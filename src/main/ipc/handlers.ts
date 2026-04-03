import { ipcMain } from 'electron'
import * as db from '../database/queries'
import { runSync, getSyncStatus, startAutoSync } from '../sync/sync-engine'
import { ERPNextClient } from '../sync/erpnext-client'
import { getPrinters, addPrinter, updatePrinter, deletePrinter, testPrinter, getPrintRoutes, addPrintRoute, deletePrintRoute } from '../print/printer'
import { printReceipt, printKots, printAmendmentKot } from '../print/print-engine'

export function registerIpcHandlers(): void {
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

  // ==================== Modifiers ====================
  ipcMain.handle('modifiers:getGroups', () => db.getModifierGroups())
  ipcMain.handle('modifiers:getForGroup', (_e, groupId: string) => db.getModifiersForGroup(groupId))
  ipcMain.handle('modifiers:getItemGroups', (_e, itemCode: string) => db.getItemModifierGroups(itemCode))

  // ==================== Printers ====================
  ipcMain.handle('printers:get', () => getPrinters())
  ipcMain.handle('printers:add', (_e, data: any) => addPrinter(data))
  ipcMain.handle('printers:update', (_e, id: string, data: any) => updatePrinter(id, data))
  ipcMain.handle('printers:delete', (_e, id: string) => deletePrinter(id))
  ipcMain.handle('printers:test', (_e, printer: any) => testPrinter(printer))

  // ==================== Print Routes ====================
  ipcMain.handle('printRoutes:get', () => getPrintRoutes())
  ipcMain.handle('printRoutes:add', (_e, data: any) => addPrintRoute(data))
  ipcMain.handle('printRoutes:delete', (_e, id: string) => deletePrintRoute(id))

  // ==================== Printing ====================
  ipcMain.handle('print:receipt', (_e, orderId: string) => printReceipt(orderId))
  ipcMain.handle('print:kots', (_e, orderId: string) => printKots(orderId))
  ipcMain.handle('print:amendmentKot', (_e, orderId: string, amendments: any[]) => printAmendmentKot(orderId, amendments))
}
