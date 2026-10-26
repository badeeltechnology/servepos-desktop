import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuthStore } from '../stores/auth'
import { useCartStore } from '../stores/cart'
import { useStatus, refreshPendingSync } from '../stores/status'
import { useMenu } from '../stores/menu'
import { toast, askConfirm, useSessionGuard, useToast } from '../stores/ui'
import { useT, useLang } from '../stores/i18n'
import ItemGrid from '../components/ItemGrid'
import Cart from '../components/Cart'
import PaymentDialog, { PaymentEntry } from '../components/PaymentDialog'
import TopTabs, { TopTab } from '../components/TopTabs'
import FloorDetails, { FloorSummary } from '../components/FloorDetails'
import OpenOrders from '../components/OpenOrders'
import WaiterOrders, { useWaiterOrders, woLabel } from '../components/WaiterOrders'
import History from '../components/History'
import StatusBand from '../components/StatusBand'
import SupervisorSettings from './SupervisorSettings'
import CoordinatorScreen from './CoordinatorScreen'
import OpenShift from '../components/OpenShift'
import CloseShift from '../components/CloseShift'
import { ActiveOrderRow, orderLabel, stageOf, STAGE } from '../components/orderStatus'
import FloorGrid, { TileInfo, tileInfo } from '../components/FloorGrid'
import TablePicker from '../components/TablePicker'
import { GuestsPick, NewOrderChooser, TableActions } from '../components/FloorDialogs'
import { useFloor, hasTables, FloorTable } from '../stores/floor'
import { useTier, roundMoney } from '../ui'
import { timeOf, minutesSince, ageLabel, useTick } from '../ui/hosts'
import { cn } from '../lib/utils'

type View = 'till' | 'tables' | 'orders' | 'ta' | 'history' | 'closeShift'

