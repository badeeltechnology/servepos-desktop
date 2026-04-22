import { useState, useEffect } from 'react'
import { Minus, Plus, Trash2, MessageSquare, Percent, MapPin, Users, ChevronDown, UserCheck, Tag, X, Printer } from 'lucide-react'
import { useCartStore, CartItem } from '../stores/cart'
import { useAuthStore } from '../stores/auth'
import TablePicker from './TablePicker'

interface CartProps {
  onPlaceOrder: () => void
  onUpdateOnly?: () => void
  onPay: () => void
  taxRate: number
  taxLabel?: string
  isOrderPlaced?: boolean
  activeOrderId?: string | null
  onAutoVoid?: () => void
}

export default function Cart({ onPlaceOrder, onUpdateOnly, onPay, taxRate, taxLabel = 'VAT', isOrderPlaced = false, activeOrderId, onAutoVoid }: CartProps) {
  const [discountEnabled, setDiscountEnabled] = useState(false)
  const [discountPermission, setDiscountPermission] = useState<'supervisor_only' | 'all_users'>('supervisor_only')

  useEffect(() => { loadDiscountConfig() }, [])

  async function loadDiscountConfig() {
    const config = await window.api.receiptConfig.getAll()
    setDiscountEnabled(config.discount_enabled === '1')
    setDiscountPermission((config.discount_permission as 'supervisor_only' | 'all_users') || 'supervisor_only')
  }

  const {
    items, orderType, setOrderType, tableName, setTable, guests, setGuests,
    waiterId, waiterName, setWaiter,
    updateItemQty, removeItem, updateItemInstructions, updateItemDiscount,
    orderDiscountPercent, orderDiscountAmount, orderDiscountReason,
    setOrderDiscount, promoName, setPromo, voucherCode, setVoucher,
    orderNotes, setOrderNotes,
    getSubtotal, getOrderDiscountValue, getTaxTotal, getGrandTotal
  } = useCartStore()

  const user = useAuthStore((s) => s.user)
  const canDiscount = discountEnabled && (user?.role === 'supervisor' || (discountPermission === 'all_users' && user?.role === 'cashier'))

  const [editingInstructions, setEditingInstructions] = useState<string | null>(null)
  const [tempInstructions, setTempInstructions] = useState('')
  const [showOrderDiscount, setShowOrderDiscount] = useState(false)
  const [discPct, setDiscPct] = useState(0)
  const [discAmt, setDiscAmt] = useState(0)
  const [discReason, setDiscReason] = useState('')
  const [showItemDiscount, setShowItemDiscount] = useState<string | null>(null)
  const [itemDiscPct, setItemDiscPct] = useState(0)
  const [itemDiscAmt, setItemDiscAmt] = useState(0)
  const [discountError, setDiscountError] = useState('')
  const [showTablePicker, setShowTablePicker] = useState(false)
  const [showPrintMenu, setShowPrintMenu] = useState(false)
  const [removeRequest, setRemoveRequest] = useState<{ cartId: string; dbId?: string } | null>(null)
  const [removePin, setRemovePin] = useState('')
  const [removeError, setRemoveError] = useState('')
  const [waitersList, setWaitersList] = useState<{ name: string; waiter_name: string }[]>([])
  const [showWaiterPicker, setShowWaiterPicker] = useState(false)
  const [promosList, setPromosList] = useState<{ name: string; promo_name: string; discount_type: string; discount_value: number }[]>([])
  const [showPromoPicker, setShowPromoPicker] = useState(false)
  const [showVoucherInput, setShowVoucherInput] = useState(false)
  const [voucherInput, setVoucherInput] = useState('')
  const [voucherError, setVoucherError] = useState('')
  const [voucherLoading, setVoucherLoading] = useState(false)

  useEffect(() => { loadWaiters(); loadPromos() }, [])

  async function loadWaiters() {
    try {
      const list = await window.api.waiters.list()
      setWaitersList(list || [])
    } catch { /* waiters table may not exist yet */ }
  }

  async function loadPromos() {
    try {
      const list = await window.api.promos.list()
      setPromosList(list || [])
    } catch { /* promos table may not exist yet */ }
  }

  const subtotal = getSubtotal()
  const orderDiscVal = getOrderDiscountValue()
  const tax = getTaxTotal(taxRate)
  const grandTotal = getGrandTotal(taxRate)

  function openInstructions(item: CartItem) { setEditingInstructions(item.id); setTempInstructions(item.specialInstructions) }
  function saveInstructions() { if (editingInstructions) updateItemInstructions(editingInstructions, tempInstructions); setEditingInstructions(null) }
  function openItemDiscount(item: CartItem) { setShowItemDiscount(item.id); setItemDiscPct(item.discountPercent); setItemDiscAmt(item.discountAmount); setDiscountError('') }

  function saveItemDiscount() {
    if (showItemDiscount) {
      const maxPct = user?.max_discount_pct ?? 0
      if (user?.role === 'cashier' && maxPct > 0 && itemDiscPct > maxPct) { setDiscountError(`Max discount: ${maxPct}%`); return }
      updateItemDiscount(showItemDiscount, itemDiscPct, itemDiscAmt)
    }
    setShowItemDiscount(null); setDiscountError('')
  }

  function openOrderDiscount() { setDiscPct(orderDiscountPercent); setDiscAmt(orderDiscountAmount); setDiscReason(orderDiscountReason); setDiscountError(''); setShowOrderDiscount(true) }

  function saveOrderDiscount() {
    const maxPct = user?.max_discount_pct ?? 0
    if (user?.role === 'cashier' && maxPct > 0 && discPct > maxPct) { setDiscountError(`Max discount: ${maxPct}%`); return }
    setOrderDiscount(discPct, discAmt, discReason); setShowOrderDiscount(false); setDiscountError('')
  }

  function handleTableSelect(name: string, room: string | null) {
    setTable(name, room)
    setShowTablePicker(false)
  }

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Order type selector — compact layout */}
      <div className="border-b px-3 py-2">
        <div className="flex rounded-lg bg-gray-100 p-0.5">
          {(['Dine In', 'Takeaway', 'Delivery'] as const).map((type) => (
            <button
              key={type}
              onClick={() => { setOrderType(type); if (type !== 'Dine In') setTable(null) }}
              className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
                orderType === type
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        {/* Table & Guests + Waiter — single row for Dine In */}
        {orderType === 'Dine In' && (
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => setShowTablePicker(true)}
              className={`flex flex-1 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all ${
                tableName
                  ? 'border-primary/20 bg-primary/5 text-primary'
                  : 'border-dashed border-gray-300 text-gray-400 hover:border-gray-400'
              }`}
            >
              <MapPin className="h-3.5 w-3.5" />
              {tableName || 'Table'}
              <ChevronDown className="ml-auto h-3 w-3 opacity-50" />
            </button>
            <div className="flex items-center gap-1 rounded-lg border border-gray-200 px-1.5 py-1">
              <Users className="h-3 w-3 text-gray-400" />
              <button onClick={() => setGuests(Math.max(1, guests - 1))} className="flex h-6 w-6 items-center justify-center rounded text-gray-500 hover:bg-gray-100">-</button>
              <span className="min-w-[20px] text-center text-xs font-bold">{guests}</span>
              <button onClick={() => setGuests(guests + 1)} className="flex h-6 w-6 items-center justify-center rounded text-gray-500 hover:bg-gray-100">+</button>
            </div>
          </div>
        )}

        {/* Waiter + Order notes — compact row */}
        <div className="mt-2 flex items-center gap-2">
          {waitersList.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowWaiterPicker(!showWaiterPicker)}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all ${
                  waiterName
                    ? 'border-green-200 bg-green-50 text-green-700'
                    : 'border-dashed border-gray-300 text-gray-400 hover:border-gray-400'
                }`}
              >
                <UserCheck className="h-3.5 w-3.5" />
                {waiterName || 'Waiter'}
                {waiterName && (
                  <span
                    onClick={(e) => { e.stopPropagation(); setWaiter(null, null) }}
                    className="ml-1 rounded-full p-0.5 text-green-400 hover:bg-green-100 hover:text-green-600"
                  >
                    <X className="h-2.5 w-2.5" />
                  </span>
                )}
                {!waiterName && <ChevronDown className="ml-1 h-3 w-3 opacity-50" />}
              </button>
              {showWaiterPicker && (
                <div className="absolute left-0 top-full z-30 mt-1 max-h-48 min-w-[180px] overflow-y-auto rounded-xl border bg-white shadow-lg">
                  {waitersList.map((w) => (
                    <button
                      key={w.name}
                      onClick={() => { setWaiter(w.name, w.waiter_name); setShowWaiterPicker(false) }}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-gray-50 ${
                        waiterId === w.name ? 'bg-green-50 font-semibold text-green-700' : 'text-gray-700'
                      }`}
                    >
                      <UserCheck className="h-3 w-3" />
                      {w.waiter_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <input
            type="text"
            value={orderNotes}
            onChange={(e) => setOrderNotes(e.target.value)}
            placeholder="Order notes..."
            className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      {/* Cart items */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <div className="mb-3 rounded-full bg-gray-100 p-4">
              <svg className="h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-400">No items in cart</p>
            <p className="mt-1 text-xs text-gray-300">Tap menu items to add them</p>
          </div>
        ) : (
          <div className="divide-y">
            {items.map((item) => (
              <div key={item.id} className="px-4 py-3 hover:bg-gray-50/50">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-gray-800">{item.itemName}</h4>
                    {item.modifiers.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {item.modifiers.map((m, i) => (
                          <p key={i} className="text-xs text-gray-500">
                            + {m.name}
                            {m.price > 0 && <span className="ml-1 font-medium text-emerald-600">+{m.price.toFixed(2)}</span>}
                          </p>
                        ))}
                      </div>
                    )}
                    {item.specialInstructions && (
                      <p className="mt-1 rounded bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
                        {item.specialInstructions}
                      </p>
                    )}
                    {(item.discountPercent > 0 || item.discountAmount > 0) && (
                      <p className="mt-0.5 text-xs font-medium text-emerald-600">
                        Discount: {item.discountPercent > 0 ? `${item.discountPercent}%` : ''} {item.discountAmount > 0 ? `-${item.discountAmount.toFixed(2)}` : ''}
                      </p>
                    )}
                  </div>
                  <span className="whitespace-nowrap text-sm font-bold text-gray-800">{item.amount.toFixed(2)}</span>
                </div>
                {/* Controls */}
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="flex items-center rounded-lg border border-gray-200">
                      <button onClick={() => updateItemQty(item.id, item.qty - 1)}
                        className="flex h-8 w-8 items-center justify-center rounded-l-lg text-gray-500 hover:bg-gray-100">
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-10 text-center text-sm font-bold">{item.qty}</span>
                      <button onClick={() => updateItemQty(item.id, item.qty + 1)}
                        className="flex h-8 w-8 items-center justify-center rounded-r-lg text-gray-500 hover:bg-gray-100">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <span className="ml-3 text-xs text-gray-400">@ {item.rate.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => openInstructions(item)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600" title="Notes">
                      <MessageSquare className="h-3.5 w-3.5" />
                    </button>
                    {canDiscount && (
                      <button onClick={() => openItemDiscount(item)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600" title="Discount">
                        <Percent className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button onClick={() => {
                      // For placed orders, require supervisor PIN to remove
                      if (isOrderPlaced && user?.role !== 'supervisor') {
                        setRemoveRequest({ cartId: item.id, dbId: (item as any).dbId })
                        setRemovePin(''); setRemoveError('')
                      } else {
                        // Supervisor or unplaced order — remove directly
                        if (isOrderPlaced && (item as any).dbId) {
                          window.api.orderItems.remove((item as any).dbId).catch(() => {})
                        }
                        removeItem(item.id)
                        // Auto-void if last item removed from a placed order
                        if (isOrderPlaced && items.length === 1 && onAutoVoid) {
                          onAutoVoid()
                        }
                      }
                    }} className="rounded-lg p-1.5 text-red-300 hover:bg-red-50 hover:text-red-500" title="Remove">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Totals & Pay */}
      {items.length > 0 && (
        <div className="border-t bg-gray-50 px-4 py-3">
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-500">
              <span>Subtotal ({items.length} items)</span>
              <span className="font-medium text-gray-700">{subtotal.toFixed(2)}</span>
            </div>
            {orderDiscVal > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Discount{promoName ? ` (${promoName}${orderDiscountPercent > 0 ? ` ${orderDiscountPercent}%` : ''})` : ''}</span>
                <span className="font-medium">-{orderDiscVal.toFixed(2)}</span>
              </div>
            )}
            {taxRate > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>{taxLabel} ({taxRate}%)</span>
                <span className="font-medium text-gray-700">{tax.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-gray-200 pt-2 text-lg font-bold">
              <span>Total</span>
              <span className="text-primary">{grandTotal.toFixed(2)}</span>
            </div>
          </div>

          <div className="mt-3 space-y-1.5">
            {/* Promo selector */}
            {promosList.length > 0 && !voucherCode && (
              <div className="relative">
                {promoName ? (
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5">
                    <Tag className="h-3 w-3 text-emerald-600" />
                    <span className="flex-1 text-xs font-semibold text-emerald-700">{promoName}</span>
                    <button onClick={() => setPromo(null)} className="rounded p-0.5 text-emerald-400 hover:bg-emerald-100 hover:text-emerald-600">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setShowPromoPicker(!showPromoPicker)}
                    className="w-full rounded-lg border border-dashed border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-white hover:border-gray-300">
                    <Tag className="inline h-3 w-3 mr-1" />
                    Apply Promo
                    <ChevronDown className="inline h-3 w-3 ml-1 opacity-50" />
                  </button>
                )}
                {showPromoPicker && !promoName && (
                  <div className="absolute bottom-full left-0 right-0 z-30 mb-1 max-h-48 overflow-y-auto rounded-xl border bg-white shadow-lg">
                    {promosList.map((p) => (
                      <button
                        key={p.name}
                        onClick={() => { setPromo(p.promo_name, p.discount_type, p.discount_value); setShowPromoPicker(false) }}
                        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-xs hover:bg-gray-50"
                      >
                        <span className="font-semibold text-gray-700">{p.promo_name}</span>
                        <span className="text-emerald-600 font-medium">
                          {p.discount_type === 'Percentage' ? `${p.discount_value}%` : `${p.discount_value}`}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* Voucher code input */}
            {!promoName && !voucherCode && (
              <div>
                {showVoucherInput ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="password"
                      inputMode="numeric"
                      value={voucherInput}
                      onChange={(e) => { setVoucherInput(e.target.value.replace(/\D/g, '').slice(0, 6)); setVoucherError('') }}
                      placeholder="••••••"
                      maxLength={6}
                      className={`flex-1 rounded-lg border px-3 py-1.5 text-center text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-primary ${voucherError ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                      autoFocus
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter' && voucherInput.length === 6) {
                          setVoucherLoading(true); setVoucherError('')
                          const res = await window.api.vouchers.validate(voucherInput)
                          setVoucherLoading(false)
                          if (res?.valid) { setVoucher(voucherInput, res.discount_percent); setShowVoucherInput(false); setVoucherInput('') }
                          else { setVoucherError(res?.reason || 'Invalid code') }
                        }
                        if (e.key === 'Escape') { setShowVoucherInput(false); setVoucherInput(''); setVoucherError('') }
                      }}
                    />
                    <button
                      disabled={voucherInput.length !== 6 || voucherLoading}
                      onClick={async () => {
                        setVoucherLoading(true); setVoucherError('')
                        const res = await window.api.vouchers.validate(voucherInput)
                        setVoucherLoading(false)
                        if (res?.valid) { setVoucher(voucherInput, res.discount_percent); setShowVoucherInput(false); setVoucherInput('') }
                        else { setVoucherError(res?.reason || 'Invalid code') }
                      }}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
                    >
                      {voucherLoading ? '...' : 'Apply'}
                    </button>
                    <button onClick={() => { setShowVoucherInput(false); setVoucherInput(''); setVoucherError('') }}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setShowVoucherInput(true)}
                    className="w-full rounded-lg border border-dashed border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-white hover:border-gray-300">
                    <Tag className="inline h-3 w-3 mr-1" />
                    Enter Voucher Code
                  </button>
                )}
                {voucherError && <p className="mt-1 text-xs text-red-500 text-center">{voucherError}</p>}
              </div>
            )}
            {voucherCode && (
              <div className="flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5">
                <Tag className="h-3 w-3 text-purple-600" />
                <span className="flex-1 text-xs font-semibold text-purple-700">Voucher Applied ({orderDiscountPercent}% off)</span>
                <button onClick={() => setVoucher(null)} className="rounded p-0.5 text-purple-400 hover:bg-purple-100 hover:text-purple-600">
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
            {canDiscount && !promoName && !voucherCode && (
              <button onClick={openOrderDiscount}
                className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-white hover:border-gray-300">
                <Percent className="inline h-3 w-3 mr-1" />
                Discount
              </button>
            )}
            {!isOrderPlaced && activeOrderId ? (
              <>
                <button onClick={onPlaceOrder}
                  className="w-full rounded-xl bg-orange-500 py-3 text-sm font-bold text-white shadow-lg shadow-orange-500/25 transition-all hover:bg-orange-600 active:scale-[0.98]">
                  Update Order & Print KOT
                </button>
                {onUpdateOnly && (
                  <button onClick={onUpdateOnly}
                    className="w-full rounded-xl border-2 border-orange-300 py-2.5 text-sm font-bold text-orange-600 transition-all hover:bg-orange-50 active:scale-[0.98]">
                    Update Without KOT
                  </button>
                )}
              </>
            ) : !isOrderPlaced ? (
              <>
                <button onClick={onPlaceOrder}
                  className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 transition-all hover:bg-emerald-700 active:scale-[0.98]">
                  Place Order & Print KOT
                </button>
                <button onClick={onPay}
                  className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-white shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 active:scale-[0.98]">
                  Quick Pay — {grandTotal.toFixed(2)}
                </button>
              </>
            ) : (
              <button onClick={onPay}
                className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-white shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 active:scale-[0.98]">
                Payment — {grandTotal.toFixed(2)}
              </button>
            )}
            {isOrderPlaced && activeOrderId && (
              <div className="relative">
                <button onClick={() => setShowPrintMenu(!showPrintMenu)}
                  className="w-full rounded-xl border-2 border-gray-200 px-4 py-2 text-xs font-semibold text-gray-500 hover:bg-white hover:border-gray-300">
                  <Printer className="inline h-3.5 w-3.5 mr-1" />
                  Print
                  <ChevronDown className="inline h-3 w-3 ml-1 opacity-50" />
                </button>
                {showPrintMenu && (
                  <div className="absolute bottom-full left-0 right-0 z-30 mb-1 rounded-xl border bg-white shadow-lg overflow-hidden">
                    <button onClick={async () => { setShowPrintMenu(false); const r = await window.api.print.kots(activeOrderId, user?.name, true); const w = await window.api.print.waiterCopy(activeOrderId); alert(r?.success && w?.success ? 'KOT + Waiter copy printed' : 'Print error — check printer') }}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50 border-b">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> KOT + Waiter Copy
                    </button>
                    <button onClick={async () => { setShowPrintMenu(false); const r = await window.api.print.kots(activeOrderId, user?.name, true); alert(r?.success ? 'KOT reprinted' : 'KOT failed') }}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50 border-b">
                      <span className="h-1.5 w-1.5 rounded-full bg-orange-500" /> Reprint KOT
                    </button>
                    <button onClick={async () => { setShowPrintMenu(false); const r = await window.api.print.waiterCopy(activeOrderId); alert(r?.success ? 'Waiter copy printed' : 'Failed') }}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50 border-b">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-500" /> Waiter Copy
                    </button>
                    <button onClick={async () => { setShowPrintMenu(false); const r = await window.api.print.invoice(activeOrderId); alert(r?.success ? 'Invoice printed' : 'Failed') }}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                      <span className="h-1.5 w-1.5 rounded-full bg-purple-500" /> Print Invoice
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Table picker */}
      {showTablePicker && (
        <TablePicker onSelect={handleTableSelect} onCancel={() => setShowTablePicker(false)} currentTable={tableName} />
      )}

      {/* Supervisor PIN modal for removing items from placed orders */}
      {removeRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-80 rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="mb-2 text-lg font-bold">Supervisor Approval</h3>
            <p className="mb-4 text-xs text-gray-500">Enter supervisor PIN to remove this item</p>
            <input
              type="password"
              value={removePin}
              onChange={(e) => { setRemovePin(e.target.value); setRemoveError('') }}
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && removePin.length >= 4) {
                  const u = await window.api.users.verifyPin(removePin)
                  if (u && u.role === 'supervisor') {
                    if (removeRequest.dbId) {
                      await window.api.orderItems.remove(removeRequest.dbId).catch(() => {})
                    }
                    removeItem(removeRequest.cartId)
                    // Auto-void if last item removed from a placed order
                    if (isOrderPlaced && items.length === 1 && onAutoVoid) {
                      onAutoVoid()
                    }
                    setRemoveRequest(null); setRemovePin('')
                  } else {
                    setRemoveError('Invalid PIN or not a supervisor')
                  }
                }
              }}
              autoFocus
              placeholder="Supervisor PIN"
              className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-center text-lg tracking-widest focus:border-primary focus:outline-none"
            />
            {removeError && <p className="mt-2 text-xs text-red-500">{removeError}</p>}
            <div className="mt-4 flex gap-3">
              <button onClick={() => { setRemoveRequest(null); setRemovePin(''); setRemoveError('') }}
                className="flex-1 rounded-xl border-2 border-gray-200 py-2.5 text-sm font-semibold hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={async () => {
                const u = await window.api.users.verifyPin(removePin)
                if (u && u.role === 'supervisor') {
                  if (removeRequest.dbId) {
                    await window.api.orderItems.remove(removeRequest.dbId).catch(() => {})
                  }
                  removeItem(removeRequest.cartId)
                  // Auto-void if last item removed from a placed order
                  if (isOrderPlaced && items.length === 1 && onAutoVoid) {
                    onAutoVoid()
                  }
                  setRemoveRequest(null); setRemovePin('')
                } else {
                  setRemoveError('Invalid PIN or not a supervisor')
                }
              }}
                className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white hover:bg-red-600">
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Instructions modal */}
      {editingInstructions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-96 rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="mb-3 text-lg font-bold">Special Instructions</h3>
            <textarea value={tempInstructions} onChange={(e) => setTempInstructions(e.target.value)}
              placeholder="e.g., No onions, allergic to nuts..."
              className="w-full resize-none rounded-xl border-2 border-gray-200 px-4 py-3 text-sm focus:border-primary focus:outline-none" rows={3} autoFocus />
            <div className="mt-4 flex gap-3">
              <button onClick={() => setEditingInstructions(null)} className="flex-1 rounded-xl border-2 border-gray-200 py-2.5 text-sm font-semibold hover:bg-gray-50">Cancel</button>
              <button onClick={saveInstructions} className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary/90">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Item discount modal */}
      {showItemDiscount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-80 rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="mb-4 text-lg font-bold">Item Discount</h3>
            <div className="space-y-3">
              <div><label className="mb-1 block text-xs font-semibold text-gray-500">Discount %</label>
                <input type="number" value={itemDiscPct || ''} onChange={(e) => setItemDiscPct(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 text-sm focus:border-primary focus:outline-none" min={0} max={100} /></div>
              <div><label className="mb-1 block text-xs font-semibold text-gray-500">Fixed Amount</label>
                <input type="number" value={itemDiscAmt || ''} onChange={(e) => setItemDiscAmt(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 text-sm focus:border-primary focus:outline-none" min={0} /></div>
            </div>
            {discountError && <p className="mt-2 text-sm text-red-500">{discountError}</p>}
            <div className="mt-4 flex gap-3">
              <button onClick={() => { setShowItemDiscount(null); setDiscountError('') }} className="flex-1 rounded-xl border-2 border-gray-200 py-2.5 text-sm font-semibold hover:bg-gray-50">Cancel</button>
              <button onClick={saveItemDiscount} className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary/90">Apply</button>
            </div>
          </div>
        </div>
      )}

      {/* Order discount modal */}
      {showOrderDiscount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-80 rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="mb-4 text-lg font-bold">Order Discount</h3>
            <div className="space-y-3">
              <div><label className="mb-1 block text-xs font-semibold text-gray-500">Discount %</label>
                <input type="number" value={discPct || ''} onChange={(e) => setDiscPct(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 text-sm focus:border-primary focus:outline-none" min={0} max={100} /></div>
              <div><label className="mb-1 block text-xs font-semibold text-gray-500">Fixed Amount</label>
                <input type="number" value={discAmt || ''} onChange={(e) => setDiscAmt(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 text-sm focus:border-primary focus:outline-none" min={0} /></div>
              <div><label className="mb-1 block text-xs font-semibold text-gray-500">Reason</label>
                <input type="text" value={discReason} onChange={(e) => setDiscReason(e.target.value)}
                  className="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 text-sm focus:border-primary focus:outline-none" placeholder="Manager discount" /></div>
            </div>
            {discountError && <p className="mt-2 text-sm text-red-500">{discountError}</p>}
            <div className="mt-4 flex gap-3">
              <button onClick={() => { setShowOrderDiscount(false); setDiscountError('') }} className="flex-1 rounded-xl border-2 border-gray-200 py-2.5 text-sm font-semibold hover:bg-gray-50">Cancel</button>
              <button onClick={saveOrderDiscount} className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary/90">Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
