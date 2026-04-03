import { getConfig } from '../database/queries'
import { syncDown } from './sync-down'
import { syncUp } from './sync-up'

let syncInterval: ReturnType<typeof setInterval> | null = null
let isSyncing = false

export interface SyncStatus {
  isSyncing: boolean
  lastSyncAt: string | null
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

  // Run first sync after 15 seconds (give app time to load)
  setTimeout(() => {
    runSync().catch(console.error)
  }, 15000)

  // Then run on interval
  syncInterval = setInterval(() => {
    runSync().catch(console.error)
  }, intervalMs)
}

export function stopAutoSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = null
    console.log('[Sync] Auto-sync stopped')
  }
}
