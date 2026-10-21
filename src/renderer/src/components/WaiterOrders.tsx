import { useCallback, useEffect, useRef, useState } from 'react'
import { useStatus } from '../stores/status'
import { itemColor } from '../stores/menu'
import { toast, askConfirm } from '../stores/ui'
import { Btn, Cap, staffColor, initial, money, BackButton } from '../ui'
import { minutesSince, ageLabel, useTick } from '../ui/hosts'
import { cn } from '../lib/utils'

// Orders from the waiter app wait here before the kitchen sees them.
// With waiter_order_auto_accept on (the default), each one is accepted 5 s after it arrives,
// whether or not this drawer is open; tapping "Hold off" stops the countdown for that order.

const AUTO_MS = 5000

export interface WaiterOrdersState {
  orders: any[]
  deadlines: Record<string, number>
  processing: string | null
  poll: () => Promise<void>
  accept: (name: string) => Promise<void>
  reject: (name: string) => Promise<void>
  pause: (name: string) => void
}

export function chime() {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const note = (freq: number, at: number) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = freq
      g.gain.setValueAtTime(0.0001, ctx.currentTime + at)
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + at + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.45)
      o.connect(g).connect(ctx.destination)
      o.start(ctx.currentTime + at)
      o.stop(ctx.currentTime + at + 0.5)
    }
    note(880, 0)
    note(1318.5, 0.18)
    setTimeout(() => ctx.close(), 1200)
  } catch { /* no audio device */ }
}

export function useWaiterOrders({ autoAccept, onNew, onAccepted }: { autoAccept: boolean; onNew: () => void; onAccepted: () => void }): WaiterOrdersState {
  const [orders, setOrders] = useState<any[]>([])
  const [deadlines, setDeadlines] = useState<Record<string, number>>({})
  const [processing, setProcessing] = useState<string | null>(null)
  const seen = useRef<Set<string>>(new Set())
  const handled = useRef<Set<string>>(new Set())
  const paused = useRef<Set<string>>(new Set())
  const auto = useRef(autoAccept)
  const cb = useRef({ onNew, onAccepted })
  auto.current = autoAccept
  cb.current = { onNew, onAccepted }

  const refresh = useCallback(async () => {
    try {
      const list: any[] = (await window.api.waiterOrders.getPending()) || []
      const visible = list.filter((o) => !handled.current.has(o.name))
      setOrders((prev) => (JSON.stringify(prev) === JSON.stringify(visible) ? prev : visible))
      useStatus.getState().set({ waiterPending: visible.length })
      return visible
    } catch {
      return null
    }
  }, [])

  const poll = useCallback(async () => {
    const visible = await refresh()
    if (!visible) return
    const fresh = visible.filter((o) => !seen.current.has(o.name))
    if (fresh.length) {
      fresh.forEach((o) => seen.current.add(o.name))
      chime()
      cb.current.onNew()
    }
  }, [refresh])

  const accept = useCallback(async (name: string) => {
    if (handled.current.has(name)) return
    handled.current.add(name)
    setDeadlines((d) => { const n = { ...d }; delete n[name]; return n })
    setProcessing(name)
    try {
      const res = await window.api.waiterOrders.accept(name)
      if (res?.success) {
        const msg = res.kotPrinted ? `Order #${res.orderNumber} accepted — KOT printed` : `Order #${res.orderNumber} accepted${res.kotError ? ` (KOT failed: ${res.kotError})` : ''}`
        res.kotPrinted ? toast.success(msg) : toast.error(msg)
        cb.current.onAccepted()
      } else {
        handled.current.delete(name)
        toast.error(`Failed: ${res?.error || 'unknown error'}`)
      }
    } catch (e: any) {
      handled.current.delete(name)
      toast.error(`Failed: ${e?.message || e}`)
    } finally {
      setProcessing(null)
      await refresh()
    }
  }, [refresh])

  const pause = useCallback((name: string) => {
    paused.current.add(name)
    setDeadlines((d) => { const n = { ...d }; delete n[name]; return n })
  }, [])

  const reject = useCallback(async (name: string) => {
    pause(name)
    if (!(await askConfirm({ title: 'Reject this order?', body: 'The waiter sees it was rejected. Nothing goes to the kitchen.', ok: 'Reject', cancel: 'Keep it', danger: true }))) return
    handled.current.add(name)
    try { await window.api.waiterOrders.reject(name) } catch {}
    await refresh()
  }, [pause, refresh])

  // Start a 5 s countdown for every waiting order (once the setting is known to be on)
  useEffect(() => {
    if (!autoAccept) { setDeadlines((d) => (Object.keys(d).length ? {} : d)); return }
    const missing = orders.filter((o) => !paused.current.has(o.name) && !handled.current.has(o.name))
    setDeadlines((d) => {
      let changed = false
      const n = { ...d }
      for (const o of missing) if (!n[o.name]) { n[o.name] = Date.now() + AUTO_MS; changed = true }
      return changed ? n : d
    })
  }, [autoAccept, orders])

  // Auto-accept ticker (independent of the drawer)
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now()
      for (const [name, at] of Object.entries(deadlines)) {
        if (at <= now && !processing) { accept(name); break }
      }
    }, 300)
    return () => clearInterval(t)
  }, [deadlines, processing, accept])

  return { orders, deadlines, processing, poll, accept, reject, pause }
}

