import { create } from 'zustand'
import { setMoneyDecimals } from '../ui'

// Live status for the lamps in the status band. The POS shell polls and writes here;
// every full-screen view reads the same values so lamps never disagree.

export interface SyncStatus {
  isSyncing: boolean
  lastSyncAt: string | null
  nextSyncIn: number | null
  lastResult: {
    down?: { success: boolean; counts?: Record<string, number>; error?: string }
    up?: { success: boolean; synced: number; failed: number; errors: string[] }
  } | null
}

interface StatusState {
  sync: SyncStatus | null
  pendingSync: number
  failedSync: number
  printers: number
  waiterPending: number
  erpConfigured: boolean
  brand: { name: string; sub: string }
  currency: string
  /** Payment method treated as cash (change, drawer). From config `cash_payment_method`, else the method named like "cash". */
  cashMethod: string | null
  setSync: (s: SyncStatus | null) => void
  set: (p: Partial<Omit<StatusState, 'set' | 'setSync'>>) => void
}

export const useStatus = create<StatusState>((set) => ({
  sync: null,
  pendingSync: 0,
  failedSync: 0,
  printers: 0,
  waiterPending: 0,
  erpConfigured: true,
  brand: { name: 'ServePOS', sub: '' },
  currency: 'QAR',
  cashMethod: null,
  setSync: (sync) => set((st) => (JSON.stringify(st.sync) === JSON.stringify(sync) ? st : { sync })),
  set: (p) => set(p as any)
}))

/** Loads the brand line (restaurant name · POS profile) once. */
export async function loadBrand() {
  try {
    const [rc, profile] = await Promise.all([window.api.receiptConfig.getAll(), window.api.config.get('pos_profile')])
    const name = (rc?.restaurant_name || 'ServePOS').trim()
    useStatus.getState().set({ brand: { name, sub: profile || '' }, currency: rc?.currency_symbol || 'QAR', cashMethod: rc?.cash_payment_method || null })
    setMoneyDecimals(parseInt(rc?.currency_decimals ?? '2'))
  } catch { /* keep default */ }
  try {
    const printers = await window.api.printers.get()
    useStatus.getState().set({ printers: (printers || []).filter((p: any) => p.is_active !== 0).length })
  } catch { /* ignore */ }
  try {
    const url = await window.api.config.get('erpnext_url')
    useStatus.getState().set({ erpConfigured: !!url })
  } catch { /* ignore */ }
}

/** Refreshes the "N to sync" count for the current shift. */
export async function refreshPendingSync(sessionId: string | null) {
  if (!sessionId) return
  try {
    const list = (await window.api.sessions.getPendingSync(sessionId)) || []
    const pending = list.length
    const failed = list.filter((o: any) => o.sync_status === 'failed').length
    const st = useStatus.getState()
    if (st.pendingSync !== pending || st.failedSync !== failed) st.set({ pendingSync: pending, failedSync: failed })
  } catch { /* ignore */ }
}

export function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Is this payment method the cash drawer? Configured name wins; otherwise any method called "cash" (EN/AR). */
export function isCashMethod(method: string | null | undefined, configured?: string | null): boolean {
  if (!method) return false
  const cfg = configured ?? useStatus.getState().cashMethod
  if (cfg) return method === cfg
  return /cash|نقد/i.test(method)
}
