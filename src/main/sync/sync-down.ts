import { getDb, saveDatabase } from '../database/schema'
import { getConfig, setConfig } from '../database/queries'
import { ERPNextClient } from './erpnext-client'

export async function syncDown(): Promise<{ success: boolean; error?: string; counts?: Record<string, number> }> {
  try {
    const client = new ERPNextClient()
    const db = getDb()
    const counts: Record<string, number> = {}

    // Sync item groups
    const groups = await client.getItemGroups()
    for (const g of groups) {
      db.run(
        `INSERT OR REPLACE INTO item_groups (name, parent_item_group, image, synced_at)
         VALUES (?, ?, ?, datetime('now'))`,
        [g.name, g.parent_item_group || null, g.image || null]
      )
    }
    counts.item_groups = groups.length

    // Sync items
    const lastItemSync = getConfig('last_item_sync')
    const items = await client.getItems(lastItemSync || undefined)
    for (const item of items) {
      // Check if item already exists to preserve local visibility setting
      const existing = db.prepare('SELECT is_visible FROM items WHERE item_code = ?')
      existing.bind([item.name])
      const hasExisting = existing.step()
      const currentVisibility = hasExisting ? (existing.getAsObject() as any).is_visible : 1
      existing.free()

      db.run(
        `INSERT OR REPLACE INTO items (item_code, item_name, item_name_ar, description, description_ar,
         item_group, rate, stock_uom, image, is_available, is_visible, kitchen_station, preparation_time,
         has_variants, variant_of, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          item.name, item.item_name,
          item.servepos_item_name_ar || null,
          item.description || null,
          item.servepos_description_ar || null,
          item.item_group, item.standard_rate || 0,
          item.stock_uom, item.image || null,
          item.servepos_is_available !== undefined ? (item.servepos_is_available ? 1 : 0) : 1,
          currentVisibility,
          item.servepos_kitchen_station || null,
          item.servepos_preparation_time || null,
          item.has_variants ? 1 : 0,
          item.variant_of || null
        ]
      )
    }
    counts.items = items.length
    setConfig('last_item_sync', new Date().toISOString())

    // Sync payment methods and POS Profile details
    const posProfile = getConfig('pos_profile')
    if (posProfile) {
      const profileDoc = await client.getDoc('POS Profile', posProfile)
      if (profileDoc) {
        // Save all POS Profile settings for sync-up invoice creation
        const profileFields: Record<string, string> = {
          warehouse: profileDoc.warehouse || '',
          currency: profileDoc.currency || 'QAR',
          pos_customer: profileDoc.customer || '',
          selling_price_list: profileDoc.selling_price_list || '',
          write_off_account: profileDoc.write_off_account || '',
          write_off_cost_center: profileDoc.write_off_cost_center || '',
          income_account: profileDoc.income_account || '',
          expense_account: profileDoc.expense_account || '',
          cost_center: profileDoc.cost_center || '',
          taxes_and_charges: profileDoc.taxes_and_charges || '',
          tax_category: profileDoc.tax_category || '',
          apply_discount_on: profileDoc.apply_discount_on || 'Grand Total',
          account_for_change_amount: profileDoc.account_for_change_amount || '',
          letter_head: profileDoc.letter_head || '',
          // Accounting dimensions
          branch: profileDoc.branch || '',
          department: profileDoc.department || ''
        }
        for (const [key, value] of Object.entries(profileFields)) {
          if (value) setConfig(key, value)
        }
      }

      const payments = profileDoc?.payments || []
      db.run('DELETE FROM payment_methods')
      for (const p of payments) {
        db.run(
          'INSERT INTO payment_methods (name, mode_of_payment, is_default) VALUES (?, ?, ?)',
          [p.mode_of_payment, p.mode_of_payment, p.default ? 1 : 0]
        )
      }
      counts.payment_methods = payments.length
    }

    // Sync tables
    try {
      const tables = await client.getTables()
      for (const t of tables) {
        const existingTable = db.prepare('SELECT status, current_order_id FROM tables_list WHERE name = ?')
        existingTable.bind([t.name])
        const hasTable = existingTable.step()
        const currentStatus = hasTable ? (existingTable.getAsObject() as any).status : 'Available'
        const currentOrder = hasTable ? (existingTable.getAsObject() as any).current_order_id : null
        existingTable.free()

        db.run(
          `INSERT OR REPLACE INTO tables_list (name, table_name, room, capacity, status, current_order_id, is_active, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
          [t.name, t.table_name, t.room || null, t.capacity || 4, currentStatus, currentOrder, t.is_active ? 1 : 0]
        )
      }
      counts.tables = tables.length
    } catch {
      // Tables doctype may not exist yet
      counts.tables = 0
    }

    // Sync rooms
    try {
      const rooms = await client.getRooms()
      for (const r of rooms) {
        db.run(
          `INSERT OR REPLACE INTO rooms (name, room_name, description, is_active, synced_at)
           VALUES (?, ?, ?, ?, datetime('now'))`,
          [r.name, r.room_name, r.description || null, r.is_active ? 1 : 0]
        )
      }
      counts.rooms = rooms.length
    } catch {
      counts.rooms = 0
    }

    saveDatabase()
    setConfig('last_sync_at', new Date().toISOString())

    return { success: true, counts }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}
