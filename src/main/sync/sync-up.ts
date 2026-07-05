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
        // Get order items (exclude voided items — they are tracked separately in void logs)
        const itemsStmt = db.prepare('SELECT * FROM order_items WHERE order_id = ? AND COALESCE(voided, 0) = 0')
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

        // Build invoice items — rate must include modifiers for correct ERPNext totals
        const invoiceItems = orderItems.map((item) => {
          const modifierTotal = item.modifier_total || 0
          const effectiveRate = item.rate + modifierTotal
          return {
            item_code: item.item_code,
            item_name: item.item_name,
            qty: item.qty,
            rate: effectiveRate,
            amount: item.amount,
            servepos_modifiers: item.modifiers || null,
            servepos_comment: item.special_instructions || null
          }
        })

        // Cap payment amounts to grand_total — when customer overpays with
        // cash (e.g. pays 50 on a 45 invoice), the change is a UI concept;
        // ERPNext should record only the invoice value.
        const grandTotal = order.grand_total || 0
        const totalPaid = payments.reduce((s: number, p: any) => s + p.amount, 0)
        const overpayment = Math.max(0, totalPaid - grandTotal)
        let remainingReduction = overpayment

        const invoicePayments = payments.map((p) => {
          let amount = p.amount
          if (remainingReduction > 0) {
            const reduce = Math.min(remainingReduction, amount)
            amount -= reduce
            remainingReduction -= reduce
          }
          return { mode_of_payment: p.payment_method, amount }
        }).filter((p) => p.amount > 0)

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
        if (order.voucher_code) {
          invoice.servepos_voucher = order.voucher_code
        }
        if (order.discount_reason) {
          invoice.servepos_discount_reason = order.discount_reason
        }
        if (order.waiter_name) {
          invoice.servepos_waiter = order.waiter_name
        }
        if (order.tip_amount && order.tip_amount > 0) {
          invoice.servepos_tip = order.tip_amount
        }
        if (order.order_notes) {
          invoice.remarks = order.order_notes
        }

        if (order.discount_percent > 0) {
          invoice.additional_discount_percentage = order.discount_percent
        }
        if (order.discount_amount > 0) {
          invoice.discount_amount = order.discount_amount
        }

        // Dedup: check if an invoice with this order_number already exists
        // (handles the case where previous createDoc succeeded but the
        // response was lost due to network timeout).
        let docname: string | null = null
        if (order.order_number) {
          try {
            const existing = await client.getList('Sales Invoice', {
              filters: { servepos_order_number: order.order_number, docstatus: ['!=', 2] },
              fields: ['name'],
              limit: 1
            })
            if (existing.length > 0) {
              docname = existing[0].name
            }
          } catch {
            // Field may not exist on older sites — proceed with create
          }
        }

        if (!docname) {
          const created = await client.createDoc('Sales Invoice', invoice)
          docname = created?.name || null
        }

        // Submit the invoice
        if (docname) {
          try {
            await client.submitDoc('Sales Invoice', docname)
          } catch {
            // Created but not submitted — still mark as synced
          }

          // Mark voucher as used on ERPNext (server tracks usage count)
          if (order.voucher_code) {
            try {
              await client.callMethod('servepos.api.voucher.use_voucher', {
                code: order.voucher_code,
                order_number: order.order_number
              })
            } catch {
              // Non-critical — voucher was already validated at POS time
            }
          }

          // Update local order
          db.run(
            "UPDATE orders SET sync_status = 'synced', erpnext_docname = ? WHERE id = ?",
            [docname, order.id]
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

    // Sync void logs to ERPNext (all voided orders not yet synced as void logs)
    const branch = getConfig('branch') || ''
    const unsyncedVoids = db.prepare(
      "SELECT * FROM orders WHERE status = 'Void' AND COALESCE(void_synced, 0) = 0"
    )
    while (unsyncedVoids.step()) {
      const order = unsyncedVoids.getAsObject() as any
      try {
        // Get all items (including voided) for this order
        const itemsStmt = db.prepare('SELECT * FROM order_items WHERE order_id = ?')
        itemsStmt.bind([order.id])
        const orderItems: any[] = []
        while (itemsStmt.step()) { orderItems.push(itemsStmt.getAsObject()) }
        itemsStmt.free()

        const voidType = order.void_reason === 'Voided at shift close' ? 'Shift Close Void'
          : order.void_reason === 'Auto-closed at end of day' ? 'Auto Close Void'
          : 'Order Void'

        await client.callMethod('servepos.api.pos_session.record_void', {
          pos_order_id: order.id,
          order_number: order.order_number || '',
          void_type: voidType,
          void_reason: order.void_reason || 'No reason',
          void_remarks: order.void_remarks || '',
          void_disposition: order.void_disposition || '',
          voided_by: order.voided_by || order.cashier_name || '',
          cashier_name: order.cashier_name || '',
          void_date: order.created_at || new Date().toISOString(),
          pos_profile: posProfile || '',
          branch: branch || null,
          table_name: order.table_name || '',
          order_type: order.order_type || '',
          grand_total: order.grand_total || 0,
          invoice_name: order.erpnext_docname || '',
          items: JSON.stringify(orderItems.map((i: any) => ({
            item_code: i.item_code,
            item_name: i.item_name,
            qty: i.qty,
            rate: i.rate,
            amount: i.amount,
            void_reason: i.void_reason || order.void_reason || '',
            void_remarks: i.void_remarks || order.void_remarks || '',
            void_disposition: i.void_disposition || order.void_disposition || ''
          })))
        })
        db.run("UPDATE orders SET void_synced = 1 WHERE id = ?", [order.id])
      } catch (err: any) {
        console.error(`[Sync] Failed to sync void log for ${order.order_number}:`, err.message)
      }
    }
    unsyncedVoids.free()

    // Sync individual item voids (items voided from active orders, not full order voids)
    const unsyncedItemVoids = db.prepare(
      `SELECT oi.id as item_id, oi.item_code, oi.item_name, oi.qty, oi.rate, oi.amount,
              oi.void_reason, oi.void_remarks, oi.void_disposition, oi.voided_by, oi.voided_at,
              o.id as order_id, o.order_number, o.order_type, o.table_name,
              o.cashier_name, o.grand_total
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE oi.voided = 1 AND COALESCE(oi.void_synced, 0) = 0 AND o.status != 'Void'`
    )
    while (unsyncedItemVoids.step()) {
      const item = unsyncedItemVoids.getAsObject() as any
      try {
        await client.callMethod('servepos.api.pos_session.record_void', {
          pos_order_id: item.order_id + '_item_' + item.item_id,
          order_number: item.order_number || '',
          void_type: 'Item Void',
          void_reason: item.void_reason || 'No reason',
          void_remarks: item.void_remarks || '',
          void_disposition: item.void_disposition || '',
          voided_by: item.voided_by || '',
          cashier_name: item.cashier_name || '',
          void_date: item.voided_at || new Date().toISOString(),
          pos_profile: posProfile || '',
          branch: branch || null,
          table_name: item.table_name || '',
          order_type: item.order_type || '',
          grand_total: item.amount || 0,
          items: JSON.stringify([{
            item_code: item.item_code,
            item_name: item.item_name,
            qty: item.qty,
            rate: item.rate,
            amount: item.amount,
            void_reason: item.void_reason || '',
            void_remarks: item.void_remarks || '',
            void_disposition: item.void_disposition || ''
          }])
        })
        db.run("UPDATE order_items SET void_synced = 1 WHERE id = ?", [item.item_id])
      } catch (err: any) {
        console.error(`[Sync] Failed to sync item void for ${item.item_name}:`, err.message)
      }
    }
    unsyncedItemVoids.free()

    saveDatabase()

    if (result.failed > 0) result.success = false
    return result
  } catch (err: any) {
    return { success: false, synced: result.synced, failed: result.failed, errors: [err.message] }
  }
}
