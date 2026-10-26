import { getDb, saveDatabase, saveDatabaseSync } from './worker-store'
import { v4 as uuidv4 } from 'uuid'
import bcrypt from 'bcryptjs'

// Sanitize params — sql.js does not accept undefined
function sanitizeParams(params: any[]): any[] {
  return params.map((p) => (p === undefined ? null : p))
}

// Helper to run a query and return all rows as objects
function queryAll(sql: string, params: any[] = []): any[] {
  const db = getDb()
  const stmt = db.prepare(sql)
  stmt.bind(sanitizeParams(params))
  const rows: any[] = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject())
  }
  stmt.free()
  return rows
}

// Helper to run a query and return first row as object
function queryOne(sql: string, params: any[] = []): any | null {
  const db = getDb()
  const stmt = db.prepare(sql)
  stmt.bind(sanitizeParams(params))
  let row = null
  if (stmt.step()) {
    row = stmt.getAsObject()
  }
  stmt.free()
  return row
}

// Helper to run an INSERT/UPDATE/DELETE (debounced save — for non-critical ops)
function execute(sql: string, params: any[] = []): void {
  const db = getDb()
  db.run(sql, sanitizeParams(params))
  saveDatabase()
}

// Helper for critical operations — flushes to disk immediately
function executeSync(sql: string, params: any[] = []): void {
  const db = getDb()
  db.run(sql, sanitizeParams(params))
  saveDatabaseSync()
}

// ==================== Config ====================

export function getConfig(key: string): string | null {
  const row = queryOne('SELECT value FROM config WHERE key = ?', [key])
  return row?.value ?? null
}

export function setConfig(key: string, value: string): void {
  execute('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', [key, value])
}

export function getAllConfig(): Record<string, string> {
  const rows = queryAll('SELECT key, value FROM config')
  const config: Record<string, string> = {}
  for (const row of rows) {
    config[row.key] = row.value
  }
  return config
}

// ==================== Receipt Config ====================

export function getReceiptConfig(key: string): string | null {
  const row = queryOne('SELECT value FROM receipt_config WHERE key = ?', [key])
  return row?.value ?? null
}

export function setReceiptConfig(key: string, value: string): void {
  execute('INSERT OR REPLACE INTO receipt_config (key, value) VALUES (?, ?)', [key, value])
}

export function getAllReceiptConfig(): Record<string, string> {
  const rows = queryAll('SELECT key, value FROM receipt_config')
  const config: Record<string, string> = {}
  for (const row of rows) {
    config[row.key] = row.value
  }
  return config
}

export function setReceiptConfigBulk(configs: Record<string, string>): void {
  const db = getDb()
  for (const [key, value] of Object.entries(configs)) {
    db.run('INSERT OR REPLACE INTO receipt_config (key, value) VALUES (?, ?)', [key, value])
  }
  saveDatabase()
}

// ==================== Admin ====================

export function createAdmin(username: string, password: string): void {
  const id = uuidv4()
  const passwordHash = bcrypt.hashSync(password, 10)
  execute('INSERT INTO admin (id, username, password_hash) VALUES (?, ?, ?)', [id, username, passwordHash])
}

export async function verifyAdmin(username: string, password: string): Promise<boolean> {
  const row = queryOne('SELECT password_hash FROM admin WHERE username = ?', [username])
  if (!row) return false
  return bcrypt.compare(password, row.password_hash)
}

export function adminExists(): boolean {
  const row = queryOne('SELECT COUNT(*) as count FROM admin')
  return (row?.count ?? 0) > 0
}

export function updateAdminPassword(username: string, newPassword: string): boolean {
  const passwordHash = bcrypt.hashSync(newPassword, 10)
  const before = queryOne('SELECT COUNT(*) as count FROM admin WHERE username = ?', [username])
  if ((before?.count ?? 0) === 0) return false
  execute("UPDATE admin SET password_hash = ?, updated_at = datetime('now') WHERE username = ?", [passwordHash, username])
  return true
}

// ==================== Users ====================

