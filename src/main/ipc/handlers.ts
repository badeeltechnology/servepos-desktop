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
  ipcMain.handle('users:create', (_e, name: string, pin: string, role: string, options?: any) => db.createUser(name, pin, role as 'supervisor' | 'cashier', options))
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
  ipcMain.handle('orders:update', (_e, id: string, updates: any) => db.updateOrder(id, updates))

  // ==================== Order Items ====================
  ipcMain.handle('orderItems:add', (_e, data: any) => db.addOrderItem(data))
  ipcMain.handle('orderItems:get', (_e, orderId: string) => db.getOrderItems(orderId))
  ipcMain.handle('orderItems:update', (_e, id: string, updates: any) => db.updateOrderItem(id, updates))
  ipcMain.handle('orderItems:remove', (_e, id: string) => db.removeOrderItem(id))

  // ==================== Order Payments ====================
  ipcMain.handle('orderPayments:add', (_e, orderId: string, method: string, amount: number, reference?: string) => db.addOrderPayment(orderId, method, amount, reference))
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
  ipcMain.handle('waiterOrders:getPending', async () => {
    try {
      const erpnextUrl = db.getConfig('erpnext_url')
      if (!erpnextUrl) return []
      const client = new ERPNextClient()
      const branch = db.getConfig('branch') || undefined
      return await client.getPendingWaiterOrders(branch)
    } catch {
      return []
    }
  })

  ipcMain.handle('waiterOrders:accept', async (_e, waiterOrderName: string) => {
    try {
      const client = new ERPNextClient()
      // Fetch the full waiter order
      const wo = await client.getDoc('ServePOS Waiter Order', waiterOrderName)
      const dbRef = getDb()

      // Get active session
      const sessionStmt = dbRef.prepare("SELECT id, user_id, user_name FROM sessions WHERE status = 'Open' ORDER BY opened_at DESC LIMIT 1")
      const session = sessionStmt.step() ? sessionStmt.getAsObject() as any : null
      sessionStmt.free()

      // Create local order with waiter properly assigned
      const order = db.createOrder({
        orderType: wo.order_type || 'Dine In',
        tableName: wo.table || undefined,
        room: wo.room || undefined,
        guests: wo.guests || 1,
        cashierId: session?.user_id || 'waiter',
        cashierName: session?.user_name || '',
        sessionId: session?.id || undefined,
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

      dbRef.run('UPDATE orders SET subtotal = ?, grand_total = ?, kot_printed = 1 WHERE id = ?', [subtotal, subtotal, order.id])
      ;saveDatabase()

      // Accept in ERPNext
      await client.acceptWaiterOrder(waiterOrderName, order.id)

      // Print KOT
      try { await printKots(order.id) } catch {}

      return { success: true, orderId: order.id, orderNumber: order.order_number }
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

  // Waiters
  ipcMain.handle('waiters:list', () => db.getWaiters())
}
