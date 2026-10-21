import { useEffect, useState } from 'react'
import { useToast, useConfirm } from '../stores/ui'
import { Btn, Dialog } from '.'
import { cn } from '../lib/utils'

/** Bottom-centre toast; auto-dismisses after 4 s (same as before). */
export function ToastHost() {
  const { toast, clear } = useToast()
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(clear, 4000)
    return () => clearTimeout(t)
  }, [toast, clear])
  if (!toast) return null
  return (
    <div role="status" key={toast.id}
      className={cn('fixed top-[52px] left-1/2 z-[10050] flex max-w-[80vw] -translate-x-1/2 animate-rise items-center gap-2.5 rounded-md px-5 py-3 text-sm font-semibold shadow-pop',
        toast.type === 'success' ? 'bg-n-green text-white' : toast.type === 'info' ? 'bg-n-deep text-white' : 'bg-n-red text-white')}
      onClick={clear}>
      {toast.type === 'info' && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
      {toast.message}
    </div>
  )
}

export function ConfirmHost() {
  const { pending, answer } = useConfirm()
  if (!pending) return null
  return (
    <Dialog onClose={() => answer(false)} className="w-[420px]" label={pending.title}>
      <div className="flex flex-col gap-2 px-5 pb-4 pt-5">
        <span className={cn('cond text-[26px] font-bold leading-none', pending.danger ? 'text-n-red' : 'text-n-deep')}>{pending.title}</span>
        {pending.body && <span className="text-sm text-n-muted">{pending.body}</span>}
      </div>
      <div className="flex gap-2 bg-white px-4 py-3">
        <Btn size="lg" variant="outline" onClick={() => answer(false)}>{pending.cancel || 'Cancel'}</Btn>
        <span className="flex-1" />
        <Btn size="lg" variant={pending.danger ? 'danger' : 'deep'} onClick={() => answer(true)} autoFocus>{pending.ok || 'OK'}</Btn>
      </div>
    </Dialog>
  )
}

/** HH:MM clock that re-renders only itself. */
export function Clock({ className, seconds }: { className?: string; seconds?: boolean }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), seconds ? 1000 : 10000)
    return () => clearInterval(t)
  }, [seconds])
  return <span className={className}>{now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) })}</span>
}

/** Minutes since a SQLite UTC timestamp (no tz marker) or ISO string. */
export function minutesSince(ts?: string | null): number {
  if (!ts) return 0
  const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(ts)
  const d = new Date(hasTz ? ts : ts.replace(' ', 'T') + 'Z')
  if (isNaN(d.getTime())) return 0
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000))
}
export function ageLabel(min: number) {
  if (min < 1) return 'now'
  if (min < 60) return `${min}m`
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`
}
export function timeOf(ts?: string | null) {
  if (!ts) return ''
  const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(ts)
  const d = new Date(hasTz ? ts : ts.replace(' ', 'T') + 'Z')
  if (isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

/** Re-render every `ms` (for age labels). */
export function useTick(ms = 30000) {
  const [, set] = useState(0)
  useEffect(() => {
    const t = setInterval(() => set((x) => x + 1), ms)
    return () => clearInterval(t)
  }, [ms])
}
