import { useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '../stores/auth'
import { useStatus, refreshPendingSync } from '../stores/status'
import { toast } from '../stores/ui'
import ReceiptPreview from './ReceiptPreview'
import VoidDialog from './VoidDialog'
import { orderLabel, typeShort } from './orderStatus'
import { SubBar, BackButton, Chip, Btn, Sheet, Dot, Cap, SearchIcon, money, C } from '../ui'
import { timeOf } from '../ui/hosts'
import { cn } from '../lib/utils'

// Sales today: what still has to reach ERPNext on top, then every order of the shift (or a date),
// with reprint, invoice, void and void-slip actions in a side panel.

type Filter = 'all' | 'Completed' | 'Open' | 'Hold' | 'Void'

const STATUS_COLOR: Record<string, string> = { Completed: C.green, Open: C.teal, Hold: '#8B6F5C', Void: C.red, Returned: C.stone, Preparing: C.amber, 'Ready to Serve': C.green, Invoiced: '#7C5CBF' }

const STATUS_LABEL: Record<string, string> = { Completed: 'Paid', 'Ready to Serve': 'Ready', Hold: 'On hold', Invoiced: 'Bill printed' }
const statusText = (s: string) => STATUS_LABEL[s] || s

function syncLabel(o: any) {
  if (o.status !== 'Completed' && o.status !== 'Void') return { text: '—', color: C.stone }
  if (o.sync_status === 'synced') return { text: 'Synced', color: C.green }
  if (o.sync_status === 'failed') return { text: 'Failed', color: C.red }
  return { text: 'Waiting', color: C.amber }
}

export default function History({ onClose, isSupervisor, cashierId, sessionId, backLabel = 'Back' }: {
  onClose: () => void
  isSupervisor: boolean
  cashierId: string | null
  sessionId: string | null
  backLabel?: string
}) {
  const user = useAuthStore((state) => state.user)
  const cur = useStatus((s) => s.currency)
  const [orders, setOrders] = useState<any[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [selectedOrder, setSelectedOrder] = useState<any>(null)
  const [orderItems, setOrderItems] = useState<any[]>([])
  const [orderPayments, setOrderPayments] = useState<any[]>([])
  const [voidTarget, setVoidTarget] = useState<any>(null)
  const [previewOrderId, setPreviewOrderId] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [query, setQuery] = useState('')
  const [finding, setFinding] = useState(false)
  // View mode: 'shift' shows current session orders (across dates), 'date' shows a specific date
  const [viewMode, setViewMode] = useState<'shift' | 'date'>(sessionId ? 'shift' : 'date')
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  })
  const [shiftStart, setShiftStart] = useState<string | null>(null)

  useEffect(() => { loadOrders() }, [filter, viewMode, selectedDate])
  useEffect(() => { window.api.sessions.getActive().then((s: any) => setShiftStart(s?.opened_at || null)).catch(() => {}) }, [])

  async function loadOrders() {
    const filters: any = {}
    if (viewMode === 'shift' && sessionId) {
      // Shift-based: show all orders from this session regardless of date
      filters.sessionId = sessionId
    } else {
      // Date-based fallback
      filters.date = selectedDate
    }
    if (filter !== 'all') filters.status = filter
    // Cashier only sees own orders
    if (cashierId) filters.cashierId = cashierId
    const data = await window.api.orders.getAll(filters)
    setOrders(data || [])
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

  async function doVoidOrder(id: string, reason: string, remarks?: string, disposition?: string) {
    const voidedByName = cashierId ? 'Cashier' : (user?.name || 'Supervisor')
    await window.api.orders.update(id, { status: 'Void', voidReason: reason, voidRemarks: remarks || undefined, voidedBy: voidedByName, voidDisposition: disposition || undefined })
    // Print void slip
    try { await window.api.print.voidSlip(id, reason, voidedByName, undefined, remarks, disposition) } catch {}
    // Free table if applicable
    const order = orders.find((o) => o.id === id)
    if (order?.table_name) {
      await window.api.tables.updateStatus(order.table_name, 'Available').catch(() => {})
    }
    loadOrders()
    setSelectedOrder(null)
    setVoidTarget(null)
    toast.success(`${order?.order_number || 'Order'} voided`)
  }

  async function retryAll() {
    setRetrying(true)
    try {
      const r: any = await window.api.sync.run()
      if (r?.up && r.up.success === false) toast.error(`Some sales still failed: ${r.up.errors?.[0] || ''}`)
      else toast.success('Sync complete')
    } catch (e: any) { toast.error(`Sync failed: ${e?.message || e}`) }
    setRetrying(false)
    loadOrders()
    refreshPendingSync(sessionId)
  }

  // Count summaries
  const completed = orders.filter((o) => o.status === 'Completed')
  const openCount = orders.filter((o) => o.status === 'Open').length
  const holdCount = orders.filter((o) => o.status === 'Hold').length
  const voidCount = orders.filter((o) => o.status === 'Void').length
  const totalSales = completed.reduce((s, o) => s + (o.grand_total || 0), 0)
  const pending = completed.filter((o) => o.sync_status !== 'synced')
  const syncedCount = orders.filter((o) => o.sync_status === 'synced').length

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return orders
    return orders.filter((o) => [o.order_number, o.table_name, o.cashier_name, o.waiter_name, o.order_type].some((v: any) => String(v || '').toLowerCase().includes(q)))
  }, [orders, query])

  const title = viewMode === 'shift' ? 'Sales today' : `Orders · ${new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
  const grid = 'grid grid-cols-[112px_54px_minmax(0,1fr)_100px_100px_96px_96px] items-center gap-3 px-3.5'

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-n-cream">
      <SubBar>
        <BackButton onClick={onClose} label={backLabel} />
        <span className="cond ml-1.5 whitespace-nowrap text-2xl font-bold">{title}</span>
        <span className="hidden truncate text-[13px] text-n-mist min-[1000px]:inline">
          {viewMode === 'shift' && shiftStart ? `Shift from ${timeOf(shiftStart)} · ` : ''}{completed.length} sale{completed.length === 1 ? '' : 's'} · {cur} {money(totalSales)}
        </span>
        <span className="flex-1" />
        {finding ? (
          <label className="flex h-11 items-center gap-2 rounded-md bg-white px-3 text-n-ink">
            <SearchIcon />
            <input autoFocus data-keyboard="full" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Invoice, table, name" className="w-40 bg-transparent text-sm focus:outline-none" />
            <button type="button" aria-label="Close search" onClick={() => { setQuery(''); setFinding(false) }} className="text-lg text-n-muted">×</button>
          </label>
        ) : (
          <button type="button" aria-label="Find a sale" onClick={() => setFinding(true)} className="press flex h-11 w-11 items-center justify-center rounded-md border-[1.5px] border-n-steel text-white"><SearchIcon /></button>
        )}
      </SubBar>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 p-3">
        {pending.length > 0 && (
          <section className="flex max-h-[30%] flex-shrink-0 flex-col overflow-hidden rounded-md bg-white shadow-[inset_4px_0_0_#F4A52A,0_1px_2px_rgba(60,45,20,.12)]">
            <div className="flex items-center gap-2.5 px-3.5 pb-1.5 pt-2.5">
              <span className="text-[15px] font-semibold">{pending.length} waiting to sync</span>
              <span className="truncate text-[13px] text-n-muted">Paid and printed here, not yet in ERPNext</span>
              <span className="flex-1" />
              <Btn size="sm" variant="deep" onClick={retryAll} disabled={retrying}>{retrying ? 'Syncing…' : 'Retry all'}</Btn>
            </div>
            <div className="overflow-y-auto">
              {pending.map((p) => (
                <button key={p.id} type="button" onClick={() => viewOrderDetail(p)} className="flex h-11 w-full items-center gap-3 border-t border-[#F0ECE3] px-3.5 text-left text-[13px]">
                  <span className="cond num w-[110px] text-[17px] font-bold">{p.order_number}</span>
                  <span className="num w-[54px] text-n-muted">{timeOf(p.created_at)}</span>
                  <span className="min-w-0 flex-1 truncate">{orderLabel(p)} · {typeShort(p.order_type).toLowerCase()}</span>
                  <span className={cn('max-w-[40%] truncate font-semibold', p.sync_status === 'failed' ? 'text-n-red' : 'text-[#B56A00]')}>{p.sync_error || (p.sync_status === 'failed' ? 'Failed' : 'Waiting for the next sync')}</span>
                  <span className="num w-[90px] text-right font-semibold">{cur} {money(p.grand_total)}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5">
          {([['all', 'All'], ['Completed', 'Paid'], ['Open', 'Open'], ['Hold', 'On hold'], ['Void', 'Void']] as [Filter, string][]).map(([k, l]) => (
            <Chip key={k} active={filter === k} onClick={() => setFilter(k)}>
              {k !== 'all' && <Dot color={STATUS_COLOR[k]} size={9} square />}{l}
              {filter === 'all' && k !== 'all' && <span className="num opacity-60">{k === 'Completed' ? completed.length : k === 'Open' ? openCount : k === 'Hold' ? holdCount : voidCount}</span>}
            </Chip>
          ))}
          <span className="flex-1" />
          {syncedCount > 0 && <span className="hidden text-xs text-n-muted min-[1000px]:inline">{syncedCount} synced</span>}
          <div className="flex overflow-hidden rounded-full border border-[#E0D9CB] bg-white p-[3px]">
            {sessionId && (
              <button type="button" onClick={() => setViewMode('shift')} className={cn('h-9 rounded-full px-3 text-[13px] font-semibold', viewMode === 'shift' ? 'bg-n-deep text-white' : 'text-n-muted')}>This shift</button>
            )}
            <button type="button" onClick={() => setViewMode('date')} className={cn('h-9 rounded-full px-3 text-[13px] font-semibold', viewMode === 'date' ? 'bg-n-deep text-white' : 'text-n-muted')}>By date</button>
          </div>
          {viewMode === 'date' && (
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
              className="h-11 rounded-md border border-n-edge bg-white px-3 text-sm font-medium focus:border-n-teal focus:outline-none" />
          )}
        </div>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md bg-white shadow-tile">
          <div className={cn(grid, 'h-8 flex-shrink-0 border-b border-n-line text-[11px] font-bold uppercase tracking-[.08em] text-n-muted')}>
            <span>Invoice</span><span>Time</span><span>Order</span><span>Status</span><span>ERPNext</span><span className="text-right">Total</span><span />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {rows.length === 0 && <div className="flex h-full items-center justify-center py-10 text-n-muted">No orders found</div>}
            {rows.map((o) => {
              const s = syncLabel(o)
              return (
                <div key={o.id} role="button" tabIndex={0} onClick={() => viewOrderDetail(o)} onKeyDown={(e) => e.key === 'Enter' && viewOrderDetail(o)}
                  className={cn(grid, 'h-12 cursor-pointer border-b border-[#F0ECE3] text-[13px]', selectedOrder?.id === o.id && 'bg-n-ice')}>
                  <span className="cond num truncate text-[17px] font-bold">{o.order_number}</span>
                  <span className="num text-n-muted">{timeOf(o.created_at)}</span>
                  <span className="truncate">{orderLabel(o)} · {typeShort(o.order_type).toLowerCase()}{o.cashier_name ? ` · ${o.cashier_name}` : ''}</span>
                  <span className="flex items-center gap-1.5"><Dot color={STATUS_COLOR[o.status] || C.stone} size={8} />{statusText(o.status)}</span>
                  <span className="flex items-center gap-1.5"><Dot color={s.color} size={8} />{s.text}</span>
                  <span className="num text-right font-semibold">{money(o.grand_total)}</span>
                  <span className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                    {o.status === 'Completed' && <button type="button" onClick={() => setPreviewOrderId(o.id)} className="press h-10 rounded-md border border-n-edge bg-white px-3 text-[13px] font-semibold">Reprint</button>}
                    {(o.status === 'Open' || o.status === 'Hold') && <button type="button" onClick={async () => { try { await window.api.print.invoice(o.id); toast.success('Invoice printed') } catch (e: any) { toast.error(`Invoice print failed: ${e.message}`) } }} className="press h-10 rounded-md border border-n-edge bg-white px-3 text-[13px] font-semibold">Invoice</button>}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      </div>

      {/* Order detail */}
      {selectedOrder && (
        <Sheet onClose={() => setSelectedOrder(null)} className="w-[400px] max-w-[92vw]" label={selectedOrder.order_number}>
          <div className="flex h-14 flex-shrink-0 items-center gap-3 bg-n-deep px-4 text-white">
            <span className="cond flex-1 text-2xl font-bold">{selectedOrder.order_number}</span>
            <span className="flex items-center gap-1.5 text-[13px] text-n-frost"><Dot color={STATUS_COLOR[selectedOrder.status] || C.stone} size={8} />{statusText(selectedOrder.status)}</span>
            <Btn variant="ghostDark" onClick={() => setSelectedOrder(null)}>Close</Btn>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 text-sm">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-n-muted">
              <span>Type <b className="text-n-ink">{typeShort(selectedOrder.order_type)}</b></span>
              {selectedOrder.table_name && <span>Table <b className="text-n-ink">{selectedOrder.table_name}</b></span>}
              <span>Cashier <b className="text-n-ink">{selectedOrder.cashier_name}</b></span>
              {selectedOrder.waiter_name && <span>Waiter <b className="text-n-ink">{selectedOrder.waiter_name}</b></span>}
              <span>Time <b className="text-n-ink">{timeOf(selectedOrder.created_at)}</b></span>
            </div>

            <div className="rounded-md bg-white p-3 shadow-tile">
              <Cap className="text-n-muted">Items</Cap>
              <div className="mt-1.5 flex flex-col gap-1.5">
                {orderItems.map((item) => {
                  let mods: any[] = []
                  try { mods = item.modifiers ? JSON.parse(item.modifiers) : [] } catch {}
                  return (
                    <div key={item.id} className="flex justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-medium">{item.qty} × {item.item_name}</span>
                        {mods.map((m: any, i: number) => <p key={i} className="ml-4 text-xs text-n-muted">+ {m.name} {m.price > 0 ? `(${money(m.price)})` : ''}</p>)}
                        {item.special_instructions && <p className="ml-4 text-xs text-[#B56A00]">“{item.special_instructions}”</p>}
                      </div>
                      <span className="num font-medium">{money(item.amount)}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-col gap-0.5 rounded-md bg-white p-3 shadow-tile">
              <div className="flex justify-between"><span className="text-n-muted">Subtotal</span><span className="num">{money(selectedOrder.subtotal)}</span></div>
              {(selectedOrder.discount_amount > 0 || selectedOrder.discount_percent > 0) && (
                <div className="flex justify-between text-n-green"><span>Discount{selectedOrder.promo_name ? ` (${selectedOrder.promo_name})` : ''}</span><span className="num">−{money((selectedOrder.discount_amount || 0) + (selectedOrder.subtotal || 0) * (selectedOrder.discount_percent || 0) / 100)}</span></div>
              )}
              {selectedOrder.tax_total > 0 && <div className="flex justify-between"><span className="text-n-muted">Tax</span><span className="num">{money(selectedOrder.tax_total)}</span></div>}
              <div className="mt-1 flex justify-between border-t border-n-line pt-1 text-base font-bold"><span>Total</span><span className="num">{cur} {money(selectedOrder.grand_total)}</span></div>
            </div>

            {orderPayments.length > 0 && (
              <div className="rounded-md bg-white p-3 shadow-tile">
                <Cap className="text-n-muted">Payments</Cap>
                {orderPayments.map((p) => (
                  <div key={p.id} className="mt-1 flex justify-between"><span>{p.payment_method}{p.collected_by_waiter ? ` · by ${p.collected_by_waiter}` : ''}{p.reference ? ` · ${p.reference}` : ''}</span><span className="num font-medium">{money(p.amount)}</span></div>
                ))}
              </div>
            )}

            {selectedOrder.void_reason && <div className="rounded-md bg-[#F6E3DF] p-3 text-sm text-n-red"><b>Void reason:</b> {selectedOrder.void_reason}</div>}
            {selectedOrder.sync_error && <div className="rounded-md bg-[#FBEFD9] p-3 text-xs text-[#8A5A00]"><b>Sync error:</b> {selectedOrder.sync_error}</div>}
            {selectedOrder.erpnext_docname && <div className="rounded-md bg-white p-3 text-xs text-n-muted"><b>ERPNext:</b> {selectedOrder.erpnext_docname}</div>}
          </div>

          <div className="flex flex-shrink-0 gap-2 bg-white px-4 py-3">
            {selectedOrder.status === 'Completed' && (
              <>
                <Btn size="lg" variant="outline" className="flex-1" onClick={() => setPreviewOrderId(selectedOrder.id)}>Reprint</Btn>
                {isSupervisor && <Btn size="lg" variant="dangerOutline" className="flex-1" onClick={() => setVoidTarget(selectedOrder)}>Void</Btn>}
              </>
            )}
            {selectedOrder.status === 'Void' && (
              <Btn size="lg" variant="dangerOutline" className="flex-1" onClick={async () => {
                try { await window.api.print.voidSlip(selectedOrder.id, selectedOrder.void_reason || 'Voided', 'Reprint'); toast.success('Void slip printed') } catch { toast.error('Print failed') }
              }}>Print void slip</Btn>
            )}
            {(selectedOrder.status === 'Open' || selectedOrder.status === 'Hold') && (
              <>
                <Btn size="lg" variant="outline" className="flex-1" onClick={async () => {
                  try { await window.api.print.invoice(selectedOrder.id); toast.success('Invoice printed') } catch (e: any) { toast.error(`Invoice print failed: ${e.message}`) }
                }}>Print invoice</Btn>
                <Btn size="lg" variant="dangerOutline" className="flex-1" onClick={() => setVoidTarget(selectedOrder)}>Void order</Btn>
              </>
            )}
          </div>
        </Sheet>
      )}

      {/* Receipt Preview */}
      {previewOrderId && <ReceiptPreview orderId={previewOrderId} onClose={() => setPreviewOrderId(null)} />}

      {/* Void order: reason → disposition → remarks, supervisor PIN inline for cashiers */}
      {voidTarget && (
        <VoidDialog
          requirePin={!isSupervisor}
          target={{
            kind: 'order',
            title: `Void ${voidTarget.order_number}`,
            subtitle: voidTarget.status === 'Completed' ? 'This sale is already paid. The whole order is voided and a void slip prints.' : 'The whole order is cancelled and a void slip prints.',
            amount: voidTarget.grand_total
          }}
          onCancel={() => setVoidTarget(null)}
          onConfirm={(r) => doVoidOrder(voidTarget.id, r.reason, r.remarks, r.disposition)}
        />
      )}
    </div>
  )
}
