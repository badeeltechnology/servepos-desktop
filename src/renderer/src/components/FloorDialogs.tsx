import { useState } from 'react'
import { Btn, Dialog, Stepper, money } from '../ui'
import { useStatus } from '../stores/status'
import { useT } from '../stores/i18n'
import { TileInfo } from './FloorGrid'
import { STAGE, stageOf } from './orderStatus'
import { ageLabel } from '../ui/hosts'

// Small dialogs around the floor: how many guests, what kind of order, what to do with a table.

/** 1 to 8 in one tap, More for bigger parties. Skip keeps the default (2). */
export function GuestsPick({ table, initial, onPick, onCancel }: { table: string; initial?: number; onPick: (n: number | null) => void; onCancel: () => void }) {
  const t = useT()
  const [more, setMore] = useState(false)
  const [n, setN] = useState(Math.max(9, initial || 9))
  return (
    <Dialog onClose={onCancel} className="w-[min(560px,calc(100vw-32px))] rounded-lg" label={t('How many guests?')}>
      <div className="flex items-end gap-3 px-5 pb-2 pt-4">
        <span className="cond text-[44px] font-bold leading-none text-n-deep">{table}</span>
        <span className="pb-1 text-lg font-semibold text-n-ink">{t('How many guests?')}</span>
      </div>
      {!more ? (
        <div className="grid grid-cols-4 gap-2 px-5 py-3">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((k) => (
            <button key={k} type="button" onClick={() => onPick(k)} aria-label={`${k} ${t(k === 1 ? 'guest' : 'guests')}`}
              className={`press cond num flex h-[72px] items-center justify-center rounded-md text-[34px] font-bold ${initial === k ? 'bg-n-deep text-white' : 'border border-n-edge bg-white text-n-ink'}`}>
              {k}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center gap-4 px-5 py-6">
          <Stepper value={<span className="cond num text-[40px] font-bold">{n}</span>} size={64} onDec={() => setN(Math.max(1, n - 1))} onInc={() => setN(n + 1)} decLabel="One guest less" incLabel="One guest more" />
          <Btn size="xl" variant="teal" onClick={() => onPick(n)}>{t('Seat {n}', { n })}</Btn>
        </div>
      )}
      <div className="flex gap-2 px-5 pb-4 pt-1">
        <Btn size="lg" variant="outline" onClick={onCancel}>{t('Cancel')}</Btn>
        <span className="flex-1" />
        {!more && <Btn size="lg" variant="outline" onClick={() => setMore(true)}>{t('More than 8')}</Btn>}
        <Btn size="lg" variant="outline" onClick={() => onPick(null)}>{t('Skip')}</Btn>
      </div>
    </Dialog>
  )
}

/** New order: Dine in goes to the floor, Takeaway and Delivery go straight to the till. */
export function NewOrderChooser({ hasTables, onPick, onCancel }: { hasTables: boolean; onPick: (type: 'Dine In' | 'Takeaway' | 'Delivery') => void; onCancel: () => void }) {
  const t = useT()
  const opts: { type: 'Dine In' | 'Takeaway' | 'Delivery'; label: string; sub: string; icon: JSX.Element }[] = [
    { type: 'Dine In', label: t('Dine in'), sub: hasTables ? t('Pick a table') : t('Eat here'),
      icon: <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M6 12v8M18 12v8" /></svg> },
    { type: 'Takeaway', label: t('Takeaway'), sub: t('Quick sale, pay now or later'),
      icon: <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 8h14l-1.5 12h-11z" /><path d="M9 8a3 3 0 0 1 6 0" /></svg> },
    { type: 'Delivery', label: t('Delivery'), sub: t('Talabat, phone orders'),
      icon: <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="6" cy="17" r="2.5" /><circle cx="18" cy="17" r="2.5" /><path d="M8.5 17h7M3 13h9V7h4l3 5v5" /></svg> }
  ]
  return (
    <Dialog onClose={onCancel} className="w-[min(760px,calc(100vw-32px))] rounded-lg" label={t('New order')}>
      <div className="px-5 pb-1 pt-4"><span className="cond text-[30px] font-bold text-n-deep">{t('New order')}</span></div>
      <div className="grid grid-cols-3 gap-2.5 px-5 py-3">
        {opts.map((o) => (
          <button key={o.type} type="button" onClick={() => onPick(o.type)}
            className={`press flex min-h-[132px] flex-col items-start justify-between gap-2 rounded-lg p-4 text-start ${o.type === 'Dine In' ? 'bg-n-deep text-white' : 'border-[1.5px] border-n-edge bg-white text-n-ink'}`}>
            {o.icon}
            <span className="flex flex-col">
              <span className="cond text-[30px] font-bold leading-none">{o.label}</span>
              <span className="mt-1 text-[13px] opacity-75">{o.sub}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="flex px-5 pb-4 pt-1"><Btn size="lg" variant="outline" onClick={onCancel}>{t('Cancel')}</Btn></div>
    </Dialog>
  )
}

/** Long-press on an occupied table. */
export function TableActions({ info, onOpen, onMove, onPrintBill, onCancel }: { info: TileInfo; onOpen: () => void; onMove: () => void; onPrintBill: () => void; onCancel: () => void }) {
  const t = useT()
  const cur = useStatus((s) => s.currency)
  const o = info.order!
  const st = stageOf(o)
  return (
    <Dialog onClose={onCancel} className="w-[min(440px,calc(100vw-32px))] rounded-lg" label={info.table.table_name}>
      <div className="flex items-end gap-3 bg-n-deep px-5 pb-3 pt-4 text-white">
        <span className="cond text-[44px] font-bold leading-none">{info.table.table_name}</span>
        <span className="flex flex-col pb-0.5 text-[13px] text-n-frost">
          <span className="cond num text-[22px] font-bold text-white">{cur} {money(o.grand_total)}</span>
          <span>{t(STAGE[st].label)} · {ageLabel(info.minutes)}{o.guests ? ` · ${o.guests} ${t(o.guests === 1 ? 'guest' : 'guests')}` : ''}{o.waiter_name ? ` · ${o.waiter_name}` : ''}</span>
        </span>
      </div>
      <div className="flex flex-col gap-2 p-4">
        <Btn size="xl" variant="teal" onClick={onOpen}>{t('Open order')}</Btn>
        <Btn size="xl" variant="outline" onClick={onMove}>{t('Move to another table')}</Btn>
        <Btn size="xl" variant="outline" onClick={onPrintBill}>{t('Print bill')}</Btn>
        <Btn size="lg" variant="plain" onClick={onCancel}>{t('Cancel')}</Btn>
      </div>
    </Dialog>
  )
}
