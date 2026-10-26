import { getDb } from './worker-store'

export function createTables(): void {
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

export function runMigrations(): void {
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

  // Rebuild CHECK constraints without dropping any existing columns or values.
  rebuildConstraint('users', 'coordinator', "role IN ('supervisor', 'cashier', 'coordinator')")
  rebuildConstraint('orders', 'Preparing', "status IN ('Open', 'Hold', 'Preparing', 'Ready to Serve', 'Invoiced', 'Completed', 'Void', 'Returned')")

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

  rebuildConstraint('print_routes', 'prep_doc', "print_type IN ('receipt', 'kot', 'prep_doc', 'invoice')")

  // Safety net: ensure all expected columns exist after any migration.
  // Migration 14: Add kot_printed flag to order_items so supplementary KOTs only print new items
  if (!hasColumn('order_items', 'kot_printed')) {
    {
      database.run('ALTER TABLE order_items ADD COLUMN kot_printed INTEGER DEFAULT 0')
      // Backfill: mark items of orders that already had KOT printed
      database.run('UPDATE order_items SET kot_printed = 1 WHERE order_id IN (SELECT id FROM orders WHERE kot_printed = 1)')
    }
  }

  // Additive: when each line went to the kitchen, so the till can show rounds ("Round 2 · sent 14:12").
  // Nullable; older lines and older app versions simply leave it empty.
  if (!hasColumn('order_items', 'sent_at')) {
    database.run('ALTER TABLE order_items ADD COLUMN sent_at TEXT')
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
      database.run(`ALTER TABLE orders ADD COLUMN ${col} ${type}`)
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
      database.run(`ALTER TABLE order_items ADD COLUMN ${col} ${type}`)
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
      database.run(`ALTER TABLE orders ADD COLUMN ${col} ${type}`)
    }
  }

  // Migration: Add void_disposition to order_items
  if (!hasColumn('order_items', 'void_disposition')) {
    database.run('ALTER TABLE order_items ADD COLUMN void_disposition TEXT')
  }

  // Migration: Add shift_log_synced to sessions for tracking ERPNext shift log sync
  if (!hasColumn('sessions', 'shift_log_synced')) {
    database.run('ALTER TABLE sessions ADD COLUMN shift_log_synced INTEGER DEFAULT 0')
  }
}


function rebuildConstraint(table: string, marker: string, check: string): void {
  const native = getDb().native
  const original = native.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table) as {sql: string}
  if (original.sql.includes(marker)) return
  const indexes = native.prepare("SELECT sql FROM sqlite_master WHERE type IN ('index', 'trigger') AND tbl_name=? AND sql IS NOT NULL").all(table) as {sql: string}[]
  const temporary = table + '_native_upgrade'
  const create = original.sql.replace(/CREATE TABLE\s+(?:"[^"]+"|`[^`]+`|\w+)/i, 'CREATE TABLE "' + temporary + '"')
    .replace(/CHECK\s*\(\s*(?:role|status|print_type)\s+IN\s*\([^)]*\)\s*\)/i, 'CHECK(' + check + ')')
  if (create === original.sql || !create.includes(marker)) throw new Error('Cannot migrate constraint for ' + table)
  native.exec(create)
  native.exec(`INSERT INTO "${temporary}" SELECT * FROM "${table}"; DROP TABLE "${table}"; ALTER TABLE "${temporary}" RENAME TO "${table}"`)
  for (const index of indexes) native.exec(index.sql)
}
