import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs'

let db: SqlJsDatabase | null = null
let dbPath: string = ''
let saveTimer: ReturnType<typeof setTimeout> | null = null

export function getDb(): SqlJsDatabase {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

export async function initDatabase(): Promise<void> {
  const SQL = await initSqlJs()

  const userDataPath = app.getPath('userData')
  if (!existsSync(userDataPath)) {
    mkdirSync(userDataPath, { recursive: true })
  }

  dbPath = join(userDataPath, 'servepos.db')

  if (existsSync(dbPath)) {
    const buffer = readFileSync(dbPath)
    db = new SQL.Database(buffer)
  } else {
    db = new SQL.Database()
  }

  db.run('PRAGMA foreign_keys = ON')
  createTables()
  runMigrations()
  saveDatabase()
}

function createTables(): void {
  const database = getDb()

  database.run(`
    -- App configuration (one-time setup)
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS receipt_config (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS admin (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      full_name TEXT,
      pin_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('supervisor', 'cashier')),
      erpnext_user TEXT,
      max_discount_pct REAL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS items (
      item_code TEXT PRIMARY KEY,
      item_name TEXT NOT NULL,
      item_name_ar TEXT,
      description TEXT,
      description_ar TEXT,
      item_group TEXT,
      rate REAL DEFAULT 0,
      stock_uom TEXT,
      image TEXT,
      is_available INTEGER DEFAULT 1,
      is_visible INTEGER DEFAULT 1,
      kitchen_station TEXT,
      preparation_time INTEGER,
      has_variants INTEGER DEFAULT 0,
      variant_of TEXT,
      attributes TEXT,
      has_bom INTEGER DEFAULT 0,
      default_bom TEXT,
      synced_at TEXT
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS boms (
      bom_name TEXT PRIMARY KEY,
      item_code TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      synced_at TEXT,
      FOREIGN KEY (item_code) REFERENCES items(item_code)
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS bom_items (
      id TEXT PRIMARY KEY,
      bom_name TEXT NOT NULL,
      item_code TEXT NOT NULL,
      item_name TEXT,
      qty REAL NOT NULL,
      stock_uom TEXT,
      FOREIGN KEY (bom_name) REFERENCES boms(bom_name)
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS item_groups (
      name TEXT PRIMARY KEY,
      name_ar TEXT,
      parent_item_group TEXT,
      image TEXT,
      is_visible INTEGER DEFAULT 1,
      synced_at TEXT
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS tables_list (
      name TEXT PRIMARY KEY,
      table_name TEXT NOT NULL,
      room TEXT,
      capacity INTEGER DEFAULT 4,
      status TEXT DEFAULT 'Available' CHECK(status IN ('Available', 'Occupied', 'Reserved', 'Blocked')),
      current_order_id TEXT,
      is_active INTEGER DEFAULT 1,
      synced_at TEXT
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS rooms (
      name TEXT PRIMARY KEY,
      room_name TEXT NOT NULL,
      description TEXT,
      is_active INTEGER DEFAULT 1,
      synced_at TEXT
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS modifier_groups (
      id TEXT PRIMARY KEY,
      group_name TEXT NOT NULL,
      selection_type TEXT DEFAULT 'Single' CHECK(selection_type IN ('Single', 'Multiple')),
      is_required INTEGER DEFAULT 0,
      max_selections INTEGER DEFAULT 0
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS modifiers (
      id TEXT PRIMARY KEY,
      modifier_group_id TEXT NOT NULL,
      modifier_name TEXT NOT NULL,
      price REAL DEFAULT 0,
      is_default INTEGER DEFAULT 0,
      FOREIGN KEY (modifier_group_id) REFERENCES modifier_groups(id) ON DELETE CASCADE
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS item_modifier_groups (
      id TEXT PRIMARY KEY,
      item_code TEXT NOT NULL,
      modifier_group_id TEXT NOT NULL,
      is_required INTEGER DEFAULT 0,
      display_order INTEGER DEFAULT 0,
      FOREIGN KEY (item_code) REFERENCES items(item_code),
      FOREIGN KEY (modifier_group_id) REFERENCES modifier_groups(id) ON DELETE CASCADE
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS payment_methods (
      name TEXT PRIMARY KEY,
      mode_of_payment TEXT NOT NULL,
      is_default INTEGER DEFAULT 0,
      allow_in_returns INTEGER DEFAULT 0,
      synced_at TEXT
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_number TEXT NOT NULL UNIQUE,
      order_type TEXT NOT NULL CHECK(order_type IN ('Dine In', 'Takeaway', 'Delivery')),
      table_name TEXT,
      room TEXT,
      guests INTEGER,
      cashier_id TEXT,
      cashier_name TEXT,
      subtotal REAL DEFAULT 0,
      tax_total REAL DEFAULT 0,
      discount_amount REAL DEFAULT 0,
      discount_percent REAL DEFAULT 0,
      discount_reason TEXT,
      grand_total REAL DEFAULT 0,
      status TEXT DEFAULT 'Open' CHECK(status IN ('Open', 'Hold', 'Completed', 'Void', 'Returned')),
      void_reason TEXT,
      kot_printed INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'failed')),
      sync_error TEXT,
      erpnext_docname TEXT,
      FOREIGN KEY (cashier_id) REFERENCES users(id)
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      item_code TEXT NOT NULL,
      item_name TEXT NOT NULL,
      qty REAL NOT NULL,
      rate REAL NOT NULL,
      discount_amount REAL DEFAULT 0,
      discount_percent REAL DEFAULT 0,
      amount REAL NOT NULL,
      modifiers TEXT,
      modifier_total REAL DEFAULT 0,
      special_instructions TEXT,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS order_payments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      amount REAL NOT NULL,
      reference TEXT,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS order_edit_log (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      action TEXT NOT NULL,
      item_code TEXT,
      item_name TEXT,
      old_value TEXT,
      new_value TEXT,
      edited_by TEXT,
      edited_at TEXT NOT NULL DEFAULT (datetime('now')),
      amendment_kot_printed INTEGER DEFAULT 0,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'synced', 'failed')),
      attempts INTEGER DEFAULT 0,
      last_attempt_at TEXT,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      opened_at TEXT NOT NULL DEFAULT (datetime('now')),
      closed_at TEXT,
      opening_cash REAL DEFAULT 0,
      closing_cash REAL,
      total_sales REAL DEFAULT 0,
      total_orders INTEGER DEFAULT 0,
      payment_breakdown TEXT,
      sync_status TEXT DEFAULT 'pending',
      erpnext_docname TEXT
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS tax_templates (
      name TEXT PRIMARY KEY,
      tax_rate REAL,
      tax_type TEXT,
      account_head TEXT,
      synced_at TEXT
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS printers (
      id TEXT PRIMARY KEY,
      printer_name TEXT NOT NULL,
      connection_type TEXT NOT NULL CHECK(connection_type IN ('usb', 'network', 'bluetooth')),
      address TEXT,
      port INTEGER DEFAULT 9100,
      usb_vendor_id TEXT,
      usb_product_id TEXT,
      paper_width INTEGER DEFAULT 80,
      is_active INTEGER DEFAULT 1,
      test_status TEXT DEFAULT 'untested',
      last_tested_at TEXT
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS print_routes (
      id TEXT PRIMARY KEY,
      print_type TEXT NOT NULL CHECK(print_type IN ('receipt', 'kot')),
      item_group TEXT,
      kitchen_station TEXT,
      printer_id TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      FOREIGN KEY (printer_id) REFERENCES printers(id) ON DELETE CASCADE
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS print_queue (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      print_type TEXT NOT NULL,
      printer_id TEXT NOT NULL,
      content BLOB,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'printed', 'failed')),
      attempts INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      printed_at TEXT,
      error TEXT
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS print_log (
      id TEXT PRIMARY KEY,
      order_id TEXT,
      print_type TEXT,
      printer_id TEXT,
      status TEXT,
      error TEXT,
      printed_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  // Indexes
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_items_group ON items(item_group)',
    'CREATE INDEX IF NOT EXISTS idx_items_variant ON items(variant_of)',
    'CREATE INDEX IF NOT EXISTS idx_items_visible ON items(is_visible, is_available)',
    'CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)',
    'CREATE INDEX IF NOT EXISTS idx_orders_sync ON orders(sync_status)',
    'CREATE INDEX IF NOT EXISTS idx_orders_cashier ON orders(cashier_id)',
    'CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id)',
    'CREATE INDEX IF NOT EXISTS idx_order_payments_order ON order_payments(order_id)',
    'CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status)',
    'CREATE INDEX IF NOT EXISTS idx_tables_status ON tables_list(status)',
    'CREATE INDEX IF NOT EXISTS idx_tables_room ON tables_list(room)',
    'CREATE INDEX IF NOT EXISTS idx_print_queue_status ON print_queue(status)'
  ]
  for (const idx of indexes) {
    database.run(idx)
  }
}

function runMigrations(): void {
  const database = getDb()

  // Helper to check if column exists
  function hasColumn(table: string, column: string): boolean {
    try {
      const stmt = database.prepare(`SELECT ${column} FROM ${table} LIMIT 0`)
      stmt.free()
      return true
    } catch {
      return false
    }
  }

  // Migration 1: Add description fields to items
  if (!hasColumn('items', 'description')) {
    database.run('ALTER TABLE items ADD COLUMN description TEXT')
  }
  if (!hasColumn('items', 'description_ar')) {
    database.run('ALTER TABLE items ADD COLUMN description_ar TEXT')
  }

  // Migration 2: Add shift fields to sessions
  if (!hasColumn('sessions', 'status')) {
    database.run("ALTER TABLE sessions ADD COLUMN status TEXT DEFAULT 'Open'")
  }
  if (!hasColumn('sessions', 'user_name')) {
    database.run('ALTER TABLE sessions ADD COLUMN user_name TEXT')
  }
  if (!hasColumn('sessions', 'opening_balance')) {
    database.run("ALTER TABLE sessions ADD COLUMN opening_balance TEXT DEFAULT '[]'")
  }
  if (!hasColumn('sessions', 'closing_balance')) {
    database.run("ALTER TABLE sessions ADD COLUMN closing_balance TEXT DEFAULT '[]'")
  }
  if (!hasColumn('sessions', 'expected_balance')) {
    database.run("ALTER TABLE sessions ADD COLUMN expected_balance TEXT DEFAULT '[]'")
  }
  if (!hasColumn('sessions', 'erpnext_opening_name')) {
    database.run('ALTER TABLE sessions ADD COLUMN erpnext_opening_name TEXT')
  }
  if (!hasColumn('sessions', 'erpnext_closing_name')) {
    database.run('ALTER TABLE sessions ADD COLUMN erpnext_closing_name TEXT')
  }

  // Migration 3: Add session_id to orders
  if (!hasColumn('orders', 'session_id')) {
    database.run('ALTER TABLE orders ADD COLUMN session_id TEXT')
  }

  // Migration 4: Add remarks to sessions
  if (!hasColumn('sessions', 'remarks')) {
    database.run('ALTER TABLE sessions ADD COLUMN remarks TEXT')
  }

  // Migration 5: Add visible_profiles to items for ERPNext visibility filtering
  if (!hasColumn('items', 'visible_profiles')) {
    database.run('ALTER TABLE items ADD COLUMN visible_profiles TEXT')
  }

  // Migration 6: Add is_menu_group to item_groups
  if (!hasColumn('item_groups', 'is_menu_group')) {
    database.run('ALTER TABLE item_groups ADD COLUMN is_menu_group INTEGER DEFAULT 0')
  }

  // Migration 7: Add branch to tables and rooms
  if (!hasColumn('tables_list', 'branch')) {
    database.run('ALTER TABLE tables_list ADD COLUMN branch TEXT')
  }
  if (!hasColumn('rooms', 'branch')) {
    database.run('ALTER TABLE rooms ADD COLUMN branch TEXT')
  }

  // Migration 8: Add erpnext_name to modifier_groups for sync tracking
  if (!hasColumn('modifier_groups', 'erpnext_name')) {
    database.run('ALTER TABLE modifier_groups ADD COLUMN erpnext_name TEXT')
  }

  // Migration 9: Add waiter fields to orders
  if (!hasColumn('orders', 'waiter_id')) {
    database.run('ALTER TABLE orders ADD COLUMN waiter_id TEXT')
  }
  if (!hasColumn('orders', 'waiter_name')) {
    database.run('ALTER TABLE orders ADD COLUMN waiter_name TEXT')
  }

  // Migration 10: Add waiters table for locally cached waiter list
  database.run(`
    CREATE TABLE IF NOT EXISTS waiters (
      name TEXT PRIMARY KEY,
      waiter_name TEXT NOT NULL,
      phone TEXT,
      is_active INTEGER DEFAULT 1,
      synced_at TEXT
    )
  `)

  // Migration 10b: Add payment_collected_by to order_payments
  if (!hasColumn('order_payments', 'collected_by_waiter')) {
    database.run('ALTER TABLE order_payments ADD COLUMN collected_by_waiter TEXT')
  }

  // Migration 11: Add coordinator role to users
  // Check if the CREATE TABLE SQL contains 'coordinator' — if not, recreate
  {
    // Clean up any leftover temp tables from failed migrations
    try { database.run('DROP TABLE IF EXISTS users_new') } catch {}
    try { database.run("DELETE FROM users WHERE id = '__test__'") } catch {}

    const schemaStmt = database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'")
    const hasSchema = schemaStmt.step()
    const schemaSql = hasSchema ? (schemaStmt.getAsObject() as any).sql as string : ''
    schemaStmt.free()

    if (schemaSql && !schemaSql.includes('coordinator')) {
      database.run(`CREATE TABLE users_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        full_name TEXT,
        pin_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('supervisor', 'cashier', 'coordinator')),
        erpnext_user TEXT,
        max_discount_pct REAL DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_by TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`)
      database.run('INSERT INTO users_new SELECT * FROM users')
      database.run('DROP TABLE users')
      database.run('ALTER TABLE users_new RENAME TO users')
    }
  }

  // Migration 12: Expand order status CHECK constraint to support new statuses
  {
    try { database.run('DROP TABLE IF EXISTS orders_new') } catch {}
    try { database.run("DELETE FROM orders WHERE id = '__test__'") } catch {}

    const orderSchemaStmt = database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='orders'")
    const hasOrderSchema = orderSchemaStmt.step()
    const orderSchemaSql = hasOrderSchema ? (orderSchemaStmt.getAsObject() as any).sql as string : ''
    orderSchemaStmt.free()

    if (orderSchemaSql && !orderSchemaSql.includes('Preparing')) {
    database.run(`CREATE TABLE orders_new (
      id TEXT PRIMARY KEY,
      order_number TEXT NOT NULL UNIQUE,
      order_type TEXT NOT NULL CHECK(order_type IN ('Dine In', 'Takeaway', 'Delivery')),
      table_name TEXT,
      room TEXT,
      guests INTEGER,
      cashier_id TEXT,
      cashier_name TEXT,
      waiter_id TEXT,
      waiter_name TEXT,
      subtotal REAL DEFAULT 0,
      tax_total REAL DEFAULT 0,
      discount_amount REAL DEFAULT 0,
      discount_percent REAL DEFAULT 0,
      discount_reason TEXT,
      grand_total REAL DEFAULT 0,
      status TEXT DEFAULT 'Open' CHECK(status IN ('Open', 'Hold', 'Preparing', 'Ready to Serve', 'Invoiced', 'Completed', 'Void', 'Returned')),
      void_reason TEXT,
      kot_printed INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'failed')),
      sync_error TEXT,
      erpnext_docname TEXT,
      session_id TEXT
    )`)
    database.run(`INSERT INTO orders_new SELECT
      id, order_number, order_type, table_name, room, guests, cashier_id, cashier_name,
      waiter_id, waiter_name, subtotal, tax_total, discount_amount, discount_percent,
      discount_reason, grand_total, status, void_reason, kot_printed, created_at,
      completed_at, sync_status, sync_error, erpnext_docname, session_id
    FROM orders`)
    database.run('DROP TABLE orders')
    database.run('ALTER TABLE orders_new RENAME TO orders')
    // Recreate indexes
    database.run('CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)')
    database.run('CREATE INDEX IF NOT EXISTS idx_orders_sync ON orders(sync_status)')
    database.run('CREATE INDEX IF NOT EXISTS idx_orders_cashier ON orders(cashier_id)')
    database.run('CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(created_at)')
    }
  }
}

export function saveDatabase(): void {
  if (!db || !dbPath) return
  // Debounce saves to avoid excessive disk writes
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    if (db) {
      const data = db.export()
      const buffer = Buffer.from(data)
      writeFileSync(dbPath, buffer)
    }
  }, 100)
}

export function saveDatabaseSync(): void {
  if (!db || !dbPath) return
  const data = db.export()
  const buffer = Buffer.from(data)
  writeFileSync(dbPath, buffer)
}

export function closeDatabase(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveDatabaseSync()
  if (db) {
    db.close()
    db = null
  }
}

export function deleteDatabase(): boolean {
  try {
    if (saveTimer) clearTimeout(saveTimer)
    if (db) {
      db.close()
      db = null
    }
    if (dbPath && existsSync(dbPath)) {
      unlinkSync(dbPath)
    }
    return true
  } catch (err) {
    console.error('Failed to delete database:', err)
    return false
  }
}
