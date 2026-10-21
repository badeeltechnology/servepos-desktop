import { create } from 'zustand'

// App-wide toast + confirm, so any screen can report or ask without its own modal plumbing.

export type ToastType = 'success' | 'error' | 'info'
interface ToastState {
  toast: { type: ToastType; message: string; id: number } | null
  show: (type: ToastType, message: string) => void
  clear: () => void
}
let toastSeq = 0
export const useToast = create<ToastState>((set) => ({
  toast: null,
  show: (type, message) => set({ toast: { type, message, id: ++toastSeq } }),
  clear: () => set({ toast: null })
}))
export const toast = {
  success: (m: string) => useToast.getState().show('success', m),
  error: (m: string) => useToast.getState().show('error', m),
  info: (m: string) => useToast.getState().show('info', m)
}

export interface ConfirmOptions {
  title: string
  body?: string
  ok?: string
  cancel?: string
  danger?: boolean
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
