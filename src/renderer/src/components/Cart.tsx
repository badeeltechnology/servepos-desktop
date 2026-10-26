import { useState, useEffect, useMemo, ReactNode } from 'react'
import { useCartStore, CartItem } from '../stores/cart'
import { useAuthStore } from '../stores/auth'
import { useStatus } from '../stores/status'
import { itemColor } from '../stores/menu'
import { toast } from '../stores/ui'
import TablePicker from './TablePicker'
import { GuestsPick, WaiterPick } from './FloorDialogs'
import { useFloor } from '../stores/floor'
import VoidDialog, { VoidResult } from './VoidDialog'
import { roundMoney } from '../ui/currency'
import { Btn, Dialog, Sheet, Option, Stepper, Cap, Field, Keypad, PinDots, Chevron, money, amountKey, pinKey, staffColor, initial } from '../ui'
import { timeOf, minutesSince, ageLabel, useTick } from '../ui/hosts'
import { cn } from '../lib/utils'
import { useT, useLang } from '../stores/i18n'
import { useMenu } from '../stores/menu'
import { groupRounds, STAGE, Stage } from './orderStatus'

// The ticket: who/where at the top, what went to the kitchen (Sent) apart from what hasn't (New),
// a tray of actions on the tapped line, and Send / Hold / Pay at the bottom.

type RemovedItem = { dbId?: string; itemName: string; qty: number; rate: number; amount: number }

