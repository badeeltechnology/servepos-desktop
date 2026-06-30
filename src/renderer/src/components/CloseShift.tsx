import { useState, useEffect } from 'react'
import { X, Clock, CheckCircle, AlertTriangle, Banknote, UserCheck, Trash2 } from 'lucide-react'

interface Props {
  sessionId: string
  onClose: () => void
  onCancel: () => void
}

export default function CloseShift({ sessionId, onClose, onCancel }: Props) {
  const [session, setSession] = useState<any>(null)
  const [paymentMethods, setPaymentMethods] = useState<any[]>([])
  const [closingBalances, setClosingBalances] = useState<Record<string, number>>({})
  const [expected, setExpected] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const [remarks, setRemarks] = useState('')
  const [orderCount, setOrderCount] = useState(0)
  const [totalSales, setTotalSales] = useState(0)
  const [openOrderCount, setOpenOrderCount] = useState(0)
  const [allOpenOrders, setAllOpenOrders] = useState<any[]>([])
  const [pendingSyncCount, setPendingSyncCount] = useState(0)
  const [waiterSummary, setWaiterSummary] = useState<any[]>([])
  const [voidingAll, setVoidingAll] = useState(false)
  const [showVoidAllConfirm, setShowVoidAllConfirm] = useState(false)
  const [voidAllRemarks, setVoidAllRemarks] = useState('')
  const [singleVoid, setSingleVoid] = useState<{ orderId: string; orderNumber: string; reason: string; remarks: string } | null>(null)
  const [voidReasons, setVoidReasons] = useState<{ name: string; reason_name: string }[]>([])

  useEffect(() => { loadData() }, [sessionId])

  async function loadData() {
    const [s, methods, orders, openOrders, pendingSync, allOpen] = await Promise.all([
      window.api.sessions.getActive(),
      window.api.paymentMethods.get(),
      window.api.sessions.getOrders(sessionId),
      window.api.sessions.getOpenOrders(sessionId),
      window.api.sessions.getPendingSync(sessionId),
      window.api.sessions.getAllOpenOrders()
    ])
    setSession(s)
    setPaymentMethods(methods)
    setAllOpenOrders(allOpen || [])
    setOpenOrderCount(allOpen.length)
    setPendingSyncCount(pendingSync.length)

    // Calculate expected amounts
    const opening = JSON.parse(s?.opening_balance || '[]')
    const expectedAmounts: Record<string, number> = {}
    for (const ob of opening) {
      expectedAmounts[ob.mode] = ob.amount
    }

    const completedOrders = orders.filter((o: any) => o.status === 'Completed')
    setOrderCount(completedOrders.length)
    setTotalSales(completedOrders.reduce((sum: number, o: any) => sum + (o.grand_total || 0), 0))

    for (const order of completedOrders) {
      const payments = await window.api.orderPayments.get(order.id)
      for (const p of payments) {
        expectedAmounts[p.payment_method] = (expectedAmounts[p.payment_method] || 0) + p.amount
      }
    }

    setExpected(expectedAmounts)

    // Load void reasons
    try {
      const reasons = await window.api.voidReasons.list()
      setVoidReasons(reasons || [])
    } catch { /* ignore */ }

    // Load waiter summary
    try {
      const ws = await window.api.sessions.getWaiterSummary(sessionId)
      setWaiterSummary(ws || [])
    } catch { /* ignore */ }

    // Pre-fill closing with expected
    const defaults: Record<string, number> = {}
    for (const m of methods) {
      defaults[m.mode_of_payment] = expectedAmounts[m.mode_of_payment] || 0
    }
    setClosingBalances(defaults)
  }

  const [showConfirm, setShowConfirm] = useState(false)

  async function handleClose() {
    setError('')
    setLoading(true)
    try {
      const closingBalance = Object.entries(closingBalances).map(([mode, amount]) => ({ mode, amount }))
      await window.api.sessions.close(sessionId, closingBalance, remarks)
      // Print closing voucher
      try { await window.api.print.closeShift(sessionId) } catch {}
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to close shift')
      setShowConfirm(false)
    } finally {
      setLoading(false)
    }
  }

  if (!session) return null

  const openedAt = new Date(session.opened_at + 'Z')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[550px] max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-xl font-bold">Close Shift</h2>
            <p className="text-sm text-gray-500">
              Opened {openedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} by {session.user_name}
            </p>
          </div>
          <button onClick={onCancel} className="rounded-xl p-2 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Summary */}
          <div className="mb-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-emerald-50 p-4 text-center">
              <p className="text-xs text-emerald-600 font-semibold">Total Sales</p>
              <p className="text-2xl font-bold text-emerald-700">{totalSales.toFixed(2)}</p>
            </div>
            <div className="rounded-xl bg-blue-50 p-4 text-center">
              <p className="text-xs text-blue-600 font-semibold">Orders</p>
              <p className="text-2xl font-bold text-blue-700">{orderCount}</p>
            </div>
          </div>

          {/* Payment Reconciliation */}
          {/* Cash Reconciliation */}
          <h3 className="mb-3 text-sm font-bold text-gray-500 uppercase">Cash Reconciliation</h3>
          <div className="rounded-xl border-2 border-gray-100 overflow-hidden">
            <div className="grid grid-cols-4 gap-2 bg-gray-50 px-4 py-2 text-[11px] font-bold text-gray-500 uppercase">
              <span></span>
              <span className="text-right">Expected</span>
              <span className="text-right">Actual (count)</span>
              <span className="text-right">Difference</span>
            </div>
            {(() => {
              const cashExp = expected['Cash'] || 0
              const cashActual = closingBalances['Cash'] || 0
              const cashDiff = cashActual - cashExp
              return (
                <div className="grid grid-cols-4 gap-2 items-center border-t px-4 py-4">
                  <div className="flex items-center gap-2">
                    <Banknote className="h-5 w-5 text-gray-400" />
                    <span className="text-sm font-bold">Cash</span>
                  </div>
                  <span className="text-right font-mono text-sm font-semibold text-gray-700">{cashExp.toFixed(2)}</span>
                  <input
                    type="number"
                    data-keyboard="numpad"
                    value={closingBalances['Cash'] || ''}
                    onChange={(e) => setClosingBalances({ ...closingBalances, Cash: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-lg border-2 border-gray-200 px-3 py-2 text-right font-mono text-sm font-bold focus:border-primary focus:outline-none"
                    min={0} step={0.01} autoFocus
                  />
                  <div className="text-right">
                    <span className={`font-mono text-sm font-bold ${
                      cashDiff === 0 ? 'text-emerald-600' : cashDiff > 0 ? 'text-blue-600' : 'text-red-600'
                    }`}>
                      {cashDiff > 0 ? '+' : ''}{cashDiff.toFixed(2)}
                    </span>
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Cash difference message */}
          {(() => {
            const cashExp = expected['Cash'] || 0
            const cashActual = closingBalances['Cash'] || 0
            const cashDiff = cashActual - cashExp
            if (cashDiff !== 0) {
              return (
                <div className={`mt-3 flex items-center gap-2 rounded-xl p-3 text-sm ${
                  cashDiff > 0 ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'
                }`}>
                  <AlertTriangle className="h-4 w-4" />
                  <span>{cashDiff > 0 ? `Cash overage: +${cashDiff.toFixed(2)}` : `Cash shortage: ${cashDiff.toFixed(2)}`}</span>
                </div>
              )
            }
            return (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">
                <CheckCircle className="h-4 w-4" />
                <span>Cash balance matches. No discrepancy.</span>
              </div>
            )
          })()}

          {/* Other payment methods — read-only summary */}
          {paymentMethods.filter(m => m.mode_of_payment !== 'Cash').length > 0 && (
            <>
              <h3 className="mb-2 mt-5 text-sm font-bold text-gray-500 uppercase">Other Payments</h3>
              <div className="rounded-xl border bg-gray-50 divide-y">
                {paymentMethods.filter(m => m.mode_of_payment !== 'Cash').map((m) => {
                  const exp = expected[m.mode_of_payment] || 0
                  return (
                    <div key={m.name} className="flex items-center justify-between px-4 py-3">
                      <span className="text-sm font-semibold text-gray-600">{m.mode_of_payment}</span>
                      <span className="font-mono text-sm font-bold text-gray-700">{exp.toFixed(2)}</span>
                    </div>
                  )
                })}
              </div>
              <p className="mt-1 text-xs text-gray-400">Electronic payments are tracked automatically from transactions.</p>
            </>
          )}

          {/* Waiter Accountability */}
          {waiterSummary.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-gray-500 uppercase">
                <UserCheck className="h-4 w-4" />
                Waiter Accountability
              </h3>
              <div className="rounded-xl border-2 border-gray-100 overflow-hidden">
                <div className="grid grid-cols-4 gap-2 bg-gray-50 px-4 py-2 text-[11px] font-bold text-gray-500 uppercase">
                  <span>Waiter</span>
                  <span className="text-right">Paid</span>
                  <span className="text-right">Open</span>
                  <span className="text-right">Collected</span>
                </div>
                {waiterSummary.map((w: any) => (
                  <div key={w.waiter_name} className={`grid grid-cols-4 gap-2 items-center border-t px-4 py-2.5 ${w.open_orders > 0 ? 'bg-amber-50' : ''}`}>
                    <span className="text-sm font-semibold">{w.waiter_name}</span>
                    <span className="text-right text-sm text-gray-600">{w.paid_orders}</span>
                    <span className={`text-right text-sm font-bold ${w.open_orders > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {w.open_orders > 0 ? w.open_orders : '-'}
                    </span>
                    <span className="text-right font-mono text-sm font-semibold">{(w.total_collected || 0).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              {waiterSummary.some((w: any) => w.open_orders > 0) && (
                <div className="mt-2 flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <span>
                    <strong>Uncleared orders: </strong>
                    {waiterSummary.filter((w: any) => w.open_orders > 0).map((w: any) =>
                      `${w.waiter_name} (${w.open_order_numbers})`
                    ).join('; ')}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Remarks */}
          <div className="mt-5">
            <h3 className="mb-2 text-sm font-bold text-gray-500 uppercase">Remarks (optional)</h3>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              data-keyboard="full"
              placeholder="Any notes about this shift — discrepancies, incidents, etc."
              className="w-full resize-none rounded-xl border-2 border-gray-200 px-4 py-3 text-sm focus:border-primary focus:outline-none"
              rows={3}
            />
          </div>
        </div>

        {/* Blockers & Footer */}
        <div className="border-t px-6 py-4">
          {/* Blockers */}
          {openOrderCount > 0 && (
            <div className="mb-3 rounded-xl bg-amber-50 border border-amber-200 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-sm text-amber-700">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <span><strong>{openOrderCount} order(s)</strong> still open. Void them to close shift.</span>
                </div>
                <button
                  onClick={() => { setShowVoidAllConfirm(true); setVoidAllRemarks('') }}
                  disabled={voidingAll}
                  className="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  <Trash2 className="h-3 w-3" />
                  {voidingAll ? 'Voiding...' : 'Void All'}
                </button>
              </div>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {allOpenOrders.map((order: any) => {
                  const isOldSession = order.session_id !== sessionId
                  const createdDate = new Date(order.created_at + 'Z')
                  return (
                    <div key={order.id} className="flex items-center justify-between rounded-lg bg-white/70 px-3 py-1.5 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">#{order.order_number?.split('-').pop()}</span>
                        <span className="text-gray-500">{order.table_name || order.order_type}</span>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          order.status === 'Hold' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'
                        }`}>{order.status}</span>
                        {isOldSession && (
                          <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-600">Previous shift</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400 text-[10px]">
                          {createdDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}{' '}
                          {createdDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <button
                          onClick={() => setSingleVoid({ orderId: order.id, orderNumber: order.order_number?.split('-').pop() || '', reason: '', remarks: '' })}
                          className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-600 hover:bg-red-200"
                        >Void</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {pendingSyncCount > 0 && (
            <div className="mb-3 flex items-center justify-between rounded-xl bg-blue-50 border border-blue-200 p-3 text-sm text-blue-700">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span><strong>{pendingSyncCount} order(s)</strong> pending sync to ERPNext.</span>
              </div>
              <button onClick={async () => { setSyncing(true); await window.api.sync.run(); await loadData(); setSyncing(false) }}
                disabled={syncing}
                className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                {syncing ? 'Syncing...' : 'Sync Now'}
              </button>
            </div>
          )}

          {error && <p className="mb-2 text-sm text-red-500">{error}</p>}
          <div className="flex gap-3">
            <button onClick={onCancel}
              className="flex-1 rounded-xl border-2 border-gray-200 py-3 text-sm font-semibold text-gray-500 hover:bg-gray-50">
              Cancel
            </button>
            <button onClick={() => setShowConfirm(true)} disabled={loading || openOrderCount > 0 || pendingSyncCount > 0}
              className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-bold text-white shadow-lg shadow-red-600/25 hover:bg-red-700 active:scale-[0.98] disabled:opacity-50">
              {loading ? 'Closing...' : 'Close Shift'}
            </button>
          </div>

          {/* Confirmation dialog */}
          {/* Single order void modal */}
          {singleVoid && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
              <div className="w-80 rounded-2xl bg-white p-6 shadow-2xl">
                <h3 className="mb-1 text-center text-lg font-bold">Void Order #{singleVoid.orderNumber}</h3>
                <p className="mb-3 text-center text-xs text-gray-500">Select or enter a reason</p>

                {voidReasons.length > 0 && !singleVoid.reason && (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto mb-3">
                    {voidReasons.map((r) => (
                      <button key={r.name}
                        onClick={() => setSingleVoid({ ...singleVoid, reason: r.reason_name })}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-left text-sm font-medium hover:bg-red-50 hover:border-red-200 transition-colors">
                        {r.reason_name}
                      </button>
                    ))}
                    <button onClick={() => setSingleVoid({ ...singleVoid, reason: ' ' })}
                      className="w-full rounded-lg border border-dashed border-gray-200 px-3 py-2 text-left text-sm text-gray-500 hover:bg-gray-50">
                      Other (type reason)...
                    </button>
                  </div>
                )}

                {(singleVoid.reason || voidReasons.length === 0) && (
                  <>
                    {(singleVoid.reason === ' ' || voidReasons.length === 0) && (
                      <input type="text" data-keyboard="full" value={singleVoid.reason.trim()}
                        onChange={(e) => setSingleVoid({ ...singleVoid, reason: e.target.value })}
                        placeholder="Enter void reason..."
                        className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none mb-2" autoFocus />
                    )}
                    {singleVoid.reason.trim() && (
                      <>
                        {voidReasons.length > 0 && singleVoid.reason !== ' ' && (
                          <p className="mb-2 text-xs text-gray-500">Reason: <strong>{singleVoid.reason}</strong></p>
                        )}
                        <textarea data-keyboard="full" value={singleVoid.remarks}
                          onChange={(e) => setSingleVoid({ ...singleVoid, remarks: e.target.value })}
                          placeholder="Add remarks (optional)..."
                          className="w-full resize-none rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none mb-3" rows={2} />
                      </>
                    )}
                  </>
                )}

                <div className="flex gap-3">
                  <button onClick={() => setSingleVoid(null)}
                    className="flex-1 rounded-xl border-2 border-gray-200 py-2.5 text-sm font-semibold hover:bg-gray-50">Cancel</button>
                  <button
                    onClick={async () => {
                      const reason = singleVoid.reason.trim()
                      if (!reason) return
                      try {
                        await window.api.orders.update(singleVoid.orderId, {
                          status: 'Void', voidReason: reason,
                          voidRemarks: singleVoid.remarks.trim() || undefined,
                          voidedBy: 'Supervisor'
                        })
                        const order = allOpenOrders.find(o => o.id === singleVoid.orderId)
                        if (order?.table_name) {
                          try { await window.api.tables.updateStatus(order.table_name, 'Available') } catch {}
                        }
                        try { await window.api.print.voidSlip(singleVoid.orderId, reason, 'Supervisor', undefined, singleVoid.remarks.trim()) } catch {}
                        setSingleVoid(null)
                        await loadData()
                      } catch (err: any) {
                        setError(err.message || 'Failed to void order')
                      }
                    }}
                    disabled={!singleVoid.reason.trim()}
                    className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">
                    Void
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Void All confirmation with remarks */}
          {showVoidAllConfirm && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
              <div className="w-80 rounded-2xl bg-white p-6 shadow-2xl">
                <h3 className="mb-2 text-center text-lg font-bold">Void All Orders</h3>
                <p className="mb-3 text-center text-sm text-gray-500">
                  This will void <strong>{openOrderCount}</strong> open order(s) with reason &quot;Voided at shift close&quot;.
                </p>
                <textarea
                  value={voidAllRemarks}
                  onChange={(e) => setVoidAllRemarks(e.target.value)}
                  data-keyboard="full"
                  placeholder="Add remarks (optional)..."
                  className="w-full resize-none rounded-xl border-2 border-gray-200 px-4 py-3 text-sm focus:border-primary focus:outline-none mb-4"
                  rows={3} autoFocus
                />
                <div className="flex gap-3">
                  <button onClick={() => setShowVoidAllConfirm(false)}
                    className="flex-1 rounded-xl border-2 border-gray-200 py-2.5 text-sm font-semibold hover:bg-gray-50">
                    Cancel
                  </button>
                  <button onClick={async () => {
                    setShowVoidAllConfirm(false)
                    setVoidingAll(true)
                    try {
                      const rmk = voidAllRemarks.trim()
                      for (const order of allOpenOrders) {
                        await window.api.orders.update(order.id, {
                          status: 'Void',
                          voidReason: 'Voided at shift close',
                          voidRemarks: rmk || undefined,
                          voidedBy: 'Supervisor'
                        })
                        if (order.table_name) {
                          try { await window.api.tables.updateStatus(order.table_name, 'Available') } catch {}
                        }
                      }
                      await loadData()
                    } catch (err: any) {
                      setError(err.message || 'Failed to void orders')
                    } finally {
                      setVoidingAll(false)
                    }
                  }} disabled={voidingAll}
                    className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">
                    {voidingAll ? 'Voiding...' : 'Void All'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {showConfirm && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
              <div className="w-80 rounded-2xl bg-white p-6 shadow-2xl">
                <h3 className="mb-2 text-center text-lg font-bold">Confirm Close Shift</h3>
                <p className="mb-5 text-center text-sm text-gray-500">Are you sure you want to close this shift? This action cannot be undone.</p>
                <div className="flex gap-3">
                  <button onClick={() => setShowConfirm(false)}
                    className="flex-1 rounded-xl border-2 border-gray-200 py-2.5 text-sm font-semibold hover:bg-gray-50">
                    Cancel
                  </button>
                  <button onClick={handleClose} disabled={loading}
                    className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">
                    {loading ? 'Closing...' : 'Yes, Close Shift'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
