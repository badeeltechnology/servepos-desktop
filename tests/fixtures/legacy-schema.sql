-- ServePOS 2.15.1 schema, generated from the pre-native implementation.
CREATE TABLE config (
      key TEXT PRIMARY KEY,
      value TEXT
    );

CREATE TABLE receipt_config (
      key TEXT PRIMARY KEY,
      value TEXT
    );

CREATE TABLE admin (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

CREATE TABLE items (
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
    , visible_profiles TEXT);

CREATE TABLE boms (
      bom_name TEXT PRIMARY KEY,
      item_code TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      synced_at TEXT,
      FOREIGN KEY (item_code) REFERENCES items(item_code)
    );

CREATE TABLE bom_items (
      id TEXT PRIMARY KEY,
      bom_name TEXT NOT NULL,
      item_code TEXT NOT NULL,
      item_name TEXT,
      qty REAL NOT NULL,
      stock_uom TEXT,
      FOREIGN KEY (bom_name) REFERENCES boms(bom_name)
    );

CREATE TABLE item_groups (
      name TEXT PRIMARY KEY,
      name_ar TEXT,
      parent_item_group TEXT,
      image TEXT,
      is_visible INTEGER DEFAULT 1,
      synced_at TEXT
    , is_menu_group INTEGER DEFAULT 0);

CREATE TABLE tables_list (
      name TEXT PRIMARY KEY,
      table_name TEXT NOT NULL,
      room TEXT,
      capacity INTEGER DEFAULT 4,
      status TEXT DEFAULT 'Available' CHECK(status IN ('Available', 'Occupied', 'Reserved', 'Blocked')),
      current_order_id TEXT,
      is_active INTEGER DEFAULT 1,
      synced_at TEXT
    , branch TEXT);

CREATE TABLE rooms (
      name TEXT PRIMARY KEY,
      room_name TEXT NOT NULL,
      description TEXT,
      is_active INTEGER DEFAULT 1,
      synced_at TEXT
    , branch TEXT);

CREATE TABLE modifier_groups (
      id TEXT PRIMARY KEY,
      group_name TEXT NOT NULL,
      selection_type TEXT DEFAULT 'Single' CHECK(selection_type IN ('Single', 'Multiple')),
      is_required INTEGER DEFAULT 0,
      max_selections INTEGER DEFAULT 0
    , erpnext_name TEXT);

CREATE TABLE modifiers (
      id TEXT PRIMARY KEY,
      modifier_group_id TEXT NOT NULL,
      modifier_name TEXT NOT NULL,
      price REAL DEFAULT 0,
      is_default INTEGER DEFAULT 0,
      FOREIGN KEY (modifier_group_id) REFERENCES modifier_groups(id) ON DELETE CASCADE
    );

CREATE TABLE item_modifier_groups (
      id TEXT PRIMARY KEY,
      item_code TEXT NOT NULL,
      modifier_group_id TEXT NOT NULL,
      is_required INTEGER DEFAULT 0,
      display_order INTEGER DEFAULT 0,
      FOREIGN KEY (item_code) REFERENCES items(item_code),
      FOREIGN KEY (modifier_group_id) REFERENCES modifier_groups(id) ON DELETE CASCADE
    );

CREATE TABLE payment_methods (
      name TEXT PRIMARY KEY,
      mode_of_payment TEXT NOT NULL,
      is_default INTEGER DEFAULT 0,
      allow_in_returns INTEGER DEFAULT 0,
      synced_at TEXT
    );

CREATE TABLE order_items (
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
      special_instructions TEXT, kot_printed INTEGER DEFAULT 0, voided INTEGER DEFAULT 0, void_reason TEXT, voided_by TEXT, voided_at TEXT, void_remarks TEXT, void_synced INTEGER DEFAULT 0, void_disposition TEXT,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

CREATE TABLE order_payments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      amount REAL NOT NULL,
      reference TEXT, collected_by_waiter TEXT,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

CREATE TABLE order_edit_log (
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
    );

CREATE TABLE sync_queue (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'synced', 'failed')),
      attempts INTEGER DEFAULT 0,
      last_attempt_at TEXT,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

CREATE TABLE sessions (
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
    , status TEXT DEFAULT 'Open', user_name TEXT, opening_balance TEXT DEFAULT '[]', closing_balance TEXT DEFAULT '[]', expected_balance TEXT DEFAULT '[]', erpnext_opening_name TEXT, erpnext_closing_name TEXT, remarks TEXT, shift_log_synced INTEGER DEFAULT 0);

CREATE TABLE tax_templates (
      name TEXT PRIMARY KEY,
      tax_rate REAL,
      tax_type TEXT,
      account_head TEXT,
      synced_at TEXT
    );

CREATE TABLE printers (
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
    );

CREATE TABLE print_queue (
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
    );

CREATE TABLE print_log (
      id TEXT PRIMARY KEY,
      order_id TEXT,
      print_type TEXT,
      printer_id TEXT,
      status TEXT,
      error TEXT,
      source TEXT,
      actor_name TEXT,
      printed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

CREATE TABLE promos (
      name TEXT PRIMARY KEY,
      promo_name TEXT NOT NULL,
      discount_type TEXT NOT NULL CHECK(discount_type IN ('Percentage', 'Amount')),
      discount_value REAL NOT NULL,
      enabled INTEGER DEFAULT 1,
      synced_at TEXT
    );

CREATE TABLE void_reasons (
      name TEXT PRIMARY KEY,
      reason_name TEXT NOT NULL,
      display_order INTEGER DEFAULT 0,
      enabled INTEGER DEFAULT 1,
      synced_at TEXT
    );

CREATE TABLE waiters (
      name TEXT PRIMARY KEY,
      waiter_name TEXT NOT NULL,
      phone TEXT,
      is_active INTEGER DEFAULT 1,
      synced_at TEXT
    );

CREATE TABLE "users" (
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
      );

CREATE TABLE "orders" (
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
    , promo_name TEXT, waiter_order_name TEXT, order_notes TEXT, invoice_printed INTEGER DEFAULT 0, voucher_code TEXT, tip_amount REAL DEFAULT 0, void_remarks TEXT, void_synced INTEGER DEFAULT 0, voided_by TEXT, void_disposition TEXT);

CREATE TABLE "print_routes" (
        id TEXT PRIMARY KEY,
        print_type TEXT NOT NULL CHECK(print_type IN ('receipt', 'kot', 'prep_doc', 'invoice')),
        item_group TEXT,
        kitchen_station TEXT,
        printer_id TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        FOREIGN KEY (printer_id) REFERENCES printers(id) ON DELETE CASCADE
      );

CREATE INDEX idx_items_group ON items(item_group);

CREATE INDEX idx_items_variant ON items(variant_of);

CREATE INDEX idx_items_visible ON items(is_visible, is_available);

CREATE INDEX idx_order_items_order ON order_items(order_id);

CREATE INDEX idx_order_payments_order ON order_payments(order_id);

CREATE INDEX idx_sync_queue_status ON sync_queue(status);

CREATE INDEX idx_tables_status ON tables_list(status);

CREATE INDEX idx_tables_room ON tables_list(room);

CREATE INDEX idx_print_queue_status ON print_queue(status);

CREATE INDEX idx_orders_status ON orders(status);

CREATE INDEX idx_orders_sync ON orders(sync_status);

CREATE INDEX idx_orders_cashier ON orders(cashier_id);

CREATE INDEX idx_orders_date ON orders(created_at);
