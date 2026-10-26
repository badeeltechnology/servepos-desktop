import { useState, useEffect, useMemo } from 'react'
import { CartItem } from '../stores/cart'
import { useAuthStore } from '../stores/auth'
import { useStatus, isCashMethod } from '../stores/status'
import { useSessionGuard, askConfirm, toast } from '../stores/ui'
import { useT } from '../stores/i18n'
import StatusBand from './StatusBand'
import { Btn, SubBar, BackButton, Cap, Keypad, Field, Dot, money, amountKey, roundMoney, C } from '../ui'
import { quickCash } from '../ui/currency'
import { cn } from '../lib/utils'
import { SplitChooser, EvenSplit, ItemSplit, GuestShare, guestColor } from './SplitBill'

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
  /** Guests on the order: the default number of ways for a split */
  guests?: number
  processing?: boolean
  /** Opened by "Direct pay": nothing goes to the kitchen; the header says so */
  noKot?: boolean
  onComplete: (payments: PaymentEntry[], collectedByWaiter: string | null, tipAmount?: number, receiptCopies?: number) => Promise<boolean> | boolean | void
  onCancel: () => void
  onDone?: () => void
}

type Method = { name: string; mode_of_payment: string; is_default: number }

/** Whole notes without decimals (500, 5), fractions in full (1.500 OMR). */
function chipLabel(v: number) {
  return Number.isInteger(v) ? money(v, 0) : money(v)
}

