import { useEffect, useRef, useState } from 'react'
import { Btn, Dialog, Field, Keypad, money, pinKey } from '../ui'
import { cn } from '../lib/utils'
import { useStatus } from '../stores/status'
import { denominations, denomLabel, isCoin, roundMoney } from '../ui/currency'
import { useT } from '../stores/i18n'

// Count the drawer note by note. Tap + for one, hold + for ten, or tap the count to type it
// (100 one-rial notes is one entry, not 100 taps). "Type a total" keeps the old single-amount
// entry for drawers with odd coins.

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
  const [typing, setTyping] = useState<number | null>(null)
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
                <button type="button" aria-label={`Type how many ${denomLabel(d, code)}`} onClick={() => setTyping(d)}
                  className={cn('press cond num h-12 min-w-[64px] rounded-md border border-dashed border-n-edge px-2 text-center text-[26px] font-bold', !n && 'text-n-stone')}>{n}</button>
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
      {typing !== null && (
        <CountPad denom={typing} label={`${denomLabel(typing, code)} ${isCoin(typing, code) ? 'coins' : 'notes'}`} start={counts[typing] || 0}
          onCancel={() => setTyping(null)} onSet={(v) => { onCounts({ ...counts, [typing]: v }); setTyping(null) }} />
      )}
    </section>
  )
}

/** Type how many of one note or coin: a number pad, with the amount it makes. Keyboard digits and Enter work too. */
function CountPad({ denom, label, start, onCancel, onSet }: { denom: number; label: string; start: number; onCancel: () => void; onSet: (n: number) => void }) {
  // starts empty, so typing replaces the current count; the current count shows as the hint
  const [entry, setEntry] = useState('')
  const value = entry === '' ? start : Number(entry)
  const set = () => onSet(Math.max(0, Math.floor(value) || 0))
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) setEntry((v) => pinKey(v, e.key as any, 4))
      else if (e.key === 'Backspace') setEntry((v) => v.slice(0, -1))
      else if (e.key === 'Enter') { e.preventDefault(); set() }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })
  return (
    <Dialog onClose={onCancel} className="w-[400px]" label={`How many ${label}`}>
      <div className="flex flex-col gap-3 p-5">
        <span className="cond text-[26px] font-bold leading-none text-n-deep">How many {label}?</span>
        <div className="cond num flex h-16 items-center justify-between rounded-md bg-white px-3.5 shadow-[inset_0_0_0_2px_#0E6E86]">
          <span className={cn('text-[34px] font-bold', entry === '' && 'text-n-stone')}>{entry === '' ? start : entry}</span>
          <span className="font-sans text-sm font-medium text-n-muted">= {money(value * denom)}</span>
        </div>
        <Keypad mode="pin" tone="light" className="h-[232px]" onKey={(k) => setEntry((v) => pinKey(v, k, 4))} />
      </div>
      <div className="flex gap-2 bg-white px-4 py-3">
        <Btn size="lg" variant="outline" onClick={onCancel}>Cancel</Btn>
        <span className="flex-1" />
        <Btn size="lg" variant="deep" onClick={set}>Set {Math.max(0, Math.floor(value) || 0)}</Btn>
      </div>
    </Dialog>
  )
}
