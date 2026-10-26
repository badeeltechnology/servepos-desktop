import { useEffect } from 'react'
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
// `busy` marks other screens that must not be interrupted (close shift, void); the updater
// refuses to restart while any of them, or the payment screen, is open.
export type BusyReason = 'close-shift' | 'void'
interface SessionGuardState {
  paymentOpen: boolean
  busy: Partial<Record<BusyReason, number>>
  beforeSignOut: (() => Promise<void>) | null
  setPaymentOpen: (v: boolean) => void
  setBusy: (reason: BusyReason, on: boolean) => void
  setBeforeSignOut: (fn: (() => Promise<void>) | null) => void
}
export const useSessionGuard = create<SessionGuardState>((set) => ({
  paymentOpen: false,
  busy: {},
  beforeSignOut: null,
  setPaymentOpen: (paymentOpen) => set({ paymentOpen }),
  // Counted, so two void dialogs (or a void inside close shift) clear correctly.
  setBusy: (reason, on) => set((s) => ({ busy: { ...s.busy, [reason]: Math.max(0, (s.busy[reason] || 0) + (on ? 1 : -1)) } })),
  setBeforeSignOut: (beforeSignOut) => set({ beforeSignOut })
}))
/** Marks a screen busy while it is mounted. */
export function useBusyWhileOpen(reason: BusyReason) {
  useEffect(() => {
    useSessionGuard.getState().setBusy(reason, true)
    return () => useSessionGuard.getState().setBusy(reason, false)
  }, [reason])
}
/** Why a restart would interrupt work right now, or null. */
export function busyReason(): string | null {
  const g = useSessionGuard.getState()
  if (g.paymentOpen) return 'A payment screen is open. Finish or cancel the payment first.'
  if (g.busy['close-shift']) return 'Close shift is open. Finish or cancel it first.'
  if (g.busy.void) return 'A void is in progress. Finish or cancel it first.'
  return null
}
