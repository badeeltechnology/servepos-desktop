import { useState, useEffect } from 'react'
import { X, Clock, CheckCircle, AlertTriangle, Banknote } from 'lucide-react'

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
  const [pendingSyncCount, setPendingSyncCount] = useState(0)

  useEffect(() => { loadData() }, [sessionId])

  async function loadData() {
    const [s, methods, orders, openOrders, pendingSync] = await Promise.all([
      window.api.sessions.getActive(),
      window.api.paymentMethods.get(),
      window.api.sessions.getOrders(sessionId),
      window.api.sessions.getOpenOrders(sessionId),
      window.api.sessions.getPendingSync(sessionId)
    ])
    setSession(s)
    setPaymentMethods(methods)
    setOpenOrderCount(openOrders.length)
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

    // Pre-fill closing with expected
    const defaults: Record<string, number> = {}
    for (const m of methods) {
      defaults[m.mode_of_payment] = expectedAmounts[m.mode_of_payment] || 0
    }
    setClosingBalances(defaults)
  }

  async function handleClose() {
    setError('')
    setLoading(true)
    try {
      const closingBalance = Object.entries(closingBalances).map(([mode, amount]) => ({ mode, amount }))
      await window.api.sessions.close(sessionId, closingBalance, remarks)
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to close shift')
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

          {/* Remarks */}
          <div className="mt-5">
            <h3 className="mb-2 text-sm font-bold text-gray-500 uppercase">Remarks (optional)</h3>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
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
            <div className="mb-3 flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-700">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span><strong>{openOrderCount} order(s)</strong> still open or on hold. Supervisor must complete or void them before closing.</span>
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
            <button onClick={handleClose} disabled={loading || openOrderCount > 0 || pendingSyncCount > 0}
              className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-bold text-white shadow-lg shadow-red-600/25 hover:bg-red-700 active:scale-[0.98] disabled:opacity-50">
              {loading ? 'Closing...' : 'Close Shift'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
