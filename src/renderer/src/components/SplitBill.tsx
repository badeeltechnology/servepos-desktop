import { useMemo, useState } from 'react'
import { CartItem } from '../stores/cart'
import { useT } from '../stores/i18n'
import { Btn, Dialog, money, roundMoney, staffColor } from '../ui'
import { splitEvenly, splitByWeights } from '../ui/currency'
import { cn } from '../lib/utils'

// Split the bill between guests. "By amount" is the old multi-method split (handled in the payment
// screen); "Evenly" and "By item" produce one share per guest, which the payment screen then collects
// guest by guest. Shares always add up to the total exactly (see splitEvenly / splitByWeights).

export interface GuestShare {
  guest: number // 1-based
  amount: number
  items: { qty: number; itemName: string; amount: number }[]
}

export type SplitKind = 'amount' | 'even' | 'items'

const GUEST_COLORS = ['#0E6E86', '#C25B8C', '#E8792B', '#2E9E7A', '#7C5CBF', '#D9A441', '#3F7FD1', '#A0522D', '#6E9F3A', '#8E3B6E', '#5DAACB', '#555B61']
export const guestColor = (g: number) => GUEST_COLORS[(g - 1) % GUEST_COLORS.length] || staffColor(String(g))

export function SplitChooser({ onPick, onCancel, canByAmount }: { onPick: (k: SplitKind) => void; onCancel: () => void; canByAmount: boolean }) {
  const t = useT()
  const opt = (k: SplitKind, title: string, sub: string, disabled = false) => (
    <button type="button" disabled={disabled} onClick={() => onPick(k)}
      className="press flex min-h-[112px] flex-col items-start justify-center gap-1 rounded-lg border-[1.5px] border-n-edge bg-white p-4 text-start disabled:opacity-50">
      <span className="cond text-[28px] font-bold leading-none text-n-deep">{title}</span>
      <span className="text-[13px] text-n-muted">{sub}</span>
    </button>
  )
  return (
    <Dialog onClose={onCancel} className="w-[min(760px,calc(100vw-32px))] rounded-lg" label={t('Split the bill')}>
      <div className="px-5 pb-1 pt-4"><span className="cond text-[30px] font-bold text-n-deep">{t('Split the bill')}</span></div>
      <div className="grid grid-cols-3 gap-2.5 px-5 py-3">
        {opt('even', t('Evenly'), t('Same share for each guest'))}
        {opt('items', t('By item'), t('Each guest pays for what they had'))}
        {opt('amount', t('By amount'), t('Several payment methods, any amounts'), !canByAmount)}
      </div>
      <div className="flex px-5 pb-4 pt-1"><Btn size="lg" variant="outline" onClick={onCancel}>{t('Cancel')}</Btn></div>
    </Dialog>
  )
}

/** How many ways: 2 to 12. */
export function EvenSplit({ total, initial, onDone, onCancel }: { total: number; initial?: number; onDone: (shares: GuestShare[]) => void; onCancel: () => void }) {
  const t = useT()
  const [n, setN] = useState(Math.min(12, Math.max(2, initial || 2)))
  const shares = splitEvenly(total, n)
  return (
    <Dialog onClose={onCancel} className="w-[min(640px,calc(100vw-32px))] rounded-lg" label={t('Split evenly')}>
      <div className="px-5 pb-1 pt-4"><span className="cond text-[30px] font-bold text-n-deep">{t('Split evenly')}</span></div>
      <div className="grid grid-cols-6 gap-2 px-5 py-3">
        {Array.from({ length: 11 }, (_, i) => i + 2).map((k) => (
          <button key={k} type="button" onClick={() => setN(k)} aria-label={t('{n} ways', { n: k })}
            className={cn('press cond num h-14 rounded-md text-[26px] font-bold', n === k ? 'bg-n-deep text-white' : 'border border-n-edge bg-white')}>{k}</button>
        ))}
      </div>
      <div className="mx-5 flex flex-wrap gap-1.5 rounded-md bg-white p-3 text-sm">
        {shares.map((s, i) => (
          <span key={i} className="flex items-center gap-1.5 rounded-full border border-n-line px-2.5 py-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: guestColor(i + 1) }} />{t('Guest {n}', { n: i + 1 })} <b className="num">{money(s)}</b>
          </span>
        ))}
      </div>
      <div className="flex gap-2 px-5 pb-4 pt-3">
        <Btn size="lg" variant="outline" onClick={onCancel}>{t('Cancel')}</Btn>
        <span className="flex-1" />
        <Btn size="lg" variant="deep" onClick={() => onDone(shares.map((a, i) => ({ guest: i + 1, amount: a, items: [] })))}>{t('Split {n} ways', { n })}</Btn>
      </div>
    </Dialog>
  )
}

