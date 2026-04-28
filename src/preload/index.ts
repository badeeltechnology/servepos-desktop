import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // App
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    checkForUpdate: () => ipcRenderer.invoke('app:checkForUpdate'),
    deleteDatabase: () => ipcRenderer.invoke('app:deleteDatabase'),
    clearTransactions: () => ipcRenderer.invoke('app:clearTransactions'),
    generateWaiterQR: () => ipcRenderer.invoke('app:generateWaiterQR')
  },

  // Config
  config: {
    get: (key: string) => ipcRenderer.invoke('config:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('config:set', key, value),
    getAll: () => ipcRenderer.invoke('config:getAll'),
    isSetupComplete: () => ipcRenderer.invoke('config:isSetupComplete')
  },

  // Receipt Config
  receiptConfig: {
    get: (key: string) => ipcRenderer.invoke('receiptConfig:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('receiptConfig:set', key, value),
    getAll: () => ipcRenderer.invoke('receiptConfig:getAll'),
    setBulk: (configs: Record<string, string>) => ipcRenderer.invoke('receiptConfig:setBulk', configs)
  },

  // Admin
  admin: {
    create: (username: string, password: string) => ipcRenderer.invoke('admin:create', username, password),
    verify: (username: string, password: string) => ipcRenderer.invoke('admin:verify', username, password),
    exists: () => ipcRenderer.invoke('admin:exists'),
    updatePassword: (username: string, newPassword: string) => ipcRenderer.invoke('admin:updatePassword', username, newPassword)
  },

  // Users
  users: {
    create: (name: string, pin: string, role: string, options?: any) => ipcRenderer.invoke('users:create', name, pin, role, options),
    verifyPin: (pin: string) => ipcRenderer.invoke('users:verifyPin', pin),
    getAll: (role?: string) => ipcRenderer.invoke('users:getAll', role),
    update: (id: string, updates: any) => ipcRenderer.invoke('users:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('users:delete', id)
  },

  // Items
  items: {
    get: (group?: string) => ipcRenderer.invoke('items:get', group),
    getAll: () => ipcRenderer.invoke('items:getAll'),
    getVariants: (templateCode: string) => ipcRenderer.invoke('items:getVariants', templateCode),
    setVisibility: (itemCode: string, visible: boolean) => ipcRenderer.invoke('items:setVisibility', itemCode, visible),
    setGroupVisibility: (groupName: string, visible: boolean) => ipcRenderer.invoke('items:setGroupVisibility', groupName, visible)
  },

  // Item Groups
  itemGroups: {
    get: () => ipcRenderer.invoke('itemGroups:get'),
    getAll: () => ipcRenderer.invoke('itemGroups:getAll')
  },

  // Tables & Rooms
  tables: {
    get: (room?: string) => ipcRenderer.invoke('tables:get', room),
    updateStatus: (name: string, status: string, orderId?: string) => ipcRenderer.invoke('tables:updateStatus', name, status, orderId)
  },
  rooms: {
    get: () => ipcRenderer.invoke('rooms:get')
  },

  // Orders
  orders: {
    create: (data: any) => ipcRenderer.invoke('orders:create', data),
    get: (id: string) => ipcRenderer.invoke('orders:get', id),
    getAll: (filters?: any) => ipcRenderer.invoke('orders:getAll', filters),
    getActive: () => ipcRenderer.invoke('orders:getActive'),
    update: (id: string, updates: any) => ipcRenderer.invoke('orders:update', id, updates)
  },

  // Order Items
  orderItems: {
    add: (data: any) => ipcRenderer.invoke('orderItems:add', data),
    get: (orderId: string) => ipcRenderer.invoke('orderItems:get', orderId),
    update: (id: string, updates: any) => ipcRenderer.invoke('orderItems:update', id, updates),
    remove: (id: string) => ipcRenderer.invoke('orderItems:remove', id)
  },

  // Order Payments
  orderPayments: {
    add: (orderId: string, method: string, amount: number, reference?: string, collectedByWaiter?: string) => ipcRenderer.invoke('orderPayments:add', orderId, method, amount, reference, collectedByWaiter),
    get: (orderId: string) => ipcRenderer.invoke('orderPayments:get', orderId)
  },

  // Order Edit Log
  orderEditLog: {
    add: (data: any) => ipcRenderer.invoke('orderEditLog:add', data)
  },

  // Payment Methods
  paymentMethods: {
    get: () => ipcRenderer.invoke('paymentMethods:get')
  },

  // Modifiers
  modifiers: {
    getGroups: () => ipcRenderer.invoke('modifiers:getGroups'),
    createGroup: (data: any) => ipcRenderer.invoke('modifiers:createGroup', data),
    updateGroup: (id: string, data: any) => ipcRenderer.invoke('modifiers:updateGroup', id, data),
    deleteGroup: (id: string) => ipcRenderer.invoke('modifiers:deleteGroup', id),
    getForGroup: (groupId: string) => ipcRenderer.invoke('modifiers:getForGroup', groupId),
    create: (data: any) => ipcRenderer.invoke('modifiers:create', data),
    update: (id: string, data: any) => ipcRenderer.invoke('modifiers:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('modifiers:delete', id),
    getItemGroups: (itemCode: string) => ipcRenderer.invoke('modifiers:getItemGroups', itemCode),
    assignToItem: (itemCode: string, groupId: string, isRequired: boolean, order: number) => ipcRenderer.invoke('modifiers:assignToItem', itemCode, groupId, isRequired, order),
    removeFromItem: (id: string) => ipcRenderer.invoke('modifiers:removeFromItem', id)
  },

  // Sessions / Shifts
  sessions: {
    getActive: () => ipcRenderer.invoke('sessions:getActive'),
    open: (data: any) => ipcRenderer.invoke('sessions:open', data),
    close: (sessionId: string, closingBalance: any[], remarks?: string) => ipcRenderer.invoke('sessions:close', sessionId, closingBalance, remarks),
    autoClose: () => ipcRenderer.invoke('sessions:autoClose'),
    getOrders: (sessionId: string) => ipcRenderer.invoke('sessions:getOrders', sessionId),
    getOpenOrders: (sessionId: string) => ipcRenderer.invoke('sessions:getOpenOrders', sessionId),
    getPendingSync: (sessionId: string) => ipcRenderer.invoke('sessions:getPendingSync', sessionId),
    getWaiterSummary: (sessionId: string) => ipcRenderer.invoke('sessions:getWaiterSummary', sessionId),
    getAll: (limit?: number) => ipcRenderer.invoke('sessions:getAll', limit)
  },

  // Printers
  printers: {
    get: () => ipcRenderer.invoke('printers:get'),
    add: (data: any) => ipcRenderer.invoke('printers:add', data),
    update: (id: string, data: any) => ipcRenderer.invoke('printers:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('printers:delete', id),
    test: (printer: any) => ipcRenderer.invoke('printers:test', printer),
    discoverUsb: () => ipcRenderer.invoke('printers:discoverUsb')
  },

  // Print Routes
  printRoutes: {
    get: () => ipcRenderer.invoke('printRoutes:get'),
    add: (data: any) => ipcRenderer.invoke('printRoutes:add', data),
    delete: (id: string) => ipcRenderer.invoke('printRoutes:delete', id)
  },

  // Printing
  print: {
    receipt: (orderId: string) => ipcRenderer.invoke('print:receipt', orderId),
    kots: (orderId: string, actorName?: string, reprint?: boolean) => ipcRenderer.invoke('print:kots', orderId, actorName, reprint),
    amendmentKot: (orderId: string, amendments: any[]) => ipcRenderer.invoke('print:amendmentKot', orderId, amendments),
    waiterCopy: (orderId: string, cartDiscount?: any) => ipcRenderer.invoke('print:waiterCopy', orderId, cartDiscount),
    prepDoc: (orderId: string) => ipcRenderer.invoke('print:prepDoc', orderId),
    invoice: (orderId: string, cartDiscount?: any) => ipcRenderer.invoke('print:invoice', orderId, cartDiscount),
    voidSlip: (orderId: string, voidReason: string, voidedBy: string) => ipcRenderer.invoke('print:voidSlip', orderId, voidReason, voidedBy),
    pollReadyOrders: () => ipcRenderer.invoke('print:pollReadyOrders')
  },

  // Print log (history)
  printLog: {
    getForOrder: (orderId: string) => ipcRenderer.invoke('printLog:getForOrder', orderId)
  },

  // Waiters
  waiters: {
    list: () => ipcRenderer.invoke('waiters:list'),
    fetchFromServer: () => ipcRenderer.invoke('waiters:fetchFromServer'),
    create: (data: { waiter_name: string; pin: string; phone?: string }) => ipcRenderer.invoke('waiters:create', data),
    resetPin: (waiterName: string, newPin: string) => ipcRenderer.invoke('waiters:resetPin', waiterName, newPin),
    toggleActive: (waiterName: string, isActive: boolean) => ipcRenderer.invoke('waiters:toggleActive', waiterName, isActive)
  },

  // Promos
  promos: {
    list: () => ipcRenderer.invoke('promos:list')
  },

  // Void Reasons
  voidReasons: {
    list: () => ipcRenderer.invoke('voidReasons:list')
  },

  // Vouchers
  vouchers: {
    validate: (code: string) => ipcRenderer.invoke('vouchers:validate', code),
    use: (code: string, orderNumber: string) => ipcRenderer.invoke('vouchers:use', code, orderNumber)
  },

  // Touch keyboard
  keyboard: {
    show: () => ipcRenderer.invoke('keyboard:show')
  },

  // Coordinator
  coordinator: {
    getActiveOrders: () => ipcRenderer.invoke('coordinator:getActiveOrders'),
    updateStatus: (orderId: string, status: string, userRole: string) => ipcRenderer.invoke('coordinator:updateStatus', orderId, status, userRole)
  },

  // Waiter Orders
  waiterOrders: {
    getPending: () => ipcRenderer.invoke('waiterOrders:getPending'),
    accept: (name: string) => ipcRenderer.invoke('waiterOrders:accept', name),
    reject: (name: string) => ipcRenderer.invoke('waiterOrders:reject', name)
  },

  // Backup
  backup: {
    export: () => ipcRenderer.invoke('backup:export'),
    import: () => ipcRenderer.invoke('backup:import')
  },

  // Reports
  reports: {
    todaySummary: (date?: string) => ipcRenderer.invoke('reports:todaySummary', date),
    bestSellingItems: (date?: string, limit?: number) => ipcRenderer.invoke('reports:bestSellingItems', date, limit),
    categorySales: (date?: string) => ipcRenderer.invoke('reports:categorySales', date),
    paymentBreakdown: (date?: string) => ipcRenderer.invoke('reports:paymentBreakdown', date),
    hourlySales: (date?: string) => ipcRenderer.invoke('reports:hourlySales', date),
    voidReport: (date?: string) => ipcRenderer.invoke('reports:voidReport', date),
    waiterPerformance: (date?: string) => ipcRenderer.invoke('reports:waiterPerformance', date)
  },

  // Sync
  sync: {
    run: () => ipcRenderer.invoke('sync:run'),
    status: () => ipcRenderer.invoke('sync:status'),
    startAuto: () => ipcRenderer.invoke('sync:startAuto'),
    testConnection: () => ipcRenderer.invoke('sync:testConnection'),
    getCompanies: () => ipcRenderer.invoke('sync:getCompanies'),
    getPosProfiles: (company?: string) => ipcRenderer.invoke('sync:getPosProfiles', company)
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
