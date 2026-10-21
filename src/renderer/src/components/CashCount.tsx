import { useRef, useState } from 'react'
import { Field, money } from '../ui'
import { cn } from '../lib/utils'
import { useT } from '../stores/i18n'

// Count the drawer note by note. Tap + for one, hold + for ten. "Type a total" keeps the old
// single-amount entry for drawers with odd coins.

export const DENOMS = [500, 200, 100, 50, 10, 5, 1, 0.5]
const NOTE_COLOR: Record<string, string> = { 500: '#6B4E8E', 200: '#2E6DA4', 100: '#2E8B57', 50: '#C2662B', 10: '#B98B3C', 5: '#7A7F85', 1: '#7A7F85', 0.5: '#7A7F85' }

export type Counts = Record<string, number>
export function countTotal(c: Counts) {
  return DENOMS.reduce((s, d) => s + (c[d] || 0) * d, 0)
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
          {DENOMS.map((d) => {
            const n = counts[d] || 0
            return (
              <div key={d} className="flex items-center gap-3.5 border-b border-[#F0ECE3]" style={{ height: rowHeight }}>
                <span className="cond num flex h-9 w-[72px] flex-shrink-0 items-center justify-center rounded-[3px] text-[17px] font-bold text-white" style={{ background: NOTE_COLOR[d] }}>{d >= 1 ? d : '50d'}</span>
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
