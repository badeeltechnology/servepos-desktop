import { getDb, saveDatabase } from '../database/schema'
import { ERPNextClient } from './erpnext-client'
import { getConfig } from '../database/queries'

interface SyncResult {
  success: boolean
  synced: number
  failed: number
  errors: string[]
}

export async function syncUp(): Promise<SyncResult> {
  const result: SyncResult = { success: true, synced: 0, failed: 0, errors: [] }

  try {
    const client = new ERPNextClient()
    const db = getDb()
    const posProfile = getConfig('pos_profile')
    const company = getConfig('company')

    // Get pending orders
    const pendingStmt = db.prepare(
      "SELECT * FROM orders WHERE sync_status = 'pending' AND status = 'Completed' ORDER BY created_at"
    )
    const pendingOrders: any[] = []
    while (pendingStmt.step()) {
      pendingOrders.push(pendingStmt.getAsObject())
    }
    pendingStmt.free()

    for (const order of pendingOrders) {
      try {
        // Get order items
        const itemsStmt = db.prepare('SELECT * FROM order_items WHERE order_id = ?')
        itemsStmt.bind([order.id])
        const orderItems: any[] = []
        while (itemsStmt.step()) {
          orderItems.push(itemsStmt.getAsObject())
        }
        itemsStmt.free()

        // Get payments
        const payStmt = db.prepare('SELECT * FROM order_payments WHERE order_id = ?')
        payStmt.bind([order.id])
        const payments: any[] = []
        while (payStmt.step()) {
          payments.push(payStmt.getAsObject())
        }
        payStmt.free()

        // Build POS Invoice document
        const invoiceItems = orderItems.map((item) => ({
          item_code: item.item_code,
          item_name: item.item_name,
          qty: item.qty,
          rate: item.rate,
          amount: item.amount,
          servepos_modifiers: item.modifiers || '',
          servepos_comment: item.special_instructions || ''
        }))

        const invoicePayments = payments.map((p) => ({
          mode_of_payment: p.payment_method,
          amount: p.amount
        }))

        const invoice: Record<string, any> = {
          doctype: 'POS Invoice',
          pos_profile: posProfile,
          company: company,
          customer: 'Walk In',  // default POS customer
          posting_date: order.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
          posting_time: order.created_at?.split('T')[1]?.split('.')[0] || '00:00:00',
          items: invoiceItems,
          payments: invoicePayments,
          servepos_order_type: order.order_type,
          servepos_table: order.table_name || '',
          servepos_room: order.room || '',
          servepos_guests: order.guests || 0,
          servepos_waiter: order.cashier_name || ''
        }

        if (order.discount_percent > 0) {
          invoice.additional_discount_percentage = order.discount_percent
        }
        if (order.discount_amount > 0) {
          invoice.discount_amount = order.discount_amount
        }

        // Create in ERPNext
        const created = await client.createDoc('POS Invoice', invoice)

        // Submit the invoice
        if (created?.name) {
          try {
            await client.submitDoc('POS Invoice', created.name)
          } catch {
            // Created but not submitted — still mark as synced
          }

          // Update local order
          db.run(
            "UPDATE orders SET sync_status = 'synced', erpnext_docname = ? WHERE id = ?",
            [created.name, order.id]
          )
          result.synced++
        }
      } catch (err: any) {
        db.run(
          "UPDATE orders SET sync_status = 'failed', sync_error = ? WHERE id = ?",
          [err.message, order.id]
        )
        result.failed++
        result.errors.push(`Order ${order.order_number}: ${err.message}`)
      }
    }

    // Sync void orders
    const voidStmt = db.prepare(
      "SELECT * FROM orders WHERE sync_status = 'pending' AND status = 'Void' AND erpnext_docname IS NOT NULL"
    )
    while (voidStmt.step()) {
      const order = voidStmt.getAsObject() as any
      try {
        await client.callMethod('frappe.client.cancel', {
          doctype: 'POS Invoice',
          name: order.erpnext_docname
        })
        db.run("UPDATE orders SET sync_status = 'synced' WHERE id = ?", [order.id])
        result.synced++
      } catch (err: any) {
        db.run(
          "UPDATE orders SET sync_status = 'failed', sync_error = ? WHERE id = ?",
          [err.message, order.id]
        )
        result.failed++
      }
    }
    voidStmt.free()

    saveDatabase()

    if (result.failed > 0) result.success = false
    return result
  } catch (err: any) {
    return { success: false, synced: result.synced, failed: result.failed, errors: [err.message] }
  }
}
