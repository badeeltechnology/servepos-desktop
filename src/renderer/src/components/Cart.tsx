import { useState, useEffect, useMemo, ReactNode } from 'react'
import { useCartStore, CartItem } from '../stores/cart'
import { useAuthStore } from '../stores/auth'
import { useStatus } from '../stores/status'
import { itemColor } from '../stores/menu'
import { toast } from '../stores/ui'
import TablePicker from './TablePicker'
import VoidDialog, { VoidResult } from './VoidDialog'
import { roundMoney } from '../ui/currency'
import { Btn, Dialog, Sheet, Option, Stepper, Cap, Field, Keypad, PinDots, Chevron, money, amountKey, pinKey, staffColor, initial } from '../ui'
import { timeOf } from '../ui/hosts'
import { cn } from '../lib/utils'
import { useT } from '../stores/i18n'

// The ticket: who/where at the top, what went to the kitchen (Sent) apart from what hasn't (New),
// a tray of actions on the tapped line, and Send / Hold / Pay at the bottom.

type RemovedItem = { dbId?: string; itemName: string; qty: number; rate: number; amount: number }

interface CartProps {
  onPlaceOrder: () => void
  onUpdateOnly?: () => void
  onPay: () => void
  onHold: () => void
  onNewOrder: () => void
  /** Open an existing order (occupied table in the picker) */
  onOpenOrder?: (orderId: string) => void
  taxRate: number
  taxLabel?: string
  isOrderPlaced?: boolean
  activeOrderId?: string | null
  orderNumber?: string | null
  orderCreatedAt?: string | null
  sentAt?: string | null
  processing?: boolean
  onAutoVoid?: (reason: string) => void
  onItemRemoved?: (orderId: string, item: RemovedItem, reason: string, remarks?: string, disposition?: string) => void
  /** Void part of a sent line (qty < line qty). */
  onPartialVoid?: (orderId: string, item: RemovedItem, voidQty: number, reason: string, remarks?: string, disposition?: string) => Promise<void> | void
}

