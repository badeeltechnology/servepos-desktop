import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '../stores/auth'
import { useCartStore } from '../stores/cart'
import ItemGrid from '../components/ItemGrid'
import Cart from '../components/Cart'
import PaymentDialog from '../components/PaymentDialog'
import OrdersBar from '../components/OrdersBar'
import SupervisorSettings from './SupervisorSettings'
import {
  LogOut, User, PauseCircle, LayoutGrid, ClipboardList,
  Settings, ArrowLeftRight
} from 'lucide-react'

export default function POS() {
  const { user, logout } = useAuthStore()
  const cart = useCartStore()
  const [showSettings, setShowSettings] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null)
  const [showTableTransfer, setShowTableTransfer] = useState(false)
  const [taxRate, setTaxRate] = useState(0)
  const [taxLabel, setTaxLabel] = useState('VAT')

  useEffect(() => {
    loadTaxConfig()
  }, [])

  async function loadTaxConfig() {
    const config = await window.api.receiptConfig.getAll()
    const enabled = config.tax_enabled === '1'
    setTaxRate(enabled ? parseFloat(config.tax_rate || '0') : 0)
    setTaxLabel(config.tax_label || 'VAT')
  }

  const handlePay = useCallback(() => {
    if (cart.items.length === 0) return
    setShowPayment(true)
  }, [cart.items])

  const handlePaymentComplete = useCallback(
    async (payments: { method: string; amount: number; reference: string }[]) => {
      try {
        // Create or update the order
        const order = await window.api.orders.create({
          orderType: cart.orderType,
          tableName: cart.tableName ?? undefined,
          room: cart.room ?? undefined,
          guests: cart.guests,
          cashierId: user!.id,
          cashierName: user!.name
        })

        // Add order items
        for (const item of cart.items) {
          await window.api.orderItems.add({
            orderId: order.id,
            itemCode: item.itemCode,
            itemName: item.itemName,
            qty: item.qty,
            rate: item.rate,
            discountAmount: item.discountAmount,
            discountPercent: item.discountPercent,
            amount: item.amount,
            modifiers: item.modifiers.length > 0 ? JSON.stringify(item.modifiers) : undefined,
            modifierTotal: item.modifierTotal,
            specialInstructions: item.specialInstructions || undefined
          })
        }

        // Add payments
        for (const p of payments) {
          await window.api.orderPayments.add(order.id, p.method, p.amount, p.reference || undefined)
        }

        // Update order totals and complete
        const subtotal = cart.getSubtotal()
        const orderDiscVal = cart.getOrderDiscountValue()
        const tax = cart.getTaxTotal(taxRate)
        const grandTotal = cart.getGrandTotal(taxRate)

        await window.api.orders.update(order.id, {
          status: 'Completed',
          subtotal,
          taxTotal: tax,
          discountAmount: cart.orderDiscountAmount,
          discountPercent: cart.orderDiscountPercent,
          discountReason: cart.orderDiscountReason || undefined,
          grandTotal,
          completedAt: new Date().toISOString()
        })

        // Free the table
        if (cart.tableName) {
          await window.api.tables.updateStatus(cart.tableName, 'Available')
        }

        cart.clearCart()
        setShowPayment(false)
        setActiveOrderId(null)
      } catch (err) {
        console.error('Payment error:', err)
      }
    },
    [cart, user, taxRate]
  )

  const handleHoldOrder = useCallback(async () => {
    if (cart.items.length === 0) return

    // Create order with Hold status
    const order = await window.api.orders.create({
      orderType: cart.orderType,
      tableName: cart.tableName ?? undefined,
      room: cart.room ?? undefined,
      guests: cart.guests,
      cashierId: user!.id,
      cashierName: user!.name
    })

    for (const item of cart.items) {
      await window.api.orderItems.add({
        orderId: order.id,
        itemCode: item.itemCode,
        itemName: item.itemName,
        qty: item.qty,
        rate: item.rate,
        discountAmount: item.discountAmount,
        discountPercent: item.discountPercent,
        amount: item.amount,
        modifiers: item.modifiers.length > 0 ? JSON.stringify(item.modifiers) : undefined,
        modifierTotal: item.modifierTotal,
        specialInstructions: item.specialInstructions || undefined
      })
    }

    const subtotal = cart.getSubtotal()
    const grandTotal = cart.getGrandTotal(taxRate)

    await window.api.orders.update(order.id, {
      status: 'Hold',
      subtotal,
      grandTotal
    })

    cart.clearCart()
    setActiveOrderId(null)
  }, [cart, user, taxRate])

  const handleResumeOrder = useCallback(async (orderId: string) => {
    const order = await window.api.orders.get(orderId)
    if (!order) return

    const items = await window.api.orderItems.get(orderId)

    // Load into cart
    cart.clearCart()
    cart.setOrderType(order.order_type)
    if (order.table_name) cart.setTable(order.table_name, order.room)
    if (order.guests) cart.setGuests(order.guests)

    for (const item of items) {
      const modifiers = item.modifiers ? JSON.parse(item.modifiers) : []
      cart.addItem({
        itemCode: item.item_code,
        itemName: item.item_name,
        qty: item.qty,
        rate: item.rate,
        modifiers,
        specialInstructions: item.special_instructions || undefined
      })
    }

    // Delete the held order (will recreate on pay/hold)
    await window.api.orders.update(orderId, { status: 'Void', voidReason: 'Resumed into active cart' })
    setActiveOrderId(orderId)
  }, [cart])

  const handleNewOrder = useCallback(() => {
    if (cart.items.length > 0) {
      // Auto-hold current order
      handleHoldOrder()
    }
    cart.clearCart()
    setActiveOrderId(null)
  }, [cart, handleHoldOrder])

  if (showSettings && user?.role === 'supervisor') {
    return <SupervisorSettings onBack={() => setShowSettings(false)} />
  }

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b bg-white px-4 py-2">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-primary">ServePOS</h1>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
            {user?.role === 'supervisor' ? 'Supervisor' : 'Cashier'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Hold button */}
          {cart.items.length > 0 && (
            <button
              onClick={handleHoldOrder}
              className="flex items-center gap-1.5 rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-1.5 text-xs font-medium text-yellow-700 hover:bg-yellow-100"
            >
              <PauseCircle className="h-3.5 w-3.5" />
              Hold
            </button>
          )}

          {user?.role === 'supervisor' && (
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Settings className="h-3.5 w-3.5" />
              Settings
            </button>
          )}

          <div className="mx-2 h-6 w-px bg-border" />

          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <User className="h-3.5 w-3.5" />
            <span className="text-xs">{user?.name}</span>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* Orders bar */}
      <OrdersBar
        activeOrderId={activeOrderId}
        onSelectOrder={handleResumeOrder}
        onNewOrder={handleNewOrder}
      />

      {/* Main content: Item Grid + Cart */}
      <div className="flex flex-1 overflow-hidden">
        {/* Item grid - takes remaining space */}
        <div className="flex-1 overflow-hidden">
          <ItemGrid />
        </div>

        {/* Cart sidebar */}
        <div className="w-[340px] flex-shrink-0">
          <Cart onPay={handlePay} taxRate={taxRate} taxLabel={taxLabel} />
        </div>
      </div>

      {/* Payment dialog */}
      {showPayment && (
        <PaymentDialog
          grandTotal={cart.getGrandTotal(taxRate)}
          onComplete={handlePaymentComplete}
          onCancel={() => setShowPayment(false)}
        />
      )}
    </div>
  )
}
