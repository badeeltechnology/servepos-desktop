import { useState, useEffect } from 'react'
import { useAuthStore } from '../stores/auth'
import { useStatus, isCashMethod } from '../stores/status'
import { askConfirm, toast } from '../stores/ui'
import StatusBand from './StatusBand'
import CashCount, { Counts, countTotal } from './CashCount'
import VoidDialog from './VoidDialog'
import { SubBar, BackButton, Btn, Cap, Field, money } from '../ui'
import { timeOf } from '../ui/hosts'
import { cn } from '../lib/utils'
import { useT } from '../stores/i18n'

interface Props {
  sessionId: string
  onClose: () => void
  onCancel: () => void
}

// Close shift, blind: count the drawer first; the expected cash appears only after
// "Finished counting, compare". Open orders and unsynced sales still block closing.

export default function CloseShift({ sessionId, onClose, onCancel }: Props) {
  const user = useAuthStore((s) => s.user)
  const cur = useStatus((s) => s.currency)
  const [session, setSession] = useState<any>(null)
  const [paymentMethods, setPaymentMethods] = useState<any[]>([])
  const [expected, setExpected] = useState<Record<string, number>>({})
  const [opening, setOpening] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const [remarks, setRemarks] = useState('')
  const [orderCount, setOrderCount] = useState(0)
  const [totalSales, setTotalSales] = useState(0)
  const [allOpenOrders, setAllOpenOrders] = useState<any[]>([])
  const [pendingSyncCount, setPendingSyncCount] = useState(0)
  const [waiterSummary, setWaiterSummary] = useState<any[]>([])
  const [counts, setCounts] = useState<Counts>({})
  const [manual, setManual] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [voidOrder, setVoidOrder] = useState<any>(null)
  const [closing, setClosing] = useState(false)
  const t = useT()

  useEffect(() => { loadData() }, [sessionId])

  async function loadData() {
    const [s, methods, orders, , pendingSync, allOpen] = await Promise.all([
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
    setOrderCount(0)
    setPendingSyncCount((pendingSync || []).length)

    // Calculate expected amounts
    const openingBal = JSON.parse(s?.opening_balance || '[]')
    const expectedAmounts: Record<string, number> = {}
    const openingAmounts: Record<string, number> = {}
    for (const ob of openingBal) {
      expectedAmounts[ob.mode] = ob.amount
      openingAmounts[ob.mode] = ob.amount
    }

    const completedOrders = (orders || []).filter((o: any) => o.status === 'Completed')
    setOrderCount(completedOrders.length)
    setTotalSales(completedOrders.reduce((sum: number, o: any) => sum + (o.grand_total || 0), 0))

    for (const order of completedOrders) {
      const payments = await window.api.orderPayments.get(order.id)
      for (const p of payments) {
        expectedAmounts[p.payment_method] = (expectedAmounts[p.payment_method] || 0) + p.amount
      }
    }

    setExpected(expectedAmounts)
    setOpening(openingAmounts)

    // Load waiter summary
    try {
      const ws = await window.api.sessions.getWaiterSummary(sessionId)
      setWaiterSummary(ws || [])
    } catch { /* ignore */ }
  }

  const cashName = paymentMethods.find((m: any) => isCashMethod(m.mode_of_payment))?.mode_of_payment || 'Cash'
  const counted = manual !== null ? parseFloat(manual || '0') || 0 : countTotal(counts)
  const cashExp = expected[cashName] || 0
  const cashDiff = Math.round((counted - cashExp) * 100) / 100
  const openCount = allOpenOrders.length
  // Open orders still block closing. Unsynced sales do not: the shift closes locally and the
  // sales and the shift log go to ERPNext on the next sync (works offline).
  const blocked = openCount > 0
  const canClose = revealed && !blocked && !loading && !closing

  async function handleClose() {
    if (!canClose) return
    setClosing(true)
    try {
      // Try to get unsynced sales out first; if that fails (offline), close anyway after saying so.
      let pending = pendingSyncCount
      if (pending > 0) {
        setSyncing(true)
        try { await window.api.sync.run() } catch { /* offline */ }
        try { pending = ((await window.api.sessions.getPendingSync(sessionId)) || []).length } catch {}
        setPendingSyncCount(pending)
        setSyncing(false)
      }
      const ok = await askConfirm({
        title: t('Close shift') + '?',
        body: `Counted ${cur} ${money(counted)}${cashDiff === 0 ? ', drawer matches.' : `, ${cashDiff > 0 ? 'over' : 'short'} by ${money(Math.abs(cashDiff))}.`}${pending > 0 ? `\n${pending} sale${pending === 1 ? ' is' : 's are'} not in ERPNext yet. They stay on this till and sync automatically when the connection is back.` : ''}\nThis can’t be undone.`,
        ok: t('Close shift'), cancel: 'Not yet'
      })
      if (!ok) return
      await doClose()
    } finally {
      setClosing(false)
    }
  }

  async function doClose() {
    setError('')
    setLoading(true)
    try {
      // Every method closes at its expected amount except Cash, which is what was counted (as before)
      const closingBalances: Record<string, number> = {}
      for (const m of paymentMethods) closingBalances[m.mode_of_payment] = expected[m.mode_of_payment] || 0
      closingBalances[cashName] = Math.round(counted * 100) / 100
      const closingBalance = Object.entries(closingBalances).map(([mode, amount]) => ({ mode, amount }))
      await window.api.sessions.close(sessionId, closingBalance, remarks)
      // Print closing voucher
      try { await window.api.print.closeShift(sessionId) } catch {}
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to close shift')
    } finally {
      setLoading(false)
    }
  }

  const openedAt = session?.opened_at
  const nonCash = paymentMethods.filter((m) => m.mode_of_payment !== cashName)

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-n-cream text-n-ink">
      <StatusBand userName={user?.name} showWaiter={false} />
      <SubBar>
        <BackButton onClick={onCancel} />
        <span className="cond ml-1.5 whitespace-nowrap text-2xl font-bold">{t('Close shift')}</span>
        <span className="truncate text-[13px] text-n-mist">{openedAt ? `Opened ${timeOf(openedAt)} by ${session?.user_name}` : ''}</span>
        <span className="flex-1" />
        {openCount > 0 && <span className="whitespace-nowrap text-[13px] font-semibold text-n-gold">{openCount} order{openCount === 1 ? '' : 's'} still open</span>}
      </SubBar>

      <div className="flex min-h-0 flex-1 gap-3 p-3">
        <CashCount title={t('Count the cash in the drawer')} hint="The expected amount shows only after you finish counting" rowHeight={62}
          counts={counts} onCounts={(c) => { setCounts(c) }} manual={manual} onManual={setManual} />

        <aside className="flex w-[340px] flex-shrink-0 flex-col gap-3">
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
            <div className="flex flex-shrink-0 flex-col gap-1 rounded-md bg-n-deep p-4 text-white">
              <Cap className="text-n-mist">{t('Counted cash')}</Cap>
              <span className="cond num text-5xl font-bold leading-none">{cur} {money(counted)}</span>
              {revealed ? (
                <div className="mt-2.5 flex flex-col gap-1 border-t border-n-steel pt-2.5 text-[13px]">
                  <span className="flex justify-between"><span>{t('Opening float')}</span><span className="num">{money(opening[cashName] || 0)}</span></span>
                  <span className="flex justify-between"><span>{t('Cash sales')}</span><span className="num">+ {money(cashExp - (opening[cashName] || 0))}</span></span>
                  <span className="flex justify-between font-semibold"><span>{t('Expected in drawer')}</span><span className="num">{money(cashExp)}</span></span>
                  <span className={cn('mt-1.5 text-sm font-bold', cashDiff === 0 ? 'text-n-lamp' : Math.abs(cashDiff) <= 20 ? 'text-n-gold' : 'text-n-coral')}>
                    {cashDiff === 0 ? t('Drawer matches') : `${cashDiff > 0 ? 'Over' : 'Short'} by ${money(Math.abs(cashDiff))}, goes on the closing entry`}
                  </span>
                  <button type="button" onClick={() => setRevealed(false)} className="mt-1 self-start text-xs font-semibold text-n-mist underline">{t('Recount')}</button>
                </div>
              ) : (
                <button type="button" onClick={() => setRevealed(true)} className="press mt-2.5 h-12 rounded-md border-[1.5px] border-n-steel bg-transparent text-sm font-semibold text-white">{t('Finished counting, compare')}</button>
              )}
            </div>

            <div className="flex flex-shrink-0 flex-col gap-1.5 rounded-md bg-white px-4 py-3 text-[13px] shadow-tile">
              <span className="mb-0.5 font-semibold">{t('Shift totals')}</span>
              {nonCash.map((m) => (
                <span key={m.name} className="flex justify-between"><span>{m.mode_of_payment}</span><span className="num">{money(expected[m.mode_of_payment] || 0)}</span></span>
              ))}
              {revealed && <span className="flex justify-between"><span>Cash</span><span className="num">{money(cashExp - (opening[cashName] || 0))}</span></span>}
              <span className="mt-0.5 flex justify-between border-t border-n-line pt-1.5 font-semibold"><span>Sales, {orderCount} invoice{orderCount === 1 ? '' : 's'}</span><span className="num">{money(totalSales)}</span></span>
            </div>

            {waiterSummary.length > 0 && (
              <div className="flex flex-shrink-0 flex-col gap-1 rounded-md bg-white px-4 py-3 text-[13px] shadow-tile">
                <span className="mb-0.5 font-semibold">Waiters</span>
                <span className="grid grid-cols-[1fr_36px_40px_76px] gap-x-1 text-xs font-bold uppercase tracking-[.06em] text-n-muted"><span>Name</span><span className="text-right">Paid</span><span className="text-right">Open</span><span className="text-right">Collected</span></span>
                {waiterSummary.map((w: any) => (
                  <span key={w.waiter_name} className={cn('grid grid-cols-[1fr_36px_40px_76px] gap-x-1', w.open_orders > 0 && 'font-semibold text-n-red')}>
                    <span className="truncate">{w.waiter_name}</span><span className="num text-right">{w.paid_orders}</span><span className="num text-right">{w.open_orders > 0 ? w.open_orders : '–'}</span><span className="num text-right">{money(w.total_collected || 0)}</span>
                  </span>
                ))}
                {waiterSummary.some((w: any) => w.open_orders > 0) && (
                  <span className="mt-1 text-xs text-[#8A5A00]">Uncleared: {waiterSummary.filter((w: any) => w.open_orders > 0).map((w: any) => `${w.waiter_name} (${w.open_order_numbers})`).join('; ')}</span>
                )}
              </div>
            )}

            {openCount > 0 && (
              <div className="flex flex-shrink-0 flex-col gap-1.5 rounded-md bg-white px-4 py-3 text-[13px] shadow-[inset_4px_0_0_#F4A52A,0_1px_2px_rgba(60,45,20,.12)]">
                <span className="font-semibold">{openCount} order{openCount === 1 ? '' : 's'} still open. Pay or void {openCount === 1 ? 'it' : 'them'} to close.</span>
                {allOpenOrders.map((o: any) => (
                  <span key={o.id} className="flex items-center gap-2">
                    <span className="cond num text-[15px] font-bold">#{o.order_number?.split('-').pop()}</span>
                    <span className="min-w-0 flex-1 truncate text-n-muted">{o.table_name || o.order_type} · {o.status}{o.session_id !== sessionId ? ' · previous shift' : ''}</span>
                    <Btn size="sm" variant="dangerOutline" onClick={() => setVoidOrder(o)}>Void</Btn>
                  </span>
                ))}
              </div>
            )}

            {pendingSyncCount > 0 && (
              <div className="flex flex-shrink-0 items-center gap-2 rounded-md bg-white px-4 py-3 text-[13px] shadow-tile">
                <span className="flex-1"><b>{pendingSyncCount} sale{pendingSyncCount === 1 ? '' : 's'}</b> not in ERPNext yet. You can still close; they sync later.</span>
                <Btn size="sm" variant="deep" disabled={syncing} onClick={async () => { setSyncing(true); try { await window.api.sync.run() } catch {} await loadData(); setSyncing(false) }}>{syncing ? t('Syncing…') : t('Sync now')}</Btn>
              </div>
            )}

            <Field data-keyboard="full" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Remarks for this shift (optional)" className="flex-shrink-0" />
          </div>

          {error && <span className="text-sm font-semibold text-n-red">{error}</span>}
          <button type="button" onClick={handleClose} disabled={!canClose}
            className={cn('press flex h-16 flex-shrink-0 items-center justify-between whitespace-nowrap rounded-lg px-[18px] text-lg font-bold', canClose ? 'bg-n-amber text-n-ink' : 'bg-n-sand text-n-stone')}>
            <span>{loading || closing ? (syncing ? t('Syncing…') : 'Closing…') : !revealed ? t('Count first') : blocked ? t('Clear the blockers') : t('Close shift')}</span>
            <span className="text-[13px] font-medium">{canClose ? 'Prints the closing voucher' : ''}</span>
          </button>
        </aside>
      </div>

      {voidOrder && (
        <VoidDialog
          requirePin={user?.role !== 'supervisor'}
          target={{ kind: 'order', title: `Void #${voidOrder.order_number?.split('-').pop()}`, subtitle: `${voidOrder.table_name || voidOrder.order_type} · ${voidOrder.status}. The whole order is cancelled and a void slip prints.`, amount: voidOrder.grand_total }}
          onCancel={() => setVoidOrder(null)}
          onConfirm={async (r) => {
            try {
              await window.api.orders.update(voidOrder.id, {
                status: 'Void', voidReason: r.reason,
                voidRemarks: r.remarks || undefined,
                voidedBy: r.approver?.name || user?.name || 'Supervisor',
                voidDisposition: r.disposition
              })
              if (voidOrder.table_name) {
                try { await window.api.tables.updateStatus(voidOrder.table_name, 'Available') } catch {}
              }
              try { await window.api.print.voidSlip(voidOrder.id, r.reason, r.approver?.name || user?.name || 'Supervisor', undefined, r.remarks, r.disposition) } catch {}
              toast.success('Order voided')
              setVoidOrder(null)
              await loadData()
            } catch (err: any) {
              setError(err.message || 'Failed to void order')
            }
          }}
        />
      )}
    </div>
  )
}
