import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import { app, dialog } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, mkdirSync, unlinkSync, renameSync, openSync, writeSync, closeSync, fsyncSync } from 'fs'

let db: SqlJsDatabase | null = null
let dbPath: string = ''
let dbBackupPath: string = ''
let dbTmpPath: string = ''
let saveTimer: ReturnType<typeof setTimeout> | null = null
let periodicSaveInterval: ReturnType<typeof setInterval> | null = null

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
  dbBackupPath = join(userDataPath, 'servepos.db.bak')
  dbTmpPath = join(userDataPath, 'servepos.db.tmp')

  let recoveredFromBackup = false

  // Helper: try to load and validate a database file
  function tryLoadDb(filePath: string, label: string): SqlJsDatabase | null {
    if (!existsSync(filePath)) {
      console.log(`[DB Recovery] ${label}: file not found`)
      return null
    }
    try {
      const buffer = readFileSync(filePath)
      console.log(`[DB Recovery] ${label}: file exists, ${buffer.length} bytes`)
      if (buffer.length === 0) {
        console.warn(`[DB Recovery] ${label}: file is empty`)
        return null
      }
      const candidate = new SQL.Database(buffer)
      const result = candidate.exec('PRAGMA integrity_check')
      const status = result[0]?.values[0]?.[0]
      if (status !== 'ok') {
        console.error(`[DB Recovery] ${label}: integrity check failed — ${status}`)
        candidate.close()
        return null
      }
      console.log(`[DB Recovery] ${label}: loaded successfully`)
      return candidate
    } catch (err) {
      console.error(`[DB Recovery] ${label}: failed to load —`, err)
      return null
    }
  }

  // Recovery chain: main → backup → tmp (leftover from crashed rename) → fresh
  console.log('[DB Recovery] Starting recovery chain...')
  db = tryLoadDb(dbPath, 'main')
  if (!db) {
    db = tryLoadDb(dbBackupPath, 'backup')
    if (db) {
      recoveredFromBackup = true
    } else {
      db = tryLoadDb(dbTmpPath, 'tmp')
      if (db) {
        recoveredFromBackup = true
      }
    }
  }

  // Clean up tmp file after recovery attempt
  if (existsSync(dbTmpPath)) {
    try { unlinkSync(dbTmpPath) } catch {}
  }

  // If all failed, create fresh
  if (!db) {
    db = new SQL.Database()
  }

  db.run('PRAGMA foreign_keys = ON')
  createTables()
  runMigrations()
  saveDatabase()

  // Start periodic save every 30 seconds
  periodicSaveInterval = setInterval(() => {
    saveDatabaseSafe()
  }, 30_000)

  // Show recovery dialog after window is ready
  if (recoveredFromBackup) {
    app.whenReady().then(() => {
      dialog.showMessageBox({
        type: 'warning',
        title: 'Database Recovered',
        message: 'Database was restored from backup',
        detail: 'The main database file was corrupted (possibly due to a power outage). It has been automatically restored from the last backup. There may be data loss of up to 30 seconds.',
        buttons: ['OK']
      })
    })
  }
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
      source TEXT,
      actor_name TEXT,
      printed_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS promos (
      name TEXT PRIMARY KEY,
      promo_name TEXT NOT NULL,
      discount_type TEXT NOT NULL CHECK(discount_type IN ('Percentage', 'Amount')),
      discount_value REAL NOT NULL,
      enabled INTEGER DEFAULT 1,
      synced_at TEXT
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS void_reasons (
      name TEXT PRIMARY KEY,
      reason_name TEXT NOT NULL,
      display_order INTEGER DEFAULT 0,
      enabled INTEGER DEFAULT 1,
      synced_at TEXT
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

  // Migration 9c: Add waiter_order_name to orders (links to ERPNext ServePOS Waiter Order)
  if (!hasColumn('orders', 'waiter_order_name')) {
    database.run('ALTER TABLE orders ADD COLUMN waiter_order_name TEXT')
  }

  // Migration 9d: Add order_notes column for order-level notes
  if (!hasColumn('orders', 'order_notes')) {
    database.run('ALTER TABLE orders ADD COLUMN order_notes TEXT')
  }

  // Migration 9b: Add invoice_printed flag to orders
  if (!hasColumn('orders', 'invoice_printed')) {
    database.run('ALTER TABLE orders ADD COLUMN invoice_printed INTEGER DEFAULT 0')
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
      database.run('PRAGMA foreign_keys = OFF')
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
      database.run('PRAGMA foreign_keys = ON')
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
    // Disable FK constraints during table recreation
    database.run('PRAGMA foreign_keys = OFF')
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
    database.run('PRAGMA foreign_keys = ON')
    }
  }

  // Migration 13b: Add promo_name to orders
  if (!hasColumn('orders', 'promo_name')) {
    database.run('ALTER TABLE orders ADD COLUMN promo_name TEXT')
  }

  // Migration 13c: Add source column to print_log ('auto' | 'manual' | 'reprint')
  if (!hasColumn('print_log', 'source')) {
    database.run('ALTER TABLE print_log ADD COLUMN source TEXT')
  }

  // Migration 13d: Add actor_name to print_log so we can attribute prints
  // to the real human (all staff share one ERPNext username).
  if (!hasColumn('print_log', 'actor_name')) {
    database.run('ALTER TABLE print_log ADD COLUMN actor_name TEXT')
  }

  // Migration 13: Expand print_routes to support prep_doc, invoice types
  {
    const prSchemaStmt = database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='print_routes'")
    const hasPrSchema = prSchemaStmt.step()
    const prSchemaSql = hasPrSchema ? (prSchemaStmt.getAsObject() as any).sql as string : ''
    prSchemaStmt.free()

    if (prSchemaSql && !prSchemaSql.includes('prep_doc')) {
      database.run('PRAGMA foreign_keys = OFF')
      try { database.run('DROP TABLE IF EXISTS print_routes_new') } catch {}
      database.run(`CREATE TABLE print_routes_new (
        id TEXT PRIMARY KEY,
        print_type TEXT NOT NULL CHECK(print_type IN ('receipt', 'kot', 'prep_doc', 'invoice')),
        item_group TEXT,
        kitchen_station TEXT,
        printer_id TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        FOREIGN KEY (printer_id) REFERENCES printers(id) ON DELETE CASCADE
      )`)
      database.run('INSERT INTO print_routes_new SELECT * FROM print_routes')
      database.run('DROP TABLE print_routes')
      database.run('ALTER TABLE print_routes_new RENAME TO print_routes')
      database.run('PRAGMA foreign_keys = ON')
    }
  }

  // Safety net: ensure all expected columns exist after any migration.
  // Migration 14: Add kot_printed flag to order_items so supplementary KOTs only print new items
  if (!hasColumn('order_items', 'kot_printed')) {
    try {
      database.run('ALTER TABLE order_items ADD COLUMN kot_printed INTEGER DEFAULT 0')
      // Backfill: mark items of orders that already had KOT printed
      database.run('UPDATE order_items SET kot_printed = 1 WHERE order_id IN (SELECT id FROM orders WHERE kot_printed = 1)')
    } catch {}
  }

  // Migration 12 recreated the orders table and may have dropped columns added earlier.
  const ordersCols: [string, string][] = [
    ['waiter_id', 'TEXT'],
    ['waiter_name', 'TEXT'],
    ['waiter_order_name', 'TEXT'],
    ['order_notes', 'TEXT'],
    ['invoice_printed', 'INTEGER DEFAULT 0'],
    ['session_id', 'TEXT'],
    ['promo_name', 'TEXT'],
    ['voucher_code', 'TEXT'],
    ['tip_amount', 'REAL DEFAULT 0'],
  ]
  for (const [col, type] of ordersCols) {
    if (!hasColumn('orders', col)) {
      try { database.run(`ALTER TABLE orders ADD COLUMN ${col} ${type}`) } catch {}
    }
  }

  // Migration: Add void tracking columns to order_items
  const itemVoidCols: [string, string][] = [
    ['voided', 'INTEGER DEFAULT 0'],
    ['void_reason', 'TEXT'],
    ['voided_by', 'TEXT'],
    ['voided_at', 'TEXT'],
    ['void_remarks', 'TEXT'],
    ['void_synced', 'INTEGER DEFAULT 0'],
  ]
  for (const [col, type] of itemVoidCols) {
    if (!hasColumn('order_items', col)) {
      try { database.run(`ALTER TABLE order_items ADD COLUMN ${col} ${type}`) } catch {}
    }
  }

  // Migration: Add void_remarks and void_synced to orders
  const orderVoidCols: [string, string][] = [
    ['void_remarks', 'TEXT'],
    ['void_synced', 'INTEGER DEFAULT 0'],
    ['voided_by', 'TEXT'],
    ['void_disposition', 'TEXT'],
  ]
  for (const [col, type] of orderVoidCols) {
    if (!hasColumn('orders', col)) {
      try { database.run(`ALTER TABLE orders ADD COLUMN ${col} ${type}`) } catch {}
    }
  }

  // Migration: Add void_disposition to order_items
  if (!hasColumn('order_items', 'void_disposition')) {
    try { database.run('ALTER TABLE order_items ADD COLUMN void_disposition TEXT') } catch {}
  }
}

