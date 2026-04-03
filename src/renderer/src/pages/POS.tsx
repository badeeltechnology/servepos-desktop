import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '../stores/auth'
import { useCartStore } from '../stores/cart'
import ItemGrid from '../components/ItemGrid'
import Cart from '../components/Cart'
import PaymentDialog from '../components/PaymentDialog'
import OrdersBar from '../components/OrdersBar'
import SupervisorSettings from './SupervisorSettings'
import {
  LogOut, User, PauseCircle, Settings, CheckCircle, AlertCircle, Wifi, WifiOff
} from 'lucide-react'
import { useAppStore } from '../stores/app'

export default function POS() {
  const { user, logout } = useAuthStore()
  const cart = useCartStore()
  const isOnline = useAppStore((s) => s.isOnline)
  const [showPayment, setShowPayment] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null)
  const [taxRate, setTaxRate] = useState(0)
  const [taxLabel, setTaxLabel] = useState('VAT')
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [processing, setProcessing] = useState(false)

  useEffect(() => { loadTaxConfig() }, [])

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000)
      return () => clearTimeout(t)
    }
  }, [toast])

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
      setProcessing(true)
      try {
        // Create order
        const order = await window.api.orders.create({
          orderType: cart.orderType,
          tableName: cart.tableName ?? undefined,
          room: cart.room ?? undefined,
          guests: cart.guests,
          cashierId: user!.id,
          cashierName: user!.name
        })

        // Add items
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

        // Calculate totals
        const subtotal = cart.getSubtotal()
        const orderDiscVal = cart.getOrderDiscountValue()
        const tax = cart.getTaxTotal(taxRate)
        const grandTotal = cart.getGrandTotal(taxRate)

        // Complete order
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

        // Free table
        if (cart.tableName) {
          await window.api.tables.updateStatus(cart.tableName, 'Available')
        }

        // Print KOT to kitchen
        try {
          await window.api.print.kots(order.id)
        } catch (e) {
          console.warn('KOT print failed:', e)
        }

        // Print receipt
        try {
          await window.api.print.receipt(order.id)
        } catch (e) {
          console.warn('Receipt print failed:', e)
        }

        cart.clearCart()
        setShowPayment(false)
        setActiveOrderId(null)
        setToast({ type: 'success', message: `Order ${order.order_number} completed!` })
      } catch (err: any) {
        console.error('Payment error:', err)
        setToast({ type: 'error', message: `Order failed: ${err.message}` })
      } finally {
        setProcessing(false)
      }
    },
    [cart, user, taxRate]
  )

  const handleHoldOrder = useCallback(async () => {
    if (cart.items.length === 0) return
    try {
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
          orderId: order.id, itemCode: item.itemCode, itemName: item.itemName,
          qty: item.qty, rate: item.rate, discountAmount: item.discountAmount,
          discountPercent: item.discountPercent, amount: item.amount,
          modifiers: item.modifiers.length > 0 ? JSON.stringify(item.modifiers) : undefined,
          modifierTotal: item.modifierTotal, specialInstructions: item.specialInstructions || undefined
        })
      }

      await window.api.orders.update(order.id, {
        status: 'Hold', subtotal: cart.getSubtotal(), grandTotal: cart.getGrandTotal(taxRate)
      })

      // Print KOT when holding (kitchen needs to start cooking)
      try { await window.api.print.kots(order.id) } catch {}

      cart.clearCart()
      setActiveOrderId(null)
      setToast({ type: 'success', message: `Order held: ${order.order_number}` })
    } catch (err: any) {
      setToast({ type: 'error', message: `Hold failed: ${err.message}` })
    }
  }, [cart, user, taxRate])

  const handleResumeOrder = useCallback(async (orderId: string) => {
    const order = await window.api.orders.get(orderId)
    if (!order) return
    const items = await window.api.orderItems.get(orderId)

    // Auto-hold current cart if it has items
    if (cart.items.length > 0) await handleHoldOrder()

    cart.clearCart()
    cart.setOrderType(order.order_type)
    if (order.table_name) cart.setTable(order.table_name, order.room)
    if (order.guests) cart.setGuests(order.guests)

    for (const item of items) {
      cart.addItem({
        itemCode: item.item_code, itemName: item.item_name, qty: item.qty, rate: item.rate,
        modifiers: item.modifiers ? JSON.parse(item.modifiers) : [],
        specialInstructions: item.special_instructions || undefined
      })
    }

    // Mark as void (will be recreated on pay)
    await window.api.orders.update(orderId, { status: 'Void', voidReason: 'Resumed into active cart' })
    setActiveOrderId(orderId)
  }, [cart, handleHoldOrder])

  const handleNewOrder = useCallback(() => {
    if (cart.items.length > 0) handleHoldOrder()
    else { cart.clearCart(); setActiveOrderId(null) }
  }, [cart, handleHoldOrder])

  if (showSettings && user?.role === 'supervisor') {
    return <SupervisorSettings onBack={() => { setShowSettings(false); loadTaxConfig() }} />
  }

  return (
    <div className="flex h-screen flex-col bg-gray-100">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b bg-white px-5 py-2.5 shadow-sm">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-black tracking-tight text-primary">ServePOS</h1>
          <div className="flex items-center gap-1.5">
            {isOnline ? (
              <Wifi className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <WifiOff className="h-3.5 w-3.5 text-red-400" />
            )}
            <span className="text-[11px] text-gray-400">{isOnline ? 'Online' : 'Offline'}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Hold */}
          {cart.items.length > 0 && (
            <button onClick={handleHoldOrder}
              className="flex items-center gap-1.5 rounded-xl bg-amber-50 border-2 border-amber-200 px-4 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors">
              <PauseCircle className="h-4 w-4" />
              Hold Order
            </button>
          )}

          {/* Settings (supervisor only) */}
          {user?.role === 'supervisor' && (
            <button onClick={() => setShowSettings(true)}
              className="flex items-center gap-1.5 rounded-xl border-2 border-gray-200 px-4 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-50 transition-colors">
              <Settings className="h-4 w-4" />
              Settings
            </button>
          )}

          <div className="mx-1 h-8 w-px bg-gray-200" />

          {/* User */}
          <div className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
              {user?.name?.charAt(0)?.toUpperCase()}
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-700">{user?.name}</p>
              <p className="text-[10px] text-gray-400 capitalize">{user?.role}</p>
            </div>
          </div>
          <button onClick={logout}
            className="rounded-xl p-2 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Orders bar */}
      <OrdersBar activeOrderId={activeOrderId} onSelectOrder={handleResumeOrder} onNewOrder={handleNewOrder} />

      {/* Main: Items + Cart */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <ItemGrid />
        </div>
        <div className="w-[360px] flex-shrink-0 border-l shadow-lg">
          <Cart onPay={handlePay} taxRate={taxRate} taxLabel={taxLabel} />
        </div>
      </div>

      {/* Payment dialog */}
      {showPayment && (
        <PaymentDialog grandTotal={cart.getGrandTotal(taxRate)} onComplete={handlePaymentComplete} onCancel={() => setShowPayment(false)} />
      )}

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium shadow-lg transition-all ${
          toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
          {toast.message}
        </div>
      )}
    </div>
  )
}
