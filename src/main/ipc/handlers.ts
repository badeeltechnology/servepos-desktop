import { ipcMain, app, BrowserWindow, dialog } from 'electron'
import QRCode from 'qrcode'
import * as db from '../database/queries'
import { getDb, saveDatabase, saveDatabaseSync, deleteDatabase, initDatabase } from '../database/schema'
import { writeFileSync, readFileSync } from 'fs'
import { runSync, getSyncStatus, startAutoSync } from '../sync/sync-engine'
import { ERPNextClient, getActiveUrl } from '../sync/erpnext-client'
import { getPrinters, addPrinter, updatePrinter, deletePrinter, testPrinter, getPrintRoutes, addPrintRoute, deletePrintRoute, discoverUsbPrinters } from '../print/printer'
import { printReceipt, printKots, printAmendmentKot, printWaiterCopy, printPrepDoc, printInvoice, printVoidSlip, printCloseShift } from '../print/print-engine'

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
    const posProfile = db.getConfig('pos_profile') || ''
    if (!url || !apiKey || !apiSecret) return { error: 'ERPNext connection not configured' }
    if (!posProfile) return { error: 'POS Profile is not configured on this device' }
    // Format: url|api_key|api_secret|pos_profile — pos_profile is required so
    // the Waiter App can call the centralized registry API on setup.
    const qrData = `${url}|${apiKey}|${apiSecret}|${posProfile}`
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

  // ==================== Backup ====================
  ipcMain.handle('backup:export', async () => {
    const win = BrowserWindow.getAllWindows()[0]
    const result = await dialog.showSaveDialog(win, {
      title: 'Export Settings Backup',
      defaultPath: `servepos-backup-${new Date().toISOString().slice(0, 10)}.spbak`,
      filters: [{ name: 'ServePOS Backup', extensions: ['spbak'] }]
    })
    if (result.canceled || !result.filePath) return { success: false, canceled: true }

    try {
      // Ensure latest data is flushed to DB
      saveDatabaseSync()
      const database = getDb()

      // Export settings tables (not transaction data like orders/sessions)
      const backup: Record<string, any[]> = {}
      const settingsTables = [
        'config', 'receipt_config', 'admin', 'users',
        'printers', 'print_routes', 'payment_methods',
        'waiters', 'modifier_groups', 'modifiers', 'item_modifier_groups'
      ]

      for (const table of settingsTables) {
        try {
          const stmt = database.prepare(`SELECT * FROM ${table}`)
          const rows: any[] = []
          while (stmt.step()) {
            rows.push(stmt.getAsObject())
          }
          stmt.free()
          backup[table] = rows
        } catch {
          // Table may not exist, skip
        }
      }

      backup._meta = [{ version: app.getVersion(), exported_at: new Date().toISOString() }]
      writeFileSync(result.filePath, JSON.stringify(backup, null, 2))
      return { success: true, path: result.filePath }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('backup:import', async () => {
    const win = BrowserWindow.getAllWindows()[0]
    const result = await dialog.showOpenDialog(win, {
      title: 'Import Settings Backup',
      filters: [{ name: 'ServePOS Backup', extensions: ['spbak'] }],
      properties: ['openFile']
    })
    if (result.canceled || !result.filePaths[0]) return { success: false, canceled: true }

    try {
      const content = readFileSync(result.filePaths[0], 'utf-8')
      const backup = JSON.parse(content)

      if (!backup._meta || !backup.config) {
        return { success: false, error: 'Invalid backup file' }
      }

      const database = getDb()

      // Restore each settings table
      const settingsTables = [
        'config', 'receipt_config', 'admin', 'users',
        'printers', 'print_routes', 'payment_methods',
        'waiters', 'modifier_groups', 'modifiers', 'item_modifier_groups'
      ]

      database.run('PRAGMA foreign_keys = OFF')
      for (const table of settingsTables) {
        if (!backup[table] || backup[table].length === 0) continue
        try {
          // Clear existing data
          database.run(`DELETE FROM ${table}`)
          // Insert backup rows
          const columns = Object.keys(backup[table][0])
          const placeholders = columns.map(() => '?').join(', ')
          const insertSql = `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`
          for (const row of backup[table]) {
            database.run(insertSql, columns.map((c) => row[c] ?? null))
          }
        } catch (err) {
          console.error(`Failed to restore table ${table}:`, err)
        }
      }
      database.run('PRAGMA foreign_keys = ON')

      saveDatabaseSync()

      // Reload app to apply restored settings
      setTimeout(() => {
        if (win) win.webContents.reload()
      }, 500)

      return { success: true, meta: backup._meta[0] }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
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
  ipcMain.handle('orderItems:void', (_e, id: string, reason: string, voidedBy: string, remarks?: string) => db.voidOrderItem(id, reason, voidedBy, remarks))

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
  ipcMain.handle('sessions:getAllOpenOrders', () => db.getAllOpenOrders())
  ipcMain.handle('sessions:getPendingSync', (_e, sessionId: string) => db.getSessionPendingSyncOrders(sessionId))
  ipcMain.handle('sessions:getAll', (_e, limit?: number) => db.getSessions(limit))

  // Auto-close shift: void all open/hold orders, then close the session
  ipcMain.handle('sessions:autoClose', async () => {
    try {
      const session = db.getActiveSession()
      if (!session) return { success: false, error: 'No active session' }

      const database = getDb()

      // Void all Open/Hold orders (including previous sessions)
      const openOrders = db.getAllOpenOrders()
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

  // Per-waiter-order mutex — serializes concurrent accept calls for the same waiter order.
  // Without this, two calls racing in the few ms before waiter_order_name is written both
  // pass the dup check and create duplicate POS orders (each printing its own KOT).
  const acceptingWaiterOrders = new Map<string, Promise<any>>()

  // Shared helper: create local order from waiter order data, apply tax, print KOT
  async function acceptWaiterOrderLocally(wo: any, client: ERPNextClient): Promise<{ success: boolean; orderId?: string; orderNumber?: string; error?: string; kotPrinted?: boolean; kotError?: string }> {
    // Serialize per waiter order name — if another accept is in-flight for the same wo.name,
    // wait for it and return its result instead of creating a duplicate.
    if (wo.name) {
      const inflight = acceptingWaiterOrders.get(wo.name)
      if (inflight) return await inflight
      const p = (async () => {
        try {
          return await doAcceptWaiterOrderLocally(wo, client)
        } finally {
          acceptingWaiterOrders.delete(wo.name)
        }
      })()
      acceptingWaiterOrders.set(wo.name, p)
      return await p
    }
    return await doAcceptWaiterOrderLocally(wo, client)
  }

  async function doAcceptWaiterOrderLocally(wo: any, client: ERPNextClient): Promise<{ success: boolean; orderId?: string; orderNumber?: string; error?: string; kotPrinted?: boolean; kotError?: string }> {
    const database = getDb()

    // Check for duplicate — skip if this exact waiter order was already accepted.
    // With the per-name mutex above, this check is now race-free.
    if (wo.name) {
      const dupStmt = database.prepare("SELECT id, order_number FROM orders WHERE waiter_order_name = ? AND status != 'Void'")
      dupStmt.bind([wo.name])
      if (dupStmt.step()) {
        const existing = dupStmt.getAsObject() as any
        dupStmt.free()
        // Treat as idempotent success — do NOT reprint KOT
        return { success: true, orderId: existing.id, orderNumber: existing.order_number, kotPrinted: false, error: 'Already accepted' }
      }
      dupStmt.free()
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

    // Immediately claim this waiter_order_name on the new row so any racing caller's
    // dup check finds it (defense-in-depth alongside the per-name mutex above).
    if (wo.name) {
      database.run('UPDATE orders SET waiter_order_name = ? WHERE id = ?', [wo.name, order.id])
      saveDatabase()
    }

    // Add items
    let subtotal = 0
    for (const item of (wo.items || [])) {
      try {
        const amount = ((item.rate || 0) + (item.modifier_total || 0)) * (item.qty || 1)
        // Sanitize modifiers: waiter app sends JS notation not valid JSON
        // e.g. "[{name: Pumpkin Seeds, price: 2.0}]" → '[{"name":"Pumpkin Seeds","price":2}]'
        let modifiersStr: string | undefined
        if (item.modifiers) {
          if (typeof item.modifiers === 'string') {
            try {
              JSON.parse(item.modifiers)
              modifiersStr = item.modifiers
            } catch {
              try {
                const fixed = item.modifiers
                  .replace(/(\{|,)\s*(\w+)\s*:/g, '$1"$2":')
                  .replace(/:\s*([^,}\[\]"]+?)(\s*[,}])/g, (_: string, val: string, end: string) => {
                    const trimmed = val.trim()
                    return /^-?\d+(\.\d+)?$/.test(trimmed) ? ':' + trimmed + end : ':"' + trimmed + '"' + end
                  })
                JSON.parse(fixed) // verify
                modifiersStr = fixed
              } catch {
                modifiersStr = '[]'
              }
            }
          } else {
            modifiersStr = JSON.stringify(item.modifiers)
          }
        }
        db.addOrderItem({
          orderId: order.id, itemCode: item.item_code, itemName: item.item_name,
          qty: item.qty || 1, rate: item.rate || 0, amount,
          modifiers: modifiersStr, modifierTotal: item.modifier_total || 0,
          specialInstructions: item.special_instructions || undefined
        })
        subtotal += amount
      } catch (itemErr: any) {
        console.error(`[Waiter] Failed to add item ${item.item_code}: ${itemErr.message}`)
        // Continue with remaining items
      }
    }

    // Apply tax to calculate proper grand_total
    const config = db.getAllReceiptConfig()
    const taxEnabled = config.tax_enabled === '1'
    const taxRate = taxEnabled ? parseFloat(config.tax_rate || '0') : 0
    const taxTotal = subtotal * (taxRate / 100)
    const grandTotal = subtotal + taxTotal

    database.run('UPDATE orders SET subtotal = ?, tax_total = ?, grand_total = ?, waiter_order_name = ?, order_notes = ? WHERE id = ?', [subtotal, taxTotal, grandTotal, wo.name || null, wo.notes || null, order.id])
    saveDatabase()

    // Accept in ERPNext
    await client.acceptWaiterOrder(wo.name, order.id)

    // Print KOT (this also sets kot_printed = 1)
    let kotPrinted = false
    let kotError = ''
    try {
      // Actor for auto prints = waiter who placed the order (if via waiter app)
      // else the cashier on the current shift.
      const kotResult = await printKots(order.id, 'auto', wo.waiter_name || session.user_name)
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
      const pending = await client.getPendingWaiterOrders()
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
  ipcMain.handle('print:kots', (_e, orderId: string, actorName?: string, reprint?: boolean) => {
    return printKots(orderId, reprint ? 'reprint' : 'manual', actorName)
  })
  ipcMain.handle('print:amendmentKot', (_e, orderId: string, amendments: any[]) => printAmendmentKot(orderId, amendments))

  // Fetch print history for an order (for the "Print History" panel).
  // Joins printer name so the UI doesn't need a second lookup.
  ipcMain.handle('printLog:getForOrder', (_e, orderId: string) => {
    const database = getDb()
    const stmt = database.prepare(
      `SELECT pl.id, pl.print_type, pl.status, pl.error, pl.source, pl.actor_name, pl.printed_at,
              p.printer_name
       FROM print_log pl
       LEFT JOIN printers p ON p.id = pl.printer_id
       WHERE pl.order_id = ?
       ORDER BY pl.printed_at ASC`
    )
    stmt.bind([orderId])
    const rows: any[] = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  })
  ipcMain.handle('print:waiterCopy', (_e, orderId: string, cartDiscount?: any) => printWaiterCopy(orderId, cartDiscount))
  ipcMain.handle('print:prepDoc', (_e, orderId: string) => printPrepDoc(orderId))
  ipcMain.handle('print:invoice', (_e, orderId: string, cartDiscount?: any) => printInvoice(orderId, cartDiscount))
  ipcMain.handle('print:voidSlip', (_e, orderId: string, voidReason: string, voidedBy: string, removedItems?: any[], voidRemarks?: string) => printVoidSlip(orderId, voidReason, voidedBy, removedItems, voidRemarks))
  ipcMain.handle('print:closeShift', (_e, sessionId: string) => printCloseShift(sessionId))

  // Poll for "Ready to Serve" orders that need invoice printing
  // Concurrency guard to prevent double-printing
  let pollReadyRunning = false
  ipcMain.handle('print:pollReadyOrders', async () => {
    if (pollReadyRunning) return { printed: 0, total: 0 }
    pollReadyRunning = true
    try {
      const database = getDb()

      // Step 1: Cross-machine sync — if a waiter order was marked "Ready" on another machine,
      // update the matching local order to "Ready to Serve" so the auto-print picks it up.
      try {
        const erpnextUrl = db.getConfig('erpnext_url')
        const posProfile = db.getConfig('pos_profile') || ''
        if (erpnextUrl && posProfile) {
          const client = new ERPNextClient()
          const remoteReady = await client.callMethod('servepos.api.registry.get_active_orders', {
            pos_profile: posProfile,
            statuses: 'Ready',
          })
          if (Array.isArray(remoteReady)) {
            for (const wo of remoteReady) {
              // Match on pos_order_id first, fallback to waiter_order_name
              if (wo.pos_order_id) {
                database.run(
                  "UPDATE orders SET status = 'Ready to Serve' WHERE id = ? AND status NOT IN ('Ready to Serve', 'Invoiced', 'Completed', 'Void')",
                  [wo.pos_order_id]
                )
              }
              if (wo.name) {
                database.run(
                  "UPDATE orders SET status = 'Ready to Serve' WHERE waiter_order_name = ? AND status NOT IN ('Ready to Serve', 'Invoiced', 'Completed', 'Void')",
                  [wo.name]
                )
              }
            }
            saveDatabase()
          }
        }
      } catch (err) {
        // Non-blocking — local poll still runs
      }

      // Step 2: Find local orders that are "Ready to Serve" but invoice not yet printed
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

  // Waiters (ERPNext CRUD) — via centralized registry
  ipcMain.handle('waiters:fetchFromServer', async () => {
    try {
      const client = new ERPNextClient()
      const posProfile = db.getConfig('pos_profile') || ''
      if (!posProfile) return { success: false, error: 'POS Profile not configured', waiters: [] }
      const result = await client.callMethod('servepos.api.registry.get_waiters', { pos_profile: posProfile })
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
      const res = await fetch(`${getActiveUrl()}/api/resource/ServePOS Waiter/${encodeURIComponent(waiterName)}`, {
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
      const res = await fetch(`${getActiveUrl()}/api/resource/ServePOS Waiter/${encodeURIComponent(waiterName)}`, {
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

  // ==================== Reports ====================
  ipcMain.handle('reports:todaySummary', (_e, date?: string) => {
    const database = getDb()
    const filterDate = date || new Date().toLocaleDateString('en-CA') // YYYY-MM-DD local
    const stmt = database.prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN status = 'Completed' THEN grand_total ELSE 0 END), 0) as totalSales,
        SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as orderCount,
        CASE WHEN SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) > 0
          THEN COALESCE(SUM(CASE WHEN status = 'Completed' THEN grand_total ELSE 0 END), 0)
               / SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END)
          ELSE 0 END as avgOrderValue,
        SUM(CASE WHEN status = 'Void' THEN 1 ELSE 0 END) as voidCount,
        COALESCE(SUM(CASE WHEN status = 'Void' THEN grand_total ELSE 0 END), 0) as voidAmount
       FROM orders
       WHERE date(created_at, 'localtime') = ?`
    )
    stmt.bind([filterDate])
    const row = stmt.step() ? stmt.getAsObject() : { totalSales: 0, orderCount: 0, avgOrderValue: 0, voidCount: 0, voidAmount: 0 }
    stmt.free()
    return row
  })

  ipcMain.handle('reports:bestSellingItems', (_e, date?: string, limit?: number) => {
    const database = getDb()
    const filterDate = date || new Date().toLocaleDateString('en-CA')
    const maxItems = limit || 10
    const stmt = database.prepare(
      `SELECT oi.item_name, SUM(oi.qty) as qty_sold, SUM(oi.amount) as revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.status = 'Completed' AND date(o.created_at, 'localtime') = ?
       GROUP BY oi.item_code
       ORDER BY qty_sold DESC
       LIMIT ?`
    )
    stmt.bind([filterDate, maxItems])
    const rows: any[] = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  })

  ipcMain.handle('reports:allItemsSales', (_e, date?: string) => {
    const database = getDb()
    const filterDate = date || new Date().toLocaleDateString('en-CA')
    const stmt = database.prepare(
      `SELECT oi.item_name, SUM(oi.qty) as qty_sold, SUM(oi.amount) as revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.status = 'Completed' AND date(o.created_at, 'localtime') = ?
       GROUP BY oi.item_code
       ORDER BY oi.item_name ASC`
    )
    stmt.bind([filterDate])
    const rows: any[] = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  })

  ipcMain.handle('reports:removedItems', (_e, date?: string) => {
    const filterDate = date || new Date().toLocaleDateString('en-CA')
    return db.getVoidedItems(filterDate)
  })

  ipcMain.handle('reports:categorySales', (_e, date?: string) => {
    const database = getDb()
    const filterDate = date || new Date().toLocaleDateString('en-CA')
    const stmt = database.prepare(
      `SELECT COALESCE(i.item_group, 'Uncategorized') as item_group,
              SUM(oi.qty) as qty_sold, SUM(oi.amount) as revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       LEFT JOIN items i ON i.item_code = oi.item_code
       WHERE o.status = 'Completed' AND date(o.created_at, 'localtime') = ?
       GROUP BY i.item_group
       ORDER BY revenue DESC`
    )
    stmt.bind([filterDate])
    const rows: any[] = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  })

  ipcMain.handle('reports:paymentBreakdown', (_e, date?: string) => {
    const database = getDb()
    const filterDate = date || new Date().toLocaleDateString('en-CA')
    const stmt = database.prepare(
      `SELECT op.payment_method, SUM(op.amount) as total, COUNT(*) as count
       FROM order_payments op
       JOIN orders o ON o.id = op.order_id
       WHERE o.status = 'Completed' AND date(o.created_at, 'localtime') = ?
       GROUP BY op.payment_method
       ORDER BY total DESC`
    )
    stmt.bind([filterDate])
    const rows: any[] = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  })

  ipcMain.handle('reports:hourlySales', (_e, date?: string) => {
    const database = getDb()
    const filterDate = date || new Date().toLocaleDateString('en-CA')
    const stmt = database.prepare(
      `SELECT strftime('%H', created_at, 'localtime') as hour,
              COUNT(*) as orders, SUM(grand_total) as revenue
       FROM orders
       WHERE status = 'Completed' AND date(created_at, 'localtime') = ?
       GROUP BY hour
       ORDER BY hour`
    )
    stmt.bind([filterDate])
    const rows: any[] = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  })

  ipcMain.handle('reports:voidReport', (_e, date?: string) => {
    const database = getDb()
    const filterDate = date || new Date().toLocaleDateString('en-CA')
    const stmt = database.prepare(
      `SELECT order_number, void_reason, grand_total, cashier_name, created_at
       FROM orders
       WHERE status = 'Void' AND date(created_at, 'localtime') = ?
       ORDER BY created_at DESC`
    )
    stmt.bind([filterDate])
    const rows: any[] = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  })

  ipcMain.handle('reports:waiterPerformance', (_e, date?: string) => {
    const database = getDb()
    const filterDate = date || new Date().toLocaleDateString('en-CA')
    const stmt = database.prepare(
      `SELECT COALESCE(waiter_name, 'No Waiter') as waiter_name,
              COUNT(*) as orders, SUM(grand_total) as revenue,
              COALESCE(SUM(tip_amount), 0) as tips
       FROM orders
       WHERE status = 'Completed' AND date(created_at, 'localtime') = ?
       GROUP BY COALESCE(waiter_name, 'No Waiter')
       ORDER BY revenue DESC`
    )
    stmt.bind([filterDate])
    const rows: any[] = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  })

  // Promos
  ipcMain.handle('promos:list', () => db.getPromos())
  ipcMain.handle('voidReasons:list', () => db.getVoidReasons())

  // Voided items report
  ipcMain.handle('voidedItems:list', (_e, date: string) => db.getVoidedItems(date))

  // Vouchers — validated and consumed via ERPNext
  ipcMain.handle('vouchers:validate', async (_e, code: string) => {
    try {
      const client = new ERPNextClient()
      const res = await client.callMethod('servepos.api.voucher.validate_voucher', { code })
      return res
    } catch (err: any) {
      return { valid: false, reason: err.message || 'Server error' }
    }
  })
  ipcMain.handle('vouchers:use', async (_e, code: string, orderNumber: string) => {
    try {
      const client = new ERPNextClient()
      await client.callMethod('servepos.api.voucher.use_voucher', { code, order_number: orderNumber })
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

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

  // Coordinator — get active orders. Combines local orders + remote waiter orders from ERPNext
  // (so coordinator on Machine 2 can see orders accepted on Machine 1)
  ipcMain.handle('coordinator:getActiveOrders', async () => {
    const database = getDb()

    // Local active orders (this machine) — last 7 days (UI filters to selected date)
    const stmt = database.prepare(
      `SELECT o.*, GROUP_CONCAT(oi.item_name || ' x' || oi.qty, ', ') as items_summary,
              COUNT(oi.id) as item_count
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.status NOT IN ('Completed', 'Void', 'Returned')
         AND date(o.created_at, 'localtime') >= date('now', 'localtime', '-7 days')
       GROUP BY o.id
       ORDER BY o.created_at DESC`
    )
    const localRows: any[] = []
    while (stmt.step()) localRows.push(stmt.getAsObject())
    stmt.free()

    // Remote: pull active waiter orders from ERPNext (cross-machine visibility)
    let remoteRows: any[] = []
    try {
      const erpnextUrl = db.getConfig('erpnext_url')
      if (erpnextUrl) {
        const client = new ERPNextClient()
        const posProfile = db.getConfig('pos_profile') || ''
        if (!posProfile) throw new Error('POS Profile not configured')
        const remote = await client.callMethod('servepos.api.registry.get_active_orders', {
          pos_profile: posProfile,
          statuses: 'Accepted,In Kitchen,Ready',
          days: 7,
        })
        if (Array.isArray(remote)) {
          // Return all remote orders — UI filters to the selected date
          const filteredRemote = remote
          // Map ERPNext waiter orders to coordinator format
          // Skip orders that are already in localRows (matched by waiter_order_name = wo.name)
          const localWaiterNames = new Set(localRows.map((r) => r.waiter_order_name).filter(Boolean))
          // ERPNext status → POS status mapping
          const statusMap: Record<string, string> = {
            'Accepted': 'Open',
            'In Kitchen': 'Preparing',
            'Ready': 'Ready to Serve'
          }
          remoteRows = filteredRemote
            .filter((wo: any) => !localWaiterNames.has(wo.name))
            .map((wo: any) => ({
              id: wo.pos_order_id || wo.name,
              order_number: wo.name,
              order_type: wo.order_type || 'Dine In',
              table_name: wo.table || null,
              room: wo.room || null,
              guests: wo.guests || 1,
              waiter_name: wo.waiter_name || null,
              cashier_name: null,
              status: statusMap[wo.status] || 'Open',
              order_notes: wo.notes || null,
              created_at: wo.creation,
              waiter_order_name: wo.name,
              is_remote: 1, // marker so frontend knows this is remote
              items_summary: (wo.items || []).map((i: any) => `${i.item_name} x${i.qty}`).join(', '),
              item_count: (wo.items || []).length,
              items: (wo.items || []).map((i: any, idx: number) => ({
                id: `${wo.name}-${idx}`,
                item_name: i.item_name,
                qty: i.qty,
                rate: i.rate,
                amount: i.amount
              }))
            }))
        }
      }
    } catch (err) {
      console.error('[Coordinator] Failed to fetch remote orders:', err)
    }

    return [...localRows, ...remoteRows]
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

    // Check if this order exists locally — remote orders don't
    const existingOrder = db.getOrder(orderId)
    if (existingOrder) {
      db.updateOrder(orderId, { status })
    }

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
