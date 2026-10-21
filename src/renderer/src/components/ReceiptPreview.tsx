import { useState, useEffect, useRef } from 'react'
import { toast } from '../stores/ui'
import { Btn } from '../ui'

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

  const [allItems, setAllItems] = useState<Record<string, any>>({})

  async function loadData() {
    const [o, i, p, c, itemsList] = await Promise.all([
      window.api.orders.get(orderId),
      window.api.orderItems.get(orderId),
      window.api.orderPayments.get(orderId),
      window.api.receiptConfig.getAll(),
      window.api.items.getAll()
    ])
    setOrder(o)
    setItems(i)
    setPayments(p)
    setConfig(c)
    // Build lookup for Arabic names
    const lookup: Record<string, any> = {}
    for (const item of itemsList) {
      lookup[item.item_code] = item
    }
    setAllItems(lookup)
  }

  async function handlePrint() {
    const result = await window.api.print.receipt(orderId)
    if (result?.success) {
      onClose()
    } else {
      toast.error('Print failed: ' + (result?.error || 'Check printer configuration'))
    }
  }

  if (!order) return null

  const showArabic = config.show_arabic === '1'
  const showArabicItems = config.show_arabic_items === '1'
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(11,59,73,.6)] p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="flex max-h-full animate-rise flex-col">
        <div className="flex max-h-full w-[340px] flex-col overflow-hidden bg-white shadow-pop">
          {/* Action bar */}
          <div className="flex h-14 flex-shrink-0 items-center gap-2 bg-n-deep px-3 text-white">
            <span className="cond flex-1 text-xl font-bold">Receipt</span>
            <Btn variant="ghostDark" onClick={onClose}>Close</Btn>
            <Btn variant="amber" onClick={handlePrint}>Print</Btn>
          </div>

          {/* Receipt content */}
          <div ref={receiptRef} className="overflow-y-auto px-6 py-5 font-mono text-xs leading-relaxed text-n-ink">
            {/* Header */}
            <div className="text-center">
              {showArabic && config.restaurant_name_ar && (
                <p className="text-sm font-bold" dir="rtl">{config.restaurant_name_ar}</p>
              )}
              {config.restaurant_name && (
                <p className="text-sm font-bold">{config.restaurant_name}</p>
              )}
              <div className="my-2 border-t border-dashed border-[#B9B2A4]" />
              {config.address_line_1 && <p>{config.address_line_1}</p>}
              {showArabic && config.address_line_1_ar && <p dir="rtl">{config.address_line_1_ar}</p>}
              {config.address_line_2 && <p>{config.address_line_2}</p>}
              {config.phone && <p>Tel: {config.phone}</p>}
              {showCr && <p>CR: {config.cr_number}</p>}
              {showVat && <p>VAT: {config.vat_number}</p>}
            </div>

            <div className="my-2 border-t-2 border-n-ink" />

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
              {order.order_notes && <p className="text-n-muted">Notes: {order.order_notes}</p>}
            </div>

            <div className="my-2 border-t border-dashed border-[#B9B2A4]" />

            {/* Column header */}
            <div className="flex justify-between font-bold">
              <span>Qty  Item</span>
              <span>Amount</span>
            </div>
            <div className="my-1 border-t border-dashed border-[#B9B2A4]" />

            {/* Items */}
            {items.map((item) => {
              const itemInfo = allItems[item.item_code] || {}
              return (
              <div key={item.id} className="mb-1">
                <div className="flex justify-between">
                  <span> {item.qty}   {item.item_name}</span>
                  <span>{item.amount.toFixed(decimals)}</span>
                </div>
                {showArabicItems && itemInfo.item_name_ar && (
                  <p className="pl-6 text-n-muted" dir="rtl">{itemInfo.item_name_ar}</p>
                )}
                {config.show_description_on_receipt === '1' && itemInfo.description && (
                  <p className="pl-6 text-n-muted" style={{ fontSize: '12px' }}>{itemInfo.description}</p>
                )}
                {config.show_description_ar_on_receipt === '1' && itemInfo.description_ar && (
                  <p className="pl-6 text-n-muted" dir="rtl" style={{ fontSize: '12px' }}>{itemInfo.description_ar}</p>
                )}
                {item.modifiers && JSON.parse(item.modifiers).map((m: any, i: number) => (
                  <div key={i} className="flex justify-between text-n-muted pl-4">
                    <span>+ {m.name}</span>
                    {m.price > 0 && <span>{m.price.toFixed(decimals)}</span>}
                  </div>
                ))}
                {item.special_instructions && (
                  <p className="text-n-muted pl-4">"{item.special_instructions}"</p>
                )}
              </div>
            )})}

            <div className="my-2 border-t border-dashed border-[#B9B2A4]" />

            {/* Totals */}
            <div className="space-y-0.5">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>{fmt(order.subtotal || 0)}</span>
              </div>
              {(order.discount_amount > 0 || order.discount_percent > 0) && (
                <div className="flex justify-between">
                  <span>Discount{order.promo_name ? ` (${order.promo_name})` : ''}:</span>
                  <span>-{fmt((order.discount_amount || 0) + (order.subtotal || 0) * (order.discount_percent || 0) / 100)}</span>
                </div>
              )}
              {taxEnabled && order.tax_total > 0 && (
                <div className="flex justify-between">
                  <span>{taxLabel}:</span>
                  <span>{fmt(order.tax_total)}</span>
                </div>
              )}
              <div className="my-1 border-t border-dashed border-[#B9B2A4]" />
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

            <div className="my-2 border-t-2 border-n-ink" />

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