function woTotal(wo: any) {
  return (wo.items || []).reduce((s: number, i: any) => s + (i.rate + (i.modifier_total || 0)) * i.qty, 0)
}

export default function WaiterOrders({ state, autoAccept, onClose }: { state: WaiterOrdersState; autoAccept: boolean; onClose: () => void }) {
  useTick(250)
  const { orders, deadlines, processing, accept, reject, pause } = state
  const cur = useStatus((s) => s.currency)
  const waiters = Array.from(new Set(orders.map((o) => o.waiter_name).filter(Boolean)))

  return (
    <div className="fixed inset-x-0 bottom-0 top-10 z-40 flex flex-col bg-n-cream animate-rise" role="dialog" aria-label="Waiter app orders">
      <div className="flex h-14 flex-shrink-0 items-center gap-3 bg-n-rail px-2 text-white">
        <BackButton onClick={onClose} label="Back to the till" />
        <span className="cond ml-1.5 text-2xl font-bold">Waiter app</span>
        <span className="hidden truncate text-[13px] text-n-mist min-[900px]:inline">Orders arrive here before the kitchen sees them</span>
        <span className="flex-1" />
        <span className="text-sm text-n-frost"><span className="cond num text-lg font-bold text-white">{orders.length}</span> waiting</span>
      </div>

      <div className="flex min-h-0 flex-1 gap-3 p-3">
        <div className="flex min-w-0 flex-1 snap-x gap-3 overflow-x-auto">
          {orders.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-1 text-n-muted">
              <span className="cond text-3xl font-bold text-n-ink">Nothing waiting</span>
              <span className="text-sm">New waiter orders appear here with a chime.</span>
            </div>
          )}
          {orders.map((wo) => {
            const items = wo.items || []
            const n = items.reduce((s: number, i: any) => s + i.qty, 0)
            const deadline = deadlines[wo.name]
            const left = deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : null
            const busy = processing === wo.name
            const age = minutesSince(wo.created || wo.creation)
            const where = [wo.table, wo.room].filter(Boolean).join(' · ') || wo.order_type
            // Waiter app v2: a later round for a table that already has an open order arrives as its own
            // Pending waiter order with parent_order + round_no. Accepting it uses the same accept call.
            const isRound = !!wo.parent_order || Number(wo.round_no) > 1
            const place = wo.table ? (/^(table|bed|room|pool)\b/i.test(String(wo.table)) ? String(wo.table) : `Table ${wo.table}`) : null
            const roundText = isRound ? `${wo.round_no ? `Round ${wo.round_no}` : 'Next round'}${place ? ` for ${place}` : ''}` : null
            return (
              <section key={wo.name} className="flex min-w-[272px] max-w-[460px] flex-1 snap-start flex-col overflow-hidden rounded-md bg-white shadow-tile outline outline-2 -outline-offset-2 outline-n-teal">
                <div className="flex items-center gap-2.5 border-b border-n-line px-3.5 pb-2 pt-3">
                  <span className="cond flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-[22px] font-bold text-white" style={{ background: staffColor(wo.waiter_name) }}>{initial(wo.waiter_name)}</span>
                  <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="flex items-baseline gap-2"><span className="cond text-[26px] font-bold">{String(wo.name).replace(/^WO-\d{4}-0*/, 'WO-')}</span><span className="truncate text-sm font-semibold">{where}</span></span>
                    <span className="truncate text-xs text-n-muted">{[wo.waiter_name, wo.guests ? `${wo.guests} guests` : null, wo.order_type].filter(Boolean).join(' · ')}</span>
                  </span>
                  {(wo.created || wo.creation) && <span className="cond num text-xl font-bold text-n-muted">{ageLabel(age)}</span>}
                </div>
                {roundText && (
                  <div className="mx-3.5 mt-2 flex flex-col rounded bg-n-teal px-2.5 py-1.5 text-white">
                    <span className="cond text-lg font-bold leading-tight">{roundText}</span>
                    <span className="truncate text-xs text-n-frost">adds to {wo.parent_order ? String(wo.parent_order).replace(/^WO-\d{4}-0*/, 'WO-') : 'the open order'}, already with the kitchen</span>
                  </div>
                )}
                {wo.notes && <div className="mx-3.5 mt-2 rounded bg-[#FBEFD9] px-2.5 py-1.5 text-[13px] font-semibold text-[#8A5A00]">{wo.notes}</div>}
                <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
                  {items.map((i: any, idx: number) => {
                    const mods = [...(i.modifiers || []).map((m: any) => m.name), i.special_instructions].filter(Boolean).join(', ')
                    return (
                      <div key={idx} className="flex min-h-[40px] items-center gap-2.5 px-2 py-1">
                        <span className="cond num inline-flex h-[22px] min-w-[22px] items-center justify-center rounded px-[5px] text-[15px] font-bold text-white" style={{ background: itemColor(i.item_code, i.item_name) }}>{i.qty}</span>
                        <span className="min-w-0 flex-1 text-sm">{i.item_name}{mods && <span className="text-n-muted"> · {mods}</span>}</span>
                        <span className="num text-sm font-medium">{money((i.rate + (i.modifier_total || 0)) * i.qty)}</span>
                      </div>
                    )
                  })}
                </div>
                <div className="flex justify-between border-t border-n-line px-3.5 py-1.5 text-[13px] text-n-muted">
                  <span>{n} item{n === 1 ? '' : 's'}</span><span className="num font-semibold text-n-ink">{cur} {money(woTotal(wo))}</span>
                </div>
                <div className="flex gap-2 bg-white px-2.5 pb-2.5 pt-2">
                  <button type="button" disabled={busy} onClick={() => reject(wo.name)} className="press h-[60px] w-[72px] rounded-md border-[1.5px] border-n-red bg-white text-[13px] font-semibold text-n-red disabled:opacity-50">Reject</button>
                  {left !== null && !busy && (
                    <button type="button" onClick={() => pause(wo.name)} className="press h-[60px] w-[84px] rounded-md border-[1.5px] border-n-edge bg-white text-[13px] font-semibold">Hold off</button>
                  )}
                  <button type="button" disabled={busy} onClick={() => accept(wo.name)}
                    className={cn('press flex h-[60px] flex-1 flex-col items-center justify-center rounded-md text-base font-bold text-white', busy ? 'bg-n-green' : 'bg-n-deep')}>
                    {busy ? 'Sending to kitchen…' : 'Accept and send'}
                    {left !== null && !busy && <span className="text-xs font-medium text-n-mist">automatically in {left}s</span>}
                  </button>
                </div>
              </section>
            )
          })}
        </div>

        <aside className="hidden w-[236px] flex-shrink-0 flex-col gap-2.5 min-[900px]:flex">
          <div className="flex flex-col gap-2 rounded-md bg-white px-3.5 py-3 shadow-tile">
            <Cap className="text-n-muted">Waiters with orders</Cap>
            {waiters.length === 0 && <span className="text-[13px] text-n-muted">None right now</span>}
            {waiters.map((w) => (
              <span key={w} className="flex items-center gap-2 text-[13px]">
                <span className="cond inline-flex h-6 w-6 items-center justify-center rounded-full text-[13px] font-bold text-white" style={{ background: staffColor(w) }}>{initial(w)}</span>
                <span className="flex-1">{w}</span>
                <span className="text-n-muted">{orders.filter((o) => o.waiter_name === w).length}</span>
              </span>
            ))}
          </div>
          <div className="flex flex-col gap-1.5 rounded-md bg-n-deep px-3.5 py-3 text-[13px] leading-normal text-n-frost">
            <span className="font-semibold text-white">{autoAccept ? 'Auto-accept is on' : 'Auto-accept is off'}</span>
            <span>{autoAccept
              ? 'Each order goes to the kitchen 5 seconds after it arrives. Tap Hold off to check one first.'
              : 'Orders wait here until a cashier accepts them. An admin can turn auto-accept on in Settings.'}</span>
          </div>
          <span className="flex-1" />
          <Btn size="lg" variant="outline" onClick={onClose}>Close</Btn>
        </aside>
      </div>
    </div>
  )
}