export interface User {
  id: string
  name: string
  full_name: string | null
  role: 'supervisor' | 'cashier' | 'coordinator'
  erpnext_user: string | null
  max_discount_pct: number
  is_active: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export function createUser(
  name: string,
  pin: string,
  role: 'supervisor' | 'cashier' | 'coordinator',
  options?: {
    fullName?: string
    erpnextUser?: string
    maxDiscountPct?: number
    createdBy?: string
  }
): string {
  const id = uuidv4()
  const pinHash = bcrypt.hashSync(pin, 10)
  execute(
    `INSERT INTO users (id, name, full_name, pin_hash, role, erpnext_user, max_discount_pct, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, name, options?.fullName ?? null, pinHash, role, options?.erpnextUser ?? null, options?.maxDiscountPct ?? 0, options?.createdBy ?? null]
  )
  return id
}

export async function verifyPin(pin: string): Promise<User | null> {
  const rows = queryAll('SELECT * FROM users WHERE is_active = 1')
  for (const row of rows) {
    if (await bcrypt.compare(pin, row.pin_hash)) {
      return {
        id: row.id,
        name: row.name,
        full_name: row.full_name,
        role: row.role,
        erpnext_user: row.erpnext_user,
        max_discount_pct: row.max_discount_pct,
        is_active: row.is_active,
        created_by: row.created_by,
        created_at: row.created_at,
        updated_at: row.updated_at
      }
    }
  }
  return null
}

export function getUsers(role?: string): User[] {
  const sql = role
    ? 'SELECT id, name, full_name, role, erpnext_user, max_discount_pct, is_active, created_by, created_at, updated_at FROM users WHERE role = ?'
    : 'SELECT id, name, full_name, role, erpnext_user, max_discount_pct, is_active, created_by, created_at, updated_at FROM users'
  return queryAll(sql, role ? [role] : [])
}

export function updateUser(id: string, updates: Partial<{ name: string; fullName: string; pin: string; erpnextUser: string; maxDiscountPct: number; isActive: number }>): boolean {
  const sets: string[] = ["updated_at = datetime('now')"]
  const values: any[] = []

  if (updates.name !== undefined) { sets.push('name = ?'); values.push(updates.name) }
  if (updates.fullName !== undefined) { sets.push('full_name = ?'); values.push(updates.fullName) }
  if (updates.pin !== undefined) { sets.push('pin_hash = ?'); values.push(bcrypt.hashSync(updates.pin, 10)) }
  if (updates.erpnextUser !== undefined) { sets.push('erpnext_user = ?'); values.push(updates.erpnextUser) }
  if (updates.maxDiscountPct !== undefined) { sets.push('max_discount_pct = ?'); values.push(updates.maxDiscountPct) }
  if (updates.isActive !== undefined) { sets.push('is_active = ?'); values.push(updates.isActive) }

  values.push(id)
  execute(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, values)
  return true
}

export function deleteUser(id: string): boolean {
  execute('DELETE FROM users WHERE id = ?', [id])
  return true
}

// ==================== Items ====================

// Profile filtering now happens server-side via servepos.api.registry.
// The local DB is pre-filtered at sync time, so these reads are plain queries.
export function getItems(group?: string): any[] {
  if (group) {
    return queryAll('SELECT * FROM items WHERE item_group = ? AND is_visible = 1 AND is_available = 1 ORDER BY item_name', [group])
  }
  return queryAll('SELECT * FROM items WHERE is_visible = 1 AND is_available = 1 ORDER BY item_group, item_name')
}

export function getAllItems(): any[] {
  return queryAll('SELECT * FROM items ORDER BY item_group, item_name')
}

export function getItemVariants(templateItemCode: string): any[] {
  return queryAll('SELECT * FROM items WHERE variant_of = ? AND is_visible = 1 AND is_available = 1', [templateItemCode])
}

export function setItemVisibility(itemCode: string, visible: boolean): void {
  execute('UPDATE items SET is_visible = ? WHERE item_code = ?', [visible ? 1 : 0, itemCode])
}

export function setItemGroupVisibility(groupName: string, visible: boolean): void {
  execute('UPDATE item_groups SET is_visible = ? WHERE name = ?', [visible ? 1 : 0, groupName])
}

// ==================== Item Groups ====================

export function getItemGroups(): any[] {
  // If any group has is_menu_group=1 (synced from ERPNext), only show menu groups
  const hasMenuGroups = queryOne('SELECT COUNT(*) as count FROM item_groups WHERE is_menu_group = 1')
  if (hasMenuGroups && hasMenuGroups.count > 0) {
    return queryAll('SELECT * FROM item_groups WHERE is_visible = 1 AND is_menu_group = 1 ORDER BY name')
  }
  // Fallback: show all visible groups (backward compatible)
  return queryAll('SELECT * FROM item_groups WHERE is_visible = 1 ORDER BY name')
}

export function getAllItemGroups(): any[] {
  return queryAll('SELECT * FROM item_groups ORDER BY name')
}

// ==================== Tables & Rooms ====================
// Profile/branch filtering happens server-side via servepos.api.registry.
// The local DB is pre-filtered at sync time, so these reads are plain queries.

export function getTables(room?: string): any[] {
  if (room) {
    return queryAll('SELECT * FROM tables_list WHERE room = ? AND is_active = 1 ORDER BY table_name', [room])
  }
  return queryAll('SELECT * FROM tables_list WHERE is_active = 1 ORDER BY room, table_name')
}

export function updateTableStatus(name: string, status: string, orderId?: string | null): void {
  executeSync('UPDATE tables_list SET status = ?, current_order_id = ? WHERE name = ?', [status, orderId ?? null, name])
}

export function getRooms(): any[] {
  return queryAll('SELECT * FROM rooms WHERE is_active = 1 ORDER BY room_name')
}

// ==================== Orders ====================

export function generateOrderNumber(): string {
  const branchCode = getConfig('branch_code') || 'POS'
  const terminalNo = getConfig('terminal_number') || 'T01'
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')

  const seqDate = getConfig('order_seq_date')
  let seqNum = 1

  if (seqDate === today) {
    const current = getConfig('order_seq_number')
    seqNum = (current ? parseInt(current) : 0) + 1
  }

  setConfig('order_seq_date', today)
  setConfig('order_seq_number', String(seqNum))

  return `${branchCode}-${terminalNo}-${today}-${String(seqNum).padStart(4, '0')}`
}

export function createOrder(data: {
  orderType: string
  tableName?: string
  room?: string
  guests?: number
  cashierId: string
  cashierName: string
  sessionId?: string
  waiterId?: string
  waiterName?: string
}): any {
  const id = uuidv4()
  const orderNumber = generateOrderNumber()

  executeSync(
    `INSERT INTO orders (id, order_number, order_type, table_name, room, guests, cashier_id, cashier_name, session_id, waiter_id, waiter_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, orderNumber, data.orderType, data.tableName ?? null, data.room ?? null, data.guests ?? null, data.cashierId, data.cashierName, data.sessionId ?? null, data.waiterId ?? null, data.waiterName ?? null]
  )

  if (data.tableName) {
    updateTableStatus(data.tableName, 'Occupied', id)
  }

  return getOrder(id)
}

export function getOrder(id: string): any | null {
  return queryOne('SELECT * FROM orders WHERE id = ?', [id])
}

export function getActiveOrders(): any[] {
  return queryAll(
    // unsent_items (additive): lines the kitchen has not had yet, so held rounds show as "Not sent"
    `SELECT o.*, (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id AND COALESCE(i.kot_printed, 0) = 0 AND COALESCE(i.voided, 0) = 0) AS unsent_items
     FROM orders o WHERE o.status IN ('Open', 'Hold', 'Preparing', 'Ready to Serve', 'Invoiced') ORDER BY o.created_at DESC`
  )
}

export function getOrders(filters?: { status?: string; cashierId?: string; date?: string; sessionId?: string }): any[] {
  const conditions: string[] = []
  const values: any[] = []

  if (filters?.status) { conditions.push('status = ?'); values.push(filters.status) }
  if (filters?.cashierId) { conditions.push('cashier_id = ?'); values.push(filters.cashierId) }
  if (filters?.sessionId) { conditions.push('session_id = ?'); values.push(filters.sessionId) }
  if (filters?.date) { conditions.push("date(created_at, 'localtime') = ?"); values.push(filters.date) }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  return queryAll(`SELECT * FROM orders ${where} ORDER BY created_at DESC`, values)
}

export function updateOrder(id: string, updates: Record<string, any>): boolean {
  const fieldMap: Record<string, string> = {
    status: 'status', tableName: 'table_name', room: 'room', guests: 'guests',
    subtotal: 'subtotal', taxTotal: 'tax_total', discountAmount: 'discount_amount',
    discountPercent: 'discount_percent', discountReason: 'discount_reason',
    grandTotal: 'grand_total', voidReason: 'void_reason', voidRemarks: 'void_remarks',
    voidedBy: 'voided_by', voidSynced: 'void_synced', voidDisposition: 'void_disposition', kotPrinted: 'kot_printed',
    completedAt: 'completed_at', syncStatus: 'sync_status', syncError: 'sync_error',
    erpnextDocname: 'erpnext_docname', waiterId: 'waiter_id', waiterName: 'waiter_name',
    promoName: 'promo_name', voucherCode: 'voucher_code', tipAmount: 'tip_amount',
    invoicePrinted: 'invoice_printed', waiterOrderName: 'waiter_order_name', orderNotes: 'order_notes'
  }

  const sets: string[] = []
  const values: any[] = []

  for (const [key, value] of Object.entries(updates)) {
    const col = fieldMap[key]
    if (col && value !== undefined) { sets.push(`${col} = ?`); values.push(value ?? null) }
  }

  if (sets.length === 0) return false
  values.push(id)
  executeSync(`UPDATE orders SET ${sets.join(', ')} WHERE id = ?`, values)

  // If voiding a synced order, reset sync_status so cancellation syncs to ERPNext
  if (updates.status === 'Void') {
    const order = queryOne('SELECT sync_status, erpnext_docname FROM orders WHERE id = ?', [id])
    if (order && order.erpnext_docname && order.sync_status === 'synced') {
      executeSync("UPDATE orders SET sync_status = 'pending', sync_error = NULL WHERE id = ?", [id])
    }
  }

  return true
}

// ==================== Order Items ====================

export function addOrderItem(data: {
  orderId: string; itemCode: string; itemName: string; qty: number; rate: number;
  discountAmount?: number; discountPercent?: number; amount: number;
  modifiers?: string; modifierTotal?: number; specialInstructions?: string
}): string {
  const id = uuidv4()
  executeSync(
    `INSERT INTO order_items (id, order_id, item_code, item_name, qty, rate, discount_amount, discount_percent, amount, modifiers, modifier_total, special_instructions)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, data.orderId, data.itemCode, data.itemName, data.qty, data.rate,
     data.discountAmount ?? 0, data.discountPercent ?? 0, data.amount,
     data.modifiers ?? null, data.modifierTotal ?? 0, data.specialInstructions ?? null]
  )
  return id
}

export function getOrderItems(orderId: string, includeVoided = false): any[] {
  if (includeVoided) {
    return queryAll('SELECT * FROM order_items WHERE order_id = ?', [orderId])
  }
  return queryAll('SELECT * FROM order_items WHERE order_id = ? AND COALESCE(voided, 0) = 0', [orderId])
}

export function updateOrderItem(id: string, updates: Record<string, any>): boolean {
  const fieldMap: Record<string, string> = {
    qty: 'qty', rate: 'rate', discountAmount: 'discount_amount', discountPercent: 'discount_percent',
    amount: 'amount', modifiers: 'modifiers', modifierTotal: 'modifier_total', specialInstructions: 'special_instructions'
  }
  const sets: string[] = []
  const values: any[] = []
  for (const [key, value] of Object.entries(updates)) {
    const col = fieldMap[key]
    if (col && value !== undefined) { sets.push(`${col} = ?`); values.push(value ?? null) }
  }
  if (sets.length === 0) return false
  values.push(id)
  execute(`UPDATE order_items SET ${sets.join(', ')} WHERE id = ?`, values)
  return true
}

export function removeOrderItem(id: string): boolean {
  execute('DELETE FROM order_items WHERE id = ?', [id])
  return true
}

export function voidOrderItem(id: string, reason: string, voidedBy: string, remarks?: string, disposition?: string): boolean {
  executeSync(
    `UPDATE order_items SET voided = 1, void_reason = ?, voided_by = ?, voided_at = datetime('now'), void_remarks = ?, void_disposition = ? WHERE id = ?`,
    [reason, voidedBy, remarks || null, disposition || null, id]
  )
  return true
}

// ==================== Order Payments ====================

export function addOrderPayment(orderId: string, method: string, amount: number, reference?: string, collectedByWaiter?: string): string {
  const id = uuidv4()
  executeSync('INSERT INTO order_payments (id, order_id, payment_method, amount, reference, collected_by_waiter) VALUES (?, ?, ?, ?, ?, ?)',
    [id, orderId, method, amount, reference ?? null, collectedByWaiter ?? null])
  return id
}

export function getOrderPayments(orderId: string): any[] {
  return queryAll('SELECT * FROM order_payments WHERE order_id = ?', [orderId])
}

// ==================== Order Edit Log ====================

export function addOrderEditLog(data: {
  orderId: string; action: string; itemCode?: string; itemName?: string;
  oldValue?: string; newValue?: string; editedBy: string
}): void {
  const id = uuidv4()
  execute(
    `INSERT INTO order_edit_log (id, order_id, action, item_code, item_name, old_value, new_value, edited_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, data.orderId, data.action, data.itemCode ?? null, data.itemName ?? null, data.oldValue ?? null, data.newValue ?? null, data.editedBy]
  )
}

// ==================== Default Modifiers ====================

export function seedDefaultModifiers(): void {
  // Only seed if no modifier groups exist
  const existing = queryOne('SELECT COUNT(*) as count FROM modifier_groups')
  if (existing && existing.count > 0) return

  const groups = [
    {
      id: 'default-spice', name: 'Spice Level', type: 'Single', required: 0, max: 0,
      modifiers: [
        { name: 'Mild', price: 0 },
        { name: 'Medium', price: 0 },
        { name: 'Hot', price: 0 },
        { name: 'Extra Hot', price: 0 }
      ]
    },
    {
      id: 'default-sugar', name: 'Sugar Level', type: 'Single', required: 0, max: 0,
      modifiers: [
        { name: 'No Sugar', price: 0 },
        { name: 'Less Sugar', price: 0 },
        { name: 'Normal Sugar', price: 0 },
        { name: 'Extra Sugar', price: 0 }
      ]
    },
    {
      id: 'default-milk', name: 'Milk Option', type: 'Single', required: 0, max: 0,
      modifiers: [
        { name: 'Regular Milk', price: 0 },
        { name: 'Oat Milk', price: 2 },
        { name: 'Almond Milk', price: 2 },
        { name: 'Coconut Milk', price: 2 },
        { name: 'Soy Milk', price: 2 },
        { name: 'No Milk', price: 0 }
      ]
    },
    {
      id: 'default-size', name: 'Size', type: 'Single', required: 0, max: 0,
      modifiers: [
        { name: 'Small', price: 0 },
        { name: 'Medium', price: 3 },
        { name: 'Large', price: 5 }
      ]
    },
    {
      id: 'default-temp', name: 'Temperature', type: 'Single', required: 0, max: 0,
      modifiers: [
        { name: 'Hot', price: 0 },
        { name: 'Iced', price: 0 }
      ]
    },
    {
      id: 'default-cooking', name: 'Cooking Preference', type: 'Single', required: 0, max: 0,
      modifiers: [
        { name: 'Rare', price: 0 },
        { name: 'Medium Rare', price: 0 },
        { name: 'Medium', price: 0 },
        { name: 'Medium Well', price: 0 },
        { name: 'Well Done', price: 0 }
      ]
    },
    {
      id: 'default-extras', name: 'Extras', type: 'Multiple', required: 0, max: 0,
      modifiers: [
        { name: 'Extra Cheese', price: 4 },
        { name: 'Extra Sauce', price: 2 },
        { name: 'Extra Bread', price: 3 }
      ]
    },
    {
      id: 'default-remove', name: 'Remove', type: 'Multiple', required: 0, max: 0,
      modifiers: [
        { name: 'No Onion', price: 0 },
        { name: 'No Tomato', price: 0 },
        { name: 'No Lettuce', price: 0 },
        { name: 'No Sauce', price: 0 },
        { name: 'No Ice', price: 0 }
      ]
    }
  ]

  for (const g of groups) {
    execute(
      'INSERT OR IGNORE INTO modifier_groups (id, group_name, selection_type, is_required, max_selections) VALUES (?, ?, ?, ?, ?)',
      [g.id, g.name, g.type, g.required, g.max]
    )
    for (let i = 0; i < g.modifiers.length; i++) {
      const m = g.modifiers[i]
      execute(
        'INSERT OR IGNORE INTO modifiers (id, modifier_group_id, modifier_name, price, is_default) VALUES (?, ?, ?, ?, 0)',
        [`${g.id}-${i}`, g.id, m.name, m.price]
      )
    }
  }
}

// ==================== Payment Methods ====================

export function getPaymentMethods(): any[] {
  return queryAll('SELECT * FROM payment_methods ORDER BY is_default DESC, mode_of_payment')
}

// ==================== Modifiers ====================

export function getModifierGroups(): any[] {
  return queryAll('SELECT * FROM modifier_groups ORDER BY group_name')
}

export function createModifierGroup(data: {
  groupName: string; selectionType: string; isRequired: boolean; maxSelections: number
}): string {
  const id = uuidv4()
  execute(
    'INSERT INTO modifier_groups (id, group_name, selection_type, is_required, max_selections) VALUES (?, ?, ?, ?, ?)',
    [id, data.groupName, data.selectionType, data.isRequired ? 1 : 0, data.maxSelections]
  )
  return id
}

export function updateModifierGroup(id: string, data: {
  groupName?: string; selectionType?: string; isRequired?: boolean; maxSelections?: number
}): void {
  const sets: string[] = []
  const vals: any[] = []
  if (data.groupName !== undefined) { sets.push('group_name = ?'); vals.push(data.groupName) }
  if (data.selectionType !== undefined) { sets.push('selection_type = ?'); vals.push(data.selectionType) }
  if (data.isRequired !== undefined) { sets.push('is_required = ?'); vals.push(data.isRequired ? 1 : 0) }
  if (data.maxSelections !== undefined) { sets.push('max_selections = ?'); vals.push(data.maxSelections) }
  if (sets.length === 0) return
  vals.push(id)
  execute(`UPDATE modifier_groups SET ${sets.join(', ')} WHERE id = ?`, vals)
}

export function deleteModifierGroup(id: string): void {
  execute('DELETE FROM modifier_groups WHERE id = ?', [id])
}

export function getModifiersForGroup(groupId: string): any[] {
  return queryAll('SELECT * FROM modifiers WHERE modifier_group_id = ? ORDER BY modifier_name', [groupId])
}

export function createModifier(data: {
  modifierGroupId: string; modifierName: string; price: number; isDefault?: boolean
}): string {
  const id = uuidv4()
  execute(
    'INSERT INTO modifiers (id, modifier_group_id, modifier_name, price, is_default) VALUES (?, ?, ?, ?, ?)',
    [id, data.modifierGroupId, data.modifierName, data.price, data.isDefault ? 1 : 0]
  )
  return id
}

export function updateModifier(id: string, data: {
  modifierName?: string; price?: number; isDefault?: boolean
}): void {
  const sets: string[] = []
  const vals: any[] = []
  if (data.modifierName !== undefined) { sets.push('modifier_name = ?'); vals.push(data.modifierName) }
  if (data.price !== undefined) { sets.push('price = ?'); vals.push(data.price) }
  if (data.isDefault !== undefined) { sets.push('is_default = ?'); vals.push(data.isDefault ? 1 : 0) }
  if (sets.length === 0) return
  vals.push(id)
  execute(`UPDATE modifiers SET ${sets.join(', ')} WHERE id = ?`, vals)
}

export function deleteModifier(id: string): void {
  execute('DELETE FROM modifiers WHERE id = ?', [id])
}

export function getItemModifierGroups(itemCode: string): any[] {
  return queryAll(
    `SELECT img.id, img.modifier_group_id, mg.group_name, mg.selection_type, img.is_required, mg.max_selections, img.display_order
     FROM item_modifier_groups img
     JOIN modifier_groups mg ON mg.id = img.modifier_group_id
     WHERE img.item_code = ?
     ORDER BY img.display_order`,
    [itemCode]
  )
}

export function assignModifierGroupToItem(itemCode: string, modifierGroupId: string, isRequired: boolean, displayOrder: number): string {
  const id = uuidv4()
  execute(
    'INSERT INTO item_modifier_groups (id, item_code, modifier_group_id, is_required, display_order) VALUES (?, ?, ?, ?, ?)',
    [id, itemCode, modifierGroupId, isRequired ? 1 : 0, displayOrder]
  )
  return id
}

export function removeModifierGroupFromItem(id: string): void {
  execute('DELETE FROM item_modifier_groups WHERE id = ?', [id])
}

// ==================== Sessions / Shifts ====================

export function getActiveSession(): any | null {
  return queryOne("SELECT * FROM sessions WHERE status = 'Open' ORDER BY opened_at DESC LIMIT 1")
}

export function openSession(data: {
  userId: string
  userName: string
  openingBalance: { mode: string; amount: number }[]
}): string {
  // Check no active session exists
  const existing = getActiveSession()
  if (existing) throw new Error('A shift is already open. Close it first.')

  const id = uuidv4()
  executeSync(
    `INSERT INTO sessions (id, user_id, user_name, status, opening_cash, opening_balance)
     VALUES (?, ?, ?, 'Open', ?, ?)`,
    [id, data.userId, data.userName,
     data.openingBalance.reduce((s, b) => s + b.amount, 0),
     JSON.stringify(data.openingBalance)]
  )
  // Orders handed over by a closed shift (still open) now belong to this shift, so their
  // payments count in this drawer. Orders of an open shift are never touched.
  executeSync(
    `UPDATE orders SET session_id = ?
     WHERE status IN ('Open', 'Hold', 'Preparing', 'Ready to Serve', 'Invoiced')
       AND session_id IN (SELECT id FROM sessions WHERE status = 'Closed')`,
    [id]
  )
  return id
}

export function getSessionOpenOrders(sessionId: string): any[] {
  return queryAll(
    "SELECT * FROM orders WHERE session_id = ? AND status IN ('Open', 'Hold') ORDER BY created_at DESC",
    [sessionId]
  )
}

export function getAllOpenOrders(): any[] {
  return queryAll(
    // unsent_items (additive): lines the kitchen has not had yet, so held rounds show as "Not sent"
    `SELECT o.*, (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id AND COALESCE(i.kot_printed, 0) = 0 AND COALESCE(i.voided, 0) = 0) AS unsent_items
     FROM orders o WHERE o.status IN ('Open', 'Hold', 'Preparing', 'Ready to Serve', 'Invoiced') ORDER BY o.created_at DESC`
  )
}

export function getSessionPendingSyncOrders(sessionId: string): any[] {
  return queryAll(
    "SELECT * FROM orders WHERE session_id = ? AND status = 'Completed' AND sync_status IN ('pending', 'failed') ORDER BY created_at DESC",
    [sessionId]
  )
}

export function closeSession(sessionId: string, closingBalance: { mode: string; amount: number }[], remarks?: string, opts?: { handOver?: boolean }): any {
  const session = queryOne('SELECT * FROM sessions WHERE id = ?', [sessionId])
  if (!session) throw new Error('Session not found')
  if (session.status !== 'Open') throw new Error('Session is not open')

  // Check for open/hold orders (all orders, not just current session).
  // Hand-over (opt-in, newer tills only): seated tables stay open and move to the next shift
  // when it opens (see openSession). Only completed orders count towards this drawer.
  const openOrders = getAllOpenOrders()
  if (openOrders.length > 0 && opts?.handOver) {
    remarks = [remarks, `Handed over ${openOrders.length} open order(s) to the next shift`].filter(Boolean).join(' · ')
  } else if (openOrders.length > 0) {
    throw new Error(`Cannot close shift: ${openOrders.length} order(s) still open or on hold. Supervisor must complete or void them first.`)
  }

  // Check for pending sync
  const pendingSync = getSessionPendingSyncOrders(sessionId)
  if (pendingSync.length > 0) {
    throw new Error(`Cannot close shift: ${pendingSync.length} order(s) pending sync to ERPNext. Please sync first.`)
  }

  // Calculate expected balance from orders in this session
  const orders = queryAll(
    "SELECT id FROM orders WHERE session_id = ? AND status = 'Completed'",
    [sessionId]
  )

  // Get all payments from completed orders in this session
  const expectedByMode: Record<string, number> = {}
  const openingBalance = JSON.parse(session.opening_balance || '[]')
  for (const ob of openingBalance) {
    expectedByMode[ob.mode] = ob.amount
  }

  for (const order of orders) {
    const payments = queryAll('SELECT * FROM order_payments WHERE order_id = ?', [order.id])
    for (const p of payments) {
      expectedByMode[p.payment_method] = (expectedByMode[p.payment_method] || 0) + p.amount
    }
  }

  const expectedBalance = Object.entries(expectedByMode).map(([mode, amount]) => ({ mode, amount }))

  // Calculate totals
  const completedOrders = queryAll(
    "SELECT * FROM orders WHERE session_id = ? AND status = 'Completed'",
    [sessionId]
  )
  const totalSales = completedOrders.reduce((s: number, o: any) => s + (o.grand_total || 0), 0)
  const totalOrders = completedOrders.length

  // Build payment breakdown
  const paymentBreakdown: Record<string, number> = {}
  for (const order of completedOrders) {
    const payments = queryAll('SELECT * FROM order_payments WHERE order_id = ?', [order.id])
    for (const p of payments) {
      paymentBreakdown[p.payment_method] = (paymentBreakdown[p.payment_method] || 0) + p.amount
    }
  }

  executeSync(
    `UPDATE sessions SET
      status = 'Closed',
      closed_at = datetime('now'),
      closing_cash = ?,
      closing_balance = ?,
      expected_balance = ?,
      total_sales = ?,
      total_orders = ?,
      payment_breakdown = ?,
      remarks = ?
    WHERE id = ?`,
    [
      closingBalance.reduce((s, b) => s + b.amount, 0),
      JSON.stringify(closingBalance),
      JSON.stringify(expectedBalance),
      totalSales,
      totalOrders,
      JSON.stringify(paymentBreakdown),
      remarks || null,
      sessionId
    ]
  )

  return queryOne('SELECT * FROM sessions WHERE id = ?', [sessionId])
}

export function getSessionOrders(sessionId: string): any[] {
  return queryAll(
    "SELECT * FROM orders WHERE session_id = ? ORDER BY created_at DESC",
    [sessionId]
  )
}

export function getSessionVoidedOrders(sessionId: string): any[] {
  return queryAll(
    "SELECT order_number, void_reason, cashier_name, grand_total FROM orders WHERE session_id = ? AND status = 'Void' ORDER BY created_at DESC",
    [sessionId]
  )
}

export function getSessionVoidedItems(sessionId: string): any[] {
  return queryAll(
    `SELECT oi.item_name, oi.qty, oi.rate, oi.amount, oi.void_reason, oi.voided_by, o.order_number
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.session_id = ? AND oi.voided = 1
     ORDER BY oi.voided_at DESC`,
    [sessionId]
  )
}

export function getSessions(limit = 10): any[] {
  return queryAll('SELECT * FROM sessions ORDER BY opened_at DESC LIMIT ?', [limit])
}

// ==================== Clear Transactions ====================

export function clearTransactions(): { orders: number; sessions: number } {
  const db = getDb()

  // Count before deleting
  const orderCount = queryOne('SELECT COUNT(*) as count FROM orders')?.count || 0
  const sessionCount = queryOne('SELECT COUNT(*) as count FROM sessions')?.count || 0

  // Delete transaction data (cascades handle order_items, order_payments, order_edit_log)
  db.run('DELETE FROM order_payments')
  db.run('DELETE FROM order_edit_log')
  db.run('DELETE FROM order_items')
  db.run('DELETE FROM orders')
  db.run('DELETE FROM sessions')
  db.run('DELETE FROM sync_queue')
  db.run('DELETE FROM print_log')
  db.run('DELETE FROM print_queue')

  // Reset table statuses back to Available
  db.run("UPDATE tables_list SET status = 'Available', current_order_id = NULL")

  // Reset order sequence
  db.run("DELETE FROM config WHERE key IN ('order_seq_date', 'order_seq_number', 'kot_seq_date', 'kot_seq_number')")

  saveDatabase()
  return { orders: orderCount, sessions: sessionCount }
}

// ==================== Waiters ====================

export function getWaiters(): any[] {
  return queryAll('SELECT * FROM waiters WHERE is_active = 1 ORDER BY waiter_name')
}

// ==================== Promos ====================

export function getPromos(): any[] {
  return queryAll('SELECT * FROM promos WHERE enabled = 1 ORDER BY promo_name')
}

// ==================== Removed/Voided Items ====================

export function getVoidedItems(date: string): any[] {
  return queryAll(
    `SELECT oi.item_name, oi.qty, oi.rate, oi.amount, oi.void_reason as reason, oi.voided_by as removed_by, oi.voided_at as removed_at,
            o.order_number, o.order_type, o.table_name
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE oi.voided = 1 AND date(oi.voided_at, 'localtime') = ?
     ORDER BY oi.voided_at DESC`,
    [date]
  )
}

// ==================== Void Reasons ====================

export function getVoidReasons(): any[] {
  return queryAll('SELECT * FROM void_reasons WHERE enabled = 1 ORDER BY display_order')
}

// ==================== Setup Check ====================

export function isSetupComplete(): boolean {
  return adminExists() && getConfig('erpnext_url') !== null && getConfig('pos_profile') !== null
}
