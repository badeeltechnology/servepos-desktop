import { useState, useEffect } from 'react'
import { PauseCircle, PlayCircle, Clock, Plus } from 'lucide-react'

interface OrderSummary {
  id: string
  order_number: string
  status: string
  table_name: string | null
  order_type: string
  grand_total: number
  created_at: string
}

interface Props {
  activeOrderId: string | null
  onSelectOrder: (orderId: string) => void
  onNewOrder: () => void
}

export default function OrdersBar({ activeOrderId, onSelectOrder, onNewOrder }: Props) {
  const [orders, setOrders] = useState<OrderSummary[]>([])

  useEffect(() => {
    loadOrders()
    const interval = setInterval(loadOrders, 5000)
    return () => clearInterval(interval)
  }, [])

  async function loadOrders() {
    const openOrders = await window.api.orders.getAll({ status: 'Open' })
    const heldOrders = await window.api.orders.getAll({ status: 'Hold' })
    setOrders([...openOrders, ...heldOrders])
  }

  if (orders.length === 0) return null

  return (
    <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2">
      <span className="text-xs font-medium text-muted-foreground">Orders:</span>
      {orders.map((order) => (
        <button
          key={order.id}
          onClick={() => onSelectOrder(order.id)}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            activeOrderId === order.id
              ? 'bg-primary text-primary-foreground'
              : order.status === 'Hold'
                ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                : 'bg-white text-foreground shadow-sm hover:bg-muted'
          }`}
        >
          {order.status === 'Hold' ? (
            <PauseCircle className="h-3 w-3" />
          ) : (
            <Clock className="h-3 w-3" />
          )}
          {order.table_name || order.order_type}
          <span className="opacity-60">#{order.order_number.split('-').pop()}</span>
        </button>
      ))}
      <button
        onClick={onNewOrder}
        className="flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground"
      >
        <Plus className="h-3 w-3" />
        New
      </button>
    </div>
  )
}
