import { useState, useEffect } from 'react'
import { Minus, Plus, Trash2, MessageSquare, Percent, X } from 'lucide-react'
import { useCartStore, CartItem } from '../stores/cart'
import { useAuthStore } from '../stores/auth'

interface CartProps {
  onPay: () => void
  taxRate: number
  taxLabel?: string
}

export default function Cart({ onPay, taxRate, taxLabel = 'VAT' }: CartProps) {
  const [discountEnabled, setDiscountEnabled] = useState(false)
  const [discountPermission, setDiscountPermission] = useState<'supervisor_only' | 'all_users'>('supervisor_only')

  useEffect(() => {
    loadDiscountConfig()
  }, [])

  async function loadDiscountConfig() {
    const config = await window.api.receiptConfig.getAll()
    setDiscountEnabled(config.discount_enabled === '1')
    setDiscountPermission((config.discount_permission as 'supervisor_only' | 'all_users') || 'supervisor_only')
  }

  const {
    items, orderType, setOrderType, guests, setGuests,
    updateItemQty, removeItem, updateItemInstructions, updateItemDiscount,
    orderDiscountPercent, orderDiscountAmount, orderDiscountReason,
    setOrderDiscount, getSubtotal, getOrderDiscountValue, getTaxTotal, getGrandTotal
  } = useCartStore()

  const user = useAuthStore((s) => s.user)

  // Discount permission check
  const canDiscount = discountEnabled && (
    user?.role === 'supervisor' ||
    (discountPermission === 'all_users' && user?.role === 'cashier')
  )

  const [editingInstructions, setEditingInstructions] = useState<string | null>(null)
  const [tempInstructions, setTempInstructions] = useState('')
  const [showOrderDiscount, setShowOrderDiscount] = useState(false)
  const [discPct, setDiscPct] = useState(0)
  const [discAmt, setDiscAmt] = useState(0)
  const [discReason, setDiscReason] = useState('')
  const [showItemDiscount, setShowItemDiscount] = useState<string | null>(null)
  const [itemDiscPct, setItemDiscPct] = useState(0)
  const [itemDiscAmt, setItemDiscAmt] = useState(0)

  const subtotal = getSubtotal()
  const orderDiscVal = getOrderDiscountValue()
  const tax = getTaxTotal(taxRate)
  const grandTotal = getGrandTotal(taxRate)

  function openInstructions(item: CartItem) {
    setEditingInstructions(item.id)
    setTempInstructions(item.specialInstructions)
  }

  function saveInstructions() {
    if (editingInstructions) {
      updateItemInstructions(editingInstructions, tempInstructions)
    }
    setEditingInstructions(null)
  }

  function openItemDiscount(item: CartItem) {
    setShowItemDiscount(item.id)
    setItemDiscPct(item.discountPercent)
    setItemDiscAmt(item.discountAmount)
  }

  const [discountError, setDiscountError] = useState('')

  function saveItemDiscount() {
    if (showItemDiscount) {
      const maxPct = user?.max_discount_pct ?? 0
      if (user?.role === 'cashier' && maxPct > 0 && itemDiscPct > maxPct) {
        setDiscountError(`Max discount allowed: ${maxPct}%`)
        return
      }
      updateItemDiscount(showItemDiscount, itemDiscPct, itemDiscAmt)
    }
    setShowItemDiscount(null)
    setDiscountError('')
  }

  function openOrderDiscount() {
    setDiscPct(orderDiscountPercent)
    setDiscAmt(orderDiscountAmount)
    setDiscReason(orderDiscountReason)
    setDiscountError('')
    setShowOrderDiscount(true)
  }

  function saveOrderDiscount() {
    const maxPct = user?.max_discount_pct ?? 0
    if (user?.role === 'cashier' && maxPct > 0 && discPct > maxPct) {
      setDiscountError(`Max discount allowed: ${maxPct}%`)
      return
    }
    setOrderDiscount(discPct, discAmt, discReason)
    setShowOrderDiscount(false)
    setDiscountError('')
  }

  return (
    <div className="flex h-full flex-col border-l bg-white">
      {/* Header */}
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          {(['Dine In', 'Takeaway', 'Delivery'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setOrderType(type)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                orderType === type
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
        {orderType === 'Dine In' && (
          <div className="mt-2 flex items-center gap-3">
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">Guests:</span>
              <button onClick={() => setGuests(Math.max(1, guests - 1))} className="rounded bg-muted px-1.5 py-0.5 text-xs hover:bg-muted/80">-</button>
              <span className="min-w-[20px] text-center text-xs font-medium">{guests}</span>
              <button onClick={() => setGuests(guests + 1)} className="rounded bg-muted px-1.5 py-0.5 text-xs hover:bg-muted/80">+</button>
            </div>
          </div>
        )}
      </div>

      {/* Cart items */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
            Tap items to add them to the order
          </div>
        ) : (
          <div className="divide-y">
            {items.map((item) => (
              <div key={item.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium leading-tight">{item.itemName}</h4>
                    {/* Modifiers */}
                    {item.modifiers.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {item.modifiers.map((m, i) => (
                          <p key={i} className="text-xs text-muted-foreground">
                            + {m.name}
                            {m.price > 0 && (
                              <span className="ml-1 text-primary">+{m.price.toFixed(2)}</span>
                            )}
                          </p>
                        ))}
                      </div>
                    )}
                    {/* Special instructions */}
                    {item.specialInstructions && (
                      <p className="mt-1 text-xs italic text-muted-foreground">
                        "{item.specialInstructions}"
                      </p>
                    )}
                    {/* Item discount */}
                    {(item.discountPercent > 0 || item.discountAmount > 0) && (
                      <p className="mt-0.5 text-xs text-green-600">
                        Discount: {item.discountPercent > 0 ? `${item.discountPercent}%` : ''}{' '}
                        {item.discountAmount > 0 ? `-${item.discountAmount.toFixed(2)}` : ''}
                      </p>
                    )}
                  </div>
                  <span className="whitespace-nowrap text-sm font-semibold">
                    {item.amount.toFixed(2)}
                  </span>
                </div>
                {/* Qty controls + actions */}
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => updateItemQty(item.id, item.qty - 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border text-muted-foreground hover:bg-muted"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-8 text-center text-sm font-medium">{item.qty}</span>
                    <button
                      onClick={() => updateItemQty(item.id, item.qty + 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border text-muted-foreground hover:bg-muted"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                    <span className="ml-2 text-xs text-muted-foreground">
                      @ {item.rate.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openInstructions(item)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                      title="Special instructions"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                    </button>
                    {canDiscount && (
                      <button
                        onClick={() => openItemDiscount(item)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                        title="Item discount"
                      >
                        <Percent className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => removeItem(item.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-destructive/60 hover:bg-destructive/10 hover:text-destructive"
                      title="Remove"
                    >
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
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{subtotal.toFixed(2)}</span>
            </div>
            {orderDiscVal > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Discount</span>
                <span>-{orderDiscVal.toFixed(2)}</span>
              </div>
            )}
            {taxRate > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{taxLabel} ({taxRate}%)</span>
                <span>{tax.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-1 text-base font-bold">
              <span>Total</span>
              <span className="text-primary">{grandTotal.toFixed(2)}</span>
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            {canDiscount && (
              <button
                onClick={openOrderDiscount}
                className="rounded-lg border border-input px-3 py-2.5 text-xs font-medium text-muted-foreground hover:bg-white"
              >
                <Percent className="inline h-3.5 w-3.5 mr-1" />
                Discount
              </button>
            )}
            <button
              onClick={onPay}
              className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 active:scale-[0.98]"
            >
              Pay {grandTotal.toFixed(2)}
            </button>
          </div>
        </div>
      )}

      {/* Instructions modal */}
      {editingInstructions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-96 rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="mb-3 text-lg font-bold">Special Instructions</h3>
            <textarea
              value={tempInstructions}
              onChange={(e) => setTempInstructions(e.target.value)}
              placeholder="e.g., No onions, allergic to nuts..."
              className="w-full resize-none rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              rows={3}
              autoFocus
            />
            <div className="mt-4 flex gap-3">
              <button onClick={() => setEditingInstructions(null)} className="flex-1 rounded-lg border border-input py-2 text-sm font-medium hover:bg-muted">Cancel</button>
              <button onClick={saveInstructions} className="flex-1 rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Item discount modal */}
      {showItemDiscount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-80 rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="mb-4 text-lg font-bold">Item Discount</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Discount %</label>
                <input
                  type="number"
                  value={itemDiscPct || ''}
                  onChange={(e) => setItemDiscPct(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  min={0}
                  max={100}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Fixed Amount</label>
                <input
                  type="number"
                  value={itemDiscAmt || ''}
                  onChange={(e) => setItemDiscAmt(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  min={0}
                />
              </div>
            </div>
            {discountError && <p className="mt-2 text-sm text-destructive">{discountError}</p>}
            <div className="mt-4 flex gap-3">
              <button onClick={() => { setShowItemDiscount(null); setDiscountError('') }} className="flex-1 rounded-lg border border-input py-2 text-sm font-medium hover:bg-muted">Cancel</button>
              <button onClick={saveItemDiscount} className="flex-1 rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Apply</button>
            </div>
          </div>
        </div>
      )}

      {/* Order discount modal */}
      {showOrderDiscount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-80 rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="mb-4 text-lg font-bold">Order Discount</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Discount %</label>
                <input
                  type="number"
                  value={discPct || ''}
                  onChange={(e) => setDiscPct(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  min={0} max={100}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Fixed Amount</label>
                <input
                  type="number"
                  value={discAmt || ''}
                  onChange={(e) => setDiscAmt(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  min={0}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Reason</label>
                <input
                  type="text"
                  value={discReason}
                  onChange={(e) => setDiscReason(e.target.value)}
                  className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="e.g., Manager discount"
                />
              </div>
            </div>
            {discountError && <p className="mt-2 text-sm text-destructive">{discountError}</p>}
            <div className="mt-4 flex gap-3">
              <button onClick={() => { setShowOrderDiscount(false); setDiscountError('') }} className="flex-1 rounded-lg border border-input py-2 text-sm font-medium hover:bg-muted">Cancel</button>
              <button onClick={saveOrderDiscount} className="flex-1 rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
