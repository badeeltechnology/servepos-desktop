import { useEffect, useState } from 'react'
import { useToast, useConfirm } from '../stores/ui'
import { t, useT } from '../stores/i18n'
import { Btn, Dialog } from '.'
import { cn } from '../lib/utils'

/** Toast stack under the status band. Errors marked sticky stay until dismissed and can Retry. */
export function ToastHost() {
  const { toasts, dismiss } = useToast()
  useT()
  useEffect(() => {
    const timers = toasts.filter((x) => !x.sticky).map((x) => setTimeout(() => dismiss(x.id), x.type === 'error' ? 6000 : 4000))
    return () => timers.forEach(clearTimeout)
  }, [toasts, dismiss])
  if (!toasts.length) return null
  return (
    <div className="pointer-events-none fixed left-1/2 top-[52px] z-[10050] flex max-w-[80vw] -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((x) => (
        <div role={x.type === 'error' ? 'alert' : 'status'} key={x.id}
          className={cn('pointer-events-auto flex animate-rise items-center gap-2.5 rounded-md py-2 pl-5 pr-2 text-sm font-semibold shadow-pop',
            x.type === 'success' ? 'bg-n-green text-white' : x.type === 'info' ? 'bg-n-deep text-white' : 'bg-n-red text-white')}>
          {x.type === 'info' && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
          <span className="py-1">{x.message}</span>
          {x.action && (
            <button type="button" onClick={async () => { dismiss(x.id); await x.action!.run() }}
              className="press h-10 rounded-md bg-white px-3 text-sm font-bold text-n-red">{t(x.action.label)}</button>
          )}
          <button type="button" aria-label="Dismiss" onClick={() => dismiss(x.id)} className="h-10 w-9 text-lg leading-none text-white/80">×</button>
        </div>
      ))}
    </div>
  )
}

export function ConfirmHost() {
  const { pending, answer } = useConfirm()
  const [typed, setTyped] = useState('')
  useT()
  useEffect(() => { setTyped('') }, [pending])
  if (!pending) return null
  const locked = !!pending.typeToConfirm && typed.trim().toUpperCase() !== pending.typeToConfirm.toUpperCase()
  return (
    <Dialog onClose={() => answer(false)} className="w-[440px]" label={pending.title}>
      <div className="flex flex-col gap-2 px-5 pb-4 pt-5">
        <span className={cn('cond text-[26px] font-bold leading-none', pending.danger ? 'text-n-red' : 'text-n-deep')}>{pending.title}</span>
        {pending.body && <span className="whitespace-pre-line text-sm text-n-muted">{pending.body}</span>}
        {pending.typeToConfirm && (
          <label className="mt-1 flex flex-col gap-1 text-sm text-n-muted">Type {pending.typeToConfirm} to confirm
            <input autoFocus data-keyboard="full" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label={`Type ${pending.typeToConfirm} to confirm`}
              className="h-12 rounded-md border border-n-edge bg-white px-3 text-[15px] uppercase tracking-widest focus:border-2 focus:border-n-red focus:outline-none" />
          </label>
        )}
      </div>
      <div className="flex gap-2 bg-white px-4 py-3">
        <Btn size="lg" variant="outline" onClick={() => answer(false)}>{pending.cancel || t('Cancel')}</Btn>
        <span className="flex-1" />
        <Btn size="lg" variant={pending.danger ? 'danger' : 'deep'} disabled={locked} onClick={() => answer(true)} autoFocus={!pending.typeToConfirm}>{pending.ok || 'OK'}</Btn>
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
