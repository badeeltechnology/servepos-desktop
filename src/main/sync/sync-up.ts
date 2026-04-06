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

    // Get pending and failed orders (only Completed orders sync)
    const pendingStmt = db.prepare(
      "SELECT * FROM orders WHERE sync_status IN ('pending', 'failed') AND status = 'Completed' ORDER BY created_at"
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

        // Build invoice items
        const invoiceItems = orderItems.map((item) => ({
          item_code: item.item_code,
          item_name: item.item_name,
          qty: item.qty,
          rate: item.rate,
          amount: item.amount
        }))

        const invoicePayments = payments.map((p) => ({
          mode_of_payment: p.payment_method,
          amount: p.amount
        }))

        // Create as Sales Invoice with is_pos=1 (works with all POS Profile modes)
        const posDate = order.created_at?.split('T')[0] || new Date().toISOString().split('T')[0]
        const posTime = order.created_at?.split('T')[1]?.split('.')[0] || '00:00:00'
        const warehouse = getConfig('warehouse') || null

        // Build invoice using all POS Profile settings
        const customer = getConfig('pos_customer') || 'Walk In'
        const currency = getConfig('currency') || 'QAR'
        const sellingPriceList = getConfig('selling_price_list')
        const writeOffAccount = getConfig('write_off_account')
        const writeOffCostCenter = getConfig('write_off_cost_center')
        const incomeAccount = getConfig('income_account')
        const costCenter = getConfig('cost_center')
        const taxesAndCharges = getConfig('taxes_and_charges')
        const taxCategory = getConfig('tax_category')
        const applyDiscountOn = getConfig('apply_discount_on')
        const letterHead = getConfig('letter_head')

        const invoice: Record<string, any> = {
          doctype: 'Sales Invoice',
          company: company,
          customer: customer,
          currency: currency,
          posting_date: posDate,
          posting_time: posTime,
          is_pos: 1,
          pos_profile: posProfile,
          set_warehouse: warehouse,
          update_stock: 1,
          items: invoiceItems.map((item: any) => ({ ...item, warehouse })),
          payments: invoicePayments
        }

        // Add POS Profile settings if available
        if (sellingPriceList) invoice.selling_price_list = sellingPriceList
        if (writeOffAccount) invoice.write_off_account = writeOffAccount
        if (writeOffCostCenter) invoice.write_off_cost_center = writeOffCostCenter
        if (incomeAccount) invoice.income_account = incomeAccount
        if (costCenter) invoice.cost_center = costCenter
        if (taxesAndCharges) invoice.taxes_and_charges = taxesAndCharges
        if (taxCategory) invoice.tax_category = taxCategory
        if (applyDiscountOn) invoice.apply_discount_on = applyDiscountOn
        if (letterHead) invoice.letter_head = letterHead

        // Accounting dimensions from POS Profile
        const branch = getConfig('branch')
        const department = getConfig('department')
        if (branch) invoice.branch = branch
        if (department) invoice.department = department

        // ServePOS custom fields (ignored if fields don't exist on the site)
        invoice.servepos_cashier = order.cashier_name || null
        invoice.servepos_order_number = order.order_number || null
        invoice.servepos_order_type = order.order_type || null
        invoice.servepos_table = order.table_name || null
        invoice.servepos_room = order.room || null
        invoice.servepos_guests = order.guests || 0
        invoice.servepos_kot_generated = order.kot_printed ? 1 : 0
        if (order.promo_name) {
          invoice.servepos_promo = order.promo_name
        }

        if (order.discount_percent > 0) {
          invoice.additional_discount_percentage = order.discount_percent
        }
        if (order.discount_amount > 0) {
          invoice.discount_amount = order.discount_amount
        }

        const created = await client.createDoc('Sales Invoice', invoice)

        // Submit the invoice
        if (created?.name) {
          try {
            await client.submitDoc('Sales Invoice', created.name)
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

    // Sync void orders (orders that were synced to ERPNext then voided locally)
    const voidStmt = db.prepare(
      "SELECT * FROM orders WHERE sync_status IN ('pending', 'failed') AND status = 'Void' AND erpnext_docname IS NOT NULL"
    )
    while (voidStmt.step()) {
      const order = voidStmt.getAsObject() as any
      try {
        await client.callMethod('frappe.client.cancel', {
          doctype: 'Sales Invoice',
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
