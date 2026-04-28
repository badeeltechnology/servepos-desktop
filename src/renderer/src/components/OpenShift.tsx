import { useState, useEffect } from 'react'
import { Clock, Banknote } from 'lucide-react'

interface Props {
  userName: string
  userId: string
  onOpen: (sessionId: string) => void
}

export default function OpenShift({ userName, userId, onOpen }: Props) {
  const [paymentMethods, setPaymentMethods] = useState<any[]>([])
  const [balances, setBalances] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadPaymentMethods()
  }, [])

  async function loadPaymentMethods() {
    const methods = await window.api.paymentMethods.get()
    setPaymentMethods(methods)
    // Default: 0 for all methods
    const defaults: Record<string, number> = {}
    for (const m of methods) {
      defaults[m.mode_of_payment] = 0
    }
    setBalances(defaults)
  }

  async function handleOpen() {
    setError('')
    setLoading(true)
    try {
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

  return (
    <div className="flex h-full items-center justify-center bg-gradient-to-br from-gray-50 to-blue-50">
      <div className="w-[450px] rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Clock className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-2xl font-bold">Open Shift</h2>
          <p className="mt-1 text-sm text-gray-500">
            Enter the opening cash balance to start your shift
          </p>
          <p className="mt-1 text-xs text-gray-400">Cashier: <strong>{userName}</strong></p>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-500">Opening Cash Balance</h3>
          <div className="flex items-center justify-between rounded-xl border-2 border-gray-100 px-4 py-4">
            <div className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-gray-400" />
              <span className="text-sm font-bold">Cash in Drawer</span>
            </div>
            <input
              type="number"
              data-keyboard="numpad"
              value={balances['Cash'] || ''}
              onChange={(e) => setBalances({ ...balances, Cash: parseFloat(e.target.value) || 0 })}
              className="w-40 rounded-lg border border-gray-200 px-3 py-2.5 text-right font-mono text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="0.00"
              min={0}
              step={0.01}
              autoFocus
            />
          </div>
          <p className="text-xs text-gray-400">Count the cash in the drawer and enter the amount. Card and other electronic payments are tracked automatically.</p>
        </div>

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

        <button
          onClick={handleOpen}
          disabled={loading}
          className="mt-6 w-full rounded-xl bg-primary py-3.5 text-sm font-bold text-white shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50"
        >
          {loading ? 'Opening...' : 'Open Shift'}
        </button>
      </div>
    </div>
  )
}