interface CartProps {
  /** Send; `stay` keeps the till on this ticket instead of going back to the floor */
  onPlaceOrder: (opts?: { stay?: boolean }) => void
  /** Dine-in at a table on a till with a floor: offer "Send & floor" (default) and "Send" (stay) */
  floorAfterSend?: boolean
  onPrintBill?: () => void
  /** Stage of the saved order, for the header ("In kitchen", "Bill printed"…) */
  stage?: Stage | null
  /** Config quick_sale_kot = 0: a takeaway / delivery paid at once prints no KOT */
  quickSaleNoKot?: boolean
  onUpdateOnly?: () => void
  onPay: () => void
  onHold: () => void
  onNewOrder: () => void
  /** Open an existing order (occupied table in the picker) */
  onOpenOrder?: (orderId: string) => void
  /** Saved order changes table: persist the move (order row + both tables) */
  onMoveTable?: (tableName: string, room: string | null) => Promise<void>
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

export default function Cart({ onPlaceOrder, floorAfterSend, onPrintBill, stage, quickSaleNoKot, onUpdateOnly, onPay, onHold, onNewOrder, onMoveTable, taxRate, taxLabel = 'VAT', isOrderPlaced = false, activeOrderId, orderNumber, orderCreatedAt, sentAt, processing, onAutoVoid, onItemRemoved, onPartialVoid }: CartProps) {
  useTick(30000)
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
  const [showGuests, setShowGuests] = useState(false)
  const [showWaiters, setShowWaiters] = useState(false)
  const uiAr = useLang((s) => s.lang) === 'ar'
  const byCode = useMenu((s) => s.byCode)
  // Send / Hold / Pay waiting for a table (dine-in ticket without one)
  const [pending, setPending] = useState<null | 'send' | 'hold' | 'pay'>(null)
  const floorRooms = useFloor((s) => s.rooms)
  const floorHasTables = useFloor((s) => s.tables.length > 0)
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
  const rounds = groupRounds(items, (l) => ({ sent: !!l.kotPrinted, sentAt: l.sentAt || (l.kotPrinted ? orderCreatedAt : null) }))
  void sentLines; void sentSum; void sentAt; void sentOpen
  const ctxBtn = 'press flex h-11 min-w-0 flex-col items-start justify-center rounded-md border border-n-edge bg-white px-2 text-start leading-tight'
  const ctxCap = 'text-[10px] font-bold uppercase tracking-[.08em] text-n-muted'
  const ctxVal = 'w-full truncate text-[13.5px] font-semibold text-n-ink'

  // Deselect when the line disappears
  useEffect(() => { if (selected && !items.find((i) => i.id === selected)) setSelected(null) }, [items, selected])

  const shortNo = orderNumber ? orderNumber.split('-').pop() : null
  const label = tableName || (shortNo ? `${orderType === 'Takeaway' ? 'TA' : orderType === 'Delivery' ? 'D' : '#'} ${shortNo}` : t('New'))
  const isDine = orderType === 'Dine In'
  const roomName = room ? floorRooms.find((r) => r.name === room)?.room_name || room : null
  const needsTable = isDine && !tableName && floorHasTables
  const since = orderCreatedAt ? t('since {time}', { time: timeOf(orderCreatedAt) }) : null
  const notes = cart.orderNotes?.trim() || ''

  /** Dine-in without a table: choose the table first, then carry on with what was tapped. */
  function guarded(kind: 'send' | 'hold' | 'pay', fn: () => void) {
    if (needsTable) { setPending(kind); setShowTablePicker(true); return }
    fn()
  }
  function runPending(kind: 'send' | 'hold' | 'pay' | null) {
    if (!kind) return
    // after the store update has rendered, so the action reads the new table / type
    setTimeout(() => (kind === 'send' ? onPlaceOrder() : kind === 'hold' ? onHold() : onPay()), 0)
  }
  async function pickTable(name: string, rm: string | null) {
    const kind = pending
    setShowTablePicker(false)
    setPending(null)
    if (activeOrderId && onMoveTable && name !== tableName) await onMoveTable(name, rm)
    else cart.setTable(name, rm)
    if (orderType !== 'Dine In') setOrderType('Dine In')
    runPending(kind)
  }
  const subBtn = 'press -my-1 min-w-0 truncate rounded px-1 py-1 text-start text-[13px] hover:bg-n-cream'

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
    const mods = l.modifiers.map((m) => m.name).join(' · ')
    const disc = l.discountPercent > 0 ? `−${l.discountPercent}%` : l.discountAmount > 0 ? `−${money(l.discountAmount)}` : ''
    const name = (uiAr && byCode[l.itemCode]?.item_name_ar) || l.itemName
    return (
      <div key={l.id} className={cn(sel && 'bg-n-ice shadow-[inset_3px_0_0_#0E6E86]')}>
        <button type="button" onClick={() => setSelected(sel ? null : l.id)} aria-expanded={sel}
          className="flex min-h-[40px] w-full items-start gap-2.5 px-3 py-1.5 text-start text-n-ink">
          <span className="cond num mt-px inline-flex h-[22px] min-w-[22px] flex-shrink-0 items-center justify-center rounded px-[5px] text-[15px] font-bold text-white" style={{ background: itemColor(l.itemCode, l.itemName) }}>{l.qty}</span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className={cn('text-sm leading-snug', !sel && 'line-clamp-2')}>
              {name}
              {disc && <span className="font-semibold text-n-green"> {disc}</span>}
              {l.dbId && !l.kotPrinted && <span className="text-xs font-semibold text-n-muted"> · {t('saved')}</span>}
            </span>
            {mods && <span className="text-[12.5px] leading-snug text-n-muted">{mods}</span>}
            {l.specialInstructions && <span className="text-[12.5px] font-medium leading-snug text-n-teal">“{l.specialInstructions}”</span>}
          </span>
          <span className="num text-sm font-medium" dir="ltr">{money(l.amount)}</span>
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

  const typeChip = (
    <span className="relative flex-shrink-0">
      <button type="button" onClick={() => setTypeMenu(!typeMenu)} aria-haspopup="menu"
        className="relative flex h-[30px] items-center gap-[5px] rounded-[5px] border-[1.5px] border-n-teal px-2 text-xs font-semibold text-n-teal after:absolute after:-inset-[7px] after:content-['']">
        {t(orderType === 'Dine In' ? 'Dine in' : orderType)}<Chevron size={10} strokeWidth={3.5} />
      </button>
      {typeMenu && (
        <span role="menu" className="absolute end-0 top-full z-30 mt-1 flex w-40 flex-col overflow-hidden rounded-md bg-white shadow-pop">
          {(['Dine In', 'Takeaway', 'Delivery'] as const).map((tp) => (
            <button key={tp} role="menuitem" type="button" onClick={() => { setOrderType(tp); if (tp !== 'Dine In') cart.setTable(null); setTypeMenu(false) }}
              className={cn('h-12 px-3 text-start text-sm', orderType === tp ? 'bg-n-ice font-semibold text-n-deep' : 'text-n-ink')}>
              {t(tp === 'Dine In' ? 'Dine in' : tp)}
            </button>
          ))}
        </span>
      )}
    </span>
  )

  return (
    <aside aria-label="Current order" className="relative flex h-full flex-col bg-white shadow-[-1px_0_0_#D8D1C3]">
      {/* Who and where: the order's identity, big; table, guests, waiter and type are 44px buttons */}
      <div className="flex flex-shrink-0 flex-col gap-1.5 border-b border-n-line px-3 pb-2 pt-2" onClick={() => typeMenu && setTypeMenu(false)}>
        <div className="flex items-center gap-2.5">
          {needsTable ? (
            <button type="button" onClick={() => setShowTablePicker(true)}
              className="press flex h-12 items-center gap-2 rounded-md bg-n-amber px-4 text-base font-bold text-n-ink">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M6 12v8M18 12v8" /></svg>
              {t('Choose table')}
            </button>
          ) : (
            <button type="button" onClick={() => (isDine && floorHasTables ? setShowTablePicker(true) : setSheet('order'))}
              aria-label={isDine && tableName ? t('Table {name}, change table', { name: tableName }) : undefined}
              className="cond flex min-w-0 items-baseline gap-2 text-start leading-[.9] text-n-deep">
              {isDine ? <span className="truncate text-[42px] font-bold">{tableName || (shortNo ? `#${shortNo}` : t('New'))}</span> : (
                <>
                  <span className="text-[34px] font-bold">{t(orderType)}</span>
                  {orderType === 'Delivery' && notes
                    ? <span className="truncate text-[24px] font-semibold text-n-teal">· {notes}</span>
                    : shortNo && <span className="num text-[34px] font-bold text-n-teal">#{shortNo}</span>}
                </>
              )}
            </button>
          )}
          <span className="flex min-w-0 flex-1 flex-col text-[12.5px] leading-tight text-n-muted">
            <span className="truncate">{isDine && roomName ? roomName : t(isDine ? 'Dine in' : orderType)}{orderCreatedAt ? ` · ${t('seated {time}', { time: timeOf(orderCreatedAt) })} (${ageLabel(minutesSince(orderCreatedAt))})` : ''}</span>
            {stage ? (
              <span className="flex items-center gap-1 truncate font-semibold" style={{ color: stage === 'kitchen' ? '#8A5A00' : STAGE[stage].color }}>
                <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: STAGE[stage].color }} />{t(STAGE[stage].label)}{stage !== 'draft' && newLines.length > 0 ? ` · ${t('round {n} being taken', { n: rounds.filter((r) => r.sent).length + 1 })}` : ''}
              </span>
            ) : items.length > 0 ? <span className="font-semibold text-n-teal">{t('Not sent')}</span> : null}
          </span>
          <button type="button" aria-label="More actions" onClick={() => { setTypeMenu(false); setSheet('order') }}
            className="press flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md border border-n-line bg-white">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#1B1F24" aria-hidden="true"><circle cx="5" cy="12" r="2.2" /><circle cx="12" cy="12" r="2.2" /><circle cx="19" cy="12" r="2.2" /></svg>
          </button>
        </div>
        <div className="grid grid-cols-[1.25fr_.8fr_1fr_1fr] gap-1.5">
          {isDine && (
            <button type="button" className={ctxBtn} onClick={() => { setTypeMenu(false); setShowTablePicker(true) }}>
              <span className={ctxCap}>{t('Table')}</span><span className={ctxVal}>{tableName || t('Choose')}</span>
            </button>
          )}
          {!isDine && (
            <button type="button" className={ctxBtn} onClick={() => { setTypeMenu(false); setSheet('order') }}>
              <span className={ctxCap}>{t(orderType === 'Delivery' ? 'Reference' : 'Name')}</span><span className={ctxVal}>{notes || t('Add')}</span>
            </button>
          )}
          <button type="button" className={ctxBtn} onClick={() => { setTypeMenu(false); setShowGuests(true) }}>
            <span className={ctxCap}>{t('Guests')}</span><span className={ctxVal}>{guests}</span>
          </button>
          <button type="button" className={ctxBtn} onClick={() => { setTypeMenu(false); setShowWaiters(true) }}>
            <span className={ctxCap}>{t('Waiter')}</span><span className={ctxVal}>{waiterName || t('None')}</span>
          </button>
          <span className="relative min-w-0">
            <button type="button" className={cn(ctxBtn, 'w-full')} onClick={(e) => { e.stopPropagation(); setTypeMenu(!typeMenu) }} aria-haspopup="menu">
              <span className={ctxCap}>{t('Type')}</span><span className={ctxVal}>{t(isDine ? 'Dine in' : orderType)}</span>
            </button>
            {typeMenu && (
              <span role="menu" className="absolute end-0 top-full z-30 mt-1 flex w-40 flex-col overflow-hidden rounded-md bg-white shadow-pop">
                {(['Dine In', 'Takeaway', 'Delivery'] as const).map((tp) => (
                  <button key={tp} role="menuitem" type="button" onClick={(e) => { e.stopPropagation(); setOrderType(tp); if (tp !== 'Dine In') cart.setTable(null); setTypeMenu(false) }}
                    className={cn('h-12 px-3 text-start text-sm', orderType === tp ? 'bg-n-ice font-semibold text-n-deep' : 'text-n-ink')}>
                    {t(tp === 'Dine In' ? 'Dine in' : tp)}
                  </button>
                ))}
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Lines, one block per kitchen round */}
      <div className="scroll-none min-h-0 flex-1 overflow-y-auto pb-0.5 pt-1" onClick={() => typeMenu && setTypeMenu(false)}>
        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
            <span className="cond text-2xl font-bold text-n-ink">{t('Nothing on the ticket')}</span>
            <span className="text-sm text-n-muted">{t('Tap the menu to add items, or open an order from the rail.')}</span>
          </div>
        ) : rounds.map((r) => {
          const s2 = sum(r.lines)
          const only = rounds.length === 1
          return (
            <div key={r.key}>
              <div className="flex h-[28px] items-center gap-2 px-3">
                <Cap className={r.sent ? 'text-n-muted' : 'text-n-teal'}>
                  {r.sent
                    ? (only && !r.sentAt ? t('Sent') : r.sentAt ? t('Round {n} · sent {time}', { n: r.n, time: timeOf(r.sentAt) }) : t('Round {n} · sent', { n: r.n }))
                    : (r.n === 1 ? t('New') : t('Round {n} · not sent yet', { n: r.n }))}
                </Cap>
                <span className={cn('h-px flex-1', r.sent ? 'bg-n-line' : 'bg-[#CFE0E5]')} />
                <span className={cn('num text-xs', r.sent ? 'text-n-muted' : 'text-n-teal')}>{s2.qty} {t(s2.qty === 1 ? 'item' : 'items')} · {money(s2.amt)}</span>
              </div>
              {r.lines.map(lineRow)}
            </div>
          )
        })}
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

      {/* Send / Hold, then Print bill / Pay */}
      <div className="flex flex-shrink-0 flex-col gap-1.5 bg-white px-2.5 pb-2.5 pt-1.5">
        <div className="flex gap-1.5">
          {floorAfterSend ? (
            <>
              <button type="button" onClick={() => guarded('send', () => onPlaceOrder())} disabled={processing || newLines.length === 0}
                className={cn('press flex h-[54px] flex-[1.4] flex-col items-center justify-center whitespace-nowrap rounded-lg leading-tight', newLines.length ? 'bg-n-teal text-white' : 'border-[1.5px] border-n-edge bg-white text-n-muted')}>
                <span className="text-base font-bold">{processing ? t('Sending…') : t('Send & floor')}</span>
                {newLines.length > 0 && !processing && <span className="text-[11.5px] opacity-85">{t('{n} to kitchen', { n: newSum.qty })}</span>}
              </button>
              <button type="button" onClick={() => guarded('send', () => onPlaceOrder({ stay: true }))} disabled={processing || newLines.length === 0}
                className="press flex h-[54px] flex-1 flex-col items-center justify-center whitespace-nowrap rounded-lg border-[1.5px] border-n-teal bg-white leading-tight text-n-teal disabled:border-n-edge disabled:text-n-stone">
                <span className="text-base font-bold">{t('Send')}</span><span className="text-[11.5px]">{t('stay here')}</span>
              </button>
            </>
          ) : (
            <button type="button" onClick={() => guarded('send', () => onPlaceOrder())} disabled={processing || newLines.length === 0}
              className={cn('press h-[54px] flex-1 whitespace-nowrap rounded-lg text-base font-bold', newLines.length ? 'bg-n-teal text-white' : 'border-[1.5px] border-n-edge bg-white text-n-muted')}>
              {processing ? t('Sending…') : newLines.length ? t('Send {n}', { n: newSum.qty }) : items.length ? t('Sent') : t('Send')}
            </button>
          )}
          <button type="button" onClick={() => guarded('hold', onHold)} disabled={processing || items.length === 0}
            className="press h-[54px] w-[76px] flex-shrink-0 rounded-lg border-[1.5px] border-n-edge bg-white text-[15px] font-semibold text-n-ink disabled:text-n-stone">
            {t('Hold')}
          </button>
        </div>
        <div className="flex gap-1.5">
          <button type="button" onClick={onPrintBill} disabled={processing || !activeOrderId || !onPrintBill}
            className="press h-[54px] flex-[.8] whitespace-nowrap rounded-lg border-[1.5px] border-n-edge bg-white text-[15px] font-semibold text-n-ink disabled:text-n-stone">
            {stage === 'invoiced' ? t('Reprint bill') : t('Print bill')}
          </button>
          <button type="button" onClick={() => guarded('pay', onPay)} disabled={processing || items.length === 0}
            className="press flex h-[54px] min-w-0 flex-[1.4] items-center justify-between gap-2 whitespace-nowrap rounded-lg bg-n-amber px-3 leading-none text-n-ink disabled:bg-n-sand disabled:text-n-stone">
            <span className="text-base font-bold">{newLines.length && !(quickSaleNoKot && !activeOrderId && orderType !== 'Dine In') ? t('Send & pay') : t('Pay')}</span>
            <span className="cond num truncate text-[22px] font-bold" dir="ltr">{money(grandTotal)}</span>
          </button>
        </div>
      </div>

      {/* Sheets and dialogs */}
      {sheet === 'order' && (
        <OrderSheet onClose={() => setSheet(null)} activeOrderId={activeOrderId || null} canUpdateOnly={!!onUpdateOnly && newLines.length > 0}
          onUpdateOnly={() => { setSheet(null); onUpdateOnly?.() }} onNewOrder={() => { setSheet(null); onNewOrder() }}
          onPickTable={() => setShowTablePicker(true)} grandTotal={grandTotal} />
      )}
      {sheet === 'offers' && <OffersSheet onClose={() => setSheet(null)} canDiscount={canDiscount} limit={cashierLimit} />}

      {showTablePicker && (
        <TablePicker onSelect={pickTable} currentTable={tableName}
          title={activeOrderId && tableName ? t('Move {table} to…', { table: tableName }) : undefined}
          hint={pending === 'send' ? t('Pick the table, then the order goes to the kitchen') : pending === 'hold' ? t('Pick the table to hold this order on') : pending === 'pay' ? t('Pick the table, or make it Takeaway for a quick sale') : null}
          onTakeaway={pending && !activeOrderId ? () => { const k = pending; setShowTablePicker(false); setPending(null); setOrderType('Takeaway'); runPending(k) } : undefined}
          onCancel={() => { setShowTablePicker(false); setPending(null) }} />
      )}
      {showWaiters && (
        <WaiterPick current={cart.waiterId} onCancel={() => setShowWaiters(false)}
          onPick={(id, name) => {
            setShowWaiters(false)
            cart.setWaiter(id, name)
            if (activeOrderId) window.api.orders.update(activeOrderId, { waiterId: id, waiterName: name }).catch(() => {})
          }} />
      )}
      {showGuests && (
        <GuestsPick table={tableName || t(orderType === 'Dine In' ? 'Dine in' : orderType)} initial={guests} onCancel={() => setShowGuests(false)}
          onPick={(n) => {
            setShowGuests(false)
            if (n == null) return
            cart.setGuests(n)
            if (activeOrderId) window.api.orders.update(activeOrderId, { guests: n }).catch(() => {})
          }} />
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
  const t = useT()
  return (
    <div className="flex h-14 flex-shrink-0 items-center gap-3 bg-n-deep px-4 text-white">
      <span className="cond flex-1 text-2xl font-bold">{title}</span>
      <Btn variant="ghostDark" onClick={onClose}>{t('Done')}</Btn>
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
  const t = useT()
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

  // On an open order, guests / waiter / note are saved straight away (review F02)
  const save = (patch: Record<string, any>) => { if (activeOrderId) window.api.orders.update(activeOrderId, patch).catch(() => {}) }
  const guestsTo = (n: number) => { setGuests(n); save({ guests: n }) }
  const waiterTo = (id: string | null, name: string | null) => { setWaiter(id, name); save({ waiterId: id, waiterName: name }) }
  const close = () => { save({ orderNotes: useCartStore.getState().orderNotes || null }); onClose() }

  return (
    <Sheet onClose={close} className="w-[420px] max-w-[92vw]" label="Order details">
      <SheetHeader title={t('Order details')} onClose={close} />
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <Section title={t('Order type')}>
          <div className="grid grid-cols-3 gap-1.5">
            {(['Dine In', 'Takeaway', 'Delivery'] as const).map((tp) => (
              <Option key={tp} active={orderType === tp} onClick={() => { setOrderType(tp); if (tp !== 'Dine In') setTable(null) }} className="justify-center">{t(tp === 'Dine In' ? 'Dine in' : tp)}</Option>
            ))}
          </div>
        </Section>
        {orderType === 'Dine In' && (
          <Section title={t('Table and guests')}>
            <div className="flex items-center gap-2">
              <Option onClick={onPickTable} className="flex-1">
                <span>{tableName ? t('Table {name}', { name: tableName }) : t('Choose a table')}</span>
                <Chevron dir="right" className="text-n-muted" />
              </Option>
              <Stepper value={guests} onDec={() => guestsTo(Math.max(1, guests - 1))} onInc={() => guestsTo(guests + 1)} decLabel="One guest less" incLabel="One guest more" />
            </div>
          </Section>
        )}
        {waiters.length > 0 && (
          <Section title={t('Waiter')}>
            <div className="grid grid-cols-3 gap-1.5">
              <Option active={!waiterId} onClick={() => waiterTo(null, null)} className="justify-center text-n-muted">{t('None')}</Option>
              {waiters.map((w) => (
                <Option key={w.name} active={waiterId === w.name} onClick={() => waiterTo(w.name, w.waiter_name)} className="justify-start">
                  <span className="cond flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white" style={{ background: staffColor(w.waiter_name) }}>{initial(w.waiter_name)}</span>
                  <span className="min-w-0 flex-1 truncate">{w.waiter_name}</span>
                </Option>
              ))}
            </div>
          </Section>
        )}
        <Section title={t('Order note')} hint={t('prints on the KOT')}>
          <Field data-keyboard="full" value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} placeholder={t('Allergies, timing, name for takeaway…')} />
        </Section>
        {activeOrderId && (
          <Section title={t('Print')}>
            <div className="grid grid-cols-2 gap-1.5">
              <Option onClick={() => print('both')}>{t('KOT + waiter copy')}</Option>
              <Option onClick={() => print('kot')}>{t('Reprint KOT')}</Option>
              <Option onClick={() => print('waiter')}>{t('Waiter copy')}</Option>
              <Option onClick={() => print('invoice')}>{t('Print bill')}</Option>
            </div>
          </Section>
        )}
        <Section title={t('Order')}>
          <div className="grid grid-cols-2 gap-1.5">
            {canUpdateOnly && <Option onClick={onUpdateOnly}>{t('Save without KOT')}</Option>}
            <Option onClick={onNewOrder}>{t('New order')}</Option>
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
