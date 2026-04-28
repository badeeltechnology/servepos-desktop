import { useState, useEffect } from 'react'
import { X, Plus, Trash2, CreditCard, Banknote, Smartphone, UserCheck } from 'lucide-react'

interface PaymentEntry {
  method: string
  amount: number
  reference: string
}

interface Props {
  grandTotal: number
  orderWaiterName?: string | null
  processing?: boolean
  onComplete: (payments: PaymentEntry[], collectedByWaiter: string | null, tipAmount?: number) => void
  onCancel: () => void
}

const methodIcons: Record<string, React.ReactNode> = {
  Cash: <Banknote className="h-5 w-5" />,
  Card: <CreditCard className="h-5 w-5" />,
  'Mobile Payment': <Smartphone className="h-5 w-5" />
}

export default function PaymentDialog({ grandTotal, orderWaiterName, processing, onComplete, onCancel }: Props) {
  const [paymentMethods, setPaymentMethods] = useState<{ name: string; mode_of_payment: string; is_default: number }[]>([])
  const [payments, setPayments] = useState<PaymentEntry[]>([])
  const [error, setError] = useState('')
  const [waitersList, setWaitersList] = useState<{ name: string; waiter_name: string }[]>([])
  const [collectedBy, setCollectedBy] = useState<string>(orderWaiterName || '')
  const [tipAmount, setTipAmount] = useState(0)

  useEffect(() => {
    loadPaymentMethods()
    loadWaiters()
  }, [])

  async function loadPaymentMethods() {
    const methods = await window.api.paymentMethods.get()
    setPaymentMethods(methods)

    // Default: full amount on default payment method or first method
    const defaultMethod = methods.find((m) => m.is_default) || methods[0]
    if (defaultMethod) {
      setPayments([{ method: defaultMethod.mode_of_payment, amount: grandTotal, reference: '' }])
    }
  }

  async function loadWaiters() {
    try {
      const list = await window.api.waiters.list()
      setWaitersList(list || [])
    } catch { /* ignore */ }
  }

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0)
  const remaining = grandTotal - totalPaid
  const change = totalPaid > grandTotal ? totalPaid - grandTotal : 0

  function addPaymentLine() {
    const unusedMethod = paymentMethods.find(
      (m) => !payments.some((p) => p.method === m.mode_of_payment)
    )
    if (unusedMethod) {
      setPayments([
        ...payments,
        { method: unusedMethod.mode_of_payment, amount: Math.max(0, remaining), reference: '' }
      ])
    }
  }

  function removePaymentLine(index: number) {
    setPayments(payments.filter((_, i) => i !== index))
  }

  function updatePayment(index: number, field: keyof PaymentEntry, value: string | number) {
    setPayments(
      payments.map((p, i) => (i === index ? { ...p, [field]: value } : p))
    )
    setError('')
  }

  function selectQuickAmount(amount: number) {
    if (payments.length === 1) {
      setPayments([{ ...payments[0], amount }])
    }
  }

  function handleComplete() {
    if (totalPaid < grandTotal) {
      setError(`Payment is short by ${(grandTotal - totalPaid).toFixed(2)}`)
      return
    }
    // Cap payment amounts so stored total = order value (excess cash is change, not payment)
    let remaining = grandTotal
    const capped = payments.map((p) => {
      const amt = Math.min(p.amount, remaining)
      remaining = Math.max(0, remaining - amt)
      return { ...p, amount: Math.round(amt * 100) / 100 }
    }).filter((p) => p.amount > 0)
    onComplete(capped, collectedBy || null, tipAmount || undefined)
  }

  // Quick cash amounts — exact + QAR note denominations (5, 10, 50, 100, 200, 500)
  const quickAmounts = [
    Math.ceil(grandTotal),
    ...[5, 10, 50, 100, 200, 500].filter((n) => n >= grandTotal)
  ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 5)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[520px] rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-xl font-bold">Payment</h2>
          <button
            onClick={onCancel}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5">
          {/* Total */}
          <div className="mb-6 rounded-xl bg-primary/5 p-4 text-center">
            <p className="text-sm text-muted-foreground">Amount Due</p>
            <p className="text-3xl font-bold text-primary">{grandTotal.toFixed(2)}</p>
          </div>

          {/* Payment lines */}
          <div className="space-y-3">
            {payments.map((payment, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <select
                  value={payment.method}
                  onChange={(e) => updatePayment(idx, 'method', e.target.value)}
                  className="w-40 rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {paymentMethods.map((m) => (
                    <option key={m.name} value={m.mode_of_payment}>
                      {m.mode_of_payment}
                    </option>
                  ))}
                </select>
                <div className="relative flex-1">
                  <input
                    type="number"
                    value={payment.amount || ''}
                    onChange={(e) => updatePayment(idx, 'amount', parseFloat(e.target.value) || 0)}
                    className="w-full rounded-lg border border-input px-3 py-2.5 text-right font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    min={0}
                    step={0.01}
                  />
                </div>
                {payment.method !== 'Cash' && (
                  <input
                    type="text"
                    value={payment.reference}
                    onChange={(e) => updatePayment(idx, 'reference', e.target.value)}
                    placeholder="Ref #"
                    className="w-24 rounded-lg border border-input px-2 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                )}
                {payments.length > 1 && (
                  <button
                    onClick={() => removePaymentLine(idx)}
                    className="rounded-lg p-2 text-destructive/50 hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Add split payment */}
          {payments.length < paymentMethods.length && (
            <button
              onClick={addPaymentLine}
              className="mt-3 flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <Plus className="h-3.5 w-3.5" />
              Split payment
            </button>
          )}

          {/* Quick cash amounts */}
          {payments.length === 1 && payments[0].method === 'Cash' && (
            <div className="mt-4">
              <p className="mb-2 text-xs text-muted-foreground">Quick amounts</p>
              <div className="flex gap-2">
                {quickAmounts.map((amt) => (
                  <button
                    key={amt}
                    onClick={() => selectQuickAmount(amt)}
                    className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                      payments[0].amount === amt
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-input hover:bg-muted'
                    }`}
                  >
                    {amt.toFixed(0)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tip — only for card payments */}
          {payments.some((p) => p.method === 'Card') && (
            <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/50 p-3">
              <label className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-blue-700">
                <CreditCard className="h-3.5 w-3.5" />
                Tip (Card)
              </label>
              <div className="flex gap-2 mb-2">
                {[5, 10, 15].map((pct) => (
                  <button
                    key={pct}
                    onClick={() => setTipAmount(Math.round(grandTotal * pct) / 100)}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                      tipAmount === Math.round(grandTotal * pct) / 100
                        ? 'border-blue-400 bg-blue-100 text-blue-700'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
                <button
                  onClick={() => setTipAmount(0)}
                  className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                    tipAmount === 0 ? 'border-blue-400 bg-blue-100 text-blue-700' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  No Tip
                </button>
              </div>
              <input
                type="number"
                value={tipAmount || ''}
                onChange={(e) => setTipAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                placeholder="Custom amount"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-right font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                min={0}
                step={0.01}
              />
            </div>
          )}

          {/* Collected by waiter */}
          {waitersList.length > 0 && (
            <div className="mt-4">
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-gray-600">
                <UserCheck className="h-3.5 w-3.5" />
                Payment collected by
              </label>
              <select
                value={collectedBy}
                onChange={(e) => setCollectedBy(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">-- Cashier (direct) --</option>
                {waitersList.map((w) => (
                  <option key={w.name} value={w.waiter_name}>{w.waiter_name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Summary */}
          <div className="mt-5 space-y-2 rounded-lg bg-muted/50 p-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Paid</span>
              <span className="font-medium">{totalPaid.toFixed(2)}</span>
            </div>
            {remaining > 0 && (
              <div className="flex justify-between text-sm text-destructive">
                <span>Remaining</span>
                <span className="font-medium">{remaining.toFixed(2)}</span>
              </div>
            )}
            {change > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Change</span>
                <span className="font-bold">{change.toFixed(2)}</span>
              </div>
            )}
            {tipAmount > 0 && (
              <div className="flex justify-between text-sm text-blue-600">
                <span>Tip</span>
                <span className="font-bold">{tipAmount.toFixed(2)}</span>
              </div>
            )}
          </div>

          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex gap-3 border-t px-6 py-4">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-input py-2.5 text-sm font-medium hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleComplete}
            disabled={totalPaid < grandTotal || processing}
            className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {processing ? 'Processing...' : 'Complete Payment'}
          </button>
        </div>
      </div>
    </div>
  )
}
