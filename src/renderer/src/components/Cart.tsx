import { useState, useEffect } from 'react'
import { Minus, Plus, Trash2, MessageSquare, Percent, MapPin, Users, ChevronDown } from 'lucide-react'
import { useCartStore, CartItem } from '../stores/cart'
import { useAuthStore } from '../stores/auth'
import TablePicker from './TablePicker'

interface CartProps {
  onPlaceOrder: () => void
  onPay: () => void
  taxRate: number
  taxLabel?: string
  isOrderPlaced?: boolean
  activeOrderId?: string | null
}

export default function Cart({ onPlaceOrder, onPay, taxRate, taxLabel = 'VAT', isOrderPlaced = false, activeOrderId }: CartProps) {
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
    updateItemQty, removeItem, updateItemInstructions, updateItemDiscount,
    orderDiscountPercent, orderDiscountAmount, orderDiscountReason,
    setOrderDiscount, getSubtotal, getOrderDiscountValue, getTaxTotal, getGrandTotal
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
      {/* Order type selector */}
      <div className="border-b p-4">
        <div className="flex rounded-xl bg-gray-100 p-1">
          {(['Dine In', 'Takeaway', 'Delivery'] as const).map((type) => (
            <button
              key={type}
              onClick={() => { setOrderType(type); if (type !== 'Dine In') setTable(null) }}
              className={`flex-1 rounded-lg py-2.5 text-xs font-semibold transition-all ${
                orderType === type
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        {/* Table & Guests for Dine In */}
        {orderType === 'Dine In' && (
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={() => setShowTablePicker(true)}
              className={`flex flex-1 items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-sm font-medium transition-all ${
                tableName
                  ? 'border-primary/20 bg-primary/5 text-primary'
                  : 'border-dashed border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-500'
              }`}
            >
              <MapPin className="h-4 w-4" />
              {tableName || 'Select Table'}
              <ChevronDown className="ml-auto h-3.5 w-3.5 opacity-50" />
            </button>
            <div className="flex items-center gap-1.5 rounded-xl border-2 border-gray-200 px-2 py-1.5">
              <Users className="h-3.5 w-3.5 text-gray-400" />
              <button onClick={() => setGuests(Math.max(1, guests - 1))} className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100">-</button>
              <span className="min-w-[24px] text-center text-sm font-bold">{guests}</span>
              <button onClick={() => setGuests(guests + 1)} className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100">+</button>
            </div>
          </div>
        )}
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
                    <button onClick={() => removeItem(item.id)} className="rounded-lg p-1.5 text-red-300 hover:bg-red-50 hover:text-red-500" title="Remove">
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
        <div className="border-t bg-gray-50 px-4 py-4">
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-500">
              <span>Subtotal ({items.length} items)</span>
              <span className="font-medium text-gray-700">{subtotal.toFixed(2)}</span>
            </div>
            {orderDiscVal > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Discount</span>
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

          <div className="mt-4 space-y-2">
            {canDiscount && (
              <button onClick={openOrderDiscount}
                className="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 text-xs font-semibold text-gray-500 hover:bg-white hover:border-gray-300">
                <Percent className="inline h-3.5 w-3.5 mr-1" />
                Discount
              </button>
            )}
            {!isOrderPlaced && (
              <button onClick={onPlaceOrder}
                className="w-full rounded-xl bg-emerald-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 transition-all hover:bg-emerald-700 active:scale-[0.98]">
                Place Order & Print KOT
              </button>
            )}
            <button onClick={onPay}
              className="w-full rounded-xl bg-primary py-3.5 text-sm font-bold text-white shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 active:scale-[0.98]">
              {isOrderPlaced ? `Payment — ${grandTotal.toFixed(2)}` : `Quick Pay — ${grandTotal.toFixed(2)}`}
            </button>
            {isOrderPlaced && activeOrderId && (
              <div className="space-y-2">
                <button onClick={async () => {
                  const kotRes = await window.api.print.kots(activeOrderId)
                  const waiterRes = await window.api.print.waiterCopy(activeOrderId)
                  const errors: string[] = []
                  if (!kotRes?.success) errors.push('KOT: ' + (kotRes?.errors?.join(', ') || 'failed'))
                  if (!waiterRes?.success) errors.push('Waiter: ' + (waiterRes?.error || 'failed'))
                  alert(errors.length === 0 ? 'KOT + Waiter copy printed' : errors.join('\n'))
                }}
                  className="w-full rounded-xl border-2 border-emerald-200 px-3 py-2.5 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 hover:border-emerald-300">
                  Print KOT + Waiter Copy
                </button>
                <div className="flex gap-2">
                  <button onClick={async () => {
                    const res = await window.api.print.kots(activeOrderId)
                    alert(res?.success ? 'KOT reprinted' : `KOT failed: ${res?.errors?.join(', ') || 'Check printer'}`)
                  }}
                    className="flex-1 rounded-xl border-2 border-orange-200 px-3 py-2 text-xs font-semibold text-orange-600 hover:bg-orange-50 hover:border-orange-300">
                    Reprint KOT
                  </button>
                  <button onClick={async () => {
                    const res = await window.api.print.waiterCopy(activeOrderId)
                    alert(res?.success ? 'Waiter copy printed' : `Failed: ${res?.error || 'Check printer'}`)
                  }}
                    className="flex-1 rounded-xl border-2 border-blue-200 px-3 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50 hover:border-blue-300">
                    Waiter Copy
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Table picker */}
      {showTablePicker && (
        <TablePicker onSelect={handleTableSelect} onCancel={() => setShowTablePicker(false)} currentTable={tableName} />
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
