import { getConfig } from '../database/queries'
import { syncDown } from './sync-down'
import { syncUp } from './sync-up'

let syncInterval: ReturnType<typeof setInterval> | null = null
let isSyncing = false
let nextSyncAt: number | null = null // timestamp of next scheduled sync

export interface SyncStatus {
  isSyncing: boolean
  lastSyncAt: string | null
  nextSyncIn: number | null // seconds until next sync
  lastResult: {
    down?: { success: boolean; counts?: Record<string, number>; error?: string }
    up?: { success: boolean; synced: number; failed: number; errors: string[] }
  } | null
}

let lastResult: SyncStatus['lastResult'] = null

export function getSyncStatus(): SyncStatus {
  return {
    isSyncing,
    lastSyncAt: getConfig('last_sync_at'),
    nextSyncIn: nextSyncAt ? Math.max(0, Math.round((nextSyncAt - Date.now()) / 1000)) : null,
    lastResult
  }
}

export async function runSync(): Promise<SyncStatus['lastResult']> {
  if (isSyncing) return lastResult

  // Check if setup is complete
  const erpnextUrl = getConfig('erpnext_url')
  if (!erpnextUrl) return lastResult

  isSyncing = true
  console.log('[Sync] Starting sync...')
  try {
    // Sync down first (get latest items etc.)
    const downResult = await syncDown()
    console.log('[Sync] Down:', downResult.success ? 'OK' : downResult.error)

    // Then sync up (push local orders) — even if down fails
    const upResult = await syncUp()
    console.log('[Sync] Up:', upResult.synced, 'synced,', upResult.failed, 'failed')

    lastResult = { down: downResult, up: upResult }

    // Ensure auto-sync is running (may not have started if setup wasn't done at boot)
    if (!syncInterval) startAutoSync()

    return lastResult
  } catch (err: any) {
    console.error('[Sync] Error:', err.message)
    lastResult = {
      down: { success: false, error: err.message },
      up: { success: false, synced: 0, failed: 0, errors: [err.message] }
    }
    return lastResult
  } finally {
    isSyncing = false
  }
}

export function startAutoSync(): void {
  stopAutoSync()

  // Check if setup is complete
  const erpnextUrl = getConfig('erpnext_url')
  if (!erpnextUrl) {
    console.log('[Sync] Auto-sync skipped: no ERPNext URL configured')
    return
  }

  const intervalMinutes = parseInt(getConfig('auto_sync_interval') || '5')
  if (intervalMinutes <= 0) return

  const intervalMs = intervalMinutes * 60 * 1000
  console.log(`[Sync] Auto-sync started: every ${intervalMinutes} minutes`)

  function scheduleNext(): void {
    nextSyncAt = Date.now() + intervalMs
  }

  // Run first sync after 15 seconds (give app time to load)
  nextSyncAt = Date.now() + 15000
  setTimeout(() => {
    runSync().then(() => scheduleNext()).catch(() => scheduleNext())
  }, 15000)

  // Then run on interval
  syncInterval = setInterval(() => {
    runSync().then(() => scheduleNext()).catch(() => scheduleNext())
  }, intervalMs)
}

export function stopAutoSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = null
    nextSyncAt = null
    console.log('[Sync] Auto-sync stopped')
  }
}