type Unit = { key: string; line: CartItem; unitAmount: number }

/** By item: pick a guest, tap the items they had. A line can be shared across all guests. */
export function ItemSplit({ lines, total, initial, onDone, onCancel }: { lines: CartItem[]; total: number; initial?: number; onDone: (shares: GuestShare[]) => void; onCancel: () => void }) {
  const t = useT()
  const [n, setN] = useState(Math.min(12, Math.max(2, initial || 2)))
  const [active, setActive] = useState(1)
  const [owner, setOwner] = useState<Record<string, number>>({}) // unit key -> guest
  const [shared, setShared] = useState<Record<string, boolean>>({}) // line id -> shared by all

  // One unit per whole qty, so "3 × Karak" can go to three guests; fractional qty stays one unit
  const units: Unit[] = useMemo(() => lines.flatMap((l) => {
    const whole = Number.isInteger(l.qty) && l.qty > 1 ? l.qty : 1
    return Array.from({ length: whole }, (_, k) => ({ key: `${l.id}#${k}`, line: l, unitAmount: l.amount / whole }))
  }), [lines])

  const unassigned = units.filter((u) => !shared[u.line.id] && !(owner[u.key] >= 1 && owner[u.key] <= n))
  const gross = Array.from({ length: n }, () => 0)
  const itemsOf: GuestShare['items'][] = Array.from({ length: n }, () => [])
  for (const u of units) {
    if (shared[u.line.id]) {
      for (let g = 0; g < n; g++) gross[g] += u.unitAmount / n
    } else if (owner[u.key] >= 1 && owner[u.key] <= n) gross[owner[u.key] - 1] += u.unitAmount
  }
  for (const l of lines) {
    const ls = units.filter((u) => u.line.id === l.id)
    if (shared[l.id]) { for (let g = 0; g < n; g++) itemsOf[g].push({ qty: roundMoney(l.qty / n, 3), itemName: `${l.itemName} (shared)`, amount: roundMoney(l.amount / n) }) ; continue }
    for (let g = 1; g <= n; g++) {
      const mine = ls.filter((u) => owner[u.key] === g)
      if (mine.length) itemsOf[g - 1].push({ qty: ls.length === 1 ? l.qty : mine.length, itemName: l.itemName, amount: roundMoney(mine.reduce((s, u) => s + u.unitAmount, 0)) })
    }
  }
  // Discount and tax follow each guest's items: the total is split in proportion to item value
  const shares = splitByWeights(total, gross)

  return (
    <Dialog onClose={onCancel} className="h-[calc(100vh-32px)] w-[calc(100vw-32px)] max-w-[1100px] rounded-lg" label={t('Split by item')}>
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-n-line bg-white px-4 py-3">
        <span className="cond me-2 text-[28px] font-bold text-n-deep">{t('Split by item')}</span>
        <span className="text-[13px] text-n-muted">{t('Guests')}</span>
        <button type="button" aria-label="One guest less" onClick={() => { setN(Math.max(2, n - 1)); setActive(Math.min(active, Math.max(2, n - 1))) }} className="press h-11 w-11 rounded-md border border-n-edge text-xl">−</button>
        <span className="cond num w-8 text-center text-2xl font-bold">{n}</span>
        <button type="button" aria-label="One guest more" onClick={() => setN(Math.min(12, n + 1))} className="press h-11 w-11 rounded-md border border-n-edge text-xl">+</button>
        <span className="flex-1" />
        <span className="text-[13px] text-n-muted">{t('Tap a guest, then their items')}</span>
      </div>
      <div className="flex flex-shrink-0 gap-1.5 overflow-x-auto px-4 py-2.5" role="radiogroup" aria-label={t('Guests')}>
        {Array.from({ length: n }, (_, i) => i + 1).map((g) => (
          <button key={g} type="button" role="radio" aria-checked={active === g} onClick={() => setActive(g)}
            className={cn('press flex h-14 min-w-[120px] flex-shrink-0 flex-col items-start justify-center rounded-md px-3 text-start', active === g ? 'text-white' : 'border-2 bg-white text-n-ink')}
            style={active === g ? { background: guestColor(g) } : { borderColor: guestColor(g) }}>
            <span className="text-sm font-bold">{t('Guest {n}', { n: g })}</span>
            <span className="cond num text-lg font-bold leading-none">{money(shares[g - 1] || 0)}</span>
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
        {lines.map((l) => {
          const ls = units.filter((u) => u.line.id === l.id)
          const mods = l.modifiers.map((m) => m.name).join(' · ')
          return (
            <div key={l.id} className="flex items-center gap-3 border-b border-n-line py-2">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[15px] font-semibold">{l.qty} × {l.itemName}</span>
                {mods && <span className="text-xs text-n-muted">{mods}</span>}
              </span>
              <span className="flex flex-wrap justify-end gap-1.5">
                {shared[l.id] ? (
                  <span className="flex h-11 items-center rounded-md bg-n-ice px-3 text-[13px] font-semibold text-n-deep">{t('Shared by all {n}', { n })} · {money(l.amount / n)}</span>
                ) : ls.map((u, k) => {
                  const g = owner[u.key]
                  const on = g >= 1 && g <= n
                  return (
                    <button key={u.key} type="button" aria-label={`${l.itemName} ${k + 1}${on ? `, ${t('Guest {n}', { n: g })}` : ''}`}
                      onClick={() => setOwner((o) => ({ ...o, [u.key]: o[u.key] === active ? 0 : active }))}
                      className={cn('press cond num flex h-11 min-w-[64px] items-center justify-center gap-1 rounded-md px-2 text-base font-bold', on ? 'text-white' : 'border border-dashed border-[#B9B2A4] bg-white text-n-muted')}
                      style={on ? { background: guestColor(g) } : undefined}>
                      {on ? `G${g}` : t('Tap')} · {money(u.unitAmount)}
                    </button>
                  )
                })}
                <button type="button" onClick={() => setShared((s) => ({ ...s, [l.id]: !s[l.id] }))}
                  className={cn('press h-11 rounded-md px-2.5 text-[13px] font-semibold', shared[l.id] ? 'bg-n-deep text-white' : 'border border-n-edge bg-white')}>
                  {shared[l.id] ? t('Not shared') : t('Split this line')}
                </button>
              </span>
            </div>
          )
        })}
      </div>
      <div className="flex flex-shrink-0 items-center gap-2 border-t border-n-line bg-white px-4 py-3">
        <Btn size="lg" variant="outline" onClick={onCancel}>{t('Cancel')}</Btn>
        <span className="flex-1 text-sm font-semibold text-n-red">{unassigned.length ? t('{n} items not assigned yet', { n: unassigned.length }) : ''}</span>
        <Btn size="lg" variant="deep" disabled={unassigned.length > 0}
          onClick={() => onDone(shares.map((a, i) => ({ guest: i + 1, amount: a, items: itemsOf[i] })).filter((s) => s.amount > 0 || s.items.length))}>
          {t('Collect {n} shares', { n })}
        </Btn>
      </div>
    </Dialog>
  )
}
