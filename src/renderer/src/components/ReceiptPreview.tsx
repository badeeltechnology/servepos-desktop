import { useState, useEffect, useRef } from 'react'
import { X, Printer } from 'lucide-react'

interface Props {
  orderId: string
  onClose: () => void
}

export default function ReceiptPreview({ orderId, onClose }: Props) {
  const [order, setOrder] = useState<any>(null)
  const [items, setItems] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [config, setConfig] = useState<Record<string, string>>({})
  const receiptRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadData() }, [orderId])

  async function loadData() {
    const [o, i, p, c] = await Promise.all([
      window.api.orders.get(orderId),
      window.api.orderItems.get(orderId),
      window.api.orderPayments.get(orderId),
      window.api.receiptConfig.getAll()
    ])
    setOrder(o)
    setItems(i)
    setPayments(p)
    setConfig(c)
  }

  function handlePrint() {
    if (receiptRef.current) {
      const printWindow = window.open('', '_blank', 'width=350,height=600')
      if (printWindow) {
        printWindow.document.write(`
          <html><head><title>Receipt</title>
          <style>
            @page { size: 80mm auto; margin: 0; }
            body { font-family: 'Courier New', monospace; font-size: 12px; width: 80mm; margin: 0 auto; padding: 5mm; }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .right { text-align: right; }
            .rtl { direction: rtl; text-align: right; }
            .line { border-top: 1px dashed #000; margin: 4px 0; }
            .dline { border-top: 2px solid #000; margin: 4px 0; }
            .row { display: flex; justify-content: space-between; }
            .small { font-size: 10px; }
            .big { font-size: 16px; }
            .mod { padding-left: 15px; font-size: 10px; color: #555; }
          </style></head><body>
          ${receiptRef.current.innerHTML}
          <script>window.print(); window.close();</script>
          </body></html>
        `)
        printWindow.document.close()
      }
    }
  }

  if (!order) return null

  const showArabic = config.show_arabic === '1'
  const showCashier = config.show_cashier_name !== '0'
  const showCr = config.show_cr_number === '1' && config.cr_number
  const showVat = config.show_vat_number === '1' && config.vat_number
  const currSym = config.currency_symbol || 'QAR'
  const currPos = config.currency_position || 'after'
  const decimals = parseInt(config.currency_decimals || '2')
  const taxEnabled = config.tax_enabled === '1'
  const taxLabel = config.tax_label || 'VAT'

  const fmt = (n: number) => {
    const num = n.toFixed(decimals)
    return currPos === 'before' ? `${currSym} ${num}` : `${num} ${currSym}`
  }

  const totalPaid = payments.reduce((s: number, p: any) => s + p.amount, 0)
  const change = Math.max(0, totalPaid - (order.grand_total || 0))

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex flex-col items-center">
        {/* Receipt card */}
        <div className="w-[320px] rounded-2xl bg-white shadow-2xl overflow-hidden">
          {/* Action bar */}
          <div className="flex items-center justify-between bg-gray-50 px-4 py-3 border-b">
            <h3 className="text-sm font-bold text-gray-700">Receipt Preview</h3>
            <div className="flex items-center gap-2">
              <button onClick={handlePrint}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90">
                <Printer className="h-3.5 w-3.5" />
                Print
              </button>
              <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-200">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Receipt content */}
          <div ref={receiptRef} className="px-6 py-5 font-mono text-[11px] leading-relaxed">
            {/* Header */}
            <div className="text-center">
              {showArabic && config.restaurant_name_ar && (
                <p className="text-sm font-bold" dir="rtl">{config.restaurant_name_ar}</p>
              )}
              {config.restaurant_name && (
                <p className="text-sm font-bold">{config.restaurant_name}</p>
              )}
              <div className="my-2 border-t border-dashed border-gray-300" />
              {config.address_line_1 && <p>{config.address_line_1}</p>}
              {showArabic && config.address_line_1_ar && <p dir="rtl">{config.address_line_1_ar}</p>}
              {config.address_line_2 && <p>{config.address_line_2}</p>}
              {config.phone && <p>Tel: {config.phone}</p>}
              {showCr && <p>CR: {config.cr_number}</p>}
              {showVat && <p>VAT: {config.vat_number}</p>}
            </div>

            <div className="my-2 border-t-2 border-gray-800" />

            {/* Order info */}
            <div>
              <p>Receipt: {order.order_number}</p>
              <p>Date: {new Date(order.created_at + 'Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}    {new Date(order.created_at + 'Z').toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</p>
              {order.table_name && (
                <div className="flex justify-between">
                  <span>Table: {order.table_name}</span>
                  {order.guests > 0 && <span>Guests: {order.guests}</span>}
                </div>
              )}
              {showCashier && <p>Cashier: {order.cashier_name}</p>}
              <p>Type: {order.order_type}</p>
            </div>

            <div className="my-2 border-t border-dashed border-gray-300" />

            {/* Column header */}
            <div className="flex justify-between font-bold">
              <span>Qty  Item</span>
              <span>Amount</span>
            </div>
            <div className="my-1 border-t border-dashed border-gray-300" />

            {/* Items */}
            {items.map((item) => (
              <div key={item.id} className="mb-1">
                <div className="flex justify-between">
                  <span> {item.qty}   {item.item_name}</span>
                  <span>{item.amount.toFixed(decimals)}</span>
                </div>
                {item.modifiers && JSON.parse(item.modifiers).map((m: any, i: number) => (
                  <div key={i} className="flex justify-between text-gray-500 pl-4">
                    <span>+ {m.name}</span>
                    {m.price > 0 && <span>{m.price.toFixed(decimals)}</span>}
                  </div>
                ))}
                {item.special_instructions && (
                  <p className="text-gray-500 pl-4">"{item.special_instructions}"</p>
                )}
              </div>
            ))}

            <div className="my-2 border-t border-dashed border-gray-300" />

            {/* Totals */}
            <div className="space-y-0.5">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>{fmt(order.subtotal || 0)}</span>
              </div>
              {(order.discount_amount > 0 || order.discount_percent > 0) && (
                <div className="flex justify-between">
                  <span>Discount:</span>
                  <span>-{fmt((order.discount_amount || 0) + (order.subtotal || 0) * (order.discount_percent || 0) / 100)}</span>
                </div>
              )}
              {taxEnabled && order.tax_total > 0 && (
                <div className="flex justify-between">
                  <span>{taxLabel}:</span>
                  <span>{fmt(order.tax_total)}</span>
                </div>
              )}
              <div className="my-1 border-t border-dashed border-gray-300" />
              <div className="flex justify-between text-sm font-bold">
                <span>TOTAL:</span>
                <span>{fmt(order.grand_total || 0)}</span>
              </div>
            </div>

            {/* Payments */}
            {payments.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {payments.map((p: any) => (
                  <div key={p.id} className="flex justify-between">
                    <span>Paid: {p.payment_method}</span>
                    <span>{fmt(p.amount)}</span>
                  </div>
                ))}
                {change > 0 && (
                  <div className="flex justify-between font-bold">
                    <span>Change:</span>
                    <span>{fmt(change)}</span>
                  </div>
                )}
              </div>
            )}

            <div className="my-2 border-t-2 border-gray-800" />

            {/* Footer */}
            <div className="text-center">
              {showArabic && config.footer_message_ar && (
                <p dir="rtl">{config.footer_message_ar}</p>
              )}
              {config.footer_message && <p>{config.footer_message}</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
