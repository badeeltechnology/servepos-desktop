import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuthStore } from '../stores/auth'
import { useCartStore } from '../stores/cart'
import { useStatus, refreshPendingSync } from '../stores/status'
import { useMenu } from '../stores/menu'
import { toast, askConfirm, useSessionGuard } from '../stores/ui'
import { useT, useLang } from '../stores/i18n'
import ItemGrid from '../components/ItemGrid'
import Cart from '../components/Cart'
import PaymentDialog, { PaymentEntry } from '../components/PaymentDialog'
import OrdersBar from '../components/OrdersBar'
import OpenOrders from '../components/OpenOrders'
import WaiterOrders, { useWaiterOrders } from '../components/WaiterOrders'
import History from '../components/History'
import StatusBand from '../components/StatusBand'
import SupervisorSettings from './SupervisorSettings'
import CoordinatorScreen from './CoordinatorScreen'
import OpenShift from '../components/OpenShift'
import CloseShift from '../components/CloseShift'
import { ActiveOrderRow, orderLabel } from '../components/orderStatus'
import { useTier } from '../ui'
import { timeOf } from '../ui/hosts'
import { cn } from '../lib/utils'

type View = 'till' | 'orders' | 'history' | 'closeShift'

export default function POS() {
  const { user, logout: rawLogout } = useAuthStore()
  const t = useT()
  const { lang, setLang } = useLang()
  // In-flight guard: a second tap while Send / Hold / Pay / Save is running is ignored
  const busy = useRef(false)
  const activeRef = useRef<string | null>(null)
  const cart = useCartStore()
  const [showPayment, setShowPayment] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showCoordinator, setShowCoordinator] = useState(false)
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null)
  const [orderMeta, setOrderMeta] = useState<{ number: string | null; createdAt: string | null; sentAt: string | null }>({ number: null, createdAt: null, sentAt: null })
  const [taxRate, setTaxRate] = useState(0)
  const [taxLabel, setTaxLabel] = useState('VAT')
  const [processing, setProcessing] = useState(false)
  const [activeSession, setActiveSession] = useState<any>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [view, setView] = useState<View>('till')
  const [userMenu, setUserMenu] = useState(false)
  const [activeOrders, setActiveOrders] = useState<ActiveOrderRow[]>([])
  const [recent, setRecent] = useState<string[]>([])
  const [showWaiterOrders, setShowWaiterOrders] = useState(false)
  const [autoAccept, setAutoAccept] = useState<boolean | null>(null) // null until config is read
  const { wide, large } = useTier()

  // KOT already printed and nothing new on the ticket (adding now asks first)
  const isOrderPlaced = !!activeOrderId && cart.items.length > 0 && cart.items.every((i) => i.kotPrinted)

  useEffect(() => { loadTaxConfig(); checkSession(); useMenu.getState().load().catch(() => {}) }, [])

  // Sync status + waiter orders + invoice auto-print (3s), open orders (5s), pending-sync count (15s)
  const waiter = useWaiterOrders({
    autoAccept: autoAccept === true,
    onNew: () => setShowWaiterOrders(true),
    onAccepted: () => loadActiveOrders()
  })
  useEffect(() => {
    let polling = true
    const pollTimer = setInterval(async () => {
      if (!polling) return
      try { useStatus.getState().setSync(await window.api.sync.status()) } catch {}
      waiter.poll()
      // Invoice auto-print for ready orders
      try { await window.api.print.pollReadyOrders() } catch {}
    }, 3000)
    window.api.sync.status().then((s: any) => useStatus.getState().setSync(s)).catch(() => {})
    waiter.poll()
    return () => { polling = false; clearInterval(pollTimer) }
  }, []) // interval runs once; the hook keeps its own refs

  const loadActiveOrders = useCallback(async () => {
    try {
      const list = await window.api.orders.getActive()
      setActiveOrders((prev) => (JSON.stringify(prev) === JSON.stringify(list || []) ? prev : list || []))
    } catch {}
  }, [])
  useEffect(() => {
    loadActiveOrders()
    const t = setInterval(loadActiveOrders, 5000)
    return () => clearInterval(t)
  }, [loadActiveOrders])

  useEffect(() => {
    const sid = activeSession?.id || null
    refreshPendingSync(sid)
    const t = setInterval(() => refreshPendingSync(sid), 15000)
    return () => clearInterval(t)
  }, [activeSession?.id])

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
    // Waiter-app orders: auto-accept after 5 s unless switched off in admin (default on)
    setAutoAccept(config.waiter_order_auto_accept !== '0')
  }

  function touch(orderId: string) {
    setRecent((r) => [orderId, ...r.filter((x) => x !== orderId)].slice(0, 12))
  }

  function resetTicket() {
    useCartStore.getState().clearCart()
    setActiveOrderId(null)
    setOrderMeta({ number: null, createdAt: null, sentAt: null })
  }

  // ==================== ORDER LIFECYCLE ====================
  //
  // An order is created ONCE and persists. Never voided on resume.
  //
  // Scenarios:
  // 1. Quick Pay:   Add items → Pay → order created + payment → done (no KOT)
  // 2. Dine In:     Add items → Send (KOT) → customer eats → Pay → done
  // 3. Hold:        Add items → Send (KOT) → Hold → ... → Resume → Pay → done
  // 4. Hold before KOT: Add items → Hold (creates order + KOT) → ... → Resume → Pay → done

  function itemPayload(orderId: string, item: ReturnType<typeof useCartStore.getState>['items'][number]) {
    return {
      orderId,
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
    }
  }

  /** Writes cart lines that are not in the DB yet to order_items. */
  async function saveNewLines(orderId: string) {
    const map: Record<string, string> = {}
    for (const item of useCartStore.getState().items) {
      if (!item.dbId) map[item.id] = await window.api.orderItems.add(itemPayload(orderId, item))
    }
    if (Object.keys(map).length) useCartStore.getState().setDbIds(map)
  }

  // Helper: save cart items to a new order in DB
  async function saveCartAsOrder(status: 'Open' | 'Hold'): Promise<any> {
    const c = useCartStore.getState()
    const order = await window.api.orders.create({
      orderType: c.orderType,
      tableName: c.tableName ?? null,
      room: c.room ?? null,
      guests: c.guests,
      cashierId: user!.id,
      cashierName: user!.name,
      sessionId: activeSession?.id || null,
      waiterId: c.waiterId ?? null,
      waiterName: c.waiterName ?? null
    })

    await saveNewLines(order.id)

    const c2 = useCartStore.getState()
    await window.api.orders.update(order.id, {
      status,
      subtotal: c2.getSubtotal(),
      discountAmount: c2.orderDiscountAmount,
      discountPercent: c2.orderDiscountPercent,
      discountReason: c2.orderDiscountReason || null,
      promoName: c2.promoName || null,
      orderNotes: c2.orderNotes || null,
      grandTotal: c2.getGrandTotal(taxRate)
    })

    return await window.api.orders.get(order.id)
  }

  /** After a KOT: mark lines Sent (from the DB flags; all saved lines when the print succeeded). */
  async function syncSentFlags(orderId: string, kotOk: boolean) {
    try {
      const dbItems = await window.api.orderItems.get(orderId)
      const printed = (dbItems || []).filter((i: any) => i.kot_printed || kotOk).map((i: any) => i.id)
      useCartStore.getState().setKotPrinted(printed)
    } catch {
      if (kotOk) useCartStore.getState().setKotPrinted(useCartStore.getState().items.filter((i) => i.dbId).map((i) => i.dbId!))
    }
  }

  // Send: place order & print KOT (only unprinted items go to the kitchen)
  const handlePlaceOrder = useCallback(async () => {
    if (useCartStore.getState().items.length === 0 || busy.current) return
    busy.current = true
    setProcessing(true)
    try {
      let order: any

      if (activeOrderId) {
        // Order already exists — sync any new cart items to order_items
        await saveNewLines(activeOrderId)
        const c = useCartStore.getState()
        await window.api.orders.update(activeOrderId, {
          status: 'Open', kotPrinted: 1,
          subtotal: c.getSubtotal(), grandTotal: c.getGrandTotal(taxRate)
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
      const kotOk = !(kotResult?.success === false || (kotResult?.errors && kotResult.errors.length > 0))

      // Auto-print waiter copy if enabled
      try {
        const rc = await window.api.receiptConfig.getAll()
        if (rc.auto_print_waiter_copy === '1') {
          await window.api.print.waiterCopy(order.id)
        }
      } catch {}

      setActiveOrderId(order.id)
      touch(order.id)
      await syncSentFlags(order.id, kotOk)
      setOrderMeta({ number: order.order_number, createdAt: order.created_at, sentAt: timeOf(new Date().toISOString()) })
      if (!kotOk) {
        const oid = order.id
        toast.sticky(`Order placed but KOT print failed: ${kotResult?.errors?.join(', ') || 'Unknown error'}`, () => retryKot(oid))
      } else {
        toast.success(`Sent to the kitchen · ${order.order_number}`)
      }
      loadActiveOrders()
    } catch (err: any) {
      toast.error(`Failed: ${err.message}`)
    } finally {
      busy.current = false
      setProcessing(false)
    }
  }, [user, taxRate, activeOrderId, activeSession])

  /** Retry a failed KOT: prints only what the kitchen hasn't had yet, then refreshes Sent flags. */
  async function retryKot(orderId: string) {
    let r: any
    try { r = await window.api.print.kots(orderId, user?.name) } catch (e: any) { r = { success: false, errors: [e.message] } }
    const ok = !(r?.success === false || (r?.errors && r.errors.length > 0))
    if (activeRef.current === orderId) await syncSentFlags(orderId, ok)
    if (ok) toast.success('KOT printed')
    else toast.sticky(`KOT print failed again: ${r?.errors?.join(', ') || 'check the printer'}`, () => retryKot(orderId))
  }

  // Update order without printing KOT (e.g. adding water before payment)
  const handleUpdateOnly = useCallback(async () => {
    if (!activeOrderId || useCartStore.getState().items.length === 0 || busy.current) return
    busy.current = true
    setProcessing(true)
    try {
      await saveNewLines(activeOrderId)
      const c = useCartStore.getState()
      await window.api.orders.update(activeOrderId, {
        subtotal: c.getSubtotal(), grandTotal: c.getGrandTotal(taxRate)
      })
      toast.success('Order saved (no KOT)')
    } catch (err: any) {
      toast.error(`Update failed: ${err.message}`)
    } finally {
      busy.current = false
      setProcessing(false)
    }
  }, [taxRate, activeOrderId])

  // Open payment
  const handlePay = useCallback(() => {
    if (useCartStore.getState().items.length === 0) return
    setShowPayment(true)
  }, [])

  // Complete payment. Returns true on success; the payment screen then shows the change.
  const handlePaymentComplete = useCallback(
    async (payments: PaymentEntry[], collectedByWaiter: string | null, tipAmount?: number, receiptCopies = 1): Promise<boolean> => {
      if (busy.current) return false
      busy.current = true
      setProcessing(true)
      try {
        let orderId = activeOrderId
        let order: any
        const c = useCartStore.getState()

        if (orderId) {
          // Existing order — save any unsaved lines, then add payment
          await saveNewLines(orderId)
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
          await window.api.orderPayments.add(orderId!, p.method, p.amount, p.reference || undefined, collectedByWaiter || undefined)
        }

        // Compute discount & totals from order_items subtotal
        const discountPct = c.orderDiscountPercent
        const discountAmt = c.orderDiscountAmount
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
          discountReason: c.orderDiscountReason || null,
          promoName: c.promoName || null,
          voucherCode: c.voucherCode || null,
          tipAmount: tipAmount || 0,
          orderNotes: c.orderNotes || null,
          grandTotal: Math.max(0, afterDiscount + taxTotal),
          completedAt: new Date().toISOString()
        })

        // Free table
        if (c.tableName) {
          await window.api.tables.updateStatus(c.tableName, 'Available')
        }

        // Print receipt (copies chosen on the payment screen; 0 = no receipt)
        let receiptResult: any = { success: true }
        if (receiptCopies > 0) {
          toast.info('Printing receipt…')
          for (let i = 0; i < receiptCopies; i++) {
            try { receiptResult = await window.api.print.receipt(orderId!) } catch (e: any) { receiptResult = { success: false, error: e.message } }
            if (receiptResult?.success === false) break
          }
        }

        resetTicket()
        loadActiveOrders()
        refreshPendingSync(activeSession?.id || null)
        if (receiptResult?.success === false) {
          const oid = orderId!
          const retryReceipt = async () => {
            let r: any
            try { r = await window.api.print.receipt(oid) } catch (e: any) { r = { success: false, error: e.message } }
            if (r?.success === false) toast.sticky(`Receipt print failed again: ${r?.error || 'check the printer'}`, retryReceipt)
            else toast.success('Receipt printed')
          }
          toast.sticky(`${order.order_number} paid, but the receipt did not print: ${receiptResult?.error || 'check the printer'}`, retryReceipt)
        } else {
          toast.success(`${order.order_number} paid${receiptCopies > 0 ? ' · receipt printed' : ''}`)
        }
        return true
      } catch (err: any) {
        toast.error(`Payment failed: ${err.message}`)
        return false
      } finally {
        busy.current = false
        setProcessing(false)
      }
    },
    [user, taxRate, activeOrderId, activeSession]
  )

  // Hold order
  const handleHoldOrder = useCallback(async (opts?: { silent?: boolean; noKot?: boolean }) => {
    if (useCartStore.getState().items.length === 0 || busy.current) return
    busy.current = true
    setProcessing(true)
    try {
      let order: any

      if (activeOrderId) {
        // Order already saved — keep any new lines, change status to Hold
        await saveNewLines(activeOrderId)
        const c = useCartStore.getState()
        await window.api.orders.update(activeOrderId, { status: 'Hold', subtotal: c.getSubtotal(), grandTotal: c.getGrandTotal(taxRate) })
        order = await window.api.orders.get(activeOrderId)
      } else {
        // Not saved yet — create as Hold + print KOT so kitchen starts
        order = await saveCartAsOrder('Hold')
        if (!opts?.noKot) {
          const oid = order.id
          try {
            const kotRes = await window.api.print.kots(order.id, user?.name)
            if (kotRes?.success === false) toast.sticky(`KOT print failed: ${kotRes?.errors?.join(', ') || 'Check printer'}`, () => retryKot(oid))
          } catch {}
        }
      }

      resetTicket()
      loadActiveOrders()
      if (!opts?.silent) toast.success(`On hold: ${orderLabel(order)} · ${order.order_number}`)
    } catch (err: any) {
      toast.error(`Hold failed: ${err.message}`)
    } finally {
      busy.current = false
      setProcessing(false)
    }
  }, [user, taxRate, activeOrderId, activeSession])

  // Before anyone is signed out (inactivity or Sign out): put the ticket on hold so the order link
  // is kept. Unsent items are held without a KOT; the next cashier opens it from the rail and Sends once.
  activeRef.current = activeOrderId
  const holdRef = useRef(handleHoldOrder)
  holdRef.current = handleHoldOrder
  useEffect(() => {
    useSessionGuard.getState().setBeforeSignOut(async () => {
      if (useCartStore.getState().items.length === 0) return
      await holdRef.current({ silent: true, noKot: true })
      useCartStore.getState().clearCart()
    })
    return () => useSessionGuard.getState().setBeforeSignOut(null)
  }, [])
  const logout = useCallback(async () => {
    try { await useSessionGuard.getState().beforeSignOut?.() } catch {}
    rawLogout()
  }, [rawLogout])

  /** Before leaving the current ticket. Returns false to stay. */
  async function leaveCurrent(nextLabel: string): Promise<boolean> {
    const c = useCartStore.getState()
    if (c.items.length === 0) return true
    const unsaved = c.items.filter((i) => !i.dbId).length
    if (activeOrderId) {
      if (unsaved === 0) return true // everything is on the order already; it stays open
      const hold = await askConfirm({ title: t('Hold this order first?'), body: `${unsaved} item${unsaved === 1 ? ' is' : 's are'} not saved yet. Hold keeps ${unsaved === 1 ? 'it' : 'them'} on the order before you ${nextLabel}.`, ok: t('Hold and continue'), cancel: t('Stay') })
      if (hold) await handleHoldOrder()
      return hold
    }
    return askConfirm({ title: t('Discard this ticket?'), body: `${c.items.length} item${c.items.length === 1 ? '' : 's'} not saved to any order will be lost.`, ok: t('Discard'), cancel: t('Keep'), danger: true })
  }

  // Resume a held/open order — load into cart, NO voiding
  const handleResumeOrder = useCallback(async (orderId: string) => {
    if (orderId === activeOrderId) { setView('till'); return }
    const order = await window.api.orders.get(orderId)
    if (!order) return

    // Skip already-completed or voided orders (prevents reloading a paid order)
    if (order.status === 'Completed' || order.status === 'Void' || order.status === 'Returned') return

    if (!(await leaveCurrent(`open ${orderLabel(order)}`))) return

    // Load order items into cart
    const items = await window.api.orderItems.get(orderId)
    const c = useCartStore.getState()
    c.clearCart()
    c.setOrderType(order.order_type)
    if (order.table_name) c.setTable(order.table_name, order.room)
    if (order.guests) c.setGuests(order.guests)
    if (order.order_notes) c.setOrderNotes(order.order_notes)
    if (order.waiter_id || order.waiter_name) c.setWaiter(order.waiter_id || null, order.waiter_name || null)

    // Restore discount/promo/voucher
    if (order.voucher_code) {
      c.setVoucher(order.voucher_code, order.discount_percent || 0)
    } else if (order.promo_name) {
      c.setPromo(order.promo_name, 'Percentage', order.discount_percent || 0)
    } else if (order.discount_percent > 0 || order.discount_amount > 0) {
      c.setOrderDiscount(order.discount_percent || 0, order.discount_amount || 0, order.discount_reason || '')
    }

    for (const item of items) {
      const added = c.addItem({
        dbId: item.id,
        itemCode: item.item_code, itemName: item.item_name, qty: item.qty, rate: item.rate,
        modifiers: item.modifiers ? (function () { try { return JSON.parse(item.modifiers) } catch { return [] } })() : [],
        specialInstructions: item.special_instructions || undefined,
        kotPrinted: !!item.kot_printed
      })
      if (item.discount_percent > 0 || item.discount_amount > 0) c.updateItemDiscount(added, item.discount_percent || 0, item.discount_amount || 0)
    }

    // Change status from Hold to Open (NO voiding)
    if (order.status === 'Hold') {
      await window.api.orders.update(orderId, { status: 'Open' })
    }

    setActiveOrderId(orderId)
    touch(orderId)
    setOrderMeta({ number: order.order_number, createdAt: order.created_at, sentAt: null })
    setView('till')
    loadActiveOrders()
    // When did the kitchen last get it? (print log)
    try {
      const log = await window.api.printLog.getForOrder(orderId)
      const kots = (log || []).filter((l: any) => String(l.print_type).startsWith('kot'))
      const last = kots[kots.length - 1] || kots[0]
      if (last?.printed_at) setOrderMeta((m) => ({ ...m, sentAt: timeOf(last.printed_at) }))
    } catch {}
  }, [activeOrderId, handleHoldOrder])

  // New order
  const handleNewOrder = useCallback(async () => {
    if (!(await leaveCurrent('start a new one'))) return
    resetTicket()
    setView('till')
  }, [activeOrderId, handleHoldOrder])

  /** Void a whole order (held/open), same writes as before. */
  async function voidWholeOrder(orderId: string, reason: string, remarks: string, disposition: string, voidedBy: string) {
    await window.api.orders.update(orderId, { status: 'Void', voidReason: reason, voidRemarks: remarks.trim() || undefined, voidedBy, voidDisposition: disposition })
    try { await window.api.print.voidSlip(orderId, reason, voidedBy, undefined, remarks.trim(), disposition) } catch {}
    if (activeOrderId === orderId) resetTicket()
    const order = await window.api.orders.get(orderId)
    if (order?.table_name) await window.api.tables.updateStatus(order.table_name, 'Available').catch(() => {})
    loadActiveOrders()
  }

  if (showSettings && user?.role === 'supervisor') {
    return <SupervisorSettings onBack={() => { setShowSettings(false); loadTaxConfig() }} />
  }

  if (showCoordinator) {
    return <CoordinatorScreen onBack={() => setShowCoordinator(false)} />
  }

  // Show loading while checking session
  if (sessionLoading) {
    return <div className="flex h-screen items-center justify-center bg-n-cream"><p className="text-n-muted">Loading…</p></div>
  }

  // Show Open Shift screen if no active session
  if (!activeSession) {
    return (
      <OpenShift
        userName={user?.name || ''}
        userId={user?.id || ''}
        onSignOut={logout}
        onOpen={(sessionId) => { setActiveSession({ id: sessionId }); checkSession() }}
      />
    )
  }

  if (view === 'closeShift') {
    return (
      <CloseShift
        sessionId={activeSession.id}
        onClose={() => {
          setView('till')
          setActiveSession(null)
          resetTicket()
          toast.success('Shift closed')
        }}
        onCancel={() => setView('till')}
      />
    )
  }

  const band = (
    <StatusBand userName={user?.name} onUser={() => setUserMenu(!userMenu)} onWaiter={() => setShowWaiterOrders(true)} />
  )

  const menu = userMenu && (
    <div className="fixed inset-0 z-[45]" onMouseDown={() => setUserMenu(false)}>
      <div role="menu" className="absolute right-2 top-11 flex w-64 animate-rise flex-col overflow-hidden rounded-md bg-white shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex flex-col border-b border-n-line px-4 py-3">
          <span className="text-[15px] font-semibold">{user?.full_name || user?.name}</span>
          <span className="text-xs capitalize text-n-muted">{user?.role} · shift since {timeOf(activeSession.opened_at)}</span>
        </div>
        {[
          ['Sales today', () => setView('history')],
          ['Open orders', () => setView('orders')],
          ['Kitchen view', () => setShowCoordinator(true)],
          ...(user?.role === 'supervisor' ? [['Settings', () => setShowSettings(true)]] : []),
          ['Close shift', () => setView('closeShift')],
          ['lang', () => setLang(lang === 'ar' ? 'en' : 'ar')],
          ['Sign out', logout]
        ].map(([label, fn]) => (
          <button key={label as string} role="menuitem" type="button" onClick={() => { setUserMenu(false); (fn as () => void)() }}
            className={cn('h-12 px-4 text-start text-sm font-medium hover:bg-n-cream', label === 'Sign out' && 'border-t border-n-line text-n-red', label === 'lang' && 'border-t border-n-line')}>
            {label === 'lang' ? (lang === 'ar' ? 'English' : 'العربية') : t(label as string)}
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-n-rail text-n-ink">
      {band}

      {view === 'orders' ? (
        <OpenOrders
          orders={activeOrders}
          activeOrderId={activeOrderId}
          activeLabel={activeOrderId ? (useCartStore.getState().tableName || orderMeta.number?.split('-').pop() || null) : null}
          isSupervisor={user?.role === 'supervisor'}
          waiterPending={waiter.orders.length}
          onWaiter={() => setShowWaiterOrders(true)}
          onBack={() => setView('till')}
          onOpen={handleResumeOrder}
          onVoid={async (orderId, r) => voidWholeOrder(orderId, r.reason, r.remarks, r.disposition, user?.name || 'Supervisor')}
          onRefresh={loadActiveOrders}
        />
      ) : view === 'history' ? (
        <History
          onClose={() => setView('till')}
          isSupervisor={user?.role === 'supervisor'}
          cashierId={user?.role === 'cashier' ? user.id : null}
          sessionId={activeSession?.id || null}
          backLabel={activeOrderId ? `Back to ${useCartStore.getState().tableName || 'order'}` : 'Back'}
        />
      ) : (
        <>
          <OrdersBar orders={activeOrders} recent={recent} activeOrderId={activeOrderId} onSelectOrder={handleResumeOrder} onNewOrder={handleNewOrder} onAllOpen={() => setView('orders')} />
          <div className="flex min-h-0 flex-1">
            <ItemGrid isOrderPlaced={isOrderPlaced} />
            <div className="flex-shrink-0" style={{ width: large ? 420 : wide ? 370 : 336 }}>
              <Cart
                onPlaceOrder={handlePlaceOrder}
                onUpdateOnly={activeOrderId ? handleUpdateOnly : undefined}
                onPay={handlePay}
                onHold={() => handleHoldOrder()}
                onNewOrder={handleNewOrder}
                onOpenOrder={handleResumeOrder}
                taxRate={taxRate}
                taxLabel={taxLabel}
                isOrderPlaced={isOrderPlaced}
                activeOrderId={activeOrderId}
                orderNumber={orderMeta.number}
                orderCreatedAt={orderMeta.createdAt}
                sentAt={orderMeta.sentAt}
                processing={processing}
                onItemRemoved={activeOrderId ? async (orderId, item, reason, remarks, disposition) => {
                  // Flag item as voided in DB (keeps audit trail, excludes from receipt)
                  if (item.dbId) {
                    try { await window.api.orderItems.void(item.dbId, reason, user?.name || '', remarks, disposition) } catch {}
                  }
                  // Update order totals (getOrderItems already excludes voided)
                  const dbItems = await window.api.orderItems.get(orderId)
                  const newSubtotal = dbItems.reduce((s: number, i: any) => s + i.amount, 0)
                  await window.api.orders.update(orderId, { subtotal: newSubtotal, grandTotal: newSubtotal })
                  // Print void slip
                  try { await window.api.print.voidSlip(orderId, reason, user?.name || '', [item], remarks, disposition) } catch {}
                } : undefined}
                onPartialVoid={activeOrderId ? async (orderId, item, voidQty, reason, remarks, disposition) => {
                  // Keep the rest of the line; record the voided part as its own voided row (audit trail)
                  const line = useCartStore.getState().items.find((i) => i.dbId === item.dbId)
                  if (item.dbId && line) {
                    try { await window.api.orderItems.update(item.dbId, { qty: line.qty, amount: line.amount }) } catch {}
                    try {
                      const vid = await window.api.orderItems.add({
                        orderId, itemCode: line.itemCode, itemName: line.itemName, qty: voidQty, rate: line.rate,
                        discountAmount: 0, discountPercent: line.discountPercent, amount: item.amount,
                        modifiers: line.modifiers.length ? JSON.stringify(line.modifiers) : null, modifierTotal: line.modifierTotal,
                        specialInstructions: line.specialInstructions || null
                      })
                      await window.api.orderItems.void(vid, reason, user?.name || '', remarks, disposition)
                    } catch {}
                  }
                  const dbItems = await window.api.orderItems.get(orderId)
                  const newSubtotal = dbItems.reduce((s: number, i: any) => s + i.amount, 0)
                  await window.api.orders.update(orderId, { subtotal: newSubtotal, grandTotal: newSubtotal })
                  try { await window.api.print.voidSlip(orderId, reason, user?.name || '', [{ ...item, qty: voidQty }], remarks, disposition) } catch {}
                } : undefined}
                onAutoVoid={activeOrderId ? async (reason) => {
                  const voidReason = reason || 'All items removed'
                  await window.api.orders.update(activeOrderId, { status: 'Void', voidReason })
                  try { await window.api.print.voidSlip(activeOrderId, voidReason, user?.name || '') } catch {}
                  const order = await window.api.orders.get(activeOrderId)
                  if (order?.table_name) await window.api.tables.updateStatus(order.table_name, 'Available').catch(() => {})
                  resetTicket()
                  loadActiveOrders()
                  toast.success('Order voided — all items removed')
                } : undefined}
              />
            </div>
          </div>
        </>
      )}

      {/* Payment (full screen) */}
      {showPayment && (
        <PaymentDialog
          grandTotal={cart.getGrandTotal(taxRate)}
          subtotal={cart.getSubtotal()}
          discount={cart.getOrderDiscountValue()}
          tax={cart.getTaxTotal(taxRate)}
          taxLabel={taxLabel}
          lines={cart.items}
          orderLabel={cart.tableName || (orderMeta.number ? orderMeta.number.split('-').pop()! : t('Quick sale'))}
          orderSub={[cart.room, cart.orderType === 'Dine In' ? `${cart.guests} ${t(cart.guests === 1 ? 'guest' : 'guests')}` : t(cart.orderType), cart.waiterName].filter(Boolean).join(' · ')}
          orderNumber={orderMeta.number}
          orderWaiterName={cart.waiterName}
          processing={processing}
          onComplete={handlePaymentComplete}
          onCancel={() => setShowPayment(false)}
          onDone={() => setShowPayment(false)}
        />
      )}

      {/* Waiter-app orders drawer */}
      {showWaiterOrders && (
        <WaiterOrders state={waiter} autoAccept={autoAccept === true} onClose={() => setShowWaiterOrders(false)} />
      )}

      {menu}
    </div>
  )
}
