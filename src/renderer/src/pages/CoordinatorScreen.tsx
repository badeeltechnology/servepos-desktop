import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '../stores/auth'
import { LayoutGrid, List, Clock, ChefHat, Bell, FileText, LogOut, RefreshCw } from 'lucide-react'

type ViewMode = 'grid' | 'list'
type StatusFilter = 'all' | 'Open' | 'Preparing' | 'Ready to Serve' | 'Invoiced'

interface ActiveOrder {
  id: string
  order_number: string
  order_type: string
  table_name: string | null
  room: string | null
  guests: number
  cashier_name: string
  waiter_name: string | null
  status: string
  created_at: string
  items_summary: string | null
  item_count: number
  grand_total: number
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; border: string; label: string }> = {
  'Open': { color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', label: 'Open' },
  'Hold': { color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200', label: 'Hold' },
  'Preparing': { color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200', label: 'Preparing' },
  'Ready to Serve': { color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', label: 'Ready' },
  'Invoiced': { color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200', label: 'Invoiced' }
}

function getElapsedMinutes(createdAt: string): number {
  const created = new Date(createdAt + 'Z')
  return Math.floor((Date.now() - created.getTime()) / 60000)
}

function formatElapsed(minutes: number): string {
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}h ${m}m`
}

export default function CoordinatorScreen({ onBack }: { onBack?: () => void } = {}) {
  const [orders, setOrders] = useState<ActiveOrder[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [selectedOrder, setSelectedOrder] = useState<ActiveOrder | null>(null)
  const [loading, setLoading] = useState(false)
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const loadOrders = useCallback(async () => {
    try {
      const data = await window.api.coordinator.getActiveOrders()
      setOrders(data || [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    loadOrders()
    const interval = setInterval(loadOrders, 10000) // Refresh every 10s
    return () => clearInterval(interval)
  }, [loadOrders])

  // Force re-render every minute to update elapsed timers
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 60000)
    return () => clearInterval(timer)
  }, [])

  async function updateStatus(orderId: string, newStatus: string) {
    setLoading(true)
    try {
      const result = await window.api.coordinator.updateStatus(orderId, newStatus, user?.role || 'coordinator')
      if (result.success) {
        await loadOrders()
        setSelectedOrder(null)
      }
    } finally {
      setLoading(false)
    }
  }

  const filtered = filter === 'all' ? orders : orders.filter((o) => o.status === filter)

  const statusCounts = {
    all: orders.length,
    Open: orders.filter((o) => o.status === 'Open' || o.status === 'Hold').length,
    Preparing: orders.filter((o) => o.status === 'Preparing').length,
    'Ready to Serve': orders.filter((o) => o.status === 'Ready to Serve').length,
    Invoiced: orders.filter((o) => o.status === 'Invoiced').length
  }

  return (
    <div className="flex h-screen flex-col bg-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <ChefHat className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-lg font-bold">Coordinator</h1>
            <p className="text-xs text-gray-500">{user?.name} | {orders.length} active orders</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex rounded-lg border bg-gray-50 p-0.5">
            <button
              onClick={() => setViewMode('grid')}
              className={`rounded-md p-2 ${viewMode === 'grid' ? 'bg-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`rounded-md p-2 ${viewMode === 'list' ? 'bg-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
          <button onClick={loadOrders} className="rounded-lg border p-2 text-gray-400 hover:bg-gray-50 hover:text-gray-600">
            <RefreshCw className="h-4 w-4" />
          </button>
          {onBack ? (
            <button onClick={onBack} className="rounded-lg border px-3 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-50">
              Back to POS
            </button>
          ) : (
            <button onClick={logout} className="rounded-lg border p-2 text-gray-400 hover:bg-red-50 hover:text-red-500">
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 border-b bg-white px-6 py-2">
        {([
          { key: 'all', label: 'All' },
          { key: 'Open', label: 'Open' },
          { key: 'Preparing', label: 'Preparing' },
          { key: 'Ready to Serve', label: 'Ready' },
          { key: 'Invoiced', label: 'Invoiced' }
        ] as { key: StatusFilter; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
              filter === key
                ? 'bg-primary text-primary-foreground'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {label}
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${filter === key ? 'bg-white/20' : 'bg-gray-200'}`}>
              {statusCounts[key]}
            </span>
          </button>
        ))}
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Orders */}
        <div className="flex-1 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-gray-400">
              <ChefHat className="mb-3 h-12 w-12 opacity-30" />
              <p className="text-sm font-medium">No active orders</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {filtered.map((order) => (
                <GridCard
                  key={order.id}
                  order={order}
                  onSelect={() => setSelectedOrder(order)}
                  isSelected={selectedOrder?.id === order.id}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
                    <th className="px-4 py-3">Order</th>
                    <th className="px-4 py-3">Table</th>
                    <th className="px-4 py-3">Waiter</th>
                    <th className="px-4 py-3">Items</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((order) => (
                    <ListRow
                      key={order.id}
                      order={order}
                      onSelect={() => setSelectedOrder(order)}
                      onUpdateStatus={updateStatus}
                      userRole={user?.role || 'coordinator'}
                      loading={loading}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Order detail panel */}
        {selectedOrder && (
          <div className="w-80 border-l bg-white p-4 overflow-y-auto">
            <OrderDetail
              order={selectedOrder}
              onUpdateStatus={updateStatus}
              onClose={() => setSelectedOrder(null)}
              userRole={user?.role || 'coordinator'}
              loading={loading}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ==================== Grid Card ====================
function GridCard({ order, onSelect, isSelected }: { order: ActiveOrder; onSelect: () => void; isSelected: boolean }) {
  const config = STATUS_CONFIG[order.status] || STATUS_CONFIG['Open']
  const elapsed = getElapsedMinutes(order.created_at)
  const isUrgent = order.status === 'Ready to Serve' && elapsed > 10

  return (
    <button
      onClick={onSelect}
      className={`rounded-xl border-2 p-3 text-left transition-all hover:shadow-md ${config.border} ${config.bg} ${
        isSelected ? 'ring-2 ring-primary ring-offset-1' : ''
      } ${isUrgent ? 'animate-pulse' : ''}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${config.color} ${config.bg}`}>
          {config.label}
        </span>
        <span className="flex items-center gap-1 text-[10px] text-gray-500">
          <Clock className="h-3 w-3" />
          {formatElapsed(elapsed)}
        </span>
      </div>

      <div className="mb-1 text-sm font-bold">#{order.order_number.split('-').pop()}</div>

      {order.table_name && (
        <div className="text-xs text-gray-600">Table: {order.table_name}</div>
      )}
      {order.waiter_name && (
        <div className="text-xs text-gray-500">Waiter: {order.waiter_name}</div>
      )}
      <div className="mt-1 text-[10px] text-gray-400">
        {order.item_count} items | {order.order_type}
      </div>
    </button>
  )
}

// ==================== List Row ====================
function ListRow({ order, onSelect, onUpdateStatus, userRole, loading }: {
  order: ActiveOrder; onSelect: () => void; onUpdateStatus: (id: string, status: string) => void; userRole: string; loading: boolean
}) {
  const config = STATUS_CONFIG[order.status] || STATUS_CONFIG['Open']
  const elapsed = getElapsedMinutes(order.created_at)
  const isUrgent = order.status === 'Ready to Serve' && elapsed > 10

  return (
    <tr className={`cursor-pointer hover:bg-gray-50 ${isUrgent ? 'bg-red-50/50' : ''}`} onClick={onSelect}>
      <td className="px-4 py-3 font-semibold">#{order.order_number.split('-').pop()}</td>
      <td className="px-4 py-3">{order.table_name || '-'}</td>
      <td className="px-4 py-3">{order.waiter_name || '-'}</td>
      <td className="px-4 py-3 text-xs text-gray-500">{order.item_count} items</td>
      <td className="px-4 py-3">
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${config.color} ${config.bg}`}>
          {config.label}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-gray-500">{formatElapsed(elapsed)}</td>
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        {order.status === 'Open' && (
          <button disabled={loading} onClick={() => onUpdateStatus(order.id, 'Preparing')} className="rounded-lg bg-orange-500 px-3 py-1 text-[10px] font-bold text-white hover:bg-orange-600 disabled:opacity-50">
            Preparing
          </button>
        )}
        {order.status === 'Preparing' && (
          <button disabled={loading} onClick={() => onUpdateStatus(order.id, 'Ready to Serve')} className="rounded-lg bg-red-500 px-3 py-1 text-[10px] font-bold text-white hover:bg-red-600 disabled:opacity-50">
            Ready
          </button>
        )}
        {order.status === 'Ready to Serve' && (
          <span className="flex items-center gap-1 text-xs font-medium text-red-600">
            <Bell className="h-3 w-3 animate-bounce" /> Waiting
          </span>
        )}
        {order.status === 'Invoiced' && (
          <span className="flex items-center gap-1 text-xs font-medium text-purple-600">
            <FileText className="h-3 w-3" /> Awaiting payment
          </span>
        )}
      </td>
    </tr>
  )
}

// ==================== Order Detail Panel ====================
function OrderDetail({ order, onUpdateStatus, onClose, userRole, loading }: {
  order: ActiveOrder; onUpdateStatus: (id: string, status: string) => void; onClose: () => void; userRole: string; loading: boolean
}) {
  const config = STATUS_CONFIG[order.status] || STATUS_CONFIG['Open']
  const elapsed = getElapsedMinutes(order.created_at)
  const [items, setItems] = useState<any[]>([])

  useEffect(() => {
    loadItems()
  }, [order.id])

  async function loadItems() {
    try {
      const data = await window.api.orderItems.get(order.id)
      setItems(data || [])
    } catch { /* ignore */ }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-bold">#{order.order_number.split('-').pop()}</h3>
        <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
          <span className="text-lg">&times;</span>
        </button>
      </div>

      {/* Status badge */}
      <div className={`mb-4 rounded-xl p-3 ${config.bg} ${config.border} border`}>
        <div className={`text-sm font-bold ${config.color}`}>{order.status}</div>
        <div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
          <Clock className="h-3 w-3" />
          {formatElapsed(elapsed)} ago
        </div>
      </div>

      {/* Order info */}
      <div className="mb-4 space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Type</span>
          <span className="font-medium">{order.order_type}</span>
        </div>
        {order.table_name && (
          <div className="flex justify-between">
            <span className="text-gray-500">Table</span>
            <span className="font-medium">{order.table_name}</span>
          </div>
        )}
        {order.guests > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-500">Guests</span>
            <span className="font-medium">{order.guests}</span>
          </div>
        )}
        {order.waiter_name && (
          <div className="flex justify-between">
            <span className="text-gray-500">Waiter</span>
            <span className="font-medium">{order.waiter_name}</span>
          </div>
        )}
        {order.cashier_name && (
          <div className="flex justify-between">
            <span className="text-gray-500">Cashier</span>
            <span className="font-medium">{order.cashier_name}</span>
          </div>
        )}
      </div>

      {/* Items */}
      <div className="mb-4">
        <h4 className="mb-2 text-xs font-semibold uppercase text-gray-400">Items</h4>
        <div className="space-y-1.5">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-2 text-sm">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-[10px] font-bold">{item.qty}</span>
              <span className="flex-1">{item.item_name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="space-y-2">
        {(order.status === 'Open' || order.status === 'Hold') && (
          <button
            disabled={loading}
            onClick={() => onUpdateStatus(order.id, 'Preparing')}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            <ChefHat className="h-4 w-4" />
            Mark as Preparing
          </button>
        )}
        {order.status === 'Preparing' && (
          <button
            disabled={loading}
            onClick={() => onUpdateStatus(order.id, 'Ready to Serve')}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 py-3 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-50"
          >
            <Bell className="h-4 w-4" />
            Mark as Ready to Serve
          </button>
        )}
        {order.status === 'Ready to Serve' && (
          <div className="flex items-center gap-2 rounded-xl border-2 border-red-200 bg-red-50 p-3 text-center">
            <Bell className="h-5 w-5 animate-bounce text-red-500" />
            <div>
              <div className="text-sm font-bold text-red-700">Waiting for waiter</div>
              <div className="text-xs text-red-500">{formatElapsed(elapsed)} since ready</div>
            </div>
          </div>
        )}
        {order.status === 'Invoiced' && (
          <div className="rounded-xl border-2 border-purple-200 bg-purple-50 p-3 text-center">
            <div className="text-sm font-bold text-purple-700">Awaiting payment</div>
            <div className="text-xs text-purple-500">Invoice given to customer</div>
          </div>
        )}
      </div>
    </div>
  )
}