/**
 * Write buffer to file and flush to disk (fsync) so the OS cannot lose
 * buffered data during a power cut.
 * Uses a single file descriptor for write + fsync — opening in read mode
 * for fsync does NOT flush the write cache on Windows.
 */
function writeAndFlush(filePath: string, buffer: Buffer): void {
  const fd = openSync(filePath, 'w')
  writeSync(fd, buffer)
  fsyncSync(fd)
  closeSync(fd)
}

/**
 * Atomic save: write to tmp file (+ fsync), backup old file, rename tmp to main.
 * If power cuts during write, the original file is still intact.
 * If power cuts during rename, we recover from backup/tmp on next startup.
 */
function saveDatabaseSafe(): void {
  if (!db || !dbPath) return
  try {
    const data = db.export()
    const buffer = Buffer.from(data)
    // Step 1: Write new data to backup first (so backup always has latest)
    writeAndFlush(dbBackupPath, buffer)
    // Step 2: Write new data to temp file
    writeAndFlush(dbTmpPath, buffer)
    // Step 3: Replace main file (atomic rename on NTFS/APFS/ext4)
    // If main exists, remove it first (rename over existing may fail on Windows)
    if (existsSync(dbPath)) {
      try { unlinkSync(dbPath) } catch {}
    }
    renameSync(dbTmpPath, dbPath)
  } catch (err) {
    console.error('Failed to save database:', err)
  }
}

export function saveDatabase(): void {
  if (!db || !dbPath) return
  // Debounce saves to avoid excessive disk writes
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveDatabaseSafe()
  }, 100)
}

export function saveDatabaseSync(): void {
  saveDatabaseSafe()
}

export function closeDatabase(): void {
  if (saveTimer) clearTimeout(saveTimer)
  if (periodicSaveInterval) {
    clearInterval(periodicSaveInterval)
    periodicSaveInterval = null
  }
  saveDatabaseSync()
  if (db) {
    db.close()
    db = null
  }
}

export function deleteDatabase(): boolean {
  try {
    if (saveTimer) clearTimeout(saveTimer)
    if (periodicSaveInterval) {
      clearInterval(periodicSaveInterval)
      periodicSaveInterval = null
    }
    if (db) {
      db.close()
      db = null
    }
    if (dbPath && existsSync(dbPath)) {
      unlinkSync(dbPath)
    }
    if (dbBackupPath && existsSync(dbBackupPath)) {
      unlinkSync(dbBackupPath)
    }
    if (dbTmpPath && existsSync(dbTmpPath)) {
      unlinkSync(dbTmpPath)
    }
    return true
  } catch (err) {
    console.error('Failed to delete database:', err)
    return false
  }
}
