import { useState, useEffect } from 'react'
import { X, Plus, Trash2, CreditCard, Banknote, Smartphone } from 'lucide-react'

interface PaymentEntry {
  method: string
  amount: number
  reference: string
}

interface Props {
  grandTotal: number
  onComplete: (payments: PaymentEntry[]) => void
  onCancel: () => void
}

const methodIcons: Record<string, React.ReactNode> = {
  Cash: <Banknote className="h-5 w-5" />,
  Card: <CreditCard className="h-5 w-5" />,
  'Mobile Payment': <Smartphone className="h-5 w-5" />
}

export default function PaymentDialog({ grandTotal, onComplete, onCancel }: Props) {
  const [paymentMethods, setPaymentMethods] = useState<{ name: string; mode_of_payment: string; is_default: number }[]>([])
  const [payments, setPayments] = useState<PaymentEntry[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    loadPaymentMethods()
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
    onComplete(payments)
  }

  // Quick cash amounts
  const quickAmounts = [
    Math.ceil(grandTotal),
    Math.ceil(grandTotal / 10) * 10,
    Math.ceil(grandTotal / 50) * 50,
    Math.ceil(grandTotal / 100) * 100
  ].filter((v, i, a) => v >= grandTotal && a.indexOf(v) === i).slice(0, 4)

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
            disabled={totalPaid < grandTotal}
            className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Complete Payment
          </button>
        </div>
      </div>
    </div>
  )
}