export default function Cart({ onPlaceOrder, onUpdateOnly, onPay, onHold, onNewOrder, onOpenOrder, taxRate, taxLabel = 'VAT', isOrderPlaced = false, activeOrderId, orderNumber, orderCreatedAt, sentAt, processing, onAutoVoid, onItemRemoved, onPartialVoid }: CartProps) {
  const [discountEnabled, setDiscountEnabled] = useState(false)
  const [discountPermission, setDiscountPermission] = useState<'supervisor_only' | 'all_users'>('supervisor_only')
  const [defaultMaxPct, setDefaultMaxPct] = useState(0)
  const t = useT()

  useEffect(() => { loadDiscountConfig() }, [])

  async function loadDiscountConfig() {
    const config = await window.api.receiptConfig.getAll()
    setDiscountEnabled(config.discount_enabled === '1')
    setDiscountPermission((config.discount_permission as 'supervisor_only' | 'all_users') || 'supervisor_only')
    setDefaultMaxPct(parseFloat(config.default_max_discount_pct || '0') || 0)
  }

  const cart = useCartStore()
  const {
    items, orderType, setOrderType, tableName, room, guests, waiterName,
    updateItemQty, removeItem, updateItemInstructions, updateItemDiscount,
    orderDiscountPercent, orderDiscountAmount, promoName, voucherCode,
    getSubtotal, getOrderDiscountValue, getTaxTotal, getGrandTotal
  } = cart
  const cur = useStatus((s) => s.currency)

  const user = useAuthStore((s) => s.user)
  const canDiscount = discountEnabled && (user?.role === 'supervisor' || (discountPermission === 'all_users' && user?.role === 'cashier'))
  // Cashier limit: their own max % if set, else the admin default; 0 means no discounts for this
  // cashier (a supervisor can still give one). Supervisors are unlimited. Fixed amounts count as % of the gross.
  const cashierLimit = user?.role === 'cashier' ? ((user?.max_discount_pct ?? 0) > 0 ? user!.max_discount_pct : defaultMaxPct) : null

  const [selected, setSelected] = useState<string | null>(null)
  const [sentOpen, setSentOpen] = useState(true)
  const [typeMenu, setTypeMenu] = useState(false)
  const [sheet, setSheet] = useState<null | 'order' | 'offers'>(null)
  const [showTablePicker, setShowTablePicker] = useState(false)
  const [noteFor, setNoteFor] = useState<CartItem | null>(null)
  const [discFor, setDiscFor] = useState<CartItem | null>(null)
  const [voidFor, setVoidFor] = useState<CartItem | null>(null)
  const [voidQty, setVoidQty] = useState<number | undefined>(undefined)

  const subtotal = getSubtotal()
  const orderDiscVal = getOrderDiscountValue()
  const tax = getTaxTotal(taxRate)
  const grandTotal = getGrandTotal(taxRate)

  const sentLines = items.filter((i) => i.kotPrinted)
  const newLines = items.filter((i) => !i.kotPrinted)
  const sum = (ls: CartItem[]) => ({ qty: ls.reduce((s, l) => s + l.qty, 0), amt: ls.reduce((s, l) => s + l.amount, 0) })
  const sentSum = sum(sentLines)
  const newSum = sum(newLines)
  const itemCount = items.reduce((s, l) => s + l.qty, 0)

  // Deselect when the line disappears
  useEffect(() => { if (selected && !items.find((i) => i.id === selected)) setSelected(null) }, [items, selected])

  const shortNo = orderNumber ? orderNumber.split('-').pop() : null
  const label = tableName || (shortNo ? `${orderType === 'Takeaway' ? 'TA' : orderType === 'Delivery' ? 'D' : '#'} ${shortNo}` : t('New'))
  const subParts = [room, orderType === 'Dine In' ? `${guests} ${t(guests === 1 ? 'guest' : 'guests')}` : null, waiterName, orderCreatedAt ? t('since {time}', { time: timeOf(orderCreatedAt) }) : null].filter(Boolean)

  // Persist edits on lines already saved to the order (so payment, which reads order_items, sees them)
  function persist(line: CartItem, patch: Record<string, any>) {
    if (!line.dbId) return
    window.api.orderItems.update(line.dbId, patch).catch(() => {})
  }
  function changeQty(line: CartItem, qty: number) {
    if (qty <= 0) { removeLine(line); return }
    // A line already on the order only goes down through the void flow (reason, PIN, void slip)
    if (line.dbId && qty < line.qty) { setVoidQty(line.qty - qty); setVoidFor(line); return }
    updateItemQty(line.id, qty)
    const after = useCartStore.getState().items.find((i) => i.id === line.id)
    if (after) persist(after, { qty: after.qty, amount: after.amount })
  }
  function removeLine(line: CartItem) {
    if (line.dbId) { setVoidQty(undefined); setVoidFor(line); return } // on the order already: needs a reason (and a PIN for cashiers)
    removeItem(line.id)
  }

  async function confirmVoid(line: CartItem, r: VoidResult) {
    const orderId = activeOrderId
    const partial = r.qty < line.qty
    const removed: RemovedItem = { dbId: line.dbId, itemName: line.itemName, qty: partial ? r.qty : line.qty, rate: line.rate, amount: partial ? roundMoney((line.amount / line.qty) * r.qty) : line.amount }
    if (partial) {
      updateItemQty(line.id, line.qty - r.qty)
      if (orderId && onPartialVoid) await onPartialVoid(orderId, removed, r.qty, r.reason, r.remarks, r.disposition)
    } else {
      const wasLast = items.length === 1
      removeItem(line.id)
      if (orderId && onItemRemoved) onItemRemoved(orderId, removed, r.reason, r.remarks, r.disposition)
      if (wasLast && orderId && onAutoVoid) onAutoVoid(r.reason)
    }
    setVoidFor(null)
    setSelected(null)
    toast.success(`Voided ${removed.qty} × ${line.itemName}`)
  }

  async function reprintKot() {
    if (!activeOrderId) return
    const r = await window.api.print.kots(activeOrderId, user?.name, true)
    if (r?.success === false) toast.error(`KOT reprint failed: ${r?.errors?.join(', ') || 'check printer'}`)
    else toast.success('KOT reprinted')
  }

  const trayBtn = 'press flex h-11 min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-md border border-n-edge bg-white text-[13px] font-semibold text-n-ink'
  const trayVoid = 'press flex h-11 min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-md border border-n-red bg-white text-[13px] font-semibold text-n-red'

  function lineRow(l: CartItem) {
    const sel = selected === l.id
    const mods = [...l.modifiers.map((m) => m.name), l.specialInstructions ? `“${l.specialInstructions}”` : ''].filter(Boolean).join(', ')
    const disc = l.discountPercent > 0 ? `−${l.discountPercent}%` : l.discountAmount > 0 ? `−${money(l.discountAmount)}` : ''
    return (
      <div key={l.id} className={cn(sel && 'bg-n-ice shadow-[inset_3px_0_0_#0E6E86]')}>
        <button type="button" onClick={() => setSelected(sel ? null : l.id)} aria-expanded={sel}
          className="flex min-h-[36px] w-full items-center gap-2.5 px-3 py-1 text-start text-n-ink">
          <span className="cond num inline-flex h-[22px] min-w-[22px] flex-shrink-0 items-center justify-center rounded px-[5px] text-[15px] font-bold text-white" style={{ background: itemColor(l.itemCode, l.itemName) }}>{l.qty}</span>
          <span className={cn('min-w-0 flex-1 text-sm', sel ? 'whitespace-normal' : 'truncate')}>
            {l.itemName}
            {mods && <span className="text-n-muted"> · {mods}</span>}
            {disc && <span className="font-semibold text-n-green"> {disc}</span>}
            {l.dbId && !l.kotPrinted && <span className="text-xs font-semibold text-n-muted"> · saved</span>}
          </span>
          <span className="num text-sm font-medium">{money(l.amount)}</span>
        </button>
        {sel && (
          l.kotPrinted ? (
            <div className="flex gap-1.5 px-3 pb-2.5 pt-0.5">
              <button type="button" className={trayBtn} onClick={reprintKot}>{t('Reprint KOT')}</button>
              <button type="button" className={trayBtn} onClick={() => setNoteFor(l)}>{t('Kitchen note')}</button>
              <button type="button" className={trayVoid} onClick={() => { setVoidQty(undefined); setVoidFor(l) }}>{t('Void')}</button>
            </div>
          ) : (
            <div className="flex gap-1.5 px-3 pb-2.5 pt-0.5">
              <button type="button" aria-label="One less" onClick={() => changeQty(l, l.qty - 1)} className="press flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md border border-n-edge bg-white text-xl">−</button>
              <button type="button" aria-label="One more" onClick={() => changeQty(l, l.qty + 1)} className="press flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md border border-n-edge bg-white text-xl">+</button>
              <button type="button" className={trayBtn} onClick={() => setNoteFor(l)}>{t('Note')}</button>
              {canDiscount && <button type="button" className={trayBtn} onClick={() => setDiscFor(l)}>{t('Discount')}</button>}
              <button type="button" className={trayVoid} onClick={() => removeLine(l)}>{t('Remove')}</button>
            </div>
          )
        )}
      </div>
    )
  }

  return (
    <aside aria-label="Current order" className="relative flex h-full flex-col bg-white shadow-[-1px_0_0_#D8D1C3]">
      {/* Who and where */}
      <div className="flex flex-shrink-0 items-center gap-2.5 border-b border-n-line px-3 pb-[5px] pt-1.5">
        <button type="button" onClick={() => (orderType === 'Dine In' ? setShowTablePicker(true) : setSheet('order'))}
          className="cond max-w-[45%] truncate text-[34px] font-bold leading-none text-n-deep" title={orderType === 'Dine In' ? 'Choose table' : 'Order details'}>
          {label}
        </button>
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="relative self-start">
            <button type="button" onClick={() => setTypeMenu(!typeMenu)} aria-haspopup="menu"
              className="relative flex h-[26px] items-center gap-[5px] rounded-[5px] border-[1.5px] border-n-teal px-2 text-xs font-semibold text-n-teal after:absolute after:-inset-[9px] after:content-['']">
              {t(orderType === 'Dine In' ? 'Dine in' : orderType)}<Chevron size={10} strokeWidth={3.5} />
            </button>
            {typeMenu && (
              <span role="menu" className="absolute left-0 top-full z-30 mt-1 flex w-40 flex-col overflow-hidden rounded-md bg-white shadow-pop">
                {(['Dine In', 'Takeaway', 'Delivery'] as const).map((tp) => (
                  <button key={tp} role="menuitem" type="button" onClick={() => { setOrderType(tp); if (tp !== 'Dine In') cart.setTable(null); setTypeMenu(false) }}
                    className={cn('h-12 px-3 text-start text-sm', orderType === tp ? 'bg-n-ice font-semibold text-n-deep' : 'text-n-ink')}>
                    {t(tp === 'Dine In' ? 'Dine in' : tp)}
                  </button>
                ))}
              </span>
            )}
          </span>
          <button type="button" onClick={() => setSheet('order')} className="truncate py-1 text-start text-xs text-n-muted">
            {subParts.length ? subParts.join(' · ') : orderType === 'Dine In' ? t('Tap to pick a table, guests and waiter') : t('Tap for waiter and notes')}
          </button>
        </span>
        <button type="button" aria-label="More actions" onClick={() => setSheet('order')}
          className="press flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md border border-n-line bg-white">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#1B1F24" aria-hidden="true"><circle cx="5" cy="12" r="2.2" /><circle cx="12" cy="12" r="2.2" /><circle cx="19" cy="12" r="2.2" /></svg>
        </button>
      </div>

      {/* Lines */}
      <div className="scroll-none min-h-0 flex-1 overflow-y-auto pb-0.5 pt-1" onClick={() => typeMenu && setTypeMenu(false)}>
        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
            <span className="cond text-2xl font-bold text-n-ink">{t('Nothing on the ticket')}</span>
            <span className="text-sm text-n-muted">{t('Tap the menu to add items, or open an order from the rail.')}</span>
          </div>
        ) : (
          <>
            {sentLines.length > 0 && (
              <>
                <button type="button" onClick={() => setSentOpen(!sentOpen)} aria-expanded={sentOpen}
                  className="flex h-[30px] w-full items-center gap-2 px-3 text-start">
                  <Cap className="text-n-muted">{sentAt ? t('Sent {time}', { time: sentAt }) : t('Sent')}</Cap>
                  <span className="h-px flex-1 bg-n-line" />
                  <span className="num text-xs text-n-muted">{sentSum.qty} {t(sentSum.qty === 1 ? 'item' : 'items')} · {money(sentSum.amt)}</span>
                  <Chevron dir={sentOpen ? 'down' : 'right'} size={14} strokeWidth={2.5} className="text-n-muted" />
                </button>
                {sentOpen && sentLines.map(lineRow)}
              </>
            )}
            {newLines.length > 0 && (
              <>
                <div className="flex h-[30px] items-center gap-2 px-3">
                  <Cap className="text-n-teal">{t('New')}</Cap>
                  <span className="h-px flex-1 bg-[#CFE0E5]" />
                  <span className="num text-xs text-n-teal">{newSum.qty} {t(newSum.qty === 1 ? 'item' : 'items')} · {money(newSum.amt)}</span>
                </div>
                {newLines.map(lineRow)}
              </>
            )}
          </>
        )}
      </div>

      {/* Offers and totals */}
      {(orderDiscVal > 0 || taxRate > 0) && items.length > 0 && (
        <div className="flex flex-shrink-0 flex-col gap-0.5 border-t border-n-line px-3 py-1.5 text-[13px]">
          {orderDiscVal > 0 && (
            <span className="flex justify-between text-n-green">
              <span className="truncate">{promoName ? `Promo · ${promoName}` : voucherCode ? 'Voucher' : 'Discount'}{orderDiscountPercent > 0 ? ` ${orderDiscountPercent}%` : ''}</span>
              <span className="num font-semibold">−{money(orderDiscVal)}</span>
            </span>
          )}
          {taxRate > 0 && (
            <span className="flex justify-between text-n-muted"><span>{taxLabel} {taxRate}%</span><span className="num text-n-ink">{money(tax)}</span></span>
          )}
        </div>
      )}
      <div className="flex h-9 flex-shrink-0 items-center gap-2.5 border-t border-n-line px-3 text-[13px] text-n-muted">
        <span className="num">{itemCount} {t(itemCount === 1 ? 'item' : 'items')}</span>
        <button type="button" onClick={() => setSheet('offers')} disabled={items.length === 0}
          className="-ms-2 h-9 px-2 text-[13px] font-semibold text-n-teal disabled:text-n-stone">
          {orderDiscVal > 0 ? t('Change discount') : t('Add discount')}
        </button>
        <span className="flex-1" />
        <span>{t('Subtotal')}</span><span className="num font-semibold text-n-ink">{money(subtotal)}</span>
      </div>

      {/* Send / Hold / Pay */}
      <div className="flex flex-shrink-0 gap-2 bg-white px-2.5 pb-2.5 pt-2">
        <button type="button" onClick={onPlaceOrder} disabled={processing || newLines.length === 0}
          className={cn('press h-16 flex-1 whitespace-nowrap rounded-lg text-base font-bold', newLines.length ? 'bg-n-teal text-white' : 'border-[1.5px] border-n-edge bg-white text-n-muted')}>
          {processing ? t('Sending…') : newLines.length ? t('Send {n}', { n: newSum.qty }) : items.length ? t('Sent') : t('Send')}
        </button>
        <button type="button" onClick={onHold} disabled={processing || items.length === 0}
          className="press h-16 w-16 flex-shrink-0 rounded-lg border-[1.5px] border-n-edge bg-white text-[15px] font-semibold text-n-ink disabled:text-n-stone">
          {t('Hold')}
        </button>
        <button type="button" onClick={onPay} disabled={processing || items.length === 0}
          className="press flex h-16 flex-[1.7] items-center justify-between gap-2 whitespace-nowrap rounded-lg bg-n-amber px-3.5 leading-none text-n-ink disabled:bg-n-sand disabled:text-n-stone">
          <span className="text-base font-bold">{t('Pay')}</span>
          <span className="cond num text-2xl font-bold">{cur} {money(grandTotal)}</span>
        </button>
      </div>

      {/* Sheets and dialogs */}
      {sheet === 'order' && (
        <OrderSheet onClose={() => setSheet(null)} activeOrderId={activeOrderId || null} canUpdateOnly={!!onUpdateOnly && newLines.length > 0}
          onUpdateOnly={() => { setSheet(null); onUpdateOnly?.() }} onNewOrder={() => { setSheet(null); onNewOrder() }}
          onPickTable={() => setShowTablePicker(true)} grandTotal={grandTotal} />
      )}
      {sheet === 'offers' && <OffersSheet onClose={() => setSheet(null)} canDiscount={canDiscount} limit={cashierLimit} />}

      {showTablePicker && (
        <TablePicker onSelect={(name, rm) => { cart.setTable(name, rm); if (orderType !== 'Dine In') setOrderType('Dine In'); setShowTablePicker(false) }}
          onOpenOrder={onOpenOrder ? (id) => { setShowTablePicker(false); setSheet(null); onOpenOrder(id) } : undefined} activeOrderId={activeOrderId}
          onCancel={() => setShowTablePicker(false)} currentTable={tableName} />
      )}

      {noteFor && (
        <NoteDialog line={noteFor} sent={!!noteFor.kotPrinted} onCancel={() => setNoteFor(null)}
          onSave={(text) => { updateItemInstructions(noteFor.id, text); persist(noteFor, { specialInstructions: text || null }); setNoteFor(null) }} />
      )}

      {discFor && (
        <LineDiscountDialog line={discFor} limit={cashierLimit} onCancel={() => setDiscFor(null)}
          onApply={(pct, amt) => {
            updateItemDiscount(discFor.id, pct, amt)
            const after = useCartStore.getState().items.find((i) => i.id === discFor.id)
            if (after) persist(after, { discountPercent: pct, discountAmount: amt, amount: after.amount })
            setDiscFor(null)
          }} />
      )}

      {voidFor && (
        <VoidDialog
          requirePin={user?.role !== 'supervisor'}
          initialQty={voidQty}
          target={{
            kind: 'line',
            title: t(voidFor.kotPrinted ? 'Void from {label}' : 'Remove from {label}', { label }),
            subtitle: voidFor.kotPrinted
              ? t('Already in the kitchen. A cancel slip prints there and this is logged under {name}.', { name: user?.name || 'you' })
              : t('Saved on the order but not sent to the kitchen. Logged under {name}.', { name: user?.name || 'you' }),
            itemName: voidFor.itemName,
            itemColor: itemColor(voidFor.itemCode, voidFor.itemName),
            detail: `${voidFor.kotPrinted ? (sentAt ? `Sent ${sentAt} · ` : 'Sent · ') : ''}${voidFor.qty} on the order · ${money(voidFor.amount / voidFor.qty)} each`,
            maxQty: voidFor.qty,
            unitPrice: voidFor.amount / voidFor.qty
          }}
          onCancel={() => { setVoidFor(null); setVoidQty(undefined) }}
          onConfirm={(r) => confirmVoid(voidFor, r)}
        />
      )}
    </aside>
  )
}

