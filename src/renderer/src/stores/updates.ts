import { create } from 'zustand'

// Types come from the preload bridge (src/preload/update-types.ts) via window.api.
type UpdatesApi = Window['api']['updates']
export type UpdateState = Awaited<ReturnType<UpdatesApi['getState']>>
export type UpdateChannel = Parameters<UpdatesApi['setChannel']>[0]

// Mirror of the main-process updater (src/main/updater.ts). The main process pushes every state
// change; this store only forwards actions. Nothing here downloads or restarts on its own.
interface UpdatesStore {
  state: UpdateState | null
  /** Action in flight from this screen (the main process still owns the real status). */
  pending: 'check' | 'download' | 'install' | 'channel' | null
  /** Last action error to show beside the buttons. */
  actionError: string | null
  init: () => void
  check: () => Promise<void>
  download: () => Promise<void>
  install: () => Promise<boolean>
  setChannel: (ch: UpdateChannel) => Promise<void>
  /** Set by the sign-in chip so the admin panel opens on Updates. */
  openRequested: boolean
  requestOpen: () => void
  takeOpenRequest: () => boolean
}

let started = false

export const useUpdates = create<UpdatesStore>((set, get) => {
  const run = async (kind: NonNullable<UpdatesStore['pending']>, fn: () => Promise<any>): Promise<boolean> => {
    set({ pending: kind, actionError: null })
    try {
      const r = await fn()
      if (r?.state) set({ state: r.state })
      if (r && r.ok === false) { set({ actionError: r.error || 'Something went wrong' }); return false }
      return true
    } catch (e: any) {
      set({ actionError: e?.message || String(e) })
      return false
    } finally {
      set({ pending: null })
    }
  }
  return {
    state: null,
    pending: null,
    openRequested: false,
    requestOpen: () => set({ openRequested: true }),
    takeOpenRequest: () => { const r = get().openRequested; if (r) set({ openRequested: false }); return r },
    actionError: null,
    init: () => {
      if (started) return
      const api = (window.api as any)?.updates
      if (!api) return
      started = true
      try { api.onState?.((s: UpdateState) => set({ state: s })) } catch { /* older preload */ }
      Promise.resolve(api.getState()).then((s: UpdateState | null) => { if (s && !get().state) set({ state: s }) }).catch(() => {})
    },
    check: async () => { await run('check', () => window.api.updates.check()) },
    download: async () => { await run('download', () => window.api.updates.download()) },
    install: () => run('install', () => window.api.updates.install()),
    setChannel: async (ch) => { await run('channel', () => window.api.updates.setChannel(ch)) }
  }
})

/** An update the outlet should know about: found or already downloaded. */
export function hasUpdate(s: UpdateState | null): boolean {
  return !!s && !!s.version && (s.status === 'available' || s.status === 'downloading' || s.status === 'downloaded')
}

export function fmtBytes(n?: number): string {
  if (!n || n <= 0) return '0 MB'
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
