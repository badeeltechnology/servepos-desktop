import { useMemo, useState, useRef } from 'react'
import { ActiveOrderRow, STAGE, Stage, stageOf, orderLabel, typeShort } from './orderStatus'
import VoidDialog, { VoidResult } from './VoidDialog'
import { useStatus } from '../stores/status'
import { toast } from '../stores/ui'
import { SubBar, BackButton, RailTab, Chip, Dot, SearchIcon, staffColor, initial, money, useTier, Btn } from '../ui'
import { minutesSince, ageLabel, useTick } from '../ui/hosts'
import { cn } from '../lib/utils'
import { useT } from '../stores/i18n'

// Every open order on one board: tabs by type, chips by stage, late ones first. Tap to open.

export type OpenTab = 'All' | 'Dine In' | 'TA' | 'Takeaway' | 'Delivery' | 'Waiter'
type Tab = OpenTab
const inOpenTab = (o: ActiveOrderRow, k: Tab) => k === 'All' || (k === 'Waiter' ? !!o.waiter_name : k === 'TA' ? o.order_type !== 'Dine In' : o.order_type === k)

export default function OpenOrders({ orders, activeOrderId, activeLabel, isSupervisor, waiterPending, onWaiter, onBack, onOpen, onVoid, onRefresh, initialTab = 'All' }: {
  initialTab?: Tab
  orders: ActiveOrderRow[]
  activeOrderId: string | null
  activeLabel: string | null
  isSupervisor: boolean
  waiterPending: number
  onWaiter: () => void
  onBack: () => void
  onOpen: (id: string) => void
  onVoid: (orderId: string, r: VoidResult) => Promise<void>
  onRefresh: () => void
}) {
  useTick(30000)
  const t = useT()
  const { wide, large } = useTier()
  const cur = useStatus((s) => s.currency)
  const [tab, setTab] = useState<Tab>(initialTab)
  const [chip, setChip] = useState<Stage | null>(null)
  const [query, setQuery] = useState('')
  const [finding, setFinding] = useState(false)
  const [menuFor, setMenuFor] = useState<ActiveOrderRow | null>(null)
  const [voidFor, setVoidFor] = useState<ActiveOrderRow | null>(null)
  const findRef = useRef<HTMLInputElement>(null)

  const inTab = useMemo(() => orders.filter((o) => inOpenTab(o, tab)), [orders, tab])
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return inTab
      .filter((o) => !chip || stageOf(o) === chip)
      .filter((o) => !q || [o.table_name, o.order_number, o.waiter_name, o.order_notes, o.cashier_name].some((v) => (v || '').toLowerCase().includes(q)))
      .map((o) => ({ o, age: minutesSince(o.created_at), st: stageOf(o) }))
      .sort((a, b) => {
        const la = a.age >= 30 && a.st !== 'hold' ? 1 : 0
        const lb = b.age >= 30 && b.st !== 'hold' ? 1 : 0
        if (la !== lb) return lb - la
        return b.age - a.age
      })
  }, [inTab, chip, query])

  const tabs: [Tab, string][] = [['All', t('All')], ['Dine In', t('Dine in')], ['TA', t('Takeaway & delivery')], ['Waiter', t('With waiter')]]
  const cols = large ? 6 : wide ? 5 : 4

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-n-cream">
      <SubBar className="gap-2.5">
        <BackButton onClick={onBack} label={activeLabel ? t('Back to {name}', { name: activeLabel }) : t('Back')} />
        <span className="cond ml-1.5 whitespace-nowrap text-2xl font-bold">{t('Open orders')}</span>
        <span className="flex-1" />
        <div className="flex gap-0.5 overflow-x-auto">
          {tabs.map(([k, l]) => (
            <RailTab key={k} active={tab === k} onClick={() => setTab(k)}>
              {l} <span className="cond num text-[17px] font-bold">{orders.filter((o) => inOpenTab(o, k)).length}</span>
            </RailTab>
          ))}
        </div>
      </SubBar>

      <div className="flex flex-shrink-0 items-center gap-1.5 px-3 pb-1 pt-2.5">
        {(['draft', 'kitchen', 'ready', 'hold', 'invoiced'] as Stage[]).map((k) => {
          const n = inTab.filter((o) => stageOf(o) === k).length
          if (!n && chip !== k && k === 'invoiced') return null
          return (
            <Chip key={k} active={chip === k} onClick={() => setChip(chip === k ? null : k)}>
              <Dot color={STAGE[k].color} size={9} square />{t(STAGE[k].label)} <span className="num opacity-60">{n}</span>
            </Chip>
          )
        })}
        <span className="flex-1" />
        {waiterPending > 0 && <Btn variant="teal" onClick={onWaiter}>Waiter app · {waiterPending} new</Btn>}
        {!finding && <span className="hidden text-xs text-n-muted min-[1100px]:inline">{t('Late first, then oldest')}</span>}
        {finding ? (
          <label className="flex h-11 items-center gap-2 rounded-full border-2 border-n-teal bg-white px-3">
            <SearchIcon />
            <input ref={findRef} autoFocus data-keyboard="full" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Table, number, waiter" className="w-44 bg-transparent text-sm focus:outline-none" />
            <button type="button" aria-label="Close search" onClick={() => { setQuery(''); setFinding(false) }} className="text-lg text-n-muted">×</button>
          </label>
        ) : (
          <button type="button" aria-label="Find" onClick={() => setFinding(true)} className="press flex h-11 w-11 items-center justify-center rounded-full border border-[#E0D9CB] bg-white"><SearchIcon /></button>
        )}
      </div>

      <main className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto px-3 pb-2.5 pt-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: 104 }}>
        {shown.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center gap-1 py-20 text-n-muted">
            <span className="cond text-2xl font-bold text-n-ink">{orders.length ? t('No orders match') : t('No open orders')}</span>
            <span className="text-sm">{orders.length ? 'Clear the filter to see everything.' : 'New orders show up here as soon as they are sent or held.'}</span>
          </div>
        )}
        {shown.map(({ o, age, st }) => {
          const late = age >= 30 && st !== 'hold'
          const current = o.id === activeOrderId
          const sub = o.order_type === 'Dine In'
            ? [o.room, o.guests ? `${o.guests} guest${o.guests === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ') || 'Dine in'
            : [typeShort(o.order_type), o.order_notes].filter(Boolean).join(' · ')
          const who = o.waiter_name // the badge is always the waiter (none when there is no waiter)
          return (
            <div key={o.id} className="relative">
              <button type="button" onClick={() => onOpen(o.id)}
                className={cn('press relative flex h-full w-full overflow-hidden rounded-md bg-white text-start text-n-ink shadow-tile',
                  current ? 'outline outline-[3px] -outline-offset-[3px] outline-n-amber' : late ? 'outline outline-2 -outline-offset-2 outline-n-red' : '')}>
                <span className="w-[7px] flex-shrink-0" style={{ background: STAGE[st].color }} />
                <span className="flex min-w-0 flex-1 flex-col px-2.5 py-2">
                  <span className="flex items-baseline justify-between gap-1.5">
                    <span className="cond min-w-0 truncate text-[28px] font-bold leading-none">{orderLabel(o)}</span>
                    <span className={cn('cond num text-lg font-bold', late ? 'rounded bg-n-red px-1.5 py-px text-white' : age >= 20 ? 'text-[#B56A00]' : 'text-n-muted')}>{ageLabel(age)}</span>
                  </span>
                  <span className="mt-[3px] truncate text-xs text-n-muted">{sub}</span>
                  <span className="mt-auto flex items-center gap-1.5 text-xs">
                    <Dot color={STAGE[st].color} size={9} square />
                    <span className="font-semibold">{t(STAGE[st].label)}</span>
                    <span className="flex-1" />
                    <span className="num text-sm font-semibold">{o.grand_total ? `${cur} ${money(o.grand_total)}` : ''}</span>
                  </span>
                </span>
                {who && (
                  <span className="absolute bottom-8 right-2 flex h-[22px] w-[22px] items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: staffColor(who) }} title={who}>{initial(who)}</span>
                )}
              </button>
              {isSupervisor && o.status === 'Hold' && (
                <button type="button" aria-label={`More for ${orderLabel(o)}`} onClick={() => setMenuFor(o)}
                  className="absolute right-1 top-9 flex h-8 w-8 items-center justify-center rounded-full text-n-muted hover:bg-n-cream">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
                </button>
              )}
            </div>
          )
        })}
      </main>

      {menuFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,59,73,.45)]" onMouseDown={(e) => { if (e.target === e.currentTarget) setMenuFor(null) }}>
          <div className="flex w-80 animate-rise flex-col overflow-hidden rounded-md bg-white shadow-pop">
            <span className="border-b border-n-line px-4 py-3 text-[15px] font-semibold">{orderLabel(menuFor)} · {menuFor.order_number}</span>
            <button type="button" className="h-12 px-4 text-start text-sm" onClick={() => { const id = menuFor.id; setMenuFor(null); onOpen(id) }}>{t('Open on the POS')}</button>
            <button type="button" className="h-12 px-4 text-start text-sm" onClick={async () => { const id = menuFor.id; setMenuFor(null); try { const r = await window.api.print.invoice(id); r?.success === false ? toast.error('Invoice print failed') : toast.success('Invoice printed') } catch { toast.error('Invoice print failed') } }}>{t('Print invoice')}</button>
            <button type="button" className="h-12 border-t border-n-line px-4 text-start text-sm font-semibold text-n-red" onClick={() => { setVoidFor(menuFor); setMenuFor(null) }}>{t('Void order')}</button>
          </div>
        </div>
      )}

      {voidFor && (
        <VoidDialog
          requirePin={false}
          target={{ kind: 'order', title: `Void ${orderLabel(voidFor)}`, subtitle: `${voidFor.order_number} is on hold. The whole order is cancelled and a void slip prints.`, amount: voidFor.grand_total }}
          onCancel={() => setVoidFor(null)}
          onConfirm={async (r) => { await onVoid(voidFor.id, r); setVoidFor(null); toast.success(`${orderLabel(voidFor)} voided`); onRefresh() }}
        />
      )}
    </div>
  )
}