// ------------------------------------------------------------------ order options
function SheetHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex h-14 flex-shrink-0 items-center gap-3 bg-n-deep px-4 text-white">
      <span className="cond flex-1 text-2xl font-bold">{title}</span>
      <Btn variant="ghostDark" onClick={onClose}>Done</Btn>
    </div>
  )
}
function Section({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-baseline gap-2"><span className="text-sm font-semibold">{title}</span>{hint && <span className="text-xs text-n-muted">{hint}</span>}</span>
      {children}
    </div>
  )
}

function OrderSheet({ onClose, activeOrderId, canUpdateOnly, onUpdateOnly, onNewOrder, onPickTable, grandTotal }: {
  onClose: () => void; activeOrderId: string | null; canUpdateOnly: boolean; onUpdateOnly: () => void; onNewOrder: () => void; onPickTable: () => void; grandTotal: number
}) {
  const { orderType, setOrderType, tableName, setTable, guests, setGuests, waiterId, setWaiter, orderNotes, setOrderNotes, orderDiscountPercent, orderDiscountAmount, promoName } = useCartStore()
  const user = useAuthStore((s) => s.user)
  const [waiters, setWaiters] = useState<{ name: string; waiter_name: string }[]>([])
  useEffect(() => { window.api.waiters.list().then((l: any) => setWaiters(l || [])).catch(() => {}) }, [])

  const cd = { percent: orderDiscountPercent, amount: orderDiscountAmount, promoName: promoName || undefined }
  async function print(kind: 'both' | 'kot' | 'waiter' | 'invoice') {
    if (!activeOrderId) return
    try {
      if (kind === 'both') {
        const r = await window.api.print.kots(activeOrderId, user?.name, true)
        const w = await window.api.print.waiterCopy(activeOrderId, cd)
        r?.success && w?.success ? toast.success('KOT and waiter copy printed') : toast.error('Print error, check the printers')
      } else if (kind === 'kot') {
        const r = await window.api.print.kots(activeOrderId, user?.name, true)
        r?.success ? toast.success('KOT reprinted') : toast.error('KOT reprint failed')
      } else if (kind === 'waiter') {
        const r = await window.api.print.waiterCopy(activeOrderId, cd)
        r?.success ? toast.success('Waiter copy printed') : toast.error('Waiter copy failed')
      } else {
        const r = await window.api.print.invoice(activeOrderId, { ...cd, grandTotal })
        r?.success ? toast.success('Invoice printed') : toast.error('Invoice print failed')
      }
    } catch (e: any) { toast.error(`Print failed: ${e?.message || e}`) }
  }

  return (
    <Sheet onClose={onClose} className="w-[420px] max-w-[92vw]" label="Order details">
      <SheetHeader title="Order details" onClose={onClose} />
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <Section title="Order type">
          <div className="grid grid-cols-3 gap-1.5">
            {(['Dine In', 'Takeaway', 'Delivery'] as const).map((t) => (
              <Option key={t} active={orderType === t} onClick={() => { setOrderType(t); if (t !== 'Dine In') setTable(null) }} className="justify-center">{t === 'Dine In' ? 'Dine in' : t}</Option>
            ))}
          </div>
        </Section>
        {orderType === 'Dine In' && (
          <Section title="Table and guests">
            <div className="flex items-center gap-2">
              <Option onClick={onPickTable} className="flex-1">
                <span>{tableName ? `Table ${tableName}` : 'Choose a table'}</span>
                <Chevron dir="right" className="text-n-muted" />
              </Option>
              <Stepper value={guests} onDec={() => setGuests(Math.max(1, guests - 1))} onInc={() => setGuests(guests + 1)} decLabel="One guest less" incLabel="One guest more" />
            </div>
          </Section>
        )}
        {waiters.length > 0 && (
          <Section title="Waiter">
            <div className="grid grid-cols-3 gap-1.5">
              <Option active={!waiterId} onClick={() => setWaiter(null, null)} className="justify-center text-n-muted">None</Option>
              {waiters.map((w) => (
                <Option key={w.name} active={waiterId === w.name} onClick={() => setWaiter(w.name, w.waiter_name)} className="justify-start">
                  <span className="cond flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white" style={{ background: staffColor(w.waiter_name) }}>{initial(w.waiter_name)}</span>
                  <span className="min-w-0 flex-1 truncate">{w.waiter_name}</span>
                </Option>
              ))}
            </div>
          </Section>
        )}
        <Section title="Order note" hint="prints on the KOT">
          <Field data-keyboard="full" value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} placeholder="Allergies, timing, name for takeaway…" />
        </Section>
        {activeOrderId && (
          <Section title="Print">
            <div className="grid grid-cols-2 gap-1.5">
              <Option onClick={() => print('both')}>KOT + waiter copy</Option>
              <Option onClick={() => print('kot')}>Reprint KOT</Option>
              <Option onClick={() => print('waiter')}>Waiter copy</Option>
              <Option onClick={() => print('invoice')}>Invoice</Option>
            </div>
          </Section>
        )}
        <Section title="Order">
          <div className="grid grid-cols-2 gap-1.5">
            {canUpdateOnly && <Option onClick={onUpdateOnly}>Save without KOT</Option>}
            <Option onClick={onNewOrder}>New order</Option>
          </div>
        </Section>
      </div>
    </Sheet>
  )
}

