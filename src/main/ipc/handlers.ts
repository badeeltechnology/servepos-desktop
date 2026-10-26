import { ipcMain, app, BrowserWindow, dialog } from 'electron'
import QRCode from 'qrcode'
import * as db from '../database/queries'
import { getDb, saveDatabase, saveDatabaseSync, deleteDatabase, initDatabase } from '../database/schema'
import { writeFileSync, readFileSync } from 'fs'
import { runSync, getSyncStatus, startAutoSync, stopAndDrainSync } from '../sync/sync-engine'
import { ERPNextClient, getActiveUrl } from '../sync/erpnext-client'
import { getPrinters, addPrinter, updatePrinter, deletePrinter, testPrinter, getPrintRoutes, addPrintRoute, deletePrintRoute, discoverUsbPrinters } from '../print/printer'
import { printReceipt, printKots, printAmendmentKot, printWaiterCopy, printPrepDoc, printInvoice, printGuestShare, printVoidSlip, printCloseShift } from '../print/print-engine'

let acceptingRequests = true
let shutdownRequested = false
const inFlight = new Set<Promise<unknown>>()
function handle(channel: string, listener: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => any): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (!acceptingRequests) throw new Error('Application is closing. Please wait.')
    const maintenance = ['app:deleteDatabase', 'app:clearTransactions', 'backup:import'].includes(channel)
    const priorRequests = [...inFlight]
    if (maintenance) acceptingRequests = false
    const task = Promise.resolve().then(async () => {
      if (maintenance) await Promise.all([Promise.allSettled(priorRequests), stopAndDrainSync()])
      try { return await listener(event, ...args) }
      finally {
        if (maintenance && !shutdownRequested) {
          acceptingRequests = true
          startAutoSync()
        }
      }
    })
    inFlight.add(task)
    task.then(() => inFlight.delete(task), () => inFlight.delete(task))
    return task
  })
}
export async function drainIpcHandlers(): Promise<void> {
  shutdownRequested = true
  acceptingRequests = false
  await Promise.allSettled([...inFlight])
}
export function resumeIpcHandlers(): void { shutdownRequested = false; acceptingRequests = true }

