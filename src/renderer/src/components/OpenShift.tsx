import { useT } from '../stores/i18n'
import { useState, useEffect } from 'react'
import { useStatus, isCashMethod } from '../stores/status'
import StatusBand from './StatusBand'
import CashCount, { Counts, countTotal } from './CashCount'
import { SubBar, Btn, Cap, Dot, money, roundMoney, C } from '../ui'
import { timeOf } from '../ui/hosts'

interface Props {
  userName: string
  userId: string
  onOpen: (sessionId: string) => void
  onSignOut?: () => void
}

// Open shift: count the float note by note, see what the last shift left, then open.

export default function OpenShift({ userName, userId, onOpen, onSignOut }: Props) {
  const [paymentMethods, setPaymentMethods] = useState<any[]>([])
  const [counts, setCounts] = useState<Counts>({})
  const [manual, setManual] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [last, setLast] = useState<any>(null)
  const [itemCount, setItemCount] = useState<number | null>(null)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const { printers, currency: cur } = useStatus()
  const t = useT()

  useEffect(() => {
    loadPaymentMethods()
    window.api.sessions.getAll(5).then((list: any[]) => {
      const closed = (list || []).find((s) => s && s.status !== 'Open' && s.closed_at)
      setLast(closed || null)
    }).catch(() => {})
    window.api.items.get().then((i: any[]) => setItemCount((i || []).length)).catch(() => {})
    window.api.config.get('last_sync_at').then((v: string) => setLastSyncAt(v || null)).catch(() => {})
  }, [])

  async function loadPaymentMethods() {
    const methods = await window.api.paymentMethods.get()
    setPaymentMethods(methods)
  }

  const cashName = paymentMethods.find((m: any) => isCashMethod(m.mode_of_payment))?.mode_of_payment || 'Cash'
  const total = manual !== null ? parseFloat(manual || '0') || 0 : countTotal(counts)
  let lastFloat: number | null = null
  try {
    const cb = last?.closing_balance ? JSON.parse(last.closing_balance) : null
    const cash = Array.isArray(cb) ? cb.find((b: any) => b.mode === cashName) : null
    if (cash) lastFloat = Number(cash.amount) || 0
  } catch {}

  async function handleOpen() {
    setError('')
    setLoading(true)
    try {
      // Opening balance: counted cash, 0 for every other method (same shape as before)
      const balances: Record<string, number> = {}
      for (const m of paymentMethods) balances[m.mode_of_payment] = 0
      balances[cashName] = roundMoney(total)
      const openingBalance = Object.entries(balances).map(([mode, amount]) => ({ mode, amount }))
      const sessionId = await window.api.sessions.open({
        userId,
        userName,
        openingBalance
      })
      onOpen(sessionId)
    } catch (err: any) {
      setError(err.message || 'Failed to open shift')
    } finally {
      setLoading(false)
    }
  }

  const now = new Date()

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-n-cream text-n-ink">
      <StatusBand userName={userName} showWaiter={false} />
      <SubBar className="px-3.5">
        <span className="cond text-2xl font-bold">{t('Open shift')}</span>
        <span className="truncate text-[13px] text-n-mist">{now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · {timeOf(now.toISOString())}</span>
        <span className="flex-1" />
        {onSignOut && <Btn variant="ghostDark" onClick={onSignOut}>{t('Sign out')}</Btn>}
      </SubBar>

      <div className="flex min-h-0 flex-1 gap-3 p-3">
        <CashCount title={t('Count the float in the drawer')} hint="Tap + for one note, hold for ten" counts={counts} onCounts={setCounts} manual={manual} onManual={setManual} />

        <aside className="flex w-[330px] flex-shrink-0 flex-col gap-3">
          <div className="flex flex-col gap-1 rounded-md bg-n-deep p-4 text-white">
            <Cap className="text-n-mist">{t('Opening float')}</Cap>
            <span className="cond num text-[52px] font-bold leading-none">{cur} {money(total)}</span>
            <span className="text-[13px] text-n-mist">{manual === null ? 'Counted note by note' : 'Typed as a total'}</span>
          </div>
          {last && (
            <div className="flex flex-col gap-2 rounded-md bg-white px-4 py-3.5 text-[13px] shadow-tile">
              <span className="font-semibold">Last shift on this till</span>
              <span className="text-n-muted">Closed by {last.user_name || 'someone'}, {new Date(String(last.closed_at).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(last.closed_at) ? '' : 'Z')).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              {lastFloat !== null && <span className="flex justify-between"><span>Cash counted at close</span><span className="num font-semibold">{cur} {money(lastFloat)}</span></span>}
            </div>
          )}
          <div className="flex flex-col gap-2 rounded-md bg-white px-4 py-3.5 text-[13px] shadow-tile">
            <span className="font-semibold">Before you open</span>
            <span className="flex items-center gap-2"><Dot color={printers > 0 ? C.green : C.amber} />{printers > 0 ? `${printers} printer${printers === 1 ? '' : 's'} set up` : 'No printer set up'}</span>
            <span className="flex items-center gap-2"><Dot color={itemCount ? C.green : C.amber} />{itemCount === null ? 'Checking the menu…' : itemCount ? `Menu has ${itemCount} items${lastSyncAt ? `, synced ${timeOf(lastSyncAt)}` : ''}` : 'Menu is empty, sync from ERPNext'}</span>
            <span className="flex items-center gap-2"><Dot color={C.green} />Signed in as {userName}</span>
          </div>
          <span className="flex-1" />
          {error && <span className="text-sm font-semibold text-n-red">{error}</span>}
          <button type="button" onClick={handleOpen} disabled={loading}
            className="press flex h-16 items-center justify-between rounded-lg bg-n-amber px-[18px] text-lg font-bold text-n-ink disabled:bg-n-sand disabled:text-n-stone">
            {loading ? 'Opening…' : t('Open shift')}<span className="text-[13px] font-medium">{total === 0 ? 'with an empty drawer' : `float ${money(total)}`}</span>
          </button>
        </aside>
      </div>
    </div>
  )
}