// ------------------------------------------------------------------ discount, promo, voucher
function OffersSheet({ onClose, canDiscount, limit }: { onClose: () => void; canDiscount: boolean; limit: number | null }) {
  const { orderDiscountPercent, orderDiscountAmount, orderDiscountReason, setOrderDiscount, promoName, setPromo, voucherCode, setVoucher, getOrderDiscountValue } = useCartStore()
  const user = useAuthStore((s) => s.user)
  const cur = useStatus((s) => s.currency)
  const [promos, setPromos] = useState<{ name: string; promo_name: string; discount_type: string; discount_value: number }[]>([])
  const [tab, setTab] = useState<'discount' | 'promo' | 'voucher'>(canDiscount ? 'discount' : 'promo')
  const [mode, setMode] = useState<'pct' | 'amt'>(orderDiscountAmount > 0 && !orderDiscountPercent ? 'amt' : 'pct')
  const [entry, setEntry] = useState(() => String((orderDiscountAmount > 0 && !orderDiscountPercent ? orderDiscountAmount : orderDiscountPercent) || ''))
  const [reason, setReason] = useState(promoName || voucherCode ? '' : orderDiscountReason)
  const [error, setError] = useState('')
  const [code, setCode] = useState('')
  const [checking, setChecking] = useState(false)

  useEffect(() => { window.api.promos.list().then((l: any) => setPromos(l || [])).catch(() => {}) }, [])
  const applied = getOrderDiscountValue()

  function applyDiscount() {
    const v = parseFloat(entry || '0') || 0
    const pct = mode === 'pct' ? v : 0
    const amt = mode === 'amt' ? v : 0
    const gross = useCartStore.getState().getSubtotal()
    const err = discountError(pct, amt, gross, limit)
    if (err) { setError(err); return }
    setOrderDiscount(pct, amt, reason)
    onClose()
  }
  async function checkVoucher(c: string) {
    setChecking(true); setError('')
    const res = await window.api.vouchers.validate(c)
    setChecking(false)
    if (res?.valid) { setVoucher(c, res.discount_percent); toast.success(`Voucher applied, ${res.discount_percent}% off`); onClose() }
    else { setError(res?.reason || 'Invalid code'); setCode('') }
  }

  const tabs = [...(canDiscount ? [['discount', 'Discount']] : []), ...(promos.length ? [['promo', 'Promo']] : []), ['voucher', 'Voucher']] as [typeof tab, string][]

  return (
    <Sheet onClose={onClose} className="w-[440px] max-w-[92vw]" label="Discounts">
      <SheetHeader title="Discount" onClose={onClose} />
      {applied > 0 && (
        <div className="flex items-center gap-2 border-b border-n-line bg-white px-4 py-3 text-sm">
          <span className="flex-1"><b>{promoName ? `Promo ${promoName}` : voucherCode ? 'Voucher' : orderDiscountReason || 'Discount'}</b><span className="text-n-muted"> · {orderDiscountPercent > 0 ? `${orderDiscountPercent}%` : `${cur} ${money(orderDiscountAmount)}`}</span></span>
          <span className="num font-semibold text-n-green">−{money(applied)}</span>
          <Btn size="sm" variant="dangerOutline" onClick={() => { if (promoName) setPromo(null); else if (voucherCode) setVoucher(null); else setOrderDiscount(0, 0, '') }}>Remove</Btn>
        </div>
      )}
      <div className="flex gap-1.5 px-4 pt-3">
        {tabs.map(([k, l]) => (
          <button key={k} type="button" onClick={() => { setTab(k); setError('') }} aria-pressed={tab === k}
            className={cn('press h-11 flex-1 rounded-md text-sm font-semibold', tab === k ? 'bg-n-deep text-white' : 'border border-n-edge bg-white')}>{l}</button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        {tab === 'discount' && canDiscount && (
          <>
            <div className="grid grid-cols-2 gap-1.5">
              <Option active={mode === 'pct'} onClick={() => setMode('pct')} className="justify-center">Percent</Option>
              <Option active={mode === 'amt'} onClick={() => setMode('amt')} className="justify-center">Amount</Option>
            </div>
            <div className="cond num flex h-16 items-center justify-between rounded-md bg-white px-3.5 text-[34px] font-bold shadow-[inset_0_0_0_2px_#0E6E86]">
              <span className="font-sans text-[13px] font-medium text-n-muted">{mode === 'pct' ? 'Percent off' : `${cur} off`}</span>
              {entry || '0'}{mode === 'pct' ? '%' : ''}
            </div>
            {limit !== null && <span className="text-xs text-n-muted">{limit > 0 ? `You can give up to ${limit}% (fixed amounts count as a % of the bill).` : 'No discount limit is set for you. Ask a supervisor.'}</span>}
            <Keypad mode="decimal" tone="light" className="h-[232px]" onKey={(k) => { setError(''); setEntry(amountKey(entry, k)) }} />
            <Field data-keyboard="full" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason, e.g. manager discount" />
            {error && <span className="text-sm font-semibold text-n-red">{error}</span>}
            <Btn size="lg" variant="deep" onClick={applyDiscount}>Apply discount</Btn>
          </>
        )}
        {tab === 'promo' && (
          promos.length === 0 ? <span className="text-sm text-n-muted">No promotions are set up.</span> :
          <div className="flex flex-col gap-1.5">
            {promos.map((p) => (
              <Option key={p.name} active={promoName === p.promo_name} onClick={() => { setPromo(p.promo_name, p.discount_type, p.discount_value); onClose() }} className="h-14">
                <span className="font-semibold">{p.promo_name}</span>
                <span className="num font-semibold text-n-green">{p.discount_type === 'Percentage' ? `${p.discount_value}%` : `${cur} ${money(p.discount_value)}`}</span>
              </Option>
            ))}
          </div>
        )}
        {tab === 'voucher' && (
          <>
            <span className="text-sm text-n-muted">Enter the 6-digit voucher code.</span>
            <PinDots count={6} filled={code.length} tone="light" />
            <Keypad tone="light" className="h-[264px]" onKey={(k) => {
              setError('')
              const next = pinKey(code, k, 6)
              setCode(next)
              if (next.length === 6 && !checking) checkVoucher(next)
            }} />
            {checking && <span className="text-sm text-n-muted">Checking…</span>}
            {error && <span className="text-sm font-semibold text-n-red">{error}</span>}
          </>
        )}
      </div>
    </Sheet>
  )
}

// ------------------------------------------------------------------ line dialogs
function NoteDialog({ line, sent, onSave, onCancel }: { line: CartItem; sent: boolean; onSave: (t: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(line.specialInstructions)
  const quick = ['No onions', 'Extra hot', 'Less sugar', 'No ice', 'Allergy: nuts', 'Take away']
  return (
    <Dialog onClose={onCancel} className="w-[480px]" label="Note">
      <div className="flex flex-col gap-3 p-5">
        <span className="flex flex-col">
          <span className="cond text-[26px] font-bold leading-none text-n-deep">{sent ? 'Kitchen note' : 'Note'}</span>
          <span className="text-sm text-n-muted">{line.qty} × {line.itemName}{sent ? ' · already sent, reprint the KOT so the kitchen sees it' : ''}</span>
        </span>
        <textarea data-keyboard="full" autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={3}
          placeholder="e.g. no onions, allergic to nuts"
          className="w-full resize-none rounded-md border border-n-edge bg-white px-3 py-2.5 text-[15px] focus:border-2 focus:border-n-teal focus:outline-none" />
        <div className="flex flex-wrap gap-1.5">
          {quick.map((q) => <button key={q} type="button" onClick={() => setText(text ? `${text}, ${q.toLowerCase()}` : q)} className="press h-10 rounded-full border border-n-edge bg-white px-3 text-[13px]">{q}</button>)}
        </div>
      </div>
      <div className="flex gap-2 bg-white px-4 py-3">
        <Btn size="lg" variant="outline" onClick={onCancel}>Cancel</Btn>
        {line.specialInstructions && <Btn size="lg" variant="outline" onClick={() => onSave('')}>Clear</Btn>}
        <span className="flex-1" />
        <Btn size="lg" variant="deep" onClick={() => onSave(text.trim())}>Save note</Btn>
      </div>
    </Dialog>
  )
}

function LineDiscountDialog({ line, limit, onApply, onCancel }: { line: CartItem; limit: number | null; onApply: (pct: number, amt: number) => void; onCancel: () => void }) {
  const [mode, setMode] = useState<'pct' | 'amt'>(line.discountAmount > 0 && !line.discountPercent ? 'amt' : 'pct')
  const [entry, setEntry] = useState(String((mode === 'amt' ? line.discountAmount : line.discountPercent) || ''))
  const [error, setError] = useState('')
  const cur = useStatus((s) => s.currency)
  const gross = useMemo(() => (line.rate + line.modifiers.reduce((s, m) => s + m.price, 0)) * line.qty, [line])
  function apply() {
    const v = parseFloat(entry || '0') || 0
    const pct = mode === 'pct' ? v : 0
    const amt = mode === 'amt' ? v : 0
    const err = discountError(pct, amt, gross, limit)
    if (err) { setError(err); return }
    onApply(pct, amt)
  }
  return (
    <Dialog onClose={onCancel} className="w-[420px]" label="Item discount">
      <div className="flex flex-col gap-3 p-5">
        <span className="flex flex-col">
          <span className="cond text-[26px] font-bold leading-none text-n-deep">Item discount</span>
          <span className="text-sm text-n-muted">{line.qty} × {line.itemName} · {cur} {money(gross)}</span>
        </span>
        <div className="grid grid-cols-2 gap-1.5">
          <Option active={mode === 'pct'} onClick={() => setMode('pct')} className="justify-center">Percent</Option>
          <Option active={mode === 'amt'} onClick={() => setMode('amt')} className="justify-center">Amount</Option>
        </div>
        <div className="cond num flex h-14 items-center justify-between rounded-md bg-white px-3.5 text-[30px] font-bold shadow-[inset_0_0_0_2px_#0E6E86]">
          <span className="font-sans text-[13px] font-medium text-n-muted">{mode === 'pct' ? 'Percent off' : `${cur} off`}</span>
          {entry || '0'}{mode === 'pct' ? '%' : ''}
        </div>
        <Keypad mode="decimal" tone="light" className="h-[220px]" onKey={(k) => { setError(''); setEntry(amountKey(entry, k)) }} />
        {error && <span className="text-sm font-semibold text-n-red">{error}</span>}
      </div>
      <div className="flex gap-2 bg-white px-4 py-3">
        <Btn size="lg" variant="outline" onClick={onCancel}>Cancel</Btn>
        {(line.discountPercent > 0 || line.discountAmount > 0) && <Btn size="lg" variant="outline" onClick={() => onApply(0, 0)}>No discount</Btn>}
        <span className="flex-1" />
        <Btn size="lg" variant="deep" onClick={apply}>Apply</Btn>
      </div>
    </Dialog>
  )
}

/** Discount rules: no more than 100% / the gross; cashiers capped at their limit, fixed amounts as a % of the gross. */
function discountError(pct: number, amt: number, gross: number, limit: number | null): string | null {
  if (pct < 0 || amt < 0) return 'Discount can’t be negative'
  if (pct > 100) return 'Can’t be more than 100%'
  if (amt > gross + 0.0001) return `Can’t be more than ${money(gross)}`
  if (limit === null) return null
  const asPct = pct + (gross > 0 ? (amt / gross) * 100 : 0)
  if (limit <= 0 && asPct > 0) return 'No discount limit is set for you. Ask a supervisor.'
  if (asPct > limit + 0.0001) return amt > 0 ? `That is ${asPct.toFixed(1)}% of the bill; your limit is ${limit}%` : `Max discount: ${limit}%`
  return null
}