export function registerIpcHandlers(): void {
  // ==================== App ====================
  handle('app:getVersion', () => app.getVersion())
  handle('app:checkForUpdate', async () => {
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

  handle('app:clearTransactions', async () => await db.clearTransactions())

  handle('app:generateWaiterQR', async () => {
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

  handle('app:deleteDatabase', async () => {
    await deleteDatabase()
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
  handle('backup:exportFull', async () => {
    const result = await dialog.showSaveDialog({
      title: 'Export Full Database Backup',
      defaultPath: `servepos-full-${new Date().toISOString().slice(0, 10)}.sqlite`,
      filters: [{name: 'Full database backup', extensions: ['sqlite']}]
    })
    if (result.canceled || !result.filePath) return {success: false, canceled: true}
    try {
      await getDb().request('backup', result.filePath)
      return {success: true}
    } catch (error: any) { return {success: false, error: error.message} }
  })

  handle('backup:export', async () => {
    const win = BrowserWindow.getAllWindows()[0]
    const result = await dialog.showSaveDialog(win, {
      title: 'Export Settings Backup',
      defaultPath: `servepos-backup-${new Date().toISOString().slice(0, 10)}.spbak`,
      filters: [{ name: 'ServePOS Backup', extensions: ['spbak'] }]
    })
    if (result.canceled || !result.filePath) return { success: false, canceled: true }

    try {
      // Ensure latest data is flushed to DB
      await saveDatabaseSync()
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
          while (await stmt.step()) {
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

  handle('backup:import', async () => {
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

      await getDb().request('restoreSettings', backup)

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
  handle('sync:run', () => runSync())
  handle('sync:status', () => getSyncStatus())
  handle('sync:startAuto', () => startAutoSync())
  handle('sync:testConnection', async () => {
    const client = new ERPNextClient()
    return client.testConnection()
  })
  handle('sync:getCompanies', async () => {
    const client = new ERPNextClient()
    return client.getCompanies()
  })
  handle('sync:getPosProfiles', async (_e, company?: string) => {
    const client = new ERPNextClient()
    return client.getPosProfiles(company)
  })

  // ==================== Config ====================
  handle('config:get', (_e, key: string) => db.getConfig(key))
  handle('config:set', async (_e, key: string, value: string) => await db.setConfig(key, value))
  handle('config:getAll', () => db.getAllConfig())
  handle('config:isSetupComplete', async () => await db.isSetupComplete())

  // ==================== Receipt Config ====================
  handle('receiptConfig:get', (_e, key: string) => db.getReceiptConfig(key))
  handle('receiptConfig:set', async (_e, key: string, value: string) => await db.setReceiptConfig(key, value))
  handle('receiptConfig:getAll', () => db.getAllReceiptConfig())
  handle('receiptConfig:setBulk', async (_e, configs: Record<string, string>) => await db.setReceiptConfigBulk(configs))

  // ==================== Admin ====================
  handle('admin:create', async (_e, username: string, password: string) => await db.createAdmin(username, password))
  handle('admin:verify', async (_e, username: string, password: string) => await db.verifyAdmin(username, password))
  handle('admin:exists', async () => await db.adminExists())
  handle('admin:updatePassword', async (_e, username: string, newPassword: string) => await db.updateAdminPassword(username, newPassword))

  // ==================== Users ====================
  handle('users:create', async (_e, name: string, pin: string, role: string, options?: any) => await db.createUser(name, pin, role as 'supervisor' | 'cashier' | 'coordinator', options))
  handle('users:verifyPin', async (_e, pin: string) => await db.verifyPin(pin))
  handle('users:getAll', async (_e, role?: string) => await db.getUsers(role))
  handle('users:update', async (_e, id: string, updates: any) => await db.updateUser(id, updates))
  handle('users:delete', async (_e, id: string) => await db.deleteUser(id))

  // ==================== Items ====================
  handle('items:get', async (_e, group?: string) => await db.getItems(group))
  handle('items:getAll', async () => await db.getAllItems())
  handle('items:getVariants', async (_e, templateCode: string) => await db.getItemVariants(templateCode))
  handle('items:setVisibility', async (_e, itemCode: string, visible: boolean) => await db.setItemVisibility(itemCode, visible))
  handle('items:setGroupVisibility', async (_e, groupName: string, visible: boolean) => await db.setItemGroupVisibility(groupName, visible))

  // ==================== Item Groups ====================
  handle('itemGroups:get', async () => await db.getItemGroups())
  handle('itemGroups:getAll', async () => await db.getAllItemGroups())

  // ==================== Tables & Rooms ====================
  handle('tables:get', async (_e, room?: string) => await db.getTables(room))
  handle('tables:updateStatus', async (_e, name: string, status: string, orderId?: string) => await db.updateTableStatus(name, status, orderId))
  handle('rooms:get', async () => await db.getRooms())

  // ==================== Orders ====================
  handle('orders:create', async (_e, data: any) => await db.createOrder(data))
  handle('orders:get', async (_e, id: string) => await db.getOrder(id))
  handle('orders:getAll', async (_e, filters?: any) => await db.getOrders(filters))
  handle('orders:getActive', async () => await db.getActiveOrders())
  handle('orders:update', async (_e, id: string, updates: any) => await db.updateOrder(id, updates))

  // ==================== Order Items ====================
  handle('orderItems:add', async (_e, data: any) => await db.addOrderItem(data))
  handle('orderItems:get', async (_e, orderId: string) => await db.getOrderItems(orderId))
  handle('orderItems:update', async (_e, id: string, updates: any) => await db.updateOrderItem(id, updates))
  handle('orderItems:remove', async (_e, id: string) => await db.removeOrderItem(id))
  handle('orderItems:void', async (_e, id: string, reason: string, voidedBy: string, remarks?: string, disposition?: string) => await db.voidOrderItem(id, reason, voidedBy, remarks, disposition))

  // ==================== Order Payments ====================
  handle('orderPayments:add', async (_e, orderId: string, method: string, amount: number, reference?: string, collectedByWaiter?: string) => await db.addOrderPayment(orderId, method, amount, reference, collectedByWaiter))
  handle('orderPayments:get', async (_e, orderId: string) => await db.getOrderPayments(orderId))

  // ==================== Order Edit Log ====================
  handle('orderEditLog:add', async (_e, data: any) => await db.addOrderEditLog(data))

  // ==================== Payment Methods ====================
  handle('paymentMethods:get', async () => await db.getPaymentMethods())

  // ==================== Sessions / Shifts ====================
  handle('sessions:getActive', async () => await db.getActiveSession())
  handle('sessions:open', async (_e, data: any) => {
    const result = await db.openSession(data)
    await saveDatabaseSync() // Critical — must persist shift open
    return result
  })
  handle('sessions:close', async (_e, sessionId: string, closingBalance: any[], remarks?: string, opts?: { handOver?: boolean }) => {
    const result = await db.closeSession(sessionId, closingBalance, remarks, opts)
    await saveDatabaseSync() // Extra explicit save — critical operation must persist
    return result
  })
  handle('sessions:getOrders', async (_e, sessionId: string) => await db.getSessionOrders(sessionId))
  handle('sessions:getOpenOrders', async (_e, sessionId: string) => await db.getSessionOpenOrders(sessionId))
  handle('sessions:getAllOpenOrders', async () => await db.getAllOpenOrders())
  handle('sessions:getPendingSync', async (_e, sessionId: string) => await db.getSessionPendingSyncOrders(sessionId))
  handle('sessions:getAll', async (_e, limit?: number) => await db.getSessions(limit))

  // Auto-close shift: void all open/hold orders, then close the session
  handle('sessions:autoClose', async () => {
    try {
      const session = await db.getActiveSession()
      if (!session) return { success: false, error: 'No active session' }

      const database = getDb()

      // Void all Open/Hold orders (including previous sessions)
      const openOrders = await db.getAllOpenOrders()
      for (const order of openOrders) {
        await database.run(
          "UPDATE orders SET status = 'Void', void_reason = 'Auto-closed at end of day' WHERE id = ?",
          [order.id]
        )
        // Free table
        if (order.table_name) {
          await database.run("UPDATE tables_list SET status = 'Available', current_order_id = NULL WHERE name = ?", [order.table_name])
        }
      }
      await saveDatabase()

      // Force-sync pending completed orders before closing
      try { await runSync() } catch {}

      // Close the session with empty closing balance
      try {
        await db.closeSession(session.id, [], 'Auto-closed at scheduled time')
        return { success: true, voided: openOrders.length }
      } catch (err: any) {
        // If still can't close (pending sync), force close
        await database.run(
          "UPDATE sessions SET status = 'Closed', closed_at = datetime('now'), remarks = 'Auto-closed at scheduled time' WHERE id = ?",
          [session.id]
        )
        await saveDatabase()
        return { success: true, voided: openOrders.length, forced: true }
      }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // ==================== Modifiers ====================
  handle('modifiers:getGroups', async () => await db.getModifierGroups())
  handle('modifiers:createGroup', async (_e, data: any) => await db.createModifierGroup(data))
  handle('modifiers:updateGroup', async (_e, id: string, data: any) => await db.updateModifierGroup(id, data))
  handle('modifiers:deleteGroup', async (_e, id: string) => await db.deleteModifierGroup(id))
  handle('modifiers:getForGroup', async (_e, groupId: string) => await db.getModifiersForGroup(groupId))
  handle('modifiers:create', async (_e, data: any) => await db.createModifier(data))
  handle('modifiers:update', async (_e, id: string, data: any) => await db.updateModifier(id, data))
  handle('modifiers:delete', async (_e, id: string) => await db.deleteModifier(id))
  handle('modifiers:getItemGroups', async (_e, itemCode: string) => await db.getItemModifierGroups(itemCode))
  handle('modifiers:assignToItem', async (_e, itemCode: string, groupId: string, isRequired: boolean, order: number) => await db.assignModifierGroupToItem(itemCode, groupId, isRequired, order))
  handle('modifiers:removeFromItem', async (_e, id: string) => await db.removeModifierGroupFromItem(id))

  // ==================== Printers ====================
  handle('printers:get', async () => await getPrinters())
  handle('printers:add', async (_e, data: any) => await addPrinter(data))
  handle('printers:update', async (_e, id: string, data: any) => await updatePrinter(id, data))
  handle('printers:delete', async (_e, id: string) => await deletePrinter(id))
  handle('printers:test', async (_e, printer: any) => await testPrinter(printer))
  handle('printers:discoverUsb', () => discoverUsbPrinters())

  // ==================== Print Routes ====================
  handle('printRoutes:get', async () => await getPrintRoutes())
  handle('printRoutes:add', async (_e, data: any) => await addPrintRoute(data))
  handle('printRoutes:delete', async (_e, id: string) => await deletePrintRoute(id))

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
      if (await dupStmt.step()) {
        const existing = dupStmt.getAsObject() as any
        dupStmt.free()
        // Treat as idempotent success — do NOT reprint KOT
        return { success: true, orderId: existing.id, orderNumber: existing.order_number, kotPrinted: false, error: 'Already accepted' }
      }
      dupStmt.free()
    }

    // Get active session
    const sessionStmt = database.prepare("SELECT id, user_id, user_name FROM sessions WHERE status = 'Open' ORDER BY opened_at DESC LIMIT 1")
    const session = (await sessionStmt.step()) ? sessionStmt.getAsObject() as any : null
    sessionStmt.free()
    if (!session) return { success: false, error: 'No open shift' }

    // Create local order
    const order = await db.createOrder({
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
      await database.run('UPDATE orders SET waiter_order_name = ? WHERE id = ?', [wo.name, order.id])
      await saveDatabase()
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
        await db.addOrderItem({
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

    await database.run('UPDATE orders SET subtotal = ?, tax_total = ?, grand_total = ?, waiter_order_name = ?, order_notes = ? WHERE id = ?', [subtotal, taxTotal, grandTotal, wo.name || null, wo.notes || null, order.id])
    await saveDatabase()

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

  handle('waiterOrders:getPending', async () => {
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

  handle('waiterOrders:accept', async (_e, waiterOrderName: string) => {
    try {
      const client = new ERPNextClient()
      const wo = await client.getDoc('ServePOS Waiter Order', waiterOrderName)
      return await acceptWaiterOrderLocally(wo, client)
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  handle('waiterOrders:reject', async (_e, waiterOrderName: string) => {
    try {
      const client = new ERPNextClient()
      await client.callMethod('servepos.api.waiter.update_order_status', { order_name: waiterOrderName, status: 'Cancelled' })
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  handle('print:receipt', async (_e, orderId: string) => await printReceipt(orderId))
  handle('print:kots', async (_e, orderId: string, actorName?: string, reprint?: boolean) => {
    return await printKots(orderId, reprint ? 'reprint' : 'manual', actorName)
  })
  handle('print:amendmentKot', async (_e, orderId: string, amendments: any[]) => await printAmendmentKot(orderId, amendments))

  // Fetch print history for an order (for the "Print History" panel).
  // Joins printer name so the UI doesn't need a second lookup.
  handle('printLog:getForOrder', async (_e, orderId: string) => {
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
    while (await stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  })
  handle('print:waiterCopy', async (_e, orderId: string, cartDiscount?: any) => await printWaiterCopy(orderId, cartDiscount))
  handle('print:prepDoc', async (_e, orderId: string) => await printPrepDoc(orderId))
  handle('print:invoice', async (_e, orderId: string, cartDiscount?: any) => await printInvoice(orderId, cartDiscount))
  handle('print:guestShare', async (_e, data: any) => await printGuestShare(data))
  handle('print:voidSlip', async (_e, orderId: string, voidReason: string, voidedBy: string, removedItems?: any[], voidRemarks?: string, voidDisposition?: string) => await printVoidSlip(orderId, voidReason, voidedBy, removedItems, voidRemarks, voidDisposition))
  handle('print:closeShift', async (_e, sessionId: string) => await printCloseShift(sessionId))

  // Poll for "Ready to Serve" orders that need invoice printing
  // Concurrency guard to prevent double-printing
  let pollReadyRunning = false
  handle('print:pollReadyOrders', async () => {
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
                await database.run(
                  "UPDATE orders SET status = 'Ready to Serve' WHERE id = ? AND status NOT IN ('Ready to Serve', 'Invoiced', 'Completed', 'Void')",
                  [wo.pos_order_id]
                )
              }
              if (wo.name) {
                await database.run(
                  "UPDATE orders SET status = 'Ready to Serve' WHERE waiter_order_name = ? AND status NOT IN ('Ready to Serve', 'Invoiced', 'Completed', 'Void')",
                  [wo.name]
                )
              }
            }
            await saveDatabase()
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
      while (await readyStmt.step()) {
        readyOrders.push((readyStmt.getAsObject() as any).id)
      }
      readyStmt.free()

      let printed = 0
      for (const orderId of readyOrders) {
        // Mark as printed BEFORE printing to prevent concurrent attempts
        await database.run('UPDATE orders SET invoice_printed = 1 WHERE id = ?', [orderId])
        await saveDatabase()
        try {
          const result = await printInvoice(orderId)
          if (result.success) {
            printed++
            console.log(`[Auto-Invoice] Printed invoice for order ${orderId}`)
          } else {
            // Don't retry for config errors (no printer) — only retry for transient errors
            const isConfigError = result.error?.includes('No printer') || result.error?.includes('not found') || result.error?.includes('not configured')
            if (!isConfigError) {
              await database.run('UPDATE orders SET invoice_printed = 0 WHERE id = ?', [orderId])
              await saveDatabase()
            }
            console.error(`[Auto-Invoice] Failed for ${orderId}: ${result.error}`)
          }
        } catch (err: any) {
          // Retry on unexpected errors
          await database.run('UPDATE orders SET invoice_printed = 0 WHERE id = ?', [orderId])
          await saveDatabase()
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
  handle('waiters:list', async () => await db.getWaiters())

  // Waiters (ERPNext CRUD) — via centralized registry
  handle('waiters:fetchFromServer', async () => {
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

  handle('waiters:create', async (_e, data: { waiter_name: string; pin: string; phone?: string }) => {
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

  handle('waiters:resetPin', async (_e, waiterName: string, newPin: string) => {
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

  handle('waiters:toggleActive', async (_e, waiterName: string, isActive: boolean) => {
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
  handle('reports:todaySummary', async (_e, date?: string) => {
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
    const row = (await stmt.step()) ? stmt.getAsObject() : { totalSales: 0, orderCount: 0, avgOrderValue: 0, voidCount: 0, voidAmount: 0 }
    stmt.free()
    return row
  })

  handle('reports:bestSellingItems', async (_e, date?: string, limit?: number) => {
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
    while (await stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  })

  handle('reports:allItemsSales', async (_e, date?: string) => {
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
    while (await stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  })

  handle('reports:removedItems', async (_e, date?: string) => {
    const filterDate = date || new Date().toLocaleDateString('en-CA')
    return await db.getVoidedItems(filterDate)
  })

  handle('reports:categorySales', async (_e, date?: string) => {
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
    while (await stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  })

  handle('reports:paymentBreakdown', async (_e, date?: string) => {
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
    while (await stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  })

  handle('reports:hourlySales', async (_e, date?: string) => {
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
    while (await stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  })

  handle('reports:voidReport', async (_e, date?: string) => {
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
    while (await stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  })

  handle('reports:waiterPerformance', async (_e, date?: string) => {
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
    while (await stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  })

  // Promos
  handle('promos:list', async () => await db.getPromos())
  handle('voidReasons:list', async () => await db.getVoidReasons())

  // Voided items report
  handle('voidedItems:list', async (_e, date: string) => await db.getVoidedItems(date))

  // Vouchers — validated and consumed via ERPNext
  handle('vouchers:validate', async (_e, code: string) => {
    try {
      const client = new ERPNextClient()
      const res = await client.callMethod('servepos.api.voucher.validate_voucher', { code })
      return res
    } catch (err: any) {
      return { valid: false, reason: err.message || 'Server error' }
    }
  })
  handle('vouchers:use', async (_e, code: string, orderNumber: string) => {
    try {
      const client = new ERPNextClient()
      await client.callMethod('servepos.api.voucher.use_voucher', { code, order_number: orderNumber })
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Waiter accountability — orders per waiter in a session
  handle('sessions:getWaiterSummary', async (_e, sessionId: string) => {
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
    while (await stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  })

  // Coordinator — get active orders. Combines local orders + remote waiter orders from ERPNext
  // (so coordinator on Machine 2 can see orders accepted on Machine 1)
  handle('coordinator:getActiveOrders', async () => {
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
    while (await stmt.step()) localRows.push(stmt.getAsObject())
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
  handle('coordinator:updateStatus', async (_e, orderId: string, status: string, userRole: string) => {
    const allowedByCoordinator = ['Preparing', 'Ready to Serve']
    const allowedByCashier = ['Preparing', 'Ready to Serve', 'Invoiced', 'Completed']

    if (userRole === 'coordinator' && !allowedByCoordinator.includes(status)) {
      return { success: false, error: 'Coordinators can only mark as Preparing or Ready to Serve' }
    }
    if (userRole === 'cashier' && !allowedByCashier.includes(status)) {
      return { success: false, error: 'Invalid status' }
    }

    // Check if this order exists locally — remote orders don't
    const existingOrder = await db.getOrder(orderId)
    if (existingOrder) {
      await db.updateOrder(orderId, { status })
    }

    // Auto-print invoice when marked as Ready to Serve (if printer is on this machine)
    if (status === 'Ready to Serve') {
      try {
        const invoiceResult = await printInvoice(orderId)
        if (invoiceResult.success) {
          const database = getDb()
          await database.run('UPDATE orders SET invoice_printed = 1 WHERE id = ?', [orderId])
          await saveDatabase()
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
      const order = (await orderStmt.step()) ? orderStmt.getAsObject() as any : null
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
