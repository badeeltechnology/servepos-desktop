import { useEffect, useState } from 'react'
import { useStatus } from '../stores/status'
import { useFloor } from '../stores/floor'
import { useMenu, itemColor } from '../stores/menu'
import { useT, useLang } from '../stores/i18n'
import { Btn, Cap, money } from '../ui'
import { ageLabel, timeOf, useTick } from '../ui/hosts'
import { cn } from '../lib/utils'
import { TileInfo } from './FloorGrid'
import { STAGE, Stage, stageOf, groupRounds, ActiveOrderRow } from './orderStatus'

// Right-hand pane on the Floor: tap a seated table to see its rounds, items and total without
// leaving the floor. Open order / Add round go to the till; Print bill and Pay work from here.

export default function FloorDetails({ info, onOpen, onPay, onPrintBill, onMove, onClose }: {
  info: TileInfo
  onOpen: () => void
  onPay: () => void
  onPrintBill: () => void
  onMove: () => void
  onClose: () => void
}) {
  useTick(30000)
  const t = useT()
  const ar = useLang((s) => s.lang) === 'ar'
  const byCode = useMenu((s) => s.byCode)
  const cur = useStatus((s) => s.currency)
  const rooms = useFloor((s) => s.rooms)
  const o = info.order!
  const [items, setItems] = useState<any[] | null>(null)

  useEffect(() => {
    let live = true
    setItems(null)
    window.api.orderItems.get(o.id).then((l: any[]) => { if (live) setItems(l || []) }).catch(() => live && setItems([]))
    return () => { live = false }
  }, [o.id, o.grand_total])

  const st = stageOf(o)
  const room = rooms.find((r) => r.name === o.room)?.room_name || o.room
  const rounds = groupRounds(items || [], (l) => ({ sent: !!l.kot_printed, sentAt: l.sent_at || (l.kot_printed ? o.created_at : null) }))
  const n = (items || []).reduce((s, l) => s + l.qty, 0)

  return (
    <aside aria-label={t('Table details')} className="flex w-[340px] flex-shrink-0 flex-col bg-white shadow-[-1px_0_0_#D8D1C3] max-[1100px]:w-[300px]">
      <div className="flex flex-shrink-0 flex-col gap-1 border-b border-n-line px-4 pb-3 pt-3">
        <div className="flex items-start gap-2">
          <span className="cond min-w-0 flex-1 truncate text-[44px] font-bold leading-[.9] text-n-deep">{info.table.table_name}</span>
          <Btn size="md" variant="outline" onClick={onMove}>{t('Move')}</Btn>
          <button type="button" aria-label={t('Close')} onClick={onClose} className="press flex h-11 w-11 items-center justify-center rounded-md border border-n-line text-xl text-n-muted">×</button>
        </div>
        <span className="truncate text-[13px] text-n-muted">
          {[room, o.guests ? `${o.guests} ${t(o.guests === 1 ? 'guest' : 'guests')}` : null, o.waiter_name, `${t('seated {time}', { time: timeOf(o.created_at) })} (${ageLabel(info.minutes)})`].filter(Boolean).join(' · ')}
        </span>
        <span className="flex items-center gap-1.5 self-start rounded-full px-2.5 py-1 text-[13px] font-semibold" style={{ background: STAGE[st].color + '22', color: st === 'kitchen' ? '#8A5A00' : STAGE[st].color }}>
          <span className="h-2 w-2 rounded-full" style={{ background: STAGE[st].color }} />{t(STAGE[st].label)}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {items === null && <p className="px-4 py-6 text-sm text-n-muted">{t('Loading…')}</p>}
        {rounds.map((r) => (
          <div key={r.key}>
            <div className="flex items-center gap-2 px-4 pb-0.5 pt-2.5">
              <Cap className={r.sent ? 'text-n-muted' : 'text-n-teal'}>{r.sent ? (r.sentAt ? t('Round {n} · sent {time}', { n: r.n, time: timeOf(r.sentAt) }) : t('Round {n} · sent', { n: r.n })) : t('Round {n} · not sent yet', { n: r.n })}</Cap>
              <span className="h-px flex-1 bg-n-line" />
            </div>
            {r.lines.map((l: any) => {
              const mods = (() => { try { return (JSON.parse(l.modifiers || '[]') as any[]).map((m) => m.name) } catch { return [] } })()
              const name = (ar && byCode[l.item_code]?.item_name_ar) || l.item_name
              return (
                <div key={l.id} className="flex items-start gap-2.5 px-4 py-1">
                  <span className="cond num mt-0.5 inline-flex h-[22px] min-w-[22px] flex-shrink-0 items-center justify-center rounded px-[5px] text-[15px] font-bold text-white" style={{ background: itemColor(l.item_code, l.item_name) }}>{l.qty}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="line-clamp-2 text-sm leading-snug">{name}</span>
                    {mods.length > 0 && <span className="text-xs text-n-muted">{mods.join(' · ')}</span>}
                    {l.special_instructions && <span className="text-xs font-medium text-n-teal">“{l.special_instructions}”</span>}
                  </span>
                  <span className="num text-sm">{money(l.amount)}</span>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <div className="flex flex-shrink-0 items-baseline justify-between border-t border-n-line px-4 py-2">
        <span className="text-[13px] text-n-muted">{n} {t(n === 1 ? 'item' : 'items')}</span>
        <span className="cond num text-2xl font-bold">{cur} {money(o.grand_total)}</span>
      </div>
      <div className="grid flex-shrink-0 grid-cols-2 gap-2 px-3 pb-3">
        <button type="button" onClick={onOpen} className="press h-14 rounded-lg bg-n-deep text-[15px] font-bold text-white">{t('Open order')}</button>
        <button type="button" onClick={onOpen} className="press h-14 rounded-lg border-[1.5px] border-n-edge bg-white text-[15px] font-semibold">{t('Add round')}</button>
        <button type="button" onClick={onPrintBill} className={cn('press h-14 rounded-lg border-[1.5px] border-n-edge bg-white text-[15px] font-semibold')}>{st === 'invoiced' ? t('Reprint bill') : t('Print bill')}</button>
        <button type="button" onClick={onPay} className="press flex h-14 items-center justify-center gap-2 rounded-lg bg-n-amber text-n-ink">
          <span className="text-base font-bold">{t('Pay')}</span><span className="cond num text-xl font-bold">{money(o.grand_total)}</span>
        </button>
      </div>
    </aside>
  )
}

/** The pane when no table is selected: the floor at a glance (the pane keeps its place, so tapping a
 *  table never shifts the grid under the finger). */
export function FloorSummary({ orders }: { orders: ActiveOrderRow[] }) {
  const t = useT()
  const cur = useStatus((s) => s.currency)
  const tables = useFloor((s) => s.tables)
  const dine = orders.filter((o) => o.order_type === 'Dine In' && o.table_name)
  const by = (k: Stage) => dine.filter((o) => stageOf(o) === k)
  const free = tables.filter((x) => x.status === 'Available').length
  const late = dine.filter((o) => { const m = (Date.now() - new Date(o.created_at.replace(' ', 'T') + 'Z').getTime()) / 60000; return m >= 30 && stageOf(o) !== 'invoiced' }).length
  const row = (label: string, n: number, color: string) => (
    <div className="flex items-center gap-2.5 px-4 py-2">
      <span className="h-3 w-3 rounded-sm" style={{ background: color }} />
      <span className="flex-1 text-[15px]">{label}</span>
      <span className="cond num text-2xl font-bold">{n}</span>
    </div>
  )
  return (
    <aside aria-label={t('Floor summary')} className="flex w-[340px] flex-shrink-0 flex-col bg-white shadow-[-1px_0_0_#D8D1C3] max-[1100px]:w-[300px]">
      <div className="border-b border-n-line px-4 pb-3 pt-4">
        <span className="cond text-[30px] font-bold leading-none text-n-deep">{t('Floor')}</span>
        <p className="mt-1 text-[13px] text-n-muted">{t('Tap a seated table to see its order here. Double-tap to open it.')}</p>
      </div>
      <div className="py-1">
        {row(t('Free'), free, '#FFFFFF')}
        {row(t('Seated'), dine.length, '#0E6E86')}
        {row(t('Not sent'), by('draft').length, '#F4A52A')}
        {row(t('Ready'), by('ready').length, '#2E8B57')}
        {row(t('Bill printed'), by('invoiced').length, '#7C5CBF')}
        {row(t('Over 30m'), late, '#C83E2E')}
      </div>
      <span className="flex-1" />
      <div className="flex items-baseline justify-between border-t border-n-line px-4 py-3">
        <span className="text-[13px] text-n-muted">{t('On the tables now')}</span>
        <span className="cond num text-2xl font-bold">{cur} {money(dine.reduce((s, o) => s + (o.grand_total || 0), 0))}</span>
      </div>
    </aside>
  )
}
