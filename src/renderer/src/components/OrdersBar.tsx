import { useState, useEffect } from 'react'
import { PauseCircle, Clock, Plus, ChevronLeft, ChevronRight, UserCheck, X } from 'lucide-react'

interface OrderSummary {
  id: string
  order_number: string
  status: string
  table_name: string | null
  order_type: string
  waiter_name: string | null
  grand_total: number
  created_at: string
}

interface Props {
  activeOrderId: string | null
  onSelectOrder: (orderId: string) => void
  onNewOrder: () => void
  onVoidOrder?: (orderId: string) => void
}

export default function OrdersBar({ activeOrderId, onSelectOrder, onNewOrder, onVoidOrder }: Props) {
  const [orders, setOrders] = useState<OrderSummary[]>([])

  useEffect(() => {
    loadOrders()
    const interval = setInterval(loadOrders, 5000)
    return () => clearInterval(interval)
  }, [])

  async function loadOrders() {
    const active = await window.api.orders.getActive()
    setOrders(active || [])
  }

  if (orders.length === 0) return null

  return (
    <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2">
      <span className="flex-shrink-0 text-xs font-semibold text-gray-400">
        Orders ({orders.length}):
      </span>
      {/* Scrollable orders container */}
      <div className="flex-1 overflow-x-auto scrollbar-hide">
        <div className="flex items-center gap-1.5">
          {orders.map((order) => (
            <div key={order.id} className="flex flex-shrink-0 items-center">
              <button
                onClick={() => onSelectOrder(order.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  onVoidOrder && order.status === 'Hold' ? 'rounded-r-none' : ''
                } ${
                  activeOrderId === order.id
                    ? 'bg-primary text-primary-foreground'
                    : order.status === 'Hold'
                      ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                      : order.waiter_name
                        ? 'bg-green-100 text-green-800 shadow-sm hover:bg-green-200'
                        : 'bg-white text-foreground shadow-sm hover:bg-muted'
                }`}
              >
                {order.status === 'Hold' ? (
                  <PauseCircle className="h-3 w-3" />
                ) : order.waiter_name ? (
                  <UserCheck className="h-3 w-3" />
                ) : (
                  <Clock className="h-3 w-3" />
                )}
                <span>{order.table_name || order.order_type}</span>
                <span className="opacity-50">#{order.order_number.split('-').pop()}</span>
                {order.waiter_name && <span className="opacity-40 text-[9px]">{order.waiter_name}</span>}
              </button>
              {onVoidOrder && order.status === 'Hold' && (
                <button
                  onClick={(e) => { e.stopPropagation(); onVoidOrder(order.id) }}
                  className="flex h-full items-center rounded-r-lg bg-red-100 px-1.5 py-1.5 text-red-500 hover:bg-red-200 hover:text-red-700"
                  title="Void order"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      <button
        onClick={onNewOrder}
        className="flex flex-shrink-0 items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-gray-500 shadow-sm hover:bg-muted hover:text-foreground"
      >
        <Plus className="h-3 w-3" />
        New
      </button>
    </div>
  )
}
