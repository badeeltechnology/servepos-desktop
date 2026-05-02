import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuthStore } from '../stores/auth'
import { useCartStore } from '../stores/cart'
import ItemGrid from '../components/ItemGrid'
import Cart from '../components/Cart'
import PaymentDialog from '../components/PaymentDialog'
import OrdersBar from '../components/OrdersBar'
import SupervisorSettings from './SupervisorSettings'
import CoordinatorScreen from './CoordinatorScreen'
import ReceiptPreview from '../components/ReceiptPreview'
import OpenShift from '../components/OpenShift'
import CloseShift from '../components/CloseShift'
import {
  LogOut, User, Users, PauseCircle, Settings, CheckCircle, AlertCircle, Wifi, WifiOff,
  ClipboardList, X, RotateCcw, Printer, DoorOpen, RefreshCw, ChefHat, Loader2
} from 'lucide-react'
import { useAppStore } from '../stores/app'

export default function POS() {
  const { user, logout } = useAuthStore()
  const cart = useCartStore()
  const isOnline = useAppStore((s) => s.isOnline)
  const [showPayment, setShowPayment] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null)
  const [isOrderPlaced, setIsOrderPlaced] = useState(false)
  const placedItemCount = useRef(0) // track item count at time of KOT
  const [taxRate, setTaxRate] = useState(0)
  const [taxLabel, setTaxLabel] = useState('VAT')
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null)
  const [processing, setProcessing] = useState(false)
  const [activeSession, setActiveSession] = useState<any>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [showCloseShift, setShowCloseShift] = useState(false)
  // currentTime removed — moved to isolated Clock component to prevent full POS re-renders
  const [nextSyncIn, setNextSyncIn] = useState<number | null>(null)
  const [waiterOrderCount, setWaiterOrderCount] = useState(0)
  const [showWaiterOrders, setShowWaiterOrders] = useState(false)
  const showWaiterOrdersRef = useRef(false)
  const [waiterOrders, setWaiterOrders] = useState<any[]>([])
  const [woProcessing, setWoProcessing] = useState<string | null>(null)

  // Keep ref in sync with state
  useEffect(() => { showWaiterOrdersRef.current = showWaiterOrders }, [showWaiterOrders])

  useEffect(() => { loadTaxConfig(); checkSession() }, [])

  // Clock moved to isolated <Clock /> component to avoid re-rendering entire POS every second

  // Sync status (10s) + waiter orders poll (10s) + invoice poll (10s)
  useEffect(() => {
    let polling = true

    const pollTimer = setInterval(async () => {
      if (!polling) return
      // Sync countdown — only update state if value changed
      try {
        const status = await window.api.sync.status()
        const newSync = status.nextSyncIn ?? null
        setNextSyncIn((prev) => prev === newSync ? prev : newSync)
      } catch {}
      // Waiter orders — only update state if count changed
      try {
        const orders = await window.api.waiterOrders.getPending()
        const count = orders?.length || 0
        setWaiterOrderCount((prev) => prev === count ? prev : count)
        if (count > 0) {
          setWaiterOrders(orders || [])
          if (!showWaiterOrdersRef.current) setShowWaiterOrders(true)
        } else if (showWaiterOrdersRef.current) {
          setWaiterOrders([])
        }
      } catch {}
      // Invoice auto-print for ready orders
      try { await window.api.print.pollReadyOrders() } catch {}
    }, 3000)

    // Initial load
    window.api.waiterOrders.getPending().then((o: any) => setWaiterOrderCount(o?.length || 0)).catch(() => {})
    window.api.sync.status().then((s: any) => setNextSyncIn(s.nextSyncIn ?? null)).catch(() => {})

    return () => { polling = false; clearInterval(pollTimer) }
  }, []) // No dependencies — interval runs once, uses refs for current state

  // Shift is closed only manually by the user via "Close Shift" button.

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000)
      return () => clearTimeout(t)
    }
  }, [toast])

  async function checkSession() {
    setSessionLoading(true)
    const session = await window.api.sessions.getActive()
    setActiveSession(session)
    setSessionLoading(false)
  }

  async function loadTaxConfig() {
    const config = await window.api.receiptConfig.getAll()
    const enabled = config.tax_enabled === '1'
    setTaxRate(enabled ? parseFloat(config.tax_rate || '0') : 0)
    setTaxLabel(config.tax_label || 'VAT')
  }


  // Re-show KOT button when new items are added after order was placed
  useEffect(() => {
    if (isOrderPlaced && activeOrderId && cart.items.length > placedItemCount.current) {
      setIsOrderPlaced(false)
    }
  }, [cart.items.length, isOrderPlaced, activeOrderId])

  // ==================== ORDER LIFECYCLE ====================
  //
  // An order is created ONCE and persists. Never voided on resume.
  //
  // Scenarios:
  // 1. Quick Pay:   Add items → Quick Pay → order created + KOT + payment → done
  // 2. Dine In:     Add items → Place Order (KOT) → customer eats → Payment → done
  // 3. Hold:        Add items → Place Order (KOT) → Hold → ... → Resume → Payment → done
  // 4. Hold before KOT: Add items → Hold → ... → Resume → Place Order (KOT) → Payment → done

  // Helper: save cart items to a new order in DB
  async function saveCartAsOrder(status: 'Open' | 'Hold'): Promise<any> {
    const order = await window.api.orders.create({
      orderType: cart.orderType,
      tableName: cart.tableName ?? null,
      room: cart.room ?? null,
      guests: cart.guests,
      cashierId: user!.id,
      cashierName: user!.name,
      sessionId: activeSession?.id || null,
      waiterId: cart.waiterId ?? null,
      waiterName: cart.waiterName ?? null
    })

    for (const item of cart.items) {
      const dbId = await window.api.orderItems.add({
        orderId: order.id,
        itemCode: item.itemCode,
        itemName: item.itemName,
        qty: item.qty,
        rate: item.rate,
        discountAmount: item.discountAmount,
        discountPercent: item.discountPercent,
        amount: item.amount,
        modifiers: item.modifiers.length > 0 ? JSON.stringify(item.modifiers) : null,
        modifierTotal: item.modifierTotal,
        specialInstructions: item.specialInstructions || null
      })
      // Mark item as saved so it won't be re-added on subsequent syncs
      ;(item as any).dbId = dbId
    }

    await window.api.orders.update(order.id, {
      status,
      subtotal: cart.getSubtotal(),
      discountAmount: cart.orderDiscountAmount,
      discountPercent: cart.orderDiscountPercent,
      discountReason: cart.orderDiscountReason || null,
      promoName: cart.promoName || null,
      orderNotes: cart.orderNotes || null,
      grandTotal: cart.getGrandTotal(taxRate)
    })

    return await window.api.orders.get(order.id)
  }

  // Place Order & Print KOT
  const handlePlaceOrder = useCallback(async () => {
    if (cart.items.length === 0) return
    setProcessing(true)
    try {
      let order: any

      if (activeOrderId) {
        // Order already exists — sync any new cart items to order_items
        for (const item of cart.items) {
          if (!(item as any).dbId) {
            const newId = await window.api.orderItems.add({
              orderId: activeOrderId,
              itemCode: item.itemCode,
              itemName: item.itemName,
              qty: item.qty,
              rate: item.rate,
              discountAmount: item.discountAmount,
              discountPercent: item.discountPercent,
              amount: item.amount,
              modifiers: item.modifiers.length > 0 ? JSON.stringify(item.modifiers) : null,
              modifierTotal: item.modifierTotal,
              specialInstructions: item.specialInstructions || null
            })
            // Store dbId so item isn't re-added on next place
            item.dbId = newId
          }
        }
        await window.api.orders.update(activeOrderId, {
          status: 'Open', kotPrinted: 1,
          subtotal: cart.getSubtotal(), grandTotal: cart.getGrandTotal(taxRate)
        })
        order = await window.api.orders.get(activeOrderId)
      } else {
        // New order
        order = await saveCartAsOrder('Open')
        await window.api.orders.update(order.id, { kotPrinted: 1 })
      }

      // Print KOT
      let kotResult: any
      try { kotResult = await window.api.print.kots(order.id, user?.name) } catch (e: any) { kotResult = { success: false, errors: [e.message] } }

      // Auto-print waiter copy if enabled
      try {
        const rc = await window.api.receiptConfig.getAll()
        if (rc.auto_print_waiter_copy === '1') {
          await window.api.print.waiterCopy(order.id)
        }
      } catch {}

      setActiveOrderId(order.id)
      setIsOrderPlaced(true)
      placedItemCount.current = cart.items.length
      if (kotResult?.success === false || (kotResult?.errors && kotResult.errors.length > 0)) {
        setToast({ type: 'error', message: `Order placed but KOT print failed: ${kotResult?.errors?.join(', ') || 'Unknown error'}` })
      } else {
        setToast({ type: 'success', message: `Order ${order.order_number} placed — KOT printed` })
      }
    } catch (err: any) {
      setToast({ type: 'error', message: `Failed: ${err.message}` })
    } finally {
      setProcessing(false)
    }
  }, [cart, user, taxRate, activeOrderId, activeSession])

  // Update order without printing KOT (e.g. adding water before payment)
  const handleUpdateOnly = useCallback(async () => {
    if (!activeOrderId || cart.items.length === 0) return
    setProcessing(true)
    try {
      // Sync new cart items to order_items
      for (const item of cart.items) {
        if (!(item as any).dbId) {
          const newId = await window.api.orderItems.add({
            orderId: activeOrderId,
            itemCode: item.itemCode,
            itemName: item.itemName,
            qty: item.qty,
            rate: item.rate,
            discountAmount: item.discountAmount,
            discountPercent: item.discountPercent,
            amount: item.amount,
            modifiers: item.modifiers.length > 0 ? JSON.stringify(item.modifiers) : null,
            modifierTotal: item.modifierTotal,
            specialInstructions: item.specialInstructions || null
          })
          ;(item as any).dbId = newId
        }
      }
      await window.api.orders.update(activeOrderId, {
        subtotal: cart.getSubtotal(), grandTotal: cart.getGrandTotal(taxRate)
      })
      setIsOrderPlaced(true)
      placedItemCount.current = cart.items.length
      setToast({ type: 'success', message: 'Order updated (no KOT)' })
    } catch (err: any) {
      setToast({ type: 'error', message: `Update failed: ${err.message}` })
    } finally {
      setProcessing(false)
    }
  }, [cart, taxRate, activeOrderId])

  // Open payment dialog
  const handlePay = useCallback(() => {
    if (cart.items.length === 0) return
    setShowPayment(true)
  }, [cart.items])

  // Complete payment
  const handlePaymentComplete = useCallback(
    async (payments: { method: string; amount: number; reference: string }[], collectedByWaiter: string | null, tipAmount?: number) => {
      setProcessing(true)
      try {
        let orderId = activeOrderId
        let order: any

        if (orderId) {
          // Existing order — just add payment
          order = await window.api.orders.get(orderId)
        } else {
          // Quick Pay — create order now. Skip KOT print: Quick Pay is for
          // walk-in items where the customer pays immediately and only the
          // receipt is needed; kitchen doesn't need a separate KOT.
          order = await saveCartAsOrder('Open')
          orderId = order.id
        }

        if (!order) throw new Error('Order not found')

        // Compute subtotal from order_items (source of truth for receipt)
        const dbItems = await window.api.orderItems.get(orderId!)
        const itemsSubtotal = dbItems.reduce((sum: number, i: any) => sum + i.amount, 0)

        // Add payments with waiter collection tracking
        for (const p of payments) {
          await window.api.orderPayments.add(orderId!, p.method, p.amount, p.reference || null, collectedByWaiter || undefined)
        }

        // Compute discount & totals from order_items subtotal
        const discountPct = cart.orderDiscountPercent
        const discountAmt = cart.orderDiscountAmount
        const orderDiscount = itemsSubtotal * (discountPct / 100) + discountAmt
        const afterDiscount = Math.max(0, itemsSubtotal - orderDiscount)
        const taxTotal = afterDiscount * (taxRate / 100)

        // Complete the order
        await window.api.orders.update(orderId!, {
          status: 'Completed',
          subtotal: itemsSubtotal,
          taxTotal,
          discountAmount: discountAmt,
          discountPercent: discountPct,
          discountReason: cart.orderDiscountReason || null,
          promoName: cart.promoName || null,
          voucherCode: cart.voucherCode || null,
          tipAmount: tipAmount || 0,
          orderNotes: cart.orderNotes || null,
          grandTotal: Math.max(0, afterDiscount + taxTotal),
          completedAt: new Date().toISOString()
        })

        // Free table
        if (cart.tableName) {
          await window.api.tables.updateStatus(cart.tableName, 'Available')
        }

        // Print receipt — show an intermediate indicator so the cashier
        // knows something is happening while the printer warms up.
        setToast({ type: 'info', message: 'Printing receipt…' })
        let receiptResult: any
        try { receiptResult = await window.api.print.receipt(orderId!) } catch (e: any) { receiptResult = { success: false, error: e.message } }

        cart.clearCart(); setIsOrderPlaced(false)
        setShowPayment(false)
        setActiveOrderId(null)
        if (receiptResult?.success === false) {
          setToast({ type: 'error', message: `Order completed but receipt print failed: ${receiptResult?.error || 'Check printer'}` })
        } else {
          setToast({ type: 'success', message: `Order ${order.order_number} completed — receipt printed` })
        }
      } catch (err: any) {
        setToast({ type: 'error', message: `Payment failed: ${err.message}` })
      } finally {
        setProcessing(false)
      }
    },
    [cart, user, taxRate, activeOrderId, activeSession]
  )

  // Hold order
  const handleHoldOrder = useCallback(async () => {
    if (cart.items.length === 0) return
    try {
      let order: any

      if (activeOrderId) {
        // Order already saved — just change status to Hold
        await window.api.orders.update(activeOrderId, { status: 'Hold' })
        order = await window.api.orders.get(activeOrderId)
      } else {
        // Not saved yet — create as Hold + print KOT so kitchen starts
        order = await saveCartAsOrder('Hold')
        try {
          const kotRes = await window.api.print.kots(order.id, user?.name)
          if (kotRes?.success === false) setToast({ type: 'error', message: `KOT print failed: ${kotRes?.errors?.join(', ') || 'Check printer'}` })
        } catch {}
      }

      cart.clearCart(); setIsOrderPlaced(false)
      setActiveOrderId(null)
      setToast({ type: 'success', message: `Order held: ${order.order_number}` })
    } catch (err: any) {
      setToast({ type: 'error', message: `Hold failed: ${err.message}` })
    }
  }, [cart, user, taxRate, activeOrderId, activeSession])

  // Resume a held/open order — load into cart, NO voiding
  const handleResumeOrder = useCallback(async (orderId: string) => {
    const order = await window.api.orders.get(orderId)
    if (!order) return

    // Skip already-completed or voided orders (prevents reloading a paid order)
    if (order.status === 'Completed' || order.status === 'Void' || order.status === 'Returned') return

    // If cart has items linked to another order, ask to hold
    if (cart.items.length > 0 && activeOrderId && activeOrderId !== orderId) {
      const hold = confirm('Hold current order before switching?')
      if (hold) await handleHoldOrder()
      else return
    } else if (cart.items.length > 0 && !activeOrderId) {
      if (!confirm('Discard current cart items?')) return
    }

    // Load order items into cart
    const items = await window.api.orderItems.get(orderId)
    cart.clearCart(); setIsOrderPlaced(false)
    cart.setOrderType(order.order_type)
    if (order.table_name) cart.setTable(order.table_name, order.room)
    if (order.guests) cart.setGuests(order.guests)
    if (order.order_notes) cart.setOrderNotes(order.order_notes)
    if (order.waiter_id || order.waiter_name) cart.setWaiter(order.waiter_id || null, order.waiter_name || null)

    // Restore discount/promo/voucher
    if (order.voucher_code) {
      cart.setVoucher(order.voucher_code, order.discount_percent || 0)
    } else if (order.promo_name) {
      cart.setPromo(order.promo_name, 'Percentage', order.discount_percent || 0)
    } else if (order.discount_percent > 0 || order.discount_amount > 0) {
      cart.setOrderDiscount(order.discount_percent || 0, order.discount_amount || 0, order.discount_reason || '')
    }

    for (const item of items) {
      cart.addItem({
        dbId: item.id,
        itemCode: item.item_code, itemName: item.item_name, qty: item.qty, rate: item.rate,
        modifiers: item.modifiers ? (function(){ try { return JSON.parse(item.modifiers) } catch { return [] } })() : [],
        specialInstructions: item.special_instructions || null
      } as any)
    }

    // Change status from Hold to Open (NO voiding)
    if (order.status === 'Hold') {
      await window.api.orders.update(orderId, { status: 'Open' })
    }

    setActiveOrderId(orderId)
    setIsOrderPlaced(!!order.kot_printed)
    placedItemCount.current = items.length
  }, [cart, activeOrderId, handleHoldOrder])

  // New order
  const handleNewOrder = useCallback(() => {
    if (cart.items.length > 0) {
      if (activeOrderId) {
        const hold = confirm('Hold current order before starting a new one?')
        if (hold) { handleHoldOrder(); return }
      }
      if (!confirm('Discard current cart items?')) return
    }
    cart.clearCart(); setIsOrderPlaced(false)
    setActiveOrderId(null)
  }, [cart, activeOrderId, handleHoldOrder])


  const [showOrderHistory, setShowOrderHistory] = useState(false)
  const [showCoordinator, setShowCoordinator] = useState(false)
  const [barVoidRequest, setBarVoidRequest] = useState<{ orderId: string; reason: string } | null>(null)
  const [barVoidReasons, setBarVoidReasons] = useState<{ name: string; reason_name: string }[]>([])
  const [barVoidCustom, setBarVoidCustom] = useState(false)

  useEffect(() => {
    window.api.voidReasons.list().then((r: any) => setBarVoidReasons(r || [])).catch(() => {})
  }, [])

  if (showSettings && user?.role === 'supervisor') {
    return <SupervisorSettings onBack={() => { setShowSettings(false); loadTaxConfig() }} />
  }

  if (showCoordinator) {
    return <CoordinatorScreen onBack={() => setShowCoordinator(false)} />
  }

  // Show loading while checking session
  if (sessionLoading) {
    return <div className="flex h-screen items-center justify-center bg-gray-100"><p className="text-gray-400">Loading...</p></div>
  }

  // Show Open Shift screen if no active session
  if (!activeSession) {
    return (
      <div className="flex h-screen flex-col bg-gray-100">
        <header className="flex items-center justify-between border-b bg-white px-5 py-2.5 shadow-sm">
          <h1 className="text-xl font-black tracking-tight text-primary">ServePOS</h1>
          <button onClick={logout} className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <LogOut className="h-4 w-4" /> Logout
          </button>
        </header>
        <div className="flex-1">
          <OpenShift
            userName={user?.name || ''}
            userId={user?.id || ''}
            onOpen={(sessionId) => { setActiveSession({ id: sessionId }); checkSession() }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-gray-100">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b bg-white px-5 py-2.5 shadow-sm">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-black tracking-tight text-primary">ServePOS</h1>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              {isOnline ? (
                <Wifi className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <WifiOff className="h-3.5 w-3.5 text-red-400" />
              )}
              <span className="text-[11px] text-gray-400">{isOnline ? 'Online' : 'Offline'}</span>
            </div>
            <div className="h-4 w-px bg-gray-200" />
            <div className="text-[11px] text-gray-400">
              <Clock />
            </div>
            {nextSyncIn !== null && (
              <>
                <div className="h-4 w-px bg-gray-200" />
                <span className="text-[10px] text-gray-400">
                  Sync in {nextSyncIn > 60 ? `${Math.floor(nextSyncIn / 60)}m ${nextSyncIn % 60}s` : `${nextSyncIn}s`}
                </span>
              </>
            )}
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

          {/* Close Shift */}
          <button onClick={() => setShowCloseShift(true)}
            className="flex items-center gap-1.5 rounded-xl bg-red-50 border-2 border-red-200 px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors">
            <DoorOpen className="h-4 w-4" />
            Close Shift
          </button>

          {/* Waiter Orders */}
          <button onClick={async () => {
            const orders = await window.api.waiterOrders.getPending()
            setWaiterOrders(orders || [])
            setShowWaiterOrders(true)
          }}
            className={`relative flex items-center gap-1.5 rounded-xl border-2 px-4 py-2 text-xs font-semibold transition-colors ${waiterOrderCount > 0 ? 'border-orange-300 bg-orange-50 text-orange-700 animate-pulse' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
            <Users className="h-4 w-4" />
            Waiter
            {waiterOrderCount > 0 && (
              <span className="ml-1 rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{waiterOrderCount}</span>
            )}
          </button>

          {/* Coordinator View */}
          <button onClick={() => setShowCoordinator(true)}
            className="flex items-center gap-1.5 rounded-xl border-2 border-gray-200 px-4 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-50 transition-colors">
            <ChefHat className="h-4 w-4" />
            Kitchen
          </button>

          {/* Orders History */}
          <button onClick={() => setShowOrderHistory(true)}
            className="flex items-center gap-1.5 rounded-xl border-2 border-gray-200 px-4 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-50 transition-colors">
            <ClipboardList className="h-4 w-4" />
            Orders
          </button>

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
      <OrdersBar activeOrderId={activeOrderId} onSelectOrder={handleResumeOrder} onNewOrder={handleNewOrder}
        onVoidOrder={user?.role === 'supervisor' ? (orderId) => {
          setBarVoidRequest({ orderId, reason: '' }); setBarVoidCustom(false)
        } : undefined}
      />

      {/* OrdersBar void reason modal */}
      {barVoidRequest && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="w-80 rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="mb-1 text-center text-lg font-bold">Void Reason</h3>
            <p className="mb-4 text-center text-xs text-gray-500">Select or enter a reason (required)</p>
            {barVoidReasons.length > 0 && !barVoidCustom ? (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {barVoidReasons.map((r) => (
                  <button key={r.name}
                    onClick={async () => {
                      const oid = barVoidRequest.orderId
                      await window.api.orders.update(oid, { status: 'Void', voidReason: r.reason_name })
                      try { await window.api.print.voidSlip(oid, r.reason_name, user?.name || 'Supervisor') } catch {}
                      if (activeOrderId === oid) { cart.clearCart(); setActiveOrderId(null); setIsOrderPlaced(false) }
                      const order = await window.api.orders.get(oid)
                      if (order?.table_name) await window.api.tables.updateStatus(order.table_name, 'Available').catch(() => {})
                      setBarVoidRequest(null)
                    }}
                    className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-left text-sm font-medium hover:bg-red-50 hover:border-red-200 transition-colors">
                    {r.reason_name}
                  </button>
                ))}
                <button onClick={() => setBarVoidCustom(true)}
                  className="w-full rounded-xl border-2 border-dashed border-gray-200 px-4 py-3 text-left text-sm text-gray-500 hover:bg-gray-50">
                  Other (type reason)...
                </button>
              </div>
            ) : (
              <>
                <input type="text" data-keyboard="full" value={barVoidRequest.reason} autoFocus
                  onChange={(e) => setBarVoidRequest({ ...barVoidRequest, reason: e.target.value })}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' && barVoidRequest.reason.trim()) {
                      const oid = barVoidRequest.orderId; const reason = barVoidRequest.reason.trim()
                      await window.api.orders.update(oid, { status: 'Void', voidReason: reason })
                      try { await window.api.print.voidSlip(oid, reason, user?.name || 'Supervisor') } catch {}
                      if (activeOrderId === oid) { cart.clearCart(); setActiveOrderId(null); setIsOrderPlaced(false) }
                      const order = await window.api.orders.get(oid)
                      if (order?.table_name) await window.api.tables.updateStatus(order.table_name, 'Available').catch(() => {})
                      setBarVoidRequest(null)
                    }
                  }}
                  placeholder="Enter void reason..."
                  className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm focus:border-primary focus:outline-none" />
                <div className="mt-4 flex gap-3">
                  {barVoidReasons.length > 0 && (
                    <button onClick={() => setBarVoidCustom(false)}
                      className="rounded-xl border-2 border-gray-200 px-4 py-2.5 text-sm font-semibold hover:bg-gray-50">
                      Back
                    </button>
                  )}
                  <button onClick={async () => {
                    if (!barVoidRequest.reason.trim()) return
                    const oid = barVoidRequest.orderId; const reason = barVoidRequest.reason.trim()
                    await window.api.orders.update(oid, { status: 'Void', voidReason: reason })
                    try { await window.api.print.voidSlip(oid, reason, user?.name || 'Supervisor') } catch {}
                    if (activeOrderId === oid) { cart.clearCart(); setActiveOrderId(null); setIsOrderPlaced(false) }
                    const order = await window.api.orders.get(oid)
                    if (order?.table_name) await window.api.tables.updateStatus(order.table_name, 'Available').catch(() => {})
                    setBarVoidRequest(null)
                  }} disabled={!barVoidRequest.reason.trim()}
                    className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50">
                    Void Order
                  </button>
                </div>
              </>
            )}
            <button onClick={() => { setBarVoidRequest(null); setBarVoidCustom(false) }}
              className="mt-3 w-full rounded-xl border-2 border-gray-200 py-2.5 text-sm font-semibold text-gray-500 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Main: Items + Cart */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <ItemGrid isOrderPlaced={isOrderPlaced} />
        </div>
        <div className="w-[360px] flex-shrink-0 border-l shadow-lg">
          <Cart onPlaceOrder={handlePlaceOrder} onUpdateOnly={activeOrderId ? handleUpdateOnly : undefined} onPay={handlePay} taxRate={taxRate} taxLabel={taxLabel} isOrderPlaced={isOrderPlaced} activeOrderId={activeOrderId} processing={processing}
            onItemRemoved={activeOrderId ? async (orderId, item, reason) => {
              // Flag item as voided in DB (keeps audit trail, excludes from receipt)
              if (item.dbId) {
                try { await window.api.orderItems.void(item.dbId, reason, user?.name || '') } catch {}
              }
              // Update order totals (getOrderItems already excludes voided)
              const dbItems = await window.api.orderItems.get(orderId)
              const newSubtotal = dbItems.reduce((s: number, i: any) => s + i.amount, 0)
              await window.api.orders.update(orderId, { subtotal: newSubtotal, grandTotal: newSubtotal })
              // Print void slip
              try { await window.api.print.voidSlip(orderId, reason, user?.name || '', [item]) } catch {}
            } : undefined}
            onAutoVoid={activeOrderId ? async (reason) => {
              const voidReason = reason || 'All items removed'
              await window.api.orders.update(activeOrderId, { status: 'Void', voidReason })
              try { await window.api.print.voidSlip(activeOrderId, voidReason, user?.name || '') } catch {}
              const order = await window.api.orders.get(activeOrderId)
              if (order?.table_name) await window.api.tables.updateStatus(order.table_name, 'Available').catch(() => {})
              cart.clearCart(); setActiveOrderId(null); setIsOrderPlaced(false)
              setToast({ type: 'success', message: 'Order voided — all items removed' })
            } : undefined}
          />
        </div>
      </div>

      {/* Payment dialog */}
      {showPayment && (
        <PaymentDialog grandTotal={cart.getGrandTotal(taxRate)} orderWaiterName={cart.waiterName} processing={processing} onComplete={handlePaymentComplete} onCancel={() => setShowPayment(false)} />
      )}

      {/* Waiter Orders Panel — Full screen for supervisor/coordinator, corner toast for cashier */}
      {showWaiterOrders && user?.role === 'cashier' && waiterOrders.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 w-[360px] max-h-[50vh] overflow-y-auto rounded-2xl border-2 border-orange-200 bg-white shadow-2xl">
          <div className="sticky top-0 flex items-center justify-between border-b bg-orange-50 px-4 py-3 rounded-t-2xl">
            <div className="flex items-center gap-2">
              <ChefHat className="h-4 w-4 text-orange-600" />
              <span className="text-sm font-bold text-orange-700">{waiterOrders.length} Waiter Order{waiterOrders.length !== 1 ? 's' : ''}</span>
            </div>
            <button onClick={() => setShowWaiterOrders(false)} className="rounded-lg p-1 hover:bg-orange-100">
              <X className="h-4 w-4 text-orange-500" />
            </button>
          </div>
          <div className="p-3 space-y-2">
            {waiterOrders.map((wo: any) => (
              <div key={wo.name} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-gray-50">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-orange-600">{wo.waiter_name}</span>
                    {wo.table && <span className="text-[10px] rounded bg-blue-50 px-1.5 py-0.5 text-blue-600">T:{wo.table}</span>}
                  </div>
                  <span className="text-xs font-bold text-primary">
                    {(wo.items || []).reduce((s: number, i: any) => s + ((i.rate + (i.modifier_total || 0)) * i.qty), 0).toFixed(2)}
                  </span>
                </div>
                <div className="px-3 py-1.5">
                  {(wo.items || []).slice(0, 3).map((item: any, i: number) => (
                    <p key={i} className="text-[11px] text-gray-600">{item.qty}x {item.item_name}</p>
                  ))}
                  {(wo.items || []).length > 3 && <p className="text-[10px] text-gray-400">+{(wo.items || []).length - 3} more</p>}
                </div>
                <WaiterOrderActions
                  woName={wo.name}
                  processing={woProcessing === wo.name}
                  onAccept={async () => {
                    setWoProcessing(wo.name)
                    const res = await window.api.waiterOrders.accept(wo.name)
                    if (res.success) {
                      const msg = res.kotPrinted ? `Order #${res.orderNumber} accepted — KOT printed` : `Order #${res.orderNumber} accepted${res.kotError ? ` (KOT failed: ${res.kotError})` : ''}`
                      setToast({ type: res.kotPrinted ? 'success' : 'error', message: msg })
                    } else {
                      setToast({ type: 'error', message: `Failed: ${res.error}` })
                    }
                    const orders = await window.api.waiterOrders.getPending()
                    setWaiterOrders(orders || [])
                    setWaiterOrderCount(orders?.length || 0)
                    if ((orders?.length || 0) === 0) setShowWaiterOrders(false)
                    setWoProcessing(null)
                  }}
                  onReject={async () => {
                    if (!confirm('Reject this order?')) return
                    await window.api.waiterOrders.reject(wo.name)
                    const orders = await window.api.waiterOrders.getPending()
                    setWaiterOrders(orders || [])
                    setWaiterOrderCount(orders?.length || 0)
                    if ((orders?.length || 0) === 0) setShowWaiterOrders(false)
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full-screen waiter orders panel for supervisor/coordinator */}
      {showWaiterOrders && user?.role !== 'cashier' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="max-h-[80vh] w-[600px] overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between border-b bg-white px-6 py-4">
              <div>
                <h2 className="text-lg font-bold">Waiter Orders</h2>
                <p className="text-xs text-muted-foreground">{waiterOrders.length} pending order(s)</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={async () => {
                  const orders = await window.api.waiterOrders.getPending()
                  setWaiterOrders(orders || [])
                }} className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted">Refresh</button>
                <button onClick={() => setShowWaiterOrders(false)} className="rounded-lg p-2 hover:bg-muted">
                  <span className="text-lg leading-none">&times;</span>
                </button>
              </div>
            </div>
            <div className="p-4">
              {waiterOrders.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No pending waiter orders</p>
              ) : (
                <div className="space-y-3">
                  {waiterOrders.map((wo: any) => (
                    <div key={wo.name} className="rounded-xl border-2 border-orange-200 bg-white overflow-hidden">
                      <div className="flex items-center justify-between bg-orange-50 px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-700">{wo.name}</span>
                          <span className="text-sm font-semibold">{wo.waiter_name}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{wo.order_type}</span>
                          {wo.table && <span className="rounded bg-blue-50 px-2 py-0.5 font-medium text-blue-700">Table: {wo.table}</span>}
                          {wo.guests > 0 && <span>Guests: {wo.guests}</span>}
                        </div>
                      </div>
                      <div className="px-4 py-2">
                        {(wo.items || []).map((item: any, i: number) => (
                          <div key={i} className="flex justify-between py-0.5 text-sm">
                            <span>{item.qty}x {item.item_name}</span>
                            <span className="font-medium">{((item.rate + (item.modifier_total || 0)) * item.qty).toFixed(2)}</span>
                          </div>
                        ))}
                        <div className="mt-1 flex justify-between border-t pt-1 font-bold">
                          <span>Total</span>
                          <span className="text-primary">{(wo.items || []).reduce((s: number, i: any) => s + ((i.rate + (i.modifier_total || 0)) * i.qty), 0).toFixed(2)} QAR</span>
                        </div>
                      </div>
                      <WaiterOrderActions
                        woName={wo.name}
                        processing={woProcessing === wo.name}
                        onAccept={async () => {
                          setWoProcessing(wo.name)
                          const res = await window.api.waiterOrders.accept(wo.name)
                          if (res.success) {
                            setToast({ type: 'success', message: `Waiter order accepted — KOT printed` })
                          } else {
                            setToast({ type: 'error', message: `Failed: ${res.error}` })
                          }
                          const orders = await window.api.waiterOrders.getPending()
                          setWaiterOrders(orders || [])
                          setWaiterOrderCount(orders?.length || 0)
                          if ((orders?.length || 0) === 0) setShowWaiterOrders(false)
                          setWoProcessing(null)
                        }}
                        onReject={async () => {
                          if (!confirm('Reject this order?')) return
                          await window.api.waiterOrders.reject(wo.name)
                          const orders = await window.api.waiterOrders.getPending()
                          setWaiterOrders(orders || [])
                          setWaiterOrderCount(orders?.length || 0)
                          if ((orders?.length || 0) === 0) setShowWaiterOrders(false)
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Order History Panel */}
      {showOrderHistory && (
        <OrderHistoryPanel
          onClose={() => setShowOrderHistory(false)}
          isSupervisor={user?.role === 'supervisor'}
          cashierId={user?.role === 'cashier' ? user.id : null}
        />
      )}

      {/* Close Shift */}
      {showCloseShift && activeSession && (
        <CloseShift
          sessionId={activeSession.id}
          onClose={() => {
            setShowCloseShift(false)
            setActiveSession(null)
            cart.clearCart(); setIsOrderPlaced(false)
            setToast({ type: 'success', message: 'Shift closed successfully' })
          }}
          onCancel={() => setShowCloseShift(false)}
        />
      )}

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium shadow-lg transition-all ${
          toast.type === 'success' ? 'bg-emerald-600 text-white'
            : toast.type === 'info' ? 'bg-blue-600 text-white'
            : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="h-5 w-5" />
            : toast.type === 'info' ? <Loader2 className="h-5 w-5 animate-spin" />
            : <AlertCircle className="h-5 w-5" />}
          {toast.message}
        </div>
      )}
    </div>
  )
}

// ==================== Order History Panel ====================
function OrderHistoryPanel({ onClose, isSupervisor, cashierId }: {
  onClose: () => void
  isSupervisor: boolean
  cashierId: string | null
}) {
  const [orders, setOrders] = useState<any[]>([])
  const [filter, setFilter] = useState('all')
  const [selectedOrder, setSelectedOrder] = useState<any>(null)
  const [orderItems, setOrderItems] = useState<any[]>([])
  const [orderPayments, setOrderPayments] = useState<any[]>([])
  const [voidRequest, setVoidRequest] = useState<{ orderId: string; step: 'pin' | 'reason'; reason: string } | null>(null)
  const [voidPin, setVoidPin] = useState('')
  const [voidPinError, setVoidPinError] = useState('')
  const [voidReasons, setVoidReasons] = useState<{ name: string; reason_name: string }[]>([])
  const [showCustomReason, setShowCustomReason] = useState(false)

  useEffect(() => { loadOrders(); loadVoidReasons() }, [filter])

  async function loadVoidReasons() {
    try {
      const reasons = await window.api.voidReasons.list()
      setVoidReasons(reasons || [])
    } catch {}
  }

  async function loadOrders() {
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const filters: any = { date: today }
    if (filter !== 'all') filters.status = filter
    // Cashier only sees own orders
    if (cashierId) filters.cashierId = cashierId
    const data = await window.api.orders.getAll(filters)
    setOrders(data)
  }

  async function viewOrderDetail(order: any) {
    setSelectedOrder(order)
    const [items, payments] = await Promise.all([
      window.api.orderItems.get(order.id),
      window.api.orderPayments.get(order.id)
    ])
    setOrderItems(items)
    setOrderPayments(payments)
  }

  function voidOrder(id: string) {
    // Always start with reason selection, then PIN if not supervisor
    setVoidRequest({ orderId: id, step: 'reason', reason: '' })
    setShowCustomReason(false)
    setVoidPin('')
    setVoidPinError('')
  }

  async function doVoidOrder(id: string, reason: string) {
    await window.api.orders.update(id, { status: 'Void', voidReason: reason })
    // Print void slip
    try { await window.api.print.voidSlip(id, reason, cashierId ? 'Cashier' : 'Supervisor') } catch {}
    // Free table if applicable
    const order = orders.find((o) => o.id === id)
    if (order?.table_name) {
      await window.api.tables.updateStatus(order.table_name, 'Available').catch(() => {})
    }
    loadOrders()
    setSelectedOrder(null)
    setVoidRequest(null)
  }

  const [previewOrderId, setPreviewOrderId] = useState<string | null>(null)

  // Count summaries
  const completedCount = orders.filter((o) => o.status === 'Completed').length
  const openCount = orders.filter((o) => o.status === 'Open').length
  const holdCount = orders.filter((o) => o.status === 'Hold').length
  const totalSales = orders.filter((o) => o.status === 'Completed').reduce((s, o) => s + (o.grand_total || 0), 0)
  const pendingSyncCount = orders.filter((o) => o.sync_status === 'pending' && o.status === 'Completed').length
  const syncedCount = orders.filter((o) => o.sync_status === 'synced').length
  const failedSyncCount = orders.filter((o) => o.sync_status === 'failed').length

  const statusColors: Record<string, string> = {
    Completed: 'bg-emerald-50 text-emerald-700',
    Open: 'bg-blue-50 text-blue-700',
    Hold: 'bg-amber-50 text-amber-700',
    Void: 'bg-red-50 text-red-700',
    Returned: 'bg-gray-100 text-gray-600'
  }

  return (
    <div className="fixed inset-0 z-50 flex bg-black/60 backdrop-blur-sm">
      <div className="flex flex-1 flex-col bg-white shadow-2xl mx-4 my-4 rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-xl font-bold">Today's Orders</h2>
            <div className="mt-1 flex items-center gap-4 text-xs text-gray-500">
              <span className="font-medium text-emerald-600">{completedCount} completed</span>
              <span className="font-medium text-blue-600">{openCount} open</span>
              <span className="font-medium text-amber-600">{holdCount} on hold</span>
              <span className="text-gray-400">|</span>
              <span className="font-bold text-gray-700">Total: {totalSales.toFixed(2)}</span>
              <span className="text-gray-400">|</span>
              {syncedCount > 0 && <span className="text-emerald-500">{syncedCount} synced</span>}
              {pendingSyncCount > 0 && <span className="text-amber-500">{pendingSyncCount} pending sync</span>}
              {failedSyncCount > 0 && <span className="text-red-500">{failedSyncCount} sync failed</span>}
            </div>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 border-b px-6 py-3">
          {['all', 'Completed', 'Open', 'Hold', 'Void'].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition-all active:scale-95 ${
                filter === f ? 'bg-primary text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}>
              {f === 'all' ? 'All' : f}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Order list */}
          <div className="flex-1 overflow-y-auto">
            {orders.length === 0 ? (
              <div className="flex h-full items-center justify-center text-gray-400">
                <p>No orders found</p>
              </div>
            ) : (
              <div className="divide-y">
                {orders.map((o) => (
                  <button key={o.id} onClick={() => viewOrderDetail(o)}
                    className={`flex w-full items-center justify-between px-6 py-4 text-left transition-colors hover:bg-gray-50 ${
                      selectedOrder?.id === o.id ? 'bg-primary/5' : ''
                    }`}>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold">{o.order_number}</span>
                        <span className={`rounded-lg px-2 py-0.5 text-[10px] font-bold ${statusColors[o.status] || 'bg-gray-100'}`}>
                          {o.status}
                        </span>
                        {o.status === 'Completed' && (
                          <span className={`rounded-lg px-2 py-0.5 text-[10px] font-bold ${
                            o.sync_status === 'synced' ? 'bg-emerald-50 text-emerald-600' :
                            o.sync_status === 'failed' ? 'bg-red-50 text-red-600' :
                            'bg-gray-100 text-gray-400'
                          }`}>
                            {o.sync_status === 'synced' ? 'Synced' : o.sync_status === 'failed' ? 'Sync Failed' : 'Pending Sync'}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
                        <span>{o.order_type}</span>
                        {o.table_name && <span>Table: {o.table_name}</span>}
                        <span>{o.cashier_name}</span>
                        <span>{new Date(o.created_at + 'Z').toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                    <span className="text-lg font-bold text-gray-800">{(o.grand_total || 0).toFixed(2)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Order detail sidebar */}
          {selectedOrder && (
            <div className="w-[380px] flex-shrink-0 border-l overflow-y-auto bg-gray-50 p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-bold">{selectedOrder.order_number}</h3>
                <span className={`rounded-lg px-3 py-1 text-xs font-bold ${statusColors[selectedOrder.status]}`}>
                  {selectedOrder.status}
                </span>
              </div>

              <div className="mb-4 grid grid-cols-2 gap-2 text-xs text-gray-500">
                <span>Type: <strong className="text-gray-700">{selectedOrder.order_type}</strong></span>
                {selectedOrder.table_name && <span>Table: <strong className="text-gray-700">{selectedOrder.table_name}</strong></span>}
                <span>Cashier: <strong className="text-gray-700">{selectedOrder.cashier_name}</strong></span>
                <span>Time: <strong className="text-gray-700">{new Date(selectedOrder.created_at + 'Z').toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</strong></span>
              </div>

              {/* Items */}
              <div className="mb-4 rounded-xl border bg-white p-4">
                <h4 className="mb-2 text-xs font-bold text-gray-400 uppercase">Items</h4>
                <div className="space-y-2">
                  {orderItems.map((item) => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <div>
                        <span className="font-medium">{item.qty}x {item.item_name}</span>
                        {item.modifiers && JSON.parse(item.modifiers).map((m: any, i: number) => (
                          <p key={i} className="text-xs text-gray-400 ml-4">+ {m.name} {m.price > 0 ? `(${m.price.toFixed(2)})` : ''}</p>
                        ))}
                        {item.special_instructions && (
                          <p className="text-xs text-amber-600 ml-4">"{item.special_instructions}"</p>
                        )}
                      </div>
                      <span className="font-medium">{item.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals */}
              <div className="mb-4 rounded-xl border bg-white p-4 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{(selectedOrder.subtotal || 0).toFixed(2)}</span></div>
                {(selectedOrder.discount_amount > 0 || selectedOrder.discount_percent > 0) && (
                  <div className="flex justify-between text-emerald-600"><span>Discount</span><span>-{((selectedOrder.discount_amount || 0) + (selectedOrder.subtotal || 0) * (selectedOrder.discount_percent || 0) / 100).toFixed(2)}</span></div>
                )}
                {selectedOrder.tax_total > 0 && (
                  <div className="flex justify-between"><span className="text-gray-500">Tax</span><span>{selectedOrder.tax_total.toFixed(2)}</span></div>
                )}
                <div className="flex justify-between border-t pt-1 mt-1 font-bold text-base">
                  <span>Total</span><span className="text-primary">{(selectedOrder.grand_total || 0).toFixed(2)}</span>
                </div>
              </div>

              {/* Payments */}
              {orderPayments.length > 0 && (
                <div className="mb-4 rounded-xl border bg-white p-4">
                  <h4 className="mb-2 text-xs font-bold text-gray-400 uppercase">Payments</h4>
                  {orderPayments.map((p) => (
                    <div key={p.id} className="flex justify-between text-sm">
                      <span>{p.payment_method}</span>
                      <span className="font-medium">{p.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Void reason */}
              {selectedOrder.void_reason && (
                <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-600">
                  <strong>Void reason:</strong> {selectedOrder.void_reason}
                </div>
              )}

              {/* Sync error */}
              {selectedOrder.sync_error && (
                <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700">
                  <strong>Sync error:</strong> {selectedOrder.sync_error}
                </div>
              )}

              {/* Sync info */}
              {selectedOrder.erpnext_docname && (
                <div className="mb-4 rounded-xl bg-gray-50 p-3 text-xs text-gray-500">
                  <strong>ERPNext:</strong> {selectedOrder.erpnext_docname}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                {selectedOrder.status === 'Completed' && (
                  <>
                    <button onClick={() => setPreviewOrderId(selectedOrder.id)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-gray-200 py-2.5 text-xs font-semibold text-gray-500 hover:bg-white active:scale-95">
                      <Printer className="h-3.5 w-3.5" />
                      Reprint
                    </button>
                    {isSupervisor && (
                      <button onClick={() => voidOrder(selectedOrder.id)}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-red-200 py-2.5 text-xs font-semibold text-red-500 hover:bg-red-50 active:scale-95">
                        <RotateCcw className="h-3.5 w-3.5" />
                        Void
                      </button>
                    )}
                  </>
                )}
                {selectedOrder.status === 'Void' && (
                  <button onClick={async () => {
                    try { await window.api.print.voidSlip(selectedOrder.id, selectedOrder.void_reason || 'Voided', 'Reprint'); setToast({ type: 'success', message: 'Void slip printed' }) } catch { setToast({ type: 'error', message: 'Print failed' }) }
                  }}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-red-200 py-2.5 text-xs font-semibold text-red-500 hover:bg-red-50 active:scale-95">
                    <Printer className="h-3.5 w-3.5" />
                    Print Void Slip
                  </button>
                )}
                {(selectedOrder.status === 'Open' || selectedOrder.status === 'Hold') && (
                  <>
                    <button
                      onClick={async () => {
                        try {
                          await window.api.print.invoice(selectedOrder.id)
                          setToast({ type: 'success', message: 'Invoice printed' })
                        } catch (e: any) {
                          setToast({ type: 'error', message: `Invoice print failed: ${e.message}` })
                        }
                      }}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-blue-200 py-2.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 active:scale-95"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      Print Invoice
                    </button>
                    <button
                      onClick={() => voidOrder(selectedOrder.id)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-red-200 py-2.5 text-xs font-semibold text-red-500 hover:bg-red-50 active:scale-95"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Void Order
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Receipt Preview */}
      {previewOrderId && (
        <ReceiptPreview orderId={previewOrderId} onClose={() => setPreviewOrderId(null)} />
      )}

      {/* Void order modal — reason step first, then PIN (cashier) */}
      {voidRequest && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="w-80 rounded-2xl bg-white p-6 shadow-2xl">
            {voidRequest.step === 'pin' ? (
              <>
                <h3 className="mb-1 text-center text-lg font-bold">Supervisor PIN</h3>
                <p className="mb-2 text-center text-xs text-gray-500">Enter supervisor PIN to void this order</p>
                <p className="mb-4 text-center text-xs font-medium text-red-500">Reason: {voidRequest.reason}</p>
                <input
                  type="password"
                  data-keyboard="numpad"
                  value={voidPin}
                  onChange={(e) => { setVoidPin(e.target.value); setVoidPinError('') }}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' && voidPin.length >= 4) {
                      const u = await window.api.users.verifyPin(voidPin)
                      if (u && u.role === 'supervisor') {
                        setVoidPin('')
                        doVoidOrder(voidRequest.orderId, voidRequest.reason)
                      } else {
                        setVoidPinError('Invalid PIN or not a supervisor')
                      }
                    }
                  }}
                  autoFocus
                  placeholder="Enter PIN"
                  className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-center text-lg tracking-widest focus:border-primary focus:outline-none"
                />
                {voidPinError && <p className="mt-2 text-center text-xs text-red-500">{voidPinError}</p>}
                <div className="mt-4 flex gap-3">
                  <button onClick={() => setVoidRequest({ ...voidRequest, step: 'reason' })}
                    className="flex-1 rounded-xl border-2 border-gray-200 py-2.5 text-sm font-semibold hover:bg-gray-50">
                    Back
                  </button>
                  <button onClick={async () => {
                    const u = await window.api.users.verifyPin(voidPin)
                    if (u && u.role === 'supervisor') {
                      setVoidPin('')
                      doVoidOrder(voidRequest.orderId, voidRequest.reason)
                    } else {
                      setVoidPinError('Invalid PIN or not a supervisor')
                    }
                  }}
                    className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white hover:bg-red-600">
                    Void Order
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="mb-1 text-center text-lg font-bold">Void Reason</h3>
                <p className="mb-4 text-center text-xs text-gray-500">Select or enter a reason (required)</p>
                {voidReasons.length > 0 && !showCustomReason ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {voidReasons.map((r) => (
                      <button key={r.name}
                        onClick={() => {
                          if (isSupervisor) { doVoidOrder(voidRequest.orderId, r.reason_name) }
                          else { setVoidRequest({ ...voidRequest, step: 'pin', reason: r.reason_name }) }
                        }}
                        className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-left text-sm font-medium hover:bg-red-50 hover:border-red-200 transition-colors">
                        {r.reason_name}
                      </button>
                    ))}
                    <button
                      onClick={() => setShowCustomReason(true)}
                      className="w-full rounded-xl border-2 border-dashed border-gray-200 px-4 py-3 text-left text-sm text-gray-500 hover:bg-gray-50">
                      Other (type reason)...
                    </button>
                  </div>
                ) : (
                  <input
                    type="text"
                    data-keyboard="full"
                    value={voidRequest.reason}
                    onChange={(e) => setVoidRequest({ ...voidRequest, reason: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && voidRequest.reason.trim()) {
                        if (isSupervisor) { doVoidOrder(voidRequest.orderId, voidRequest.reason.trim()); setShowCustomReason(false) }
                        else { setVoidRequest({ ...voidRequest, step: 'pin', reason: voidRequest.reason.trim() }) }
                      }
                    }}
                    autoFocus
                    placeholder="Enter void reason..."
                    className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm focus:border-primary focus:outline-none"
                  />
                )}
                <div className="mt-4 flex gap-3">
                  <button onClick={() => { setVoidRequest(null); setShowCustomReason(false) }}
                    className="flex-1 rounded-xl border-2 border-gray-200 py-2.5 text-sm font-semibold hover:bg-gray-50">
                    Cancel
                  </button>
                  {(showCustomReason || voidReasons.length === 0) && (
                    <button onClick={() => {
                      if (voidRequest.reason.trim()) {
                        if (isSupervisor) { doVoidOrder(voidRequest.orderId, voidRequest.reason.trim()); setShowCustomReason(false) }
                        else { setVoidRequest({ ...voidRequest, step: 'pin', reason: voidRequest.reason.trim() }) }
                      }
                    }}
                      disabled={!voidRequest.reason.trim()}
                      className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50">
                      Void Order
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Isolated clock component — only re-renders itself every second, not the entire POS
function Clock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <>
      <span className="font-medium text-gray-600">{time.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
      <span className="ml-1.5">{time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
    </>
  )
}

// Waiter order Accept button with 5-second auto-accept countdown
function WaiterOrderActions({ woName, processing, onAccept, onReject }: {
  woName: string; processing: boolean; onAccept: () => void; onReject: () => void
}) {
  const [countdown, setCountdown] = useState(5)
  const accepted = useRef(false)

  useEffect(() => {
    if (processing || accepted.current) return
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          if (!accepted.current) {
            accepted.current = true
            onAccept()
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [woName, processing])

  return (
    <div className="flex gap-2 border-t bg-gray-50 px-4 py-2.5">
      <button
        onClick={() => { accepted.current = true; onAccept() }}
        disabled={processing}
        className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {processing ? 'Processing...' : `Accept & Print KOT (${countdown}s)`}
      </button>
      <button
        onClick={() => { accepted.current = true; onReject() }}
        className="rounded-lg border-2 border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
      >
        Reject
      </button>
    </div>
  )
}