export default function PaymentDialog(props: Props) {
  const { orderWaiterName, processing, onComplete, onCancel, onDone } = props
  // Snapshot the order: the cart is cleared the moment the sale completes, but we keep showing it.
  const [snap] = useState(() => ({
    due: roundMoney(props.grandTotal),
    subtotal: props.subtotal ?? props.grandTotal,
    discount: props.discount || 0,
    tax: props.tax || 0,
    taxLabel: props.taxLabel || 'VAT',
    lines: (props.lines || []).map((l) => ({ ...l })),
    label: props.orderLabel || 'Sale',
    sub: props.orderSub || '',
    number: props.orderNumber || null
  }))
  // Split by guest (evenly / by item): each guest's share is collected in turn. Nothing is stored
  // until the last share is taken; then the order completes once with one payment row per guest.
  const [splitPick, setSplitPick] = useState<null | 'choose' | 'even' | 'items'>(null)
  const [gShares, setGShares] = useState<(GuestShare & { label?: string })[] | null>(null)
  const [gIdx, setGIdx] = useState(0)
  const [gCount, setGCount] = useState(0)
  const [gPaid, setGPaid] = useState<Record<number, { method: string; amount: number; reference: string; change: number }>>({})
  const [gChange, setGChange] = useState<null | { label: string; change: number }>(null)
  const guestMode = !!gShares
  const gCur = gShares ? gShares[gIdx] : null
  const gLabel = (s: GuestShare & { label?: string }) => s.label || t('Guest {n}', { n: s.guest })
  const due = gCur ? gCur.amount : snap.due
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
  const [finishing, setFinishing] = useState(false)
  const t = useT()

  // No inactivity sign-out while this screen is open
  useEffect(() => {
    useSessionGuard.getState().setPaymentOpen(true)
    return () => useSessionGuard.getState().setPaymentOpen(false)
  }, [])

  useEffect(() => {
    window.api.paymentMethods.get().then((m: Method[]) => {
      setMethods(m || [])
      const def = (m || []).find((x) => x.is_default) || (m || [])[0]
      if (def) setMethod(def.mode_of_payment)
    }).catch(() => {})
    window.api.waiters.list().then((l: any) => setWaiters(l || [])).catch(() => {})
    window.api.receiptConfig.getAll().then((c: any) => setRc(c || {})).catch(() => {})
  }, [])

  const cashMethod = useStatus((s) => s.cashMethod)
  const cashy = (m: string) => isCashMethod(m, cashMethod)
  const isCash = cashy(method)
  const received = parseFloat(cashEntry || '0') || 0
  const tipVal = parseFloat(tip || '0') || 0

  // Tender lines before the tip. Non-cash lines are capped at what is owed; only cash can go over
  // (the excess is change). The tip is explicit (Tip button) and rides on the first non-cash line.
  const lines: PaymentEntry[] = useMemo(() => {
    if (split) return parts
    if (!method) return []
    if (isCash) return [{ method, amount: fresh && !cashEntry ? due : received, reference: '' }]
    return [{ method, amount: due, reference }]
  }, [split, parts, method, isCash, fresh, cashEntry, received, due, reference])
  const tipLine = guestMode ? -1 : lines.findIndex((p) => !cashy(p.method) && p.amount > 0)
  const tipAmount = tipLine >= 0 ? roundMoney(tipVal) : 0
  const covered = roundMoney(lines.reduce((s, p) => s + p.amount, 0))
  const remaining = roundMoney((due - covered))
  const change = covered > due && lines.some((p) => cashy(p.method)) ? roundMoney((covered - due)) : 0
  const short = remaining > 0
  const ok = !short && lines.length > 0 && !processing && !finishing
  // What goes to onComplete: same shape as before (a card line carrying a tip is due + tip)
  const payments: PaymentEntry[] = lines.map((p, i) => (i === tipLine && tipAmount > 0 ? { ...p, amount: roundMoney((p.amount + tipAmount)) } : p))

  // Quick cash: exact + the notes a guest is likely to hand over (per currency, see ui/currency)
  const code = useStatus((s) => s.currencyCode)
  const chips = useMemo(() => quickCash(due, code), [due, code])

  function onKey(k: Parameters<typeof amountKey>[1]) {
    setError('')
    if (done) return
    if (tipMode) { setTip(amountKey(tip, k)); return }
    if (split) {
      setParts((ps) => ps.map((p, i) => {
        if (i !== activePart) return p
        let amt = parseFloat(amountKey(partFresh || !p.amount ? '' : String(p.amount), k)) || 0
        if (!cashy(p.method)) {
          const others = ps.reduce((s, x, j) => (j === i ? s : s + x.amount), 0)
          amt = Math.min(amt, Math.max(0, roundMoney((due - others))))
        }
        return { ...p, amount: amt }
      }))
      setPartFresh(false)
      return
    }
    if (isCash) {
      const base = fresh ? '' : cashEntry
      setCashEntry(amountKey(base, k))
      setFresh(false)
    }
  }

  function startSplit() {
    if (split) { setSplit(false); setParts([]); return }
    if (guestMode) { leaveGuests(); return }
    setSplitPick('choose')
  }
  function startByAmount() {
    const first: PaymentEntry = { method: method || methods[0]?.mode_of_payment || 'Cash', amount: due, reference: '' }
    setParts([first]); setActivePart(0); setSplit(true); setTipMode(false)
  }
  function addPart() {
    const unused = methods.find((m) => !parts.some((p) => p.method === m.mode_of_payment))
    if (!unused) return
    setParts([...parts, { method: unused.mode_of_payment, amount: Math.max(0, roundMoney(remaining)), reference: '' }])
    setActivePart(parts.length)
  }

  function startGuests(shares: GuestShare[]) {
    setSplitPick(null); setSplit(false); setParts([]); setTipMode(false); setTip('')
    setGShares(shares); setGCount(shares.length); setGIdx(0); setGPaid({}); setGChange(null); setCashEntry(''); setFresh(true); setReference('')
  }
  async function leaveGuests() {
    const taken = Object.keys(gPaid).length
    if (taken && !(await askConfirm({ title: t('Leave the split?'), body: t('{n} guest payments taken here are not saved yet. Hand the money back, or take it again.', { n: taken }), ok: t('Leave'), cancel: t('Stay'), danger: true }))) return false
    setGShares(null); setGPaid({}); setGIdx(0); setGChange(null); setCashEntry(''); setFresh(true)
    return true
  }
  /** Fold every unpaid share into one ("Pay remaining together"). */
  function payRestTogether() {
    if (!gShares) return
    const unpaid = gShares.filter((_, i) => !gPaid[i])
    if (unpaid.length < 2) return
    const merged = { guest: unpaid[0].guest, amount: roundMoney(unpaid.reduce((x, u) => x + u.amount, 0)), items: unpaid.flatMap((u) => u.items), label: `${t('Guests')} ${unpaid.map((u) => u.label ? u.label.replace(/^\D+/, '') : u.guest).join('+')}` }
    const kept = gShares.filter((_, i) => gPaid[i])
    const next = [...kept, merged]
    const paid: typeof gPaid = {}
    kept.forEach((_, i) => { paid[i] = gPaid[gShares.indexOf(kept[i])] })
    setGShares(next); setGPaid(paid); setGIdx(next.length - 1); setCashEntry(''); setFresh(true)
  }
  async function printGuestSlip(i: number) {
    if (!gShares) return
    const s = gShares[i]; const p = gPaid[i]
    try {
      const r = await window.api.print.guestShare({ orderNumber: snap.number, label: snap.label, guestNo: s.guest, guestCount: gCount, items: s.items, share: s.amount, payments: p ? [{ method: p.method, amount: p.amount }] : [], change: p?.change || 0 })
      r?.success === false ? toast.error(r.error || 'Guest slip did not print') : toast.success(t('{who} slip printed', { who: gLabel(s) }))
    } catch (e: any) { toast.error(e?.message || 'Guest slip did not print') }
  }
  async function takeGuestShare() {
    if (!gShares || !gCur || finishing) return
    if (short) { setError(`Payment is short by ${money(remaining)}`); return }
    const m = lines[0]?.method || method
    const paidAmt = roundMoney(Math.min(lines[0]?.amount || 0, due))
    const entry = { method: m, amount: paidAmt, reference: (!cashy(m) && reference) || '', change }
    const paid = { ...gPaid, [gIdx]: entry }
    setGPaid(paid)
    setGChange({ label: gLabel(gCur), change })
    setCashEntry(''); setFresh(true); setReference(''); setError('')
    // each guest starts on the default method again
    const def = methods.find((x) => x.is_default) || methods[0]
    if (def) setMethod(def.mode_of_payment)
    const next = gShares.findIndex((_, i) => !paid[i])
    if (next >= 0) { setGIdx(next); return }
    // Last share: complete the order once, one payment row per guest ("Guest 2 of 3" in the reference)
    const all = gShares.map((g, i) => ({ method: paid[i].method, amount: paid[i].amount, reference: [`${g.label ? `Guests ${g.label.replace(/^\D+/, '')}` : `Guest ${g.guest}`} of ${gCount}`, paid[i].reference].filter(Boolean).join(' · ') }))
    setFinishing(true)
    try {
      const res = await onComplete(all, collectedBy || null, undefined, copies)
      if (res === false) { setGPaid(gPaid); return }
      setDone({ change, tip: 0, payments: all })
    } finally {
      setFinishing(false)
    }
  }

  async function handleComplete() {
    if (done) { onDone?.(); return }
    if (guestMode) { await takeGuestShare(); return }
    if (finishing) return
    if (short) { setError(`Payment is short by ${money(remaining)}`); return }
    // Cap cash at what is still owed (the excess is change handed back, not stored).
    // Non-cash lines are already capped; the one carrying the tip keeps it.
    let left = due
    const capped = payments.map((p, i) => {
      const base = i === tipLine ? p.amount - tipAmount : p.amount
      const amt = Math.min(base, left)
      left = Math.max(0, left - amt)
      return { ...p, amount: roundMoney((amt + (i === tipLine ? tipAmount : 0))) }
    }).filter((p) => p.amount > 0)
    setFinishing(true)
    try {
      const res = await onComplete(capped, collectedBy || null, tipAmount > 0 ? tipAmount : undefined, copies)
      if (res === false) return
      setDone({ change, tip: tipAmount, payments: capped })
    } finally {
      setFinishing(false)
    }
  }

  const heroChange = done ? done.change : change
  const tipMethod = tipLine >= 0 ? lines[tipLine].method : null
  const entryLabel = tipMode ? t('Tip on {method}', { method: tipMethod || '' }) : split ? `${parts[activePart]?.method || ''} amount` : isCash ? t('Cash received') : t('Amount')
  const entryValue = tipMode ? tipVal : split ? (parts[activePart]?.amount || 0) : isCash ? (fresh && !cashEntry ? due : received) : due
  const rcPayments: PaymentEntry[] = done?.payments || (gShares ? gShares.map((g, i) => gPaid[i] ? { method: gPaid[i].method, amount: gPaid[i].amount, reference: gLabel(g) } : null).filter(Boolean) as PaymentEntry[] : payments)
  const rcMethodLine = rcPayments.map((p) => `Paid ${p.method.toLowerCase()}${/^Guest/.test(p.reference || '') ? ` (${p.reference.split(' · ')[0]})` : ''}`)

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-n-cream" role="dialog" aria-label="Payment">
      <StatusBand userName={user?.name} showWaiter={false} />
      <SubBar>
        <BackButton onClick={async () => { if (guestMode && !(await leaveGuests())) return; onCancel() }} />
        <span className="cond text-2xl font-bold">{snap.label}</span>
        <span className="truncate text-[13px] text-n-mist">{snap.sub}</span>
        {props.noKot && <span className="flex-shrink-0 whitespace-nowrap rounded border border-dashed border-n-amber px-2 py-0.5 text-[12px] font-bold uppercase tracking-[.04em] text-n-amber">{t('Direct pay · no KOT')}</span>}
        <span className="flex-1" />
        <Btn variant="ghostDark" aria-pressed={split || guestMode} onClick={startSplit} disabled={!!done} className={cn((split || guestMode) && 'bg-white text-n-deep')}>{split || guestMode ? t('Split off') : t('Split')}</Btn>
        <Btn variant="ghostDark" aria-pressed={tipMode} disabled={!!done || tipLine < 0} onClick={() => setTipMode(!tipMode)} className={cn(tipMode && 'bg-white text-n-deep')}>{tipAmount > 0 ? `${t('Tip')} ${money(tipAmount)}` : t('Tip')}</Btn>
        {waiters.length > 0 && (
          <span className="relative">
            <Btn variant="ghostDark" disabled={!!done} onClick={() => setShowCollector(!showCollector)} aria-haspopup="menu">
              {collectedBy ? t('Collected by {name}', { name: collectedBy }) : t('Collected by cashier')}
            </Btn>
            {showCollector && (
              <span role="menu" className="absolute right-0 top-full z-50 mt-1 flex max-h-[60vh] w-56 flex-col overflow-y-auto rounded-md bg-white text-n-ink shadow-pop">
                <button type="button" role="menuitem" onClick={() => { setCollectedBy(''); setShowCollector(false) }} className={cn('h-12 px-3 text-start text-sm', !collectedBy && 'bg-n-ice font-semibold')}>Cashier (direct)</button>
                {waiters.map((w) => (
                  <button key={w.name} type="button" role="menuitem" onClick={() => { setCollectedBy(w.waiter_name); setShowCollector(false) }}
                    className={cn('h-12 px-3 text-start text-sm', collectedBy === w.waiter_name && 'bg-n-ice font-semibold')}>{w.waiter_name}</button>
                ))}
              </span>
            )}
          </span>
        )}
      </SubBar>

      <div className="flex min-h-0 flex-1 gap-3 p-3">
        {/* Receipt, as it will print */}
        <aside aria-label="Receipt" className="hidden w-[250px] flex-shrink-0 flex-col gap-px overflow-hidden bg-white px-3.5 pb-3 pt-3.5 font-mono text-xs leading-normal shadow-tile min-[1100px]:flex">
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
            <div className="flex justify-between text-[13px] font-semibold"><span>TOTAL {cur}</span><span>{money(snap.due)}</span></div>
            {rcPayments.map((p, i) => (
              <div key={i} className="flex justify-between"><span>{rcMethodLine[i]}</span><span>{money(p.amount)}</span></div>
            ))}
            {(done ? done.tip : tipAmount) > 0 && <div className="flex justify-between"><span>Tip</span><span>{money(done ? done.tip : tipAmount)}</span></div>}
            <div className="flex justify-between"><span>Change</span><span>{money(heroChange)}</span></div>
            <div className="my-1.5 border-t border-dashed border-[#B9B2A4]" />
            <div className="text-center">{rc.footer_message || 'Thank you'}</div>
          </div>
          <div className="mt-1 flex items-center gap-1.5 font-sans text-xs text-n-muted">
            <Dot color={copies ? C.green : C.stone} size={7} />{copies === 0 ? 'Nothing printed' : `Counter printer · ${copies} cop${copies === 1 ? 'y' : 'ies'}`}
          </div>
        </aside>

        {/* Tender */}
        <section className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="flex items-baseline gap-3 px-0.5">
            <Cap className="text-n-muted">{gCur && !done ? t('{who} pays', { who: gLabel(gCur) }) : t('To pay')}</Cap>
            <span className="cond num text-[44px] font-bold leading-none text-n-deep">{cur} {money(due)}</span>
            {split && <span className="ml-auto text-sm text-n-muted">{short ? <b className="num text-n-red">{t('Left to split {amount}', { amount: money(remaining) })}</b> : t('Fully covered')}</span>}
          </div>

          {gShares && (
            <div aria-label={t('Guests')} className="flex flex-shrink-0 items-stretch gap-1.5 overflow-x-auto">
              {gShares.map((g, i) => {
                const p = gPaid[i]
                const on = i === gIdx && !p
                return (
                  <div key={i} className={cn('flex min-w-[150px] flex-shrink-0 flex-col justify-center rounded-md px-3 py-1.5', on ? 'text-white' : 'border-2 bg-white')}
                    style={on ? { background: guestColor(g.guest) } : { borderColor: p ? '#2E8B57' : guestColor(g.guest) }}>
                    <button type="button" disabled={!!p || !!done} onClick={() => { setGIdx(i); setCashEntry(''); setFresh(true) }} className="text-start">
                      <span className="block text-[13px] font-bold">{gLabel(g)} {t('of {n}', { n: gCount })}</span>
                      <span className="cond num block text-xl font-bold leading-none">{money(g.amount)} {p && <span className="font-sans text-[13px] text-n-green">· {t('Paid')} ✓ {p.method}</span>}</span>
                    </button>
                    {p && <button type="button" onClick={() => printGuestSlip(i)} className="mt-0.5 self-start text-xs font-semibold text-n-teal underline">{t('Print slip')}</button>}
                  </div>
                )
              })}
              {!done && gShares.filter((_, i) => !gPaid[i]).length > 1 && (
                <button type="button" onClick={payRestTogether} className="press flex-shrink-0 rounded-md border-[1.5px] border-n-edge bg-white px-3 text-[13px] font-semibold">{t('Pay remaining together')}</button>
              )}
            </div>
          )}

          <div role="radiogroup" aria-label="Method" className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(4, Math.max(1, methods.length))}, minmax(0, 1fr))` }}>
            {methods.map((m) => {
              const on = split ? parts[activePart]?.method === m.mode_of_payment : method === m.mode_of_payment
              return (
                <button key={m.name} type="button" role="radio" aria-checked={on} disabled={!!done}
                  onClick={() => {
                    setError('')
                    if (split) setParts((ps) => ps.map((p, i) => (i === activePart ? { ...p, method: m.mode_of_payment } : p)))
                    else { setMethod(m.mode_of_payment); setTipMode(false); if (cashy(m.mode_of_payment)) setTip('') }
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
                      <button type="button" className="flex flex-1 items-center justify-between gap-2 text-start" onClick={() => setActivePart(i)}>
                        <span className="font-semibold">{p.method}</span>
                        <span className="cond num text-xl font-bold">{money(p.amount)}</span>
                      </button>
                      {parts.length > 1 && <button type="button" aria-label={`Remove ${p.method}`} onClick={() => { setParts(parts.filter((_, j) => j !== i)); setActivePart(0) }} className="h-9 w-9 text-xl text-n-red">×</button>}
                    </div>
                  ))}
                  {parts.length < methods.length && <Btn variant="outline" onClick={addPart} className="flex-shrink-0">{t('+ Add another method')}</Btn>}
                  {parts[activePart] && !cashy(parts[activePart].method) && (
                    <Field data-keyboard="full" value={parts[activePart].reference} placeholder={`${parts[activePart].method} reference (optional)`}
                      onChange={(e) => setParts(parts.map((x, j) => (j === activePart ? { ...x, reference: e.target.value } : x)))} />
                  )}
                </div>
              ) : isCash ? (
                <div className={cn('grid flex-shrink-0 gap-2', chips.length > 4 ? 'grid-cols-3' : 'grid-cols-4')}>
                  {chips.map((v, i) => (
                    <button key={v} type="button" aria-label={i === 0 ? 'Exact amount' : `Received ${chipLabel(v)}`} disabled={!!done} onClick={() => { setCashEntry(String(v)); setFresh(false); setError('') }}
                      className="press cond num h-[52px] rounded-md border border-n-edge bg-white text-xl font-semibold">{i === 0 ? t('Exact') : chipLabel(v)}</button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-shrink-0 flex-col gap-2">
                  <div className="rounded-md bg-white px-3 py-2.5 text-[13px] text-n-muted">{t('Charged exactly what is owed. Use Tip to add a tip.')}</div>
                  <Field data-keyboard="full" value={reference} onChange={(e) => setReference(e.target.value)} placeholder={`${method} reference (optional)`} disabled={!!done} />
                </div>
              )}

              <div className={cn('flex min-h-[100px] flex-1 items-center justify-between rounded-md px-4', done ? 'bg-n-amber text-n-ink' : short ? 'bg-white text-n-red shadow-[inset_0_0_0_2px_#C83E2E]' : 'bg-n-amber text-n-ink')}>
                <Cap>{!done && short ? t('Still owed') : gChange && fresh && !done ? t('Change for {who}', { who: gChange.label }) : t('Change')}</Cap>
                <span className="cond num text-[56px] font-bold leading-none">{cur} {money(!done && short ? remaining : gChange && fresh && !done ? gChange.change : heroChange)}</span>
              </div>

              <div role="radiogroup" aria-label="Receipt" className="flex flex-shrink-0 gap-1.5">
                {([[1, t('Print')], [2, t('Print 2 copies')], [0, t('No receipt')]] as [0 | 1 | 2, string][]).map(([v, l]) => (
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
            <span>{done ? (copies ? t('Done, printing') : t('Done')) : processing || finishing ? t('Completing…') : short ? `${t('Still owed')} ${money(remaining)}` : gShares && gShares.filter((_, i) => !gPaid[i]).length > 1 ? t('Take {who}’s share', { who: gCur ? gLabel(gCur) : '' }) : t('Finish sale')}</span>
            <span className="text-[13px] font-medium">{done ? t('Tap for the next order') : copies ? t('Prints the receipt') : ''}</span>
          </button>
        </section>
      </div>
      {splitPick === 'choose' && (
        <SplitChooser canByAmount={methods.length >= 2} onCancel={() => setSplitPick(null)}
          onPick={(k) => { if (k === 'amount') { setSplitPick(null); startByAmount() } else setSplitPick(k) }} />
      )}
      {splitPick === 'even' && <EvenSplit total={snap.due} initial={props.guests} onCancel={() => setSplitPick(null)} onDone={startGuests} />}
      {splitPick === 'items' && <ItemSplit lines={snap.lines} total={snap.due} initial={props.guests} onCancel={() => setSplitPick(null)} onDone={startGuests} />}
    </div>
  )
}
