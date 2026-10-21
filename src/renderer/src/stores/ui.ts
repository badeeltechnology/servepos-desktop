import { create } from 'zustand'

// App-wide toasts + confirm, so any screen can report or ask without its own modal plumbing.
// Toasts stack. Success/info fade after 4 s; errors that need action (print failures) stay until
// dismissed and can carry a Retry. A later "Printing…" never replaces an error.

export type ToastType = 'success' | 'error' | 'info'
export interface ToastItem {
  id: number
  type: ToastType
  message: string
  sticky?: boolean
  action?: { label: string; run: () => void | Promise<void> }
}
interface ToastState {
  toasts: ToastItem[]
  show: (type: ToastType, message: string, opts?: { sticky?: boolean; action?: ToastItem['action'] }) => number
  dismiss: (id: number) => void
  clear: () => void
}
let toastSeq = 0
export const useToast = create<ToastState>((set) => ({
  toasts: [],
  show: (type, message, opts) => {
    const id = ++toastSeq
    set((s) => {
      // Non-sticky toasts replace each other; sticky ones stay. Keep at most 4.
      const kept = s.toasts.filter((x) => x.sticky)
      return { toasts: [...kept, { id, type, message, ...opts }].slice(-4) }
    })
    return id
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
  clear: () => set({ toasts: [] })
}))
export const toast = {
  success: (m: string) => useToast.getState().show('success', m),
  error: (m: string) => useToast.getState().show('error', m),
  info: (m: string) => useToast.getState().show('info', m),
  /** Error that stays on screen until dismissed, optionally with a Retry. */
  sticky: (m: string, retry?: () => void | Promise<void>) =>
    useToast.getState().show('error', m, { sticky: true, action: retry ? { label: 'Retry', run: retry } : undefined })
}

export interface ConfirmOptions {
  title: string
  body?: string
  ok?: string
  cancel?: string
  danger?: boolean
  /** Require typing this word to enable OK (for irreversible actions). */
  typeToConfirm?: string
}
interface ConfirmState {
  pending: (ConfirmOptions & { resolve: (v: boolean) => void }) | null
  ask: (o: ConfirmOptions) => Promise<boolean>
  answer: (v: boolean) => void
}
export const useConfirm = create<ConfirmState>((set, get) => ({
  pending: null,
  ask: (o) => new Promise<boolean>((resolve) => {
    const prev = get().pending
    if (prev) prev.resolve(false)
    set({ pending: { ...o, resolve } })
  }),
  answer: (v) => {
    const p = get().pending
    set({ pending: null })
    p?.resolve(v)
  }
}))
/** Touch-friendly replacement for window.confirm. Resolves true for the OK button. */
export const askConfirm = (o: ConfirmOptions) => useConfirm.getState().ask(o)

// Session guard: the payment screen blocks the inactivity timeout, and the POS registers a
// hook that puts the current order on hold before anyone is signed out.
interface SessionGuardState {
  paymentOpen: boolean
  beforeSignOut: (() => Promise<void>) | null
  setPaymentOpen: (v: boolean) => void
  setBeforeSignOut: (fn: (() => Promise<void>) | null) => void
}
export const useSessionGuard = create<SessionGuardState>((set) => ({
  paymentOpen: false,
  beforeSignOut: null,
  setPaymentOpen: (paymentOpen) => set({ paymentOpen }),
  setBeforeSignOut: (beforeSignOut) => set({ beforeSignOut })
}))
