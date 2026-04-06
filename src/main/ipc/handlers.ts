import { ipcMain, app, BrowserWindow } from 'electron'
import QRCode from 'qrcode'
import * as db from '../database/queries'
import { getDb, saveDatabase, deleteDatabase, initDatabase } from '../database/schema'
import { runSync, getSyncStatus, startAutoSync } from '../sync/sync-engine'
import { ERPNextClient } from '../sync/erpnext-client'
import { getPrinters, addPrinter, updatePrinter, deletePrinter, testPrinter, getPrintRoutes, addPrintRoute, deletePrintRoute, discoverUsbPrinters } from '../print/printer'
import { printReceipt, printKots, printAmendmentKot, printWaiterCopy, printPrepDoc, printInvoice } from '../print/print-engine'

export function registerIpcHandlers(): void {
  // ==================== App ====================
  ipcMain.handle('app:getVersion', () => app.getVersion())
  ipcMain.handle('app:checkForUpdate', async () => {
    try {
      const res = await fetch('https://api.github.com/repos/badeeltechnology/servepos-desktop/releases/latest')
      if (!res.ok) return { hasUpdate: false }
      const release = await res.json()
      const latestVersion = release.tag_name?.replace(/^v/, '') || ''
      const currentVersion = app.getVersion()
      const hasUpdate = latestVersion && latestVersion !== currentVersion
      return {
        hasUpdate,
        currentVersion,
        latestVersion,
        releaseUrl: release.html_url || '',
        releaseName: release.name || '',
        publishedAt: release.published_at || ''
      }
    } catch {
      return { hasUpdate: false, currentVersion: app.getVersion() }
    }
  })

  ipcMain.handle('app:clearTransactions', () => db.clearTransactions())

  ipcMain.handle('app:generateWaiterQR', async () => {
    const url = db.getConfig('erpnext_url') || ''
    const apiKey = db.getConfig('api_key') || ''
    const apiSecret = db.getConfig('api_secret') || ''
    if (!url || !apiKey || !apiSecret) return { error: 'ERPNext connection not configured' }
    const qrData = `${url}|${apiKey}|${apiSecret}`
    const dataUrl = await QRCode.toDataURL(qrData, { width: 300, margin: 2 })
    return { dataUrl }
  })

  ipcMain.handle('app:deleteDatabase', async () => {
    deleteDatabase()
    // Reinitialize a fresh empty database
    await initDatabase()
    // Delay reload so IPC response reaches renderer first
    setTimeout(() => {
      const win = BrowserWindow.getAllWindows()[0]
      if (win) win.webContents.reload()
    }, 500)
    return true
  })

  // ==================== Sync ====================
  ipcMain.handle('sync:run', () => runSync())
  ipcMain.handle('sync:status', () => getSyncStatus())
  ipcMain.handle('sync:startAuto', () => startAutoSync())
  ipcMain.handle('sync:testConnection', async () => {
    const client = new ERPNextClient()
    return client.testConnection()
  })
  ipcMain.handle('sync:getCompanies', async () => {
    const client = new ERPNextClient()
    return client.getCompanies()
  })
  ipcMain.handle('sync:getPosProfiles', async (_e, company?: string) => {
    const client = new ERPNextClient()
    return client.getPosProfiles(company)
  })

  // ==================== Config ====================
  ipcMain.handle('config:get', (_e, key: string) => db.getConfig(key))
  ipcMain.handle('config:set', (_e, key: string, value: string) => db.setConfig(key, value))
  ipcMain.handle('config:getAll', () => db.getAllConfig())
  ipcMain.handle('config:isSetupComplete', () => db.isSetupComplete())

  // ==================== Receipt Config ====================
  ipcMain.handle('receiptConfig:get', (_e, key: string) => db.getReceiptConfig(key))
  ipcMain.handle('receiptConfig:set', (_e, key: string, value: string) => db.setReceiptConfig(key, value))
  ipcMain.handle('receiptConfig:getAll', () => db.getAllReceiptConfig())
  ipcMain.handle('receiptConfig:setBulk', (_e, configs: Record<string, string>) => db.setReceiptConfigBulk(configs))

  // ==================== Admin ====================
  ipcMain.handle('admin:create', (_e, username: string, password: string) => db.createAdmin(username, password))
  ipcMain.handle('admin:verify', (_e, username: string, password: string) => db.verifyAdmin(username, password))
  ipcMain.handle('admin:exists', () => db.adminExists())
  ipcMain.handle('admin:updatePassword', (_e, username: string, newPassword: string) => db.updateAdminPassword(username, newPassword))

  // ==================== Users ====================
  ipcMain.handle('users:create', (_e, name: string, pin: string, role: string, options?: any) => db.createUser(name, pin, role as 'supervisor' | 'cashier' | 'coordinator', options))
  ipcMain.handle('users:verifyPin', (_e, pin: string) => db.verifyPin(pin))
  ipcMain.handle('users:getAll', (_e, role?: string) => db.getUsers(role))
  ipcMain.handle('users:update', (_e, id: string, updates: any) => db.updateUser(id, updates))
  ipcMain.handle('users:delete', (_e, id: string) => db.deleteUser(id))

  // ==================== Items ====================
  ipcMain.handle('items:get', (_e, group?: string) => db.getItems(group))
  ipcMain.handle('items:getAll', () => db.getAllItems())
  ipcMain.handle('items:getVariants', (_e, templateCode: string) => db.getItemVariants(templateCode))
  ipcMain.handle('items:setVisibility', (_e, itemCode: string, visible: boolean) => db.setItemVisibility(itemCode, visible))
  ipcMain.handle('items:setGroupVisibility', (_e, groupName: string, visible: boolean) => db.setItemGroupVisibility(groupName, visible))

  // ==================== Item Groups ====================
  ipcMain.handle('itemGroups:get', () => db.getItemGroups())
  ipcMain.handle('itemGroups:getAll', () => db.getAllItemGroups())

  // ==================== Tables & Rooms ====================
  ipcMain.handle('tables:get', (_e, room?: string) => db.getTables(room))
  ipcMain.handle('tables:updateStatus', (_e, name: string, status: string, orderId?: string) => db.updateTableStatus(name, status, orderId))
  ipcMain.handle('rooms:get', () => db.getRooms())

  // ==================== Orders ====================
  ipcMain.handle('orders:create', (_e, data: any) => db.createOrder(data))
  ipcMain.handle('orders:get', (_e, id: string) => db.getOrder(id))
  ipcMain.handle('orders:getAll', (_e, filters?: any) => db.getOrders(filters))
  ipcMain.handle('orders:getActive', () => db.getActiveOrders())
  ipcMain.handle('orders:update', (_e, id: string, updates: any) => db.updateOrder(id, updates))

  // ==================== Order Items ====================
  ipcMain.handle('orderItems:add', (_e, data: any) => db.addOrderItem(data))
  ipcMain.handle('orderItems:get', (_e, orderId: string) => db.getOrderItems(orderId))
  ipcMain.handle('orderItems:update', (_e, id: string, updates: any) => db.updateOrderItem(id, updates))
  ipcMain.handle('orderItems:remove', (_e, id: string) => db.removeOrderItem(id))

  // ==================== Order Payments ====================
  ipcMain.handle('orderPayments:add', (_e, orderId: string, method: string, amount: number, reference?: string, collectedByWaiter?: string) => db.addOrderPayment(orderId, method, amount, reference, collectedByWaiter))
  ipcMain.handle('orderPayments:get', (_e, orderId: string) => db.getOrderPayments(orderId))

  // ==================== Order Edit Log ====================
  ipcMain.handle('orderEditLog:add', (_e, data: any) => db.addOrderEditLog(data))

  // ==================== Payment Methods ====================
  ipcMain.handle('paymentMethods:get', () => db.getPaymentMethods())

  // ==================== Sessions / Shifts ====================
  ipcMain.handle('sessions:getActive', () => db.getActiveSession())
  ipcMain.handle('sessions:open', (_e, data: any) => db.openSession(data))
  ipcMain.handle('sessions:close', (_e, sessionId: string, closingBalance: any[], remarks?: string) => db.closeSession(sessionId, closingBalance, remarks))
  ipcMain.handle('sessions:getOrders', (_e, sessionId: string) => db.getSessionOrders(sessionId))
  ipcMain.handle('sessions:getOpenOrders', (_e, sessionId: string) => db.getSessionOpenOrders(sessionId))
  ipcMain.handle('sessions:getPendingSync', (_e, sessionId: string) => db.getSessionPendingSyncOrders(sessionId))
  ipcMain.handle('sessions:getAll', (_e, limit?: number) => db.getSessions(limit))

  // Auto-close shift: void all open/hold orders, then close the session
  ipcMain.handle('sessions:autoClose', async () => {
    try {
      const session = db.getActiveSession()
      if (!session) return { success: false, error: 'No active session' }

      const database = getDb()

      // Void all Open/Hold orders in this session
      const openOrders = db.getSessionOpenOrders(session.id)
      for (const order of openOrders) {
        database.run(
          "UPDATE orders SET status = 'Void', void_reason = 'Auto-closed at end of day' WHERE id = ?",
          [order.id]
        )
        // Free table
        if (order.table_name) {
          database.run("UPDATE tables_list SET status = 'Available', current_order_id = NULL WHERE name = ?", [order.table_name])
        }
      }
      saveDatabase()

      // Force-sync pending completed orders before closing
      try { await runSync() } catch {}

      // Close the session with empty closing balance
      try {
        db.closeSession(session.id, [], 'Auto-closed at scheduled time')
        return { success: true, voided: openOrders.length }
      } catch (err: any) {
        // If still can't close (pending sync), force close
        database.run(
          "UPDATE sessions SET status = 'Closed', closed_at = datetime('now'), remarks = 'Auto-closed at scheduled time' WHERE id = ?",
          [session.id]
        )
        saveDatabase()
        return { success: true, voided: openOrders.length, forced: true }
      }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // ==================== Modifiers ====================
  ipcMain.handle('modifiers:getGroups', () => db.getModifierGroups())
  ipcMain.handle('modifiers:createGroup', (_e, data: any) => db.createModifierGroup(data))
  ipcMain.handle('modifiers:updateGroup', (_e, id: string, data: any) => db.updateModifierGroup(id, data))
  ipcMain.handle('modifiers:deleteGroup', (_e, id: string) => db.deleteModifierGroup(id))
  ipcMain.handle('modifiers:getForGroup', (_e, groupId: string) => db.getModifiersForGroup(groupId))
  ipcMain.handle('modifiers:create', (_e, data: any) => db.createModifier(data))
  ipcMain.handle('modifiers:update', (_e, id: string, data: any) => db.updateModifier(id, data))
  ipcMain.handle('modifiers:delete', (_e, id: string) => db.deleteModifier(id))
  ipcMain.handle('modifiers:getItemGroups', (_e, itemCode: string) => db.getItemModifierGroups(itemCode))
  ipcMain.handle('modifiers:assignToItem', (_e, itemCode: string, groupId: string, isRequired: boolean, order: number) => db.assignModifierGroupToItem(itemCode, groupId, isRequired, order))
  ipcMain.handle('modifiers:removeFromItem', (_e, id: string) => db.removeModifierGroupFromItem(id))

  // ==================== Printers ====================
  ipcMain.handle('printers:get', () => getPrinters())
  ipcMain.handle('printers:add', (_e, data: any) => addPrinter(data))
  ipcMain.handle('printers:update', (_e, id: string, data: any) => updatePrinter(id, data))
  ipcMain.handle('printers:delete', (_e, id: string) => deletePrinter(id))
  ipcMain.handle('printers:test', (_e, printer: any) => testPrinter(printer))
  ipcMain.handle('printers:discoverUsb', () => discoverUsbPrinters())

  // ==================== Print Routes ====================
  ipcMain.handle('printRoutes:get', () => getPrintRoutes())
  ipcMain.handle('printRoutes:add', (_e, data: any) => addPrintRoute(data))
  ipcMain.handle('printRoutes:delete', (_e, id: string) => deletePrintRoute(id))

  // ==================== Printing ====================
  // ==================== Waiter Orders ====================

  // Shared helper: create local order from waiter order data, apply tax, print KOT
  async function acceptWaiterOrderLocally(wo: any, client: ERPNextClient): Promise<{ success: boolean; orderId?: string; orderNumber?: string; error?: string }> {
    const database = getDb()

    // Check for duplicate — skip if this exact waiter order was already accepted
    if (wo.name) {
      const dupStmt = database.prepare("SELECT id FROM orders WHERE waiter_order_name = ? AND status != 'Void'")
      dupStmt.bind([wo.name])
      const isDup = dupStmt.step()
      dupStmt.free()
      if (isDup) return { success: false, error: 'Already accepted' }
    }

    // Get active session
    const sessionStmt = database.prepare("SELECT id, user_id, user_name FROM sessions WHERE status = 'Open' ORDER BY opened_at DESC LIMIT 1")
    const session = sessionStmt.step() ? sessionStmt.getAsObject() as any : null
    sessionStmt.free()
    if (!session) return { success: false, error: 'No open shift' }

    // Create local order
    const order = db.createOrder({
      orderType: wo.order_type || 'Dine In',
      tableName: wo.table || undefined,
      room: wo.room || undefined,
      guests: wo.guests || 1,
      cashierId: session.user_id,
      cashierName: session.user_name || '',
      sessionId: session.id,
      waiterId: wo.waiter || undefined,
      waiterName: wo.waiter_name || undefined
    })

    // Add items
    let subtotal = 0
    for (const item of (wo.items || [])) {
      const amount = ((item.rate || 0) + (item.modifier_total || 0)) * (item.qty || 1)
      db.addOrderItem({
        orderId: order.id, itemCode: item.item_code, itemName: item.item_name,
        qty: item.qty || 1, rate: item.rate || 0, amount,
        modifiers: item.modifiers || undefined, modifierTotal: item.modifier_total || 0,
        specialInstructions: item.special_instructions || undefined
      })
      subtotal += amount
    }

    // Apply tax to calculate proper grand_total
    const config = db.getAllReceiptConfig()
    const taxEnabled = config.tax_enabled === '1'
    const taxRate = taxEnabled ? parseFloat(config.tax_rate || '0') : 0
    const taxTotal = subtotal * (taxRate / 100)
    const grandTotal = subtotal + taxTotal

    database.run('UPDATE orders SET subtotal = ?, tax_total = ?, grand_total = ?, waiter_order_name = ? WHERE id = ?', [subtotal, taxTotal, grandTotal, wo.name || null, order.id])
    saveDatabase()

    // Accept in ERPNext
    await client.acceptWaiterOrder(wo.name, order.id)

    // Print KOT (this also sets kot_printed = 1)
    let kotPrinted = false
    let kotError = ''
    try {
      const kotResult = await printKots(order.id)
      kotPrinted = kotResult.printed > 0
      if (kotResult.errors.length > 0) kotError = kotResult.errors.join(', ')
    } catch (printErr: any) {
      kotError = printErr.message
    }

    return { success: true, orderId: order.id, orderNumber: order.order_number, kotPrinted, kotError }
  }

  ipcMain.handle('waiterOrders:getPending', async () => {
    try {
      const erpnextUrl = db.getConfig('erpnext_url')
      if (!erpnextUrl) return []
      const client = new ERPNextClient()
      const branch = db.getConfig('branch') || undefined
      const pending = await client.getPendingWaiterOrders(branch)
      // Always return pending orders to frontend — frontend handles auto-accept via countdown popup
      return pending
    } catch {
      return []
    }
  })

  ipcMain.handle('waiterOrders:accept', async (_e, waiterOrderName: string) => {
    try {
      const client = new ERPNextClient()
      const wo = await client.getDoc('ServePOS Waiter Order', waiterOrderName)
      return await acceptWaiterOrderLocally(wo, client)
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('waiterOrders:reject', async (_e, waiterOrderName: string) => {
    try {
      const client = new ERPNextClient()
      await client.callMethod('servepos.api.waiter.update_order_status', { order_name: waiterOrderName, status: 'Cancelled' })
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('print:receipt', (_e, orderId: string) => printReceipt(orderId))
  ipcMain.handle('print:kots', (_e, orderId: string) => printKots(orderId))
  ipcMain.handle('print:amendmentKot', (_e, orderId: string, amendments: any[]) => printAmendmentKot(orderId, amendments))
  ipcMain.handle('print:waiterCopy', (_e, orderId: string) => printWaiterCopy(orderId))
  ipcMain.handle('print:prepDoc', (_e, orderId: string) => printPrepDoc(orderId))
  ipcMain.handle('print:invoice', (_e, orderId: string) => printInvoice(orderId))

  // Poll for "Ready to Serve" orders that need invoice printing
  // Concurrency guard to prevent double-printing
  let pollReadyRunning = false
  ipcMain.handle('print:pollReadyOrders', async () => {
    if (pollReadyRunning) return { printed: 0, total: 0 }
    pollReadyRunning = true
    try {
      const database = getDb()

      // Find orders that are "Ready to Serve" but invoice not yet printed
      const readyStmt = database.prepare(
        "SELECT id FROM orders WHERE status = 'Ready to Serve' AND (invoice_printed IS NULL OR invoice_printed = 0)"
      )
      const readyOrders: string[] = []
      while (readyStmt.step()) {
        readyOrders.push((readyStmt.getAsObject() as any).id)
      }
      readyStmt.free()

      let printed = 0
      for (const orderId of readyOrders) {
        // Mark as printed BEFORE printing to prevent concurrent attempts
        database.run('UPDATE orders SET invoice_printed = 1 WHERE id = ?', [orderId])
        saveDatabase()
        try {
          const result = await printInvoice(orderId)
          if (result.success) {
            printed++
            console.log(`[Auto-Invoice] Printed invoice for order ${orderId}`)
          } else {
            // Don't retry for config errors (no printer) — only retry for transient errors
            const isConfigError = result.error?.includes('No printer') || result.error?.includes('not found') || result.error?.includes('not configured')
            if (!isConfigError) {
              database.run('UPDATE orders SET invoice_printed = 0 WHERE id = ?', [orderId])
              saveDatabase()
            }
            console.error(`[Auto-Invoice] Failed for ${orderId}: ${result.error}`)
          }
        } catch (err: any) {
          // Retry on unexpected errors
          database.run('UPDATE orders SET invoice_printed = 0 WHERE id = ?', [orderId])
          saveDatabase()
          console.error(`[Auto-Invoice] Error for ${orderId}: ${err.message}`)
        }
      }

      return { printed, total: readyOrders.length }
    } catch {
      return { printed: 0, total: 0 }
    } finally {
      pollReadyRunning = false
    }
  })

  // Waiters (local cache)
  ipcMain.handle('waiters:list', () => db.getWaiters())

  // Waiters (ERPNext CRUD)
  ipcMain.handle('waiters:fetchFromServer', async () => {
    try {
      const client = new ERPNextClient()
      const result = await client.callMethod('servepos.api.waiter.get_waiters')
      return { success: true, waiters: result || [] }
    } catch (err: any) {
      return { success: false, error: err.message, waiters: [] }
    }
  })

  ipcMain.handle('waiters:create', async (_e, data: { waiter_name: string; pin: string; phone?: string }) => {
    try {
      const client = new ERPNextClient()
      await client.createDoc('ServePOS Waiter', {
        waiter_name: data.waiter_name,
        pin: data.pin,
        phone: data.phone || null,
        is_active: 1
      })
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('waiters:resetPin', async (_e, waiterName: string, newPin: string) => {
    try {
      const client = new ERPNextClient()
      // Use Frappe's standard REST API to update the pin field
      const res = await fetch(`${db.getConfig('erpnext_url')}/api/resource/ServePOS Waiter/${encodeURIComponent(waiterName)}`, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${db.getConfig('api_key')}:${db.getConfig('api_secret')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ pin: newPin })
      })
      if (!res.ok) { const t = await res.text(); return { success: false, error: t } }
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('waiters:toggleActive', async (_e, waiterName: string, isActive: boolean) => {
    try {
      const res = await fetch(`${db.getConfig('erpnext_url')}/api/resource/ServePOS Waiter/${encodeURIComponent(waiterName)}`, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${db.getConfig('api_key')}:${db.getConfig('api_secret')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ is_active: isActive ? 1 : 0 })
      })
      if (!res.ok) { const t = await res.text(); return { success: false, error: t } }
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Promos
  ipcMain.handle('promos:list', () => db.getPromos())

  // Waiter accountability — orders per waiter in a session
  ipcMain.handle('sessions:getWaiterSummary', (_e, sessionId: string) => {
    const database = getDb()
    const stmt = database.prepare(
      `SELECT
        COALESCE(o.waiter_name, 'No Waiter') as waiter_name,
        COUNT(*) as total_orders,
        SUM(CASE WHEN o.status = 'Completed' THEN 1 ELSE 0 END) as paid_orders,
        SUM(CASE WHEN o.status NOT IN ('Completed', 'Void', 'Returned') THEN 1 ELSE 0 END) as open_orders,
        SUM(CASE WHEN o.status = 'Completed' THEN o.grand_total ELSE 0 END) as total_collected,
        GROUP_CONCAT(CASE WHEN o.status NOT IN ('Completed', 'Void', 'Returned') THEN o.order_number END, ', ') as open_order_numbers
       FROM orders o
       WHERE o.session_id = ? AND o.status != 'Void'
       GROUP BY COALESCE(o.waiter_name, 'No Waiter')
       ORDER BY open_orders DESC, waiter_name`
    )
    stmt.bind([sessionId])
    const rows: any[] = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  })

  // Coordinator — get active orders (not Completed/Void/Returned)
  ipcMain.handle('coordinator:getActiveOrders', () => {
    const database = getDb()
    const stmt = database.prepare(
      `SELECT o.*, GROUP_CONCAT(oi.item_name || ' x' || oi.qty, ', ') as items_summary,
              COUNT(oi.id) as item_count
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.status NOT IN ('Completed', 'Void', 'Returned')
       GROUP BY o.id
       ORDER BY o.created_at DESC`
    )
    const rows: any[] = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  })

  // Coordinator — update order status (restricted statuses)
  ipcMain.handle('coordinator:updateStatus', async (_e, orderId: string, status: string, userRole: string) => {
    const allowedByCoordinator = ['Preparing', 'Ready to Serve']
    const allowedByCashier = ['Preparing', 'Ready to Serve', 'Invoiced', 'Completed']

    if (userRole === 'coordinator' && !allowedByCoordinator.includes(status)) {
      return { success: false, error: 'Coordinators can only mark as Preparing or Ready to Serve' }
    }
    if (userRole === 'cashier' && !allowedByCashier.includes(status)) {
      return { success: false, error: 'Invalid status' }
    }

    db.updateOrder(orderId, { status })

    // Auto-print invoice when marked as Ready to Serve (if printer is on this machine)
    if (status === 'Ready to Serve') {
      try {
        const invoiceResult = await printInvoice(orderId)
        if (invoiceResult.success) {
          const database = getDb()
          database.run('UPDATE orders SET invoice_printed = 1 WHERE id = ?', [orderId])
          saveDatabase()
          console.log('[Coordinator] Invoice printed for', orderId)
        } else {
          console.log('[Coordinator] Invoice print failed (will retry via poll):', invoiceResult.error)
        }
      } catch (err: any) {
        console.log('[Coordinator] Invoice print not available on this machine (will print from cashier machine)')
      }
    }

    // Sync status to ERPNext so waiter app can poll for changes
    try {
      const database = getDb()
      const orderStmt = database.prepare('SELECT erpnext_docname FROM orders WHERE id = ?')
      orderStmt.bind([orderId])
      const order = orderStmt.step() ? orderStmt.getAsObject() as any : null
      orderStmt.free()

      // If this order came from a waiter order, update the status in ERPNext
      const client = new ERPNextClient()
      // Try to find linked waiter order and update its status
      try {
        await client.callMethod('servepos.api.waiter.update_order_status_by_pos', {
          pos_order_id: orderId,
          status
        })
      } catch {
        // API may not exist yet — that's fine, waiter app can still poll order list
      }
    } catch {
      // ERPNext sync failed — non-blocking, local status is already updated
    }

    return { success: true }
  })
}
