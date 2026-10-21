import { useState, useEffect, useMemo } from 'react'
import { CartItem } from '../stores/cart'
import { useAuthStore } from '../stores/auth'
import { useStatus } from '../stores/status'
import StatusBand from './StatusBand'
import { Btn, SubBar, BackButton, Cap, Keypad, Field, Dot, money, amountKey, C } from '../ui'
import { cn } from '../lib/utils'

// Payment: the receipt as it will print on the left, tender on the right, and the change as the
// biggest thing on screen. Supports one method, split across methods, card tips, references,
// "collected by" a waiter, and the number of receipts.

export interface PaymentEntry {
  method: string
  amount: number
  reference: string
}

interface Props {
  grandTotal: number
  subtotal?: number
  discount?: number
  tax?: number
  taxLabel?: string
  lines?: CartItem[]
  orderLabel?: string
  orderSub?: string
  orderNumber?: string | null
  orderWaiterName?: string | null
  processing?: boolean
  onComplete: (payments: PaymentEntry[], collectedByWaiter: string | null, tipAmount?: number, receiptCopies?: number) => Promise<boolean> | boolean | void
  onCancel: () => void
  onDone?: () => void
}

type Method = { name: string; mode_of_payment: string; is_default: number }

export default function PaymentDialog(props: Props) {
  const { orderWaiterName, processing, onComplete, onCancel, onDone } = props
  // Snapshot the order: the cart is cleared the moment the sale completes, but we keep showing it.
  const [snap] = useState(() => ({
    due: Math.round(props.grandTotal * 100) / 100,
    subtotal: props.subtotal ?? props.grandTotal,
    discount: props.discount || 0,
    tax: props.tax || 0,
    taxLabel: props.taxLabel || 'VAT',
    lines: (props.lines || []).map((l) => ({ ...l })),
    label: props.orderLabel || 'Sale',
    sub: props.orderSub || '',
    number: props.orderNumber || null
  }))
  const due = snap.due
  const user = useAuthStore((s) => s.user)
  const cur = useStatus((s) => s.currency)
  const [rc, setRc] = useState<Record<string, string>>({})
  const [methods, setMethods] = useState<Method[]>([])
  const [waiters, setWaiters] = useState<{ name: string; waiter_name: string }[]>([])
  const [collectedBy, setCollectedBy] = useState<string>(orderWaiterName || '')
  const [showCollector, setShowCollector] = useState(false)

  // single-method state
  const [method, setMethod] = useState('')
  const [cashEntry, setCashEntry] = useState('')
  const [fresh, setFresh] = useState(true)
  const [tip, setTip] = useState('')
  const [tipMode, setTipMode] = useState(false)
  const [reference, setReference] = useState('')
  // split state
  const [split, setSplit] = useState(false)
  const [parts, setParts] = useState<PaymentEntry[]>([])
  const [activePart, setActivePartRaw] = useState(0)
  const [partFresh, setPartFresh] = useState(true)
  const setActivePart = (i: number) => { setActivePartRaw(i); setPartFresh(true) }

  const [copies, setCopies] = useState<0 | 1 | 2>(1)
  const [error, setError] = useState('')
  const [done, setDone] = useState<null | { change: number; tip: number; payments: PaymentEntry[] }>(null)

  useEffect(() => {
    window.api.paymentMethods.get().then((m: Method[]) => {
      setMethods(m || [])
      const def = (m || []).find((x) => x.is_default) || (m || [])[0]
      if (def) setMethod(def.mode_of_payment)
    }).catch(() => {})
    window.api.waiters.list().then((l: any) => setWaiters(l || [])).catch(() => {})
    window.api.receiptConfig.getAll().then((c: any) => setRc(c || {})).catch(() => {})
  }, [])

  const isCash = method === 'Cash'
  const isCard = method === 'Card'
  const received = parseFloat(cashEntry || '0') || 0
  const tipVal = parseFloat(tip || '0') || 0

  // What we will hand to onComplete (before capping), same shape as before
  const payments: PaymentEntry[] = useMemo(() => {
    if (split) return parts
    if (!method) return []
    if (isCash) return [{ method, amount: fresh && !cashEntry ? due : received, reference: '' }]
    return [{ method, amount: Math.round((due + (isCard ? tipVal : 0)) * 100) / 100, reference }]
  }, [split, parts, method, isCash, isCard, fresh, cashEntry, received, due, tipVal, reference])

  const totalPaid = payments.reduce((s, p) => s + p.amount, 0)
  const remaining = Math.round((due - totalPaid) * 100) / 100
  const hasCard = payments.some((p) => p.method === 'Card' && p.amount > 0)
  const cardOverpay = hasCard ? Math.max(0, totalPaid - due) : 0
  const tipAmount = cardOverpay // For card: overpayment is tip
  const change = !hasCard && totalPaid > due ? totalPaid - due : 0 // For cash: overpayment is change
  const short = remaining > 0.004
  const ok = !short && payments.length > 0 && !processing

  // Quick cash: exact + the notes a guest is likely to hand over
  const chips = useMemo(() => {
    const out: number[] = [due]
    for (const step of [10, 50, 100, 500, 1000]) {
      const v = Math.ceil(due / step) * step
      if (v > due && !out.includes(v)) out.push(v)
    }
    return out.slice(0, 4)
  }, [due])

  function onKey(k: Parameters<typeof amountKey>[1]) {
    setError('')
    if (done) return
    if (split) {
      setParts((ps) => ps.map((p, i) => (i === activePart ? { ...p, amount: parseFloat(amountKey(partFresh || !p.amount ? '' : String(p.amount), k)) || 0 } : p)))
      setPartFresh(false)
      return
    }
    if (tipMode) { setTip(amountKey(tip, k)); return }
    if (isCash) {
      const base = fresh ? '' : cashEntry
      setCashEntry(amountKey(base, k))
      setFresh(false)
    }
  }

  function startSplit() {
    if (split) { setSplit(false); setParts([]); return }
    const first: PaymentEntry = { method: method || methods[0]?.mode_of_payment || 'Cash', amount: due, reference: '' }
    setParts([first]); setActivePart(0); setSplit(true); setTipMode(false)
  }
  function addPart() {
    const unused = methods.find((m) => !parts.some((p) => p.method === m.mode_of_payment))
    if (!unused) return
    setParts([...parts, { method: unused.mode_of_payment, amount: Math.max(0, Math.round(remaining * 100) / 100), reference: '' }])
    setActivePart(parts.length)
  }

  async function handleComplete() {
    if (done) { onDone?.(); return }
    if (short) { setError(`Payment is short by ${money(remaining)}`); return }
    // Cap only cash payments (excess cash = change returned, not stored)
    // Card payments keep full amount (excess = tip, actually charged to card)
    let left = due
    const capped = payments.map((p) => {
      if (p.method === 'Cash') {
        const amt = Math.min(p.amount, left)
        left = Math.max(0, left - amt)
        return { ...p, amount: Math.round(amt * 100) / 100 }
      }
      left = Math.max(0, left - p.amount)
      return p
    }).filter((p) => p.amount > 0)
    const res = await onComplete(capped, collectedBy || null, tipAmount > 0 ? tipAmount : undefined, copies)
    if (res === false) return
    setDone({ change, tip: tipAmount, payments: capped })
  }

  const heroChange = done ? done.change : change
  const entryLabel = split ? `${parts[activePart]?.method || ''} amount` : tipMode ? 'Tip on card' : isCash ? 'Cash received' : 'Amount'
  const entryValue = split ? (parts[activePart]?.amount || 0) : tipMode ? tipVal : isCash ? (fresh && !cashEntry ? due : received) : due + (isCard ? tipVal : 0)
  const rcMethodLine = (done?.payments || payments).map((p) => `Paid ${p.method.toLowerCase()}`)

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-n-cream" role="dialog" aria-label="Payment">
      <StatusBand userName={user?.name} showWaiter={false} />
      <SubBar>
        <BackButton onClick={onCancel} />
        <span className="cond text-2xl font-bold">{snap.label}</span>
        <span className="truncate text-[13px] text-n-mist">{snap.sub}</span>
        <span className="flex-1" />
        <Btn variant="ghostDark" aria-pressed={split} onClick={startSplit} disabled={!!done || methods.length < 2} className={cn(split && 'bg-white text-n-deep')}>Split</Btn>
        <Btn variant="ghostDark" aria-pressed={tipMode} disabled={!!done || split || !isCard} onClick={() => setTipMode(!tipMode)} className={cn(tipMode && 'bg-white text-n-deep')}>Tip</Btn>
        {waiters.length > 0 && (
          <span className="relative">
            <Btn variant="ghostDark" disabled={!!done} onClick={() => setShowCollector(!showCollector)} aria-haspopup="menu">
              {collectedBy ? `Collected by ${collectedBy}` : 'Collected by cashier'}
            </Btn>
            {showCollector && (
              <span role="menu" className="absolute right-0 top-full z-50 mt-1 flex max-h-[60vh] w-56 flex-col overflow-y-auto rounded-md bg-white text-n-ink shadow-pop">
                <button type="button" role="menuitem" onClick={() => { setCollectedBy(''); setShowCollector(false) }} className={cn('h-12 px-3 text-left text-sm', !collectedBy && 'bg-n-ice font-semibold')}>Cashier (direct)</button>
                {waiters.map((w) => (
                  <button key={w.name} type="button" role="menuitem" onClick={() => { setCollectedBy(w.waiter_name); setShowCollector(false) }}
                    className={cn('h-12 px-3 text-left text-sm', collectedBy === w.waiter_name && 'bg-n-ice font-semibold')}>{w.waiter_name}</button>
                ))}
              </span>
            )}
          </span>
        )}
      </SubBar>

      <div className="flex min-h-0 flex-1 gap-3 p-3">
        {/* Receipt, as it will print */}
        <aside aria-label="Receipt" className="hidden w-[250px] flex-shrink-0 flex-col gap-px overflow-hidden bg-white px-3.5 pb-3 pt-3.5 font-mono text-[11.5px] leading-normal shadow-tile min-[900px]:flex">
          <div className="text-center text-[13px] font-semibold">{rc.restaurant_name || 'RECEIPT'}</div>
          {rc.address_line_1 && <div className="text-center">{rc.address_line_1}</div>}
          <div className="my-1.5 border-t border-dashed border-[#B9B2A4]" />
          <div className="flex justify-between"><span>{snap.number || 'New sale'}</span><span>{new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>
          <div className="truncate">{snap.label}{snap.sub ? ` · ${snap.sub}` : ''}</div>
          <div className="my-1.5 border-t border-dashed border-[#B9B2A4]" />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {snap.lines.map((l) => (
              <div key={l.id} className="flex justify-between gap-2">
                <span className="min-w-0">{l.qty} {l.itemName}{l.modifiers.length ? `, ${l.modifiers.map((m) => m.name.toLowerCase()).join(', ')}` : ''}</span>
                <span>{money(l.amount)}</span>
              </div>
            ))}
            <div className="my-1.5 border-t border-dashed border-[#B9B2A4]" />
            {(snap.discount > 0 || snap.tax > 0) && <div className="flex justify-between"><span>Subtotal</span><span>{money(snap.subtotal)}</span></div>}
            {snap.discount > 0 && <div className="flex justify-between"><span>Discount</span><span>-{money(snap.discount)}</span></div>}
            {snap.tax > 0 && <div className="flex justify-between"><span>{snap.taxLabel}</span><span>{money(snap.tax)}</span></div>}
            <div className="flex justify-between text-[13px] font-semibold"><span>TOTAL {cur}</span><span>{money(due)}</span></div>
            {(done?.payments || payments).map((p, i) => (
              <div key={i} className="flex justify-between"><span>{rcMethodLine[i]}</span><span>{money(p.amount)}</span></div>
            ))}
            {(done ? done.tip : tipAmount) > 0 && <div className="flex justify-between"><span>Tip</span><span>{money(done ? done.tip : tipAmount)}</span></div>}
            <div className="flex justify-between"><span>Change</span><span>{money(heroChange)}</span></div>
            <div className="my-1.5 border-t border-dashed border-[#B9B2A4]" />
            <div className="text-center">{rc.footer_message || 'Thank you'}</div>
          </div>
          <div className="mt-1 flex items-center gap-1.5 font-sans text-[11px] text-n-muted">
            <Dot color={copies ? C.green : C.stone} size={7} />{copies === 0 ? 'Nothing printed' : `Counter printer · ${copies} cop${copies === 1 ? 'y' : 'ies'}`}
          </div>
        </aside>

        {/* Tender */}
        <section className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="flex items-baseline gap-3 px-0.5">
            <Cap className="text-n-muted">To pay</Cap>
            <span className="cond num text-[44px] font-bold leading-none text-n-deep">{cur} {money(due)}</span>
            {split && <span className="ml-auto text-sm text-n-muted">{short ? <>Left to split <b className="num text-n-red">{money(remaining)}</b></> : 'Fully covered'}</span>}
          </div>

          <div role="radiogroup" aria-label="Method" className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(4, Math.max(1, methods.length))}, minmax(0, 1fr))` }}>
            {methods.map((m) => {
              const on = split ? parts[activePart]?.method === m.mode_of_payment : method === m.mode_of_payment
              return (
                <button key={m.name} type="button" role="radio" aria-checked={on} disabled={!!done}
                  onClick={() => {
                    setError('')
                    if (split) setParts((ps) => ps.map((p, i) => (i === activePart ? { ...p, method: m.mode_of_payment } : p)))
                    else { setMethod(m.mode_of_payment); setTipMode(false); if (m.mode_of_payment !== 'Card') setTip('') }
                  }}
                  className={cn('press h-14 truncate whitespace-nowrap rounded-md px-2 text-base font-semibold', on ? 'bg-n-deep text-white' : 'border border-n-edge bg-white text-n-ink')}>
                  {m.mode_of_payment}
                </button>
              )
            })}
          </div>

          <div className="flex min-h-0 flex-1 gap-2.5">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="cond num flex h-16 flex-shrink-0 items-center justify-between rounded-md bg-white px-3.5 text-[34px] font-bold shadow-[inset_0_0_0_2px_#0E6E86]">
                <span className="font-sans text-[13px] font-medium text-n-muted">{entryLabel}</span>{money(entryValue)}
              </div>

              {split ? (
                <div className="flex min-h-0 flex-col gap-1.5 overflow-y-auto">
                  {parts.map((p, i) => (
                    <div key={i} className={cn('flex h-12 flex-shrink-0 items-center gap-2 rounded-md bg-white px-3 text-sm', i === activePart ? 'border-2 border-n-deep' : 'border border-n-edge')}>
                      <button type="button" className="flex flex-1 items-center justify-between gap-2 text-left" onClick={() => setActivePart(i)}>
                        <span className="font-semibold">{p.method}</span>
                        <span className="cond num text-xl font-bold">{money(p.amount)}</span>
                      </button>
                      {parts.length > 1 && <button type="button" aria-label={`Remove ${p.method}`} onClick={() => { setParts(parts.filter((_, j) => j !== i)); setActivePart(0) }} className="h-9 w-9 text-xl text-n-red">×</button>}
                    </div>
                  ))}
                  {parts.length < methods.length && <Btn variant="outline" onClick={addPart} className="flex-shrink-0">+ Add another method</Btn>}
                  {parts[activePart] && parts[activePart].method !== 'Cash' && (
                    <Field data-keyboard="full" value={parts[activePart].reference} placeholder={`${parts[activePart].method} reference (optional)`}
                      onChange={(e) => setParts(parts.map((x, j) => (j === activePart ? { ...x, reference: e.target.value } : x)))} />
                  )}
                </div>
              ) : isCash ? (
                <div className="grid flex-shrink-0 grid-cols-4 gap-2">
                  {chips.map((v, i) => (
                    <button key={v} type="button" aria-label={i === 0 ? 'Exact amount' : `Received ${money(v, 0)}`} disabled={!!done} onClick={() => { setCashEntry(String(v)); setFresh(false); setError('') }}
                      className="press cond num h-[52px] rounded-md border border-n-edge bg-white text-xl font-semibold">{i === 0 ? 'Exact' : money(v, 0)}</button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-shrink-0 flex-col gap-2">
                  <div className="rounded-md bg-white px-3 py-2.5 text-[13px] text-n-muted">{isCard ? 'Charged exactly what is owed. Use Tip to add a tip on the card.' : 'Charged exactly what is owed.'}</div>
                  <Field data-keyboard="full" value={reference} onChange={(e) => setReference(e.target.value)} placeholder={`${method} reference (optional)`} disabled={!!done} />
                </div>
              )}

              <div className={cn('flex min-h-[100px] flex-1 items-center justify-between rounded-md px-4', done ? 'bg-n-amber text-n-ink' : short ? 'bg-white text-n-red shadow-[inset_0_0_0_2px_#C83E2E]' : 'bg-n-amber text-n-ink')}>
                <Cap>{!done && short ? 'Still owed' : tipAmount > 0 && !done ? 'Tip on card' : 'Change'}</Cap>
                <span className="cond num text-[56px] font-bold leading-none">{cur} {money(!done && short ? remaining : tipAmount > 0 && !done ? tipAmount : heroChange)}</span>
              </div>

              <div role="radiogroup" aria-label="Receipt" className="flex flex-shrink-0 gap-1.5">
                {([[1, 'Print'], [2, 'Print 2 copies'], [0, 'No receipt']] as [0 | 1 | 2, string][]).map(([v, l]) => (
                  <button key={v} type="button" role="radio" aria-checked={copies === v} disabled={!!done} onClick={() => setCopies(v)}
                    className={cn('press h-11 flex-1 whitespace-nowrap rounded-md bg-white text-[13px]', copies === v ? 'border-2 border-n-deep font-semibold' : 'border border-n-edge')}>{l}</button>
                ))}
              </div>
            </div>
            <Keypad mode="decimal" tone="light" className="w-[270px] flex-shrink-0" onKey={onKey} />
          </div>

          {error && <span className="text-sm font-semibold text-n-red">{error}</span>}
          <button type="button" onClick={handleComplete} disabled={!done && !ok}
            className={cn('press flex h-16 flex-shrink-0 items-center justify-between rounded-lg px-[18px] text-xl font-bold',
              done ? 'bg-n-green text-white' : ok ? 'bg-n-deep text-white' : 'bg-n-sand text-n-stone')}>
            <span>{done ? (copies ? 'Done, printing' : 'Done') : processing ? 'Completing…' : short ? `Still owed ${money(remaining)}` : 'Finish sale'}</span>
            <span className="text-[13px] font-medium">{done ? 'Tap for the next order' : copies ? 'Prints the receipt' : ''}</span>
          </button>
        </section>
      </div>
    </div>
  )
}
