import { useRef, useState } from 'react'
import { Field, money } from '../ui'
import { cn } from '../lib/utils'
import { useStatus } from '../stores/status'
import { denominations, denomLabel, isCoin, roundMoney } from '../ui/currency'
import { useT } from '../stores/i18n'

// Count the drawer note by note. Tap + for one, hold + for ten. "Type a total" keeps the old
// single-amount entry for drawers with odd coins.

// Notes and coins come from the currency table (ui/currency): QAR 500…1 + 50d, OMR 50…1, 500 bz,
// 100 bz notes and 50/25/10/5 bz coins, etc.
const NOTE_COLORS = ['#6B4E8E', '#2E6DA4', '#2E8B57', '#C2662B', '#B98B3C', '#8B5A2B', '#3F7FD1', '#7C5CBF']

export type Counts = Record<string, number>
export function countTotal(c: Counts, denoms = denominations()) {
  return roundMoney(denoms.reduce((s, d) => s + (c[d] || 0) * d, 0))
}

export default function CashCount({ counts, onCounts, manual, onManual, rowHeight = 68, title, hint }: {
  counts: Counts
  onCounts: (c: Counts) => void
  manual: string | null
  onManual: (v: string | null) => void
  rowHeight?: number
  title: string
  hint: string
}) {
  const code = useStatus((st) => st.currencyCode)
  const denoms = denominations(code)
  const hold = useRef<number | null>(null)
  const held = useRef(false)
  const [, force] = useState(0)
  const t = useT()

  function set(d: number, delta: number) {
    const n = { ...counts, [d]: Math.max(0, (counts[d] || 0) + delta) }
    onCounts(n)
    force((x) => x + 1)
  }
  function down(d: number) {
    held.current = false
    hold.current = window.setTimeout(() => { held.current = true; set(d, 10) }, 500)
  }
  function up() { if (hold.current) clearTimeout(hold.current); hold.current = null }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md bg-white shadow-tile">
      <div className="flex flex-shrink-0 items-baseline gap-3 border-b border-n-line px-4 pb-2 pt-3.5">
        <span className="whitespace-nowrap text-base font-semibold">{title}</span>
        <span className="hidden truncate text-[13px] text-n-muted min-[1200px]:inline">{manual === null ? hint : 'Typing the total instead of counting notes'}</span>
        <span className="flex-1" />
        <button type="button" onClick={() => onManual(manual === null ? '' : null)} className="whitespace-nowrap text-[13px] font-semibold text-n-teal">
          {manual === null ? t('Type a total') : t('Count notes')}
        </button>
      </div>
      {manual !== null ? (
        <div className="flex flex-col gap-2 p-4">
          <span className="text-sm text-n-muted">Cash in the drawer</span>
          <Field type="number" data-keyboard="numpad" autoFocus min={0} step={0.01} value={manual} onChange={(e) => onManual(e.target.value)} placeholder="0.00" className="cond num h-16 text-right text-[34px] font-bold" />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-1">
          {denoms.map((d, i) => {
            const n = counts[d] || 0
            const coin = isCoin(d, code)
            return (
              <div key={d} className="flex items-center gap-3.5 border-b border-[#F0ECE3]" style={{ height: rowHeight }}>
                <span className={cn('cond num flex h-9 w-[72px] flex-shrink-0 items-center justify-center text-[17px] font-bold text-white', coin ? 'rounded-full' : 'rounded-[3px]')} style={{ background: coin ? '#7A7F85' : NOTE_COLORS[i % NOTE_COLORS.length] }}>{denomLabel(d, code)}</span>
                <button type="button" aria-label={`One less ${d}`} onClick={() => set(d, -1)} className="press h-12 w-14 rounded-md border border-n-edge bg-white text-xl">−</button>
                <span className={cn('cond num min-w-[44px] text-center text-[26px] font-bold', !n && 'text-n-stone')}>{n}</span>
                <button type="button" aria-label={`One more ${d}`} onPointerDown={() => down(d)} onPointerUp={up} onPointerLeave={up}
                  onClick={() => { if (held.current) { held.current = false; return } set(d, 1) }}
                  className="press h-12 w-14 rounded-md border border-n-edge bg-white text-xl">+</button>
                <span className="flex-1" />
                <span className="cond num text-xl font-semibold text-n-muted">{money(n * d)}</span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
