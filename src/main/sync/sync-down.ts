import { getDb, saveDatabase } from '../database/schema'
import { getConfig, setConfig } from '../database/queries'
import { ERPNextClient } from './erpnext-client'
import { v4 as uuidv4 } from 'uuid'
import { cacheAllImages } from './image-cache'

export async function syncDown(): Promise<{ success: boolean; error?: string; counts?: Record<string, number> }> {
  try {
    const client = new ERPNextClient()
    const db = getDb()
    const counts: Record<string, number> = {}

    // Sync item groups
    const groups = await client.getItemGroups()
    for (const g of groups) {
      // Preserve local visibility
      const existing = db.prepare('SELECT is_visible FROM item_groups WHERE name = ?')
      existing.bind([g.name])
      const hasExisting = await existing.step()
      const currentVisibility = hasExisting ? (existing.getAsObject() as any).is_visible : 1
      existing.free()

      await db.run(
        `INSERT OR REPLACE INTO item_groups (name, parent_item_group, image, is_menu_group, is_visible, synced_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        [g.name, g.parent_item_group || null, g.image || null, g.servepos_is_menu_group ? 1 : 0, currentVisibility]
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
      const hasExisting = await existing.step()
      const currentVisibility = hasExisting ? (existing.getAsObject() as any).is_visible : 1
      existing.free()

      await db.run(
        `INSERT OR REPLACE INTO items (item_code, item_name, item_name_ar, description, description_ar,
         item_group, rate, stock_uom, image, is_available, is_visible, kitchen_station, preparation_time,
         has_variants, variant_of, visible_profiles, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
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
          item.variant_of || null,
          item.servepos_visible_profiles || null
        ]
      )
    }
    counts.items = items.length
    await setConfig('last_item_sync', new Date().toISOString())

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
          if (value) await setConfig(key, value)
        }
      }

      const payments = profileDoc?.payments || []
      await db.run('DELETE FROM payment_methods')
      for (const p of payments) {
        await db.run(
          'INSERT INTO payment_methods (name, mode_of_payment, is_default) VALUES (?, ?, ?)',
          [p.mode_of_payment, p.mode_of_payment, p.default ? 1 : 0]
        )
      }
      counts.payment_methods = payments.length
    }

    // Check if there are any pending (unsynced) orders — if so, skip table/room deletion
    const pendingOrdersStmt = db.prepare("SELECT COUNT(*) as c FROM orders WHERE status NOT IN ('Completed', 'Void', 'Returned') OR sync_status IN ('pending', 'failed')")
    const hasPending = await pendingOrdersStmt.step()
    const pendingCount = hasPending ? (pendingOrdersStmt.getAsObject() as any).c : 0
    pendingOrdersStmt.free()
    const canDeleteStaleData = pendingCount === 0

    // Sync tables
    try {
      const tables = await client.getTables()
      const remoteTableNames = new Set(tables.map((t: any) => t.name))

      for (const t of tables) {
        const existingTable = db.prepare('SELECT status, current_order_id FROM tables_list WHERE name = ?')
        existingTable.bind([t.name])
        const hasTable = await existingTable.step()
        const currentStatus = hasTable ? (existingTable.getAsObject() as any).status : 'Available'
        const currentOrder = hasTable ? (existingTable.getAsObject() as any).current_order_id : null
        existingTable.free()

        await db.run(
          `INSERT OR REPLACE INTO tables_list (name, table_name, room, capacity, status, current_order_id, is_active, branch, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
          [t.name, t.table_name, t.room || null, t.capacity || 4, currentStatus, currentOrder, t.is_active === 0 ? 0 : 1, t.branch || null]
        )
      }

      // Delete local tables that no longer exist in ERPNext (only when no pending orders)
      if (canDeleteStaleData) {
        const localTablesStmt = db.prepare('SELECT name FROM tables_list')
        const localNames: string[] = []
        while (await localTablesStmt.step()) {
          localNames.push((localTablesStmt.getAsObject() as any).name)
        }
        localTablesStmt.free()

        for (const localName of localNames) {
          if (!remoteTableNames.has(localName)) {
            // Check no order references this table before deleting
            const orderRefStmt = db.prepare("SELECT COUNT(*) as c FROM orders WHERE table_name = ? AND status NOT IN ('Completed', 'Void', 'Returned')")
            orderRefStmt.bind([localName])
            const refCount = (await orderRefStmt.step()) ? (orderRefStmt.getAsObject() as any).c : 0
            orderRefStmt.free()

            if (refCount === 0) {
              await db.run('DELETE FROM tables_list WHERE name = ?', [localName])
            }
          }
        }
      }

      counts.tables = tables.length
    } catch {
      // Tables doctype may not exist yet
      counts.tables = 0
    }

    // Sync rooms
    try {
      const rooms = await client.getRooms()
      const remoteRoomNames = new Set(rooms.map((r: any) => r.name))

      for (const r of rooms) {
        await db.run(
          `INSERT OR REPLACE INTO rooms (name, room_name, description, is_active, branch, synced_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'))`,
          [r.name, r.room_name, r.description || null, r.is_active === 0 ? 0 : 1, r.branch || null]
        )
      }

      // Delete local rooms that no longer exist in ERPNext
      if (canDeleteStaleData) {
        const localRoomsStmt = db.prepare('SELECT name FROM rooms')
        const localRoomNames: string[] = []
        while (await localRoomsStmt.step()) {
          localRoomNames.push((localRoomsStmt.getAsObject() as any).name)
        }
        localRoomsStmt.free()

        for (const localName of localRoomNames) {
          if (!remoteRoomNames.has(localName)) {
            // Only delete if no tables reference this room
            const tableRefStmt = db.prepare("SELECT COUNT(*) as c FROM tables_list WHERE room = ?")
            tableRefStmt.bind([localName])
            const refCount = (await tableRefStmt.step()) ? (tableRefStmt.getAsObject() as any).c : 0
            tableRefStmt.free()

            if (refCount === 0) {
              await db.run('DELETE FROM rooms WHERE name = ?', [localName])
            }
          }
        }
      }

      counts.rooms = rooms.length
    } catch {
      counts.rooms = 0
    }

    // Sync modifier groups, modifiers, and item assignments from ERPNext
    // All modifier data is managed in ERPNext — clear and rebuild on each sync
    try {
      const modifierGroups = await client.getModifierGroups()

      // Clear all existing modifier data and rebuild from ERPNext
      await db.run('DELETE FROM item_modifier_groups')
      await db.run('DELETE FROM modifiers')
      await db.run('DELETE FROM modifier_groups')

      const groupIdMap: Record<string, string> = {} // erpnext_name → local id

      for (const group of modifierGroups) {
        const groupId = uuidv4()
        groupIdMap[group.group_name] = groupId
        await db.run(
          `INSERT INTO modifier_groups (id, group_name, selection_type, is_required, max_selections, erpnext_name)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [groupId, group.group_name, group.selection_type || 'Single', group.is_required ? 1 : 0, group.max_selections || 0, group.name]
        )

        if (group.modifiers) {
          for (const mod of group.modifiers) {
            await db.run(
              'INSERT INTO modifiers (id, modifier_group_id, modifier_name, price, is_default) VALUES (?, ?, ?, ?, ?)',
              [uuidv4(), groupId, mod.modifier_name, mod.price || 0, mod.is_default ? 1 : 0]
            )
          }
        }
      }
      counts.modifier_groups = modifierGroups.length

      // Sync item-level modifier assignments
      const allItems = db.prepare('SELECT item_code FROM items')
      const itemCodes: string[] = []
      while (await allItems.step()) {
        itemCodes.push((allItems.getAsObject() as any).item_code)
      }
      allItems.free()

      let modifierAssignments = 0
      for (const itemCode of itemCodes) {
        try {
          const itemModifiers = await client.getItemModifiers(itemCode)
          if (itemModifiers && itemModifiers.length > 0) {
            for (const img of itemModifiers) {
              const localGroupId = groupIdMap[img.group_name]
              if (localGroupId) {
                await db.run(
                  'INSERT INTO item_modifier_groups (id, item_code, modifier_group_id, is_required, display_order) VALUES (?, ?, ?, ?, ?)',
                  [uuidv4(), itemCode, localGroupId, img.is_required ? 1 : 0, img.display_order || 0]
                )
                modifierAssignments++
              }
            }
          }
        } catch {
          // Skip items where modifier fetch fails
        }
      }
      counts.modifier_assignments = modifierAssignments
    } catch {
      // Modifier sync failed — servepos app may not have modifier API
      counts.modifier_groups = 0
    }

    // Sync waiters list via the centralized registry (filtered by POS profile)
    try {
      const waiters = posProfile
        ? await client.callMethod('servepos.api.registry.get_waiters', { pos_profile: posProfile })
        : []
      if (Array.isArray(waiters)) {
        await db.run('DELETE FROM waiters')
        for (const w of waiters) {
          await db.run(
            `INSERT INTO waiters (name, waiter_name, phone, is_active, synced_at)
             VALUES (?, ?, ?, 1, datetime('now'))`,
            [w.name, w.waiter_name, w.phone || null]
          )
        }
        counts.waiters = waiters.length
      }
    } catch {
      counts.waiters = 0
    }

    // Sync promos from ERPNext (filtered by POS profile)
    try {
      const promos = await client.getPromos(posProfile || undefined)
      await db.run('DELETE FROM promos')
      for (const p of promos) {
        await db.run(
          `INSERT INTO promos (name, promo_name, discount_type, discount_value, enabled, synced_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'))`,
          [p.name, p.promo_name, p.discount_type, p.discount_value, p.enabled ? 1 : 0]
        )
      }
      counts.promos = promos.length
    } catch {
      // ServePOS Promo doctype may not exist yet
      counts.promos = 0
    }

    // Sync void reasons from ERPNext
    try {
      const voidReasons = await client.getVoidReasons(posProfile || undefined)
      await db.run('DELETE FROM void_reasons')
      for (const r of voidReasons) {
        await db.run(
          `INSERT INTO void_reasons (name, reason_name, display_order, enabled, synced_at)
           VALUES (?, ?, ?, 1, datetime('now'))`,
          [r.name, r.reason_name, r.display_order || 0]
        )
      }
      counts.voidReasons = voidReasons.length
    } catch {
      counts.voidReasons = 0
    }

    // Waiter orders are NOT auto-accepted during sync.
    // They are handled via the POS screen "Waiter" button where cashier manually accepts/rejects.
    // The POS screen polls ERPNext every 15 seconds for pending waiter orders.

    await saveDatabase()
    await setConfig('last_sync_at', new Date().toISOString())

    // Cache item images locally (runs after sync completes, non-blocking for sync result)
    try {
      const allItemsForCache = db.prepare('SELECT item_code, image FROM items')
      const itemsToCache: Array<{ item_code: string; image: string | null }> = []
      while (await allItemsForCache.step()) {
        const row = allItemsForCache.getAsObject() as any
        itemsToCache.push({ item_code: row.item_code, image: row.image || null })
      }
      allItemsForCache.free()

      if (itemsToCache.length > 0) {
        const cachedCount = await cacheAllImages(itemsToCache)
        counts.cached_images = cachedCount
        console.log(`[Sync] Cached ${cachedCount}/${itemsToCache.length} item images`)
      }
    } catch (err: any) {
      console.warn(`[Sync] Image caching failed: ${err.message}`)
    }

    return { success: true, counts }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}