export default function POS() {
  const { user, logout: rawLogout } = useAuthStore()
  const t = useT()
  const { lang, setLang } = useLang()
  // In-flight guard: a second tap while Send / Hold / Pay / Save is running is ignored
  const busy = useRef(false)
  const resuming = useRef<string | null>(null)
  const holdSendsKot = useRef(false)
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
  // Floor: the Tables screen is home when the till has tables (config start_screen = tables | menu)
  const [homeTables, setHomeTables] = useState(false)
  const homeRef = useRef(false)
  homeRef.current = homeTables
  const afterSendRef = useRef<'floor' | 'stay'>('floor')
  const [askGuests, setAskGuests] = useState(true)
  const [guestsFor, setGuestsFor] = useState<FloorTable | null>(null)
  const [chooser, setChooser] = useState(false)
  const [actionsFor, setActionsFor] = useState<TileInfo | null>(null)
  const [moveFor, setMoveFor] = useState<TileInfo | null>(null)
  const floorTables = useFloor((s) => s.tables)
  const [selTable, setSelTable] = useState<string | null>(null)
  // After "Send" on a dine-in table: back to the floor (config after_send = floor | stay; default floor)
  const [afterSend, setAfterSend] = useState<'floor' | 'stay'>('floor')
  // Config quick_sale_kot = 0: a takeaway / delivery paid straight away prints no KOT (counter cafés)
  const [quickSaleNoKot, setQuickSaleNoKot] = useState(false)
  afterSendRef.current = afterSend
  useTick(30000)

  // KOT already printed and nothing new on the ticket (adding now asks first)
  const isOrderPlaced = !!activeOrderId && cart.items.length > 0 && cart.items.every((i) => i.kotPrinted)

  useEffect(() => { loadTaxConfig(); checkSession(); useMenu.getState().load().catch(() => {}); loadFloorPrefs() }, [])

  // Hand-over notice (review F09): orders someone else left that the kitchen never got
  const noticeFor = useRef<string | null>(null)
  useEffect(() => {
    if (!user || noticeFor.current === user.id) return
    noticeFor.current = user.id
    window.api.orders.getActive().then((list: ActiveOrderRow[]) => {
      const left = (list || []).filter((o) => stageOf(o) === 'draft' && o.cashier_name && o.cashier_id !== user.id)
      if (!left.length) return
      const by = Array.from(new Set(left.map((o) => o.cashier_name)))
      const names = left.slice(0, 3).map((o) => orderLabel(o)).join(', ') + (left.length > 3 ? ` +${left.length - 3}` : '')
      useToast.getState().show('info', t('{who} left {n} not sent: {list}', { who: by.join(', '), n: left.length === 1 ? t('1 order') : t('{n} orders', { n: left.length }), list: names }), {
        sticky: true, action: { label: t('Open'), run: () => { handleResumeOrder(left[0].id) } }
      })
    }).catch(() => {})
  }, [user?.id])

  async function loadFloorPrefs() {
    await useFloor.getState().load()
    let start: string | null = null
    let ask: string | null = null
    try { start = await window.api.config.get('start_screen') } catch {}
    try { ask = await window.api.config.get('ask_guests') } catch {}
    try { setAfterSend((await window.api.config.get('after_send')) === 'stay' ? 'stay' : 'floor') } catch {}
    try { setQuickSaleNoKot((await window.api.config.get('quick_sale_kot')) === '0') } catch {}
    const home = hasTables() && start !== 'menu'
    setHomeTables(home)
    setAskGuests(ask !== '0')
    if (home && !activeRef.current && useCartStore.getState().items.length === 0) setView((v) => (v === 'till' ? 'tables' : v))
  }
  /** Where the till goes after an order is finished or held. */
  function goHome() {
    setView(homeRef.current && hasTables() ? 'tables' : 'till')
  }

  // Sync status + waiter orders + invoice auto-print (3s), open orders (5s), pending-sync count (15s)
  const waiter = useWaiterOrders({
    autoAccept: autoAccept === true,
    // Never opens by itself (it used to cover the payment screen): chime + tab count + a toast with View
    onNew: (fresh) => {
      const what = fresh.map(woLabel).slice(0, 2).join(', ') + (fresh.length > 2 ? ` +${fresh.length - 2}` : '')
      useToast.getState().show('info', `${t('Waiter app')}: ${what} ${autoAccept === false ? t('waiting for you') : t('arrived')}`, { action: { label: t('View'), run: () => setShowWaiterOrders(true) } })
    },
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
    useFloor.getState().load()
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
    // Hold = save without sending (default). hold_sends_kot = 1 restores "Hold prints the KOT".
    holdSendsKot.current = config.hold_sends_kot === '1'
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
      const now = new Date().toISOString()
      const rows = (dbItems || []).filter((i: any) => i.kot_printed || kotOk)
      useCartStore.getState().setKotPrinted(rows.map((i: any) => i.id), Object.fromEntries(rows.map((i: any) => [i.id, i.sent_at || now])))
    } catch {
      if (kotOk) { const ids = useCartStore.getState().items.filter((i) => i.dbId).map((i) => i.dbId!); useCartStore.getState().setKotPrinted(ids, Object.fromEntries(ids.map((id) => [id, new Date().toISOString()]))) }
    }
  }

  // Send: place order & print KOT (only unprinted items go to the kitchen)
  const handlePlaceOrder = useCallback(async (opts?: { stay?: boolean }): Promise<boolean> => {
    if (useCartStore.getState().items.length === 0 || busy.current) return false
    busy.current = true
    let ok = false
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
        toast.success(order.table_name ? `${order.table_name} ${t('sent to the kitchen')}` : `${t('Sent to the kitchen')} · ${order.order_number}`)
      }
      loadActiveOrders()
      ok = true
      // Dine-in at a table: back to the floor so the next guest isn't rung onto this table (review F07)
      if (!opts?.stay && order.order_type === 'Dine In' && order.table_name && homeRef.current && hasTables() && afterSendRef.current === 'floor') {
        resetTicket()
        setView('tables')
      }
    } catch (err: any) {
      toast.error(`Failed: ${err.message}`)
    } finally {
      busy.current = false
      setProcessing(false)
    }
    return ok
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
  // Pay never loses an order to the kitchen (review F03): unsent lines go on a KOT first, after a
  // confirm. Only a takeaway / delivery paid at once skips it, and only with quick_sale_kot = 0.
  const handlePay = useCallback(async () => {
    const c = useCartStore.getState()
    if (c.items.length === 0 || busy.current) return
    const unsent = c.items.filter((i) => !i.kotPrinted)
    const quickNoKot = quickSaleNoKot && !activeRef.current && c.orderType !== 'Dine In'
    if (unsent.length && !quickNoKot) {
      const n = unsent.reduce((x, i) => x + i.qty, 0)
      const go = await askConfirm({
        title: t('Send to kitchen and pay?'),
        body: t('{n} items have not gone to the kitchen. They print on the KOT first, then the payment opens.', { n }),
        ok: t('Send and pay'), cancel: t('Back')
      })
      if (!go) return
      if (!(await placeRef.current({ stay: true }))) return
    }
    setShowPayment(true)
  }, [quickSaleNoKot])

  const payRef = useRef(handlePay)
  payRef.current = handlePay
  const placeRef = useRef(handlePlaceOrder)
  placeRef.current = handlePlaceOrder

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
        // Rounded to the currency's minor unit so the stored total equals the sum of payments
        const itemsSubtotal = roundMoney(dbItems.reduce((sum: number, i: any) => sum + i.amount, 0))

        // Add payments with waiter collection tracking
        for (const p of payments) {
          await window.api.orderPayments.add(orderId!, p.method, p.amount, p.reference || undefined, collectedByWaiter || undefined)
        }

        // Compute discount & totals from order_items subtotal
        const discountPct = c.orderDiscountPercent
        const discountAmt = c.orderDiscountAmount
        const orderDiscount = roundMoney(itemsSubtotal * (discountPct / 100) + discountAmt)
        const afterDiscount = roundMoney(Math.max(0, itemsSubtotal - orderDiscount))
        const taxTotal = roundMoney(afterDiscount * (taxRate / 100))

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
          grandTotal: roundMoney(Math.max(0, afterDiscount + taxTotal)),
          completedAt: new Date().toISOString()
        })

        // Free the table the order is on (the DB row is the truth after a move)
        const freeTable = (order && order.table_name) || c.tableName
        if (freeTable) {
          await window.api.tables.updateStatus(freeTable, 'Available')
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
    const unsentQty = useCartStore.getState().items.filter((i) => !i.kotPrinted).reduce((n, i) => n + i.qty, 0)
    const wasSaved = !!activeOrderId
    try {
      let order: any

      if (activeOrderId) {
        // Order already saved — keep any new lines, change status to Hold
        await saveNewLines(activeOrderId)
        const c = useCartStore.getState()
        await window.api.orders.update(activeOrderId, { status: 'Hold', subtotal: c.getSubtotal(), grandTotal: c.getGrandTotal(taxRate) })
        order = await window.api.orders.get(activeOrderId)
      } else {
        // Not saved yet: create as Hold. The items stay "Not sent" unless hold_sends_kot = 1.
        order = await saveCartAsOrder('Hold')
        if (!opts?.noKot && holdSendsKot.current) {
          const oid = order.id
          try {
            const kotRes = await window.api.print.kots(order.id, user?.name)
            if (kotRes?.success === false) toast.sticky(`KOT print failed: ${kotRes?.errors?.join(', ') || 'Check printer'}`, () => retryKot(oid))
          } catch {}
        }
      }

      resetTicket()
      loadActiveOrders()
      if (!opts?.silent) { toast.success(`On hold: ${orderLabel(order)} · ${order.order_number}${unsentQty && !(holdSendsKot.current && !wasSaved) ? ` · ${unsentQty} not sent` : ''}`); goHome() }
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
  const handleResumeOrder = useCallback(async (orderId: string): Promise<boolean> => {
    if (orderId === activeOrderId) { setView('till'); return true }
    // A double tap must not open the same order twice (the second would see a half-loaded ticket)
    if (resuming.current === orderId) return false
    resuming.current = orderId
    try { return await resumeInner(orderId) } finally { resuming.current = null }
  }, [activeOrderId, handleHoldOrder])
  const resumeInner = async (orderId: string): Promise<boolean> => {
    const order = await window.api.orders.get(orderId)
    if (!order) return false

    // Skip already-completed or voided orders (prevents reloading a paid order)
    if (order.status === 'Completed' || order.status === 'Void' || order.status === 'Returned') return false

    if (!(await leaveCurrent(`open ${orderLabel(order)}`))) return false

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
        kotPrinted: !!item.kot_printed,
        sentAt: item.sent_at || (item.kot_printed ? order.created_at : null)
      } as any)
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
    return true
  }

  // New order
  const handleNewOrder = useCallback(async () => {
    if (!(await leaveCurrent('start a new one'))) return
    resetTicket()
    setChooser(true)
  }, [activeOrderId, handleHoldOrder])

  function startNew(type: 'Dine In' | 'Takeaway' | 'Delivery') {
    setChooser(false)
    resetTicket()
    useCartStore.getState().setOrderType(type)
    setView(type === 'Dine In' && hasTables() ? 'tables' : 'till')
  }

  // ==================== FLOOR ====================

  /** Free table tapped: guests (optional), then a new dine-in ticket bound to it. */
  async function onFreeTable(tb: FloorTable) {
    const c = useCartStore.getState()
    // A dine-in ticket still waiting for its table takes this one instead of being discarded
    const adopt = !activeOrderId && c.items.length > 0 && c.orderType === 'Dine In' && !c.tableName
    if (!adopt) {
      if (!(await leaveCurrent(`start ${tb.table_name}`))) return
      resetTicket()
    }
    if (askGuests) setGuestsFor(tb)
    else seat(tb, null)
  }
  function seat(tb: FloorTable, guests: number | null) {
    setGuestsFor(null)
    const c = useCartStore.getState()
    c.setOrderType('Dine In')
    c.setTable(tb.name, tb.room)
    if (guests) c.setGuests(guests)
    setView('till')
  }
  /** Seated table tapped: show its details beside the floor (double-tap or Open order goes in). */
  function onOccupiedTable(i: TileInfo) {
    if (i.order) setSelTable(selTable === i.table.name ? null : i.table.name)
    else toast.info(`${i.table.table_name} is in use on another till`)
  }

  async function newOfType(type: 'Takeaway' | 'Delivery') {
    if (!(await leaveCurrent(`start a ${type.toLowerCase()}`))) return
    resetTicket()
    useCartStore.getState().setOrderType(type)
    setView('till')
  }

  /** Move an open order to another table: the order row, then both tables. */
  async function moveOrderTable(orderId: string, from: string | null, to: string, room: string | null) {
    try {
      await window.api.orders.update(orderId, { tableName: to, room })
      if (from && from !== to) await window.api.tables.updateStatus(from, 'Available').catch(() => {})
      await window.api.tables.updateStatus(to, 'Occupied', orderId)
      if (activeRef.current === orderId) useCartStore.getState().setTable(to, room)
      toast.success(from ? `Moved ${from} to ${to}` : `Order now on ${to}`)
    } catch (e: any) {
      toast.error(`Move failed: ${e?.message || e}`)
    }
    loadActiveOrders()
  }

  async function printBill(orderId: string) {
    try {
      const r = await window.api.print.invoice(orderId)
      if (r?.success === false) toast.error('Bill print failed, check the printer')
      else {
        // Bill out: purple on the floor and tabs; also stops the auto-print printing it again
        await window.api.orders.update(orderId, { invoicePrinted: 1 }).catch(() => {})
        toast.success(t('Bill printed'))
      }
    } catch (e: any) { toast.error(`Print failed: ${e?.message || e}`) }
    loadActiveOrders()
  }

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
          goHome()
          setActiveSession(null)
          resetTicket()
          toast.success('Shift closed')
        }}
        onCancel={() => setView('till')}
        onOpenOrder={(id) => handleResumeOrder(id)}
      />
    )
  }

  // Floor and tab figures
  const seatedCount = new Set(activeOrders.filter((o) => o.order_type === 'Dine In' && o.table_name).map((o) => o.table_name)).size
  const activeRow = activeOrderId ? activeOrders.find((o) => o.id === activeOrderId) || null : null
  const ticketTab = (cart.items.length > 0 || activeOrderId || cart.tableName) ? (() => {
    const no = orderMeta.number?.split('-').pop()
    const label = cart.tableName || (no ? `${cart.orderType === 'Takeaway' ? 'TA' : cart.orderType === 'Delivery' ? 'D' : '#'} ${no}` : t(cart.orderType === 'Dine In' ? 'New' : cart.orderType))
    if (!activeRow) return { label, sub: cart.items.length ? t('not sent') : t('new order') }
    const age = minutesSince(activeRow.created_at)
    return { label, sub: `${t(STAGE[stageOf(activeRow)].label)} · ${ageLabel(age)}`, late: age >= 30 }
  })() : null
  const selInfo: TileInfo | null = (() => {
    if (!selTable) return null
    const tb = floorTables.find((x) => x.name === selTable)
    if (!tb) return null
    const byTable = new Map<string, ActiveOrderRow>()
    const byId = new Map<string, ActiveOrderRow>()
    for (const o of activeOrders) { byId.set(o.id, o); if (o.table_name && o.order_type === 'Dine In' && !byTable.has(o.table_name)) byTable.set(o.table_name, o) }
    return tileInfo(tb, byTable, byId)
  })()

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

      <TopTabs
        current={view === 'tables' ? 'floor' : view === 'till' ? 'ticket' : view === 'ta' ? 'ta' : view === 'orders' ? 'all' : null}
        hasTables={floorTables.length > 0}
        floorCount={seatedCount}
        ticket={ticketTab}
        taCount={activeOrders.filter((o) => o.order_type !== 'Dine In').length}
        allCount={activeOrders.length}
        waiterCount={waiter.orders.length}
        onTab={(k: TopTab) => {
          if (k === 'waiter') { setShowWaiterOrders(true); return }
          setView(k === 'floor' ? 'tables' : k === 'ticket' ? 'till' : k === 'ta' ? 'ta' : 'orders')
        }}
        onNewTakeaway={() => newOfType('Takeaway')}
        onNewDelivery={() => newOfType('Delivery')}
        onNewOrder={handleNewOrder}
      />

      {view === 'orders' || view === 'ta' ? (
        <OpenOrders
          key={view}
          initialTab={view === 'ta' ? 'TA' : 'All'}
          orders={activeOrders}
          activeOrderId={activeOrderId}
          activeLabel={activeOrderId ? (useCartStore.getState().tableName || orderMeta.number?.split('-').pop() || null) : null}
          isSupervisor={user?.role === 'supervisor'}
          waiterPending={waiter.orders.length}
          onWaiter={() => setShowWaiterOrders(true)}
          onBack={() => (cart.items.length || !homeTables ? setView('till') : goHome())}
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
          {view === 'tables' ? (
            <main aria-label="Tables" className="flex min-h-0 flex-1 bg-n-cream">
              <div className="flex min-w-0 flex-1 flex-col">
                <FloorGrid orders={activeOrders} onFree={onFreeTable} onOccupied={onOccupiedTable} onOpen={(i) => i.order && handleResumeOrder(i.order.id)}
                  onLongPress={setActionsFor} selected={selInfo?.table.name || null} currentTable={null} />
              </div>
              {!selInfo?.order && <FloorSummary orders={activeOrders} />}
              {selInfo?.order && (
                <FloorDetails info={selInfo} onClose={() => setSelTable(null)}
                  onOpen={() => { const id = selInfo.order!.id; setSelTable(null); handleResumeOrder(id) }}
                  onPay={async () => { const id = selInfo.order!.id; setSelTable(null); if (await handleResumeOrder(id)) payRef.current() }}
                  onPrintBill={() => printBill(selInfo.order!.id)}
                  onMove={() => setMoveFor(selInfo)} />
              )}
            </main>
          ) : (
          <div className="flex min-h-0 flex-1">
            <ItemGrid isOrderPlaced={isOrderPlaced} />
            <div className="flex-shrink-0" style={{ width: large ? 420 : wide ? 370 : 336 }}>
              <Cart
                onPlaceOrder={handlePlaceOrder}
                floorAfterSend={homeTables && floorTables.length > 0 && afterSend === 'floor' && cart.orderType === 'Dine In' && !!cart.tableName}
                onPrintBill={activeOrderId ? () => printBill(activeOrderId) : undefined}
                stage={activeRow ? stageOf(activeRow) : null}
                quickSaleNoKot={quickSaleNoKot}
                onUpdateOnly={activeOrderId ? handleUpdateOnly : undefined}
                onPay={handlePay}
                onHold={() => handleHoldOrder()}
                onNewOrder={handleNewOrder}
                onOpenOrder={handleResumeOrder}
                onMoveTable={activeOrderId ? (to, room) => moveOrderTable(activeOrderId, useCartStore.getState().tableName, to, room) : undefined}
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
                  const newSubtotal = roundMoney(dbItems.reduce((s: number, i: any) => s + i.amount, 0))
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
                  const newSubtotal = roundMoney(dbItems.reduce((s: number, i: any) => s + i.amount, 0))
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
          )}
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
          guests={cart.guests}
          processing={processing}
          onComplete={handlePaymentComplete}
          onCancel={() => setShowPayment(false)}
          onDone={() => { setShowPayment(false); goHome() }}
        />
      )}

      {/* Floor dialogs */}
      {guestsFor && <GuestsPick table={guestsFor.table_name} onPick={(n) => seat(guestsFor, n)} onCancel={() => setGuestsFor(null)} />}
      {chooser && <NewOrderChooser hasTables={floorTables.length > 0} onPick={startNew} onCancel={() => setChooser(false)} />}
      {actionsFor && (
        <TableActions info={actionsFor} onCancel={() => setActionsFor(null)}
          onOpen={() => { const id = actionsFor.order!.id; setActionsFor(null); handleResumeOrder(id) }}
          onMove={() => { setMoveFor(actionsFor); setActionsFor(null) }}
          onPrintBill={() => { const id = actionsFor.order!.id; setActionsFor(null); printBill(id) }} />
      )}
      {moveFor && (
        <TablePicker title={t('Move {table} to…', { table: moveFor.table.table_name })} currentTable={moveFor.table.name}
          onCancel={() => setMoveFor(null)}
          onSelect={(to, room) => { const m = moveFor; setMoveFor(null); moveOrderTable(m.order!.id, m.table.name, to, room) }} />
      )}

      {/* Waiter-app orders drawer */}
      {showWaiterOrders && (
        <WaiterOrders state={waiter} autoAccept={autoAccept === true} onClose={() => setShowWaiterOrders(false)} />
      )}

      {menu}
    </div>
  )
}
