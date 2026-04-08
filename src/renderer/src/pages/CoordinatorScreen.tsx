import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useAuthStore } from '../stores/auth'
import { LayoutGrid, List, Clock, ChefHat, Bell, FileText, LogOut, RefreshCw, Search, X, AlertTriangle } from 'lucide-react'

type ViewMode = 'grid' | 'list'
type StatusFilter = 'all' | 'Open' | 'Preparing' | 'Ready to Serve' | 'Invoiced'
type SortKey = 'priority' | 'newest' | 'oldest' | 'elapsed_desc' | 'table' | 'status'
type GroupBy = 'none' | 'waiter' | 'status'

const STATUS_PRIORITY: Record<string, number> = {
  'Ready to Serve': 0,
  'Preparing': 1,
  'Open': 2,
  'Hold': 2,
  'Invoiced': 3
}

const UI_STATE_KEY = 'coordinator_ui_state_v1'

function loadUiState(): Partial<{
  viewMode: ViewMode; filter: StatusFilter; sort: SortKey;
  waiterFilter: string; cashierFilter: string; typeFilter: string; urgentOnly: boolean;
  groupBy: GroupBy
}> {
  try { return JSON.parse(localStorage.getItem(UI_STATE_KEY) || '{}') } catch { return {} }
}

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
  is_remote?: number
  items?: any[]
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

function todayLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function CoordinatorScreen({ onBack }: { onBack?: () => void } = {}) {
  const saved = useRef(loadUiState()).current
  const [orders, setOrders] = useState<ActiveOrder[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>(saved.viewMode || 'grid')
  const [filter, setFilter] = useState<StatusFilter>(saved.filter || 'all')
  const [dateFilter, setDateFilter] = useState<string>(todayLocal())
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [waiterFilter, setWaiterFilter] = useState<string>(saved.waiterFilter || 'all')
  const [cashierFilter, setCashierFilter] = useState<string>(saved.cashierFilter || 'all')
  const [typeFilter, setTypeFilter] = useState<string>(saved.typeFilter || 'all')
  const [sort, setSort] = useState<SortKey>(saved.sort || 'priority')
  const [urgentOnly, setUrgentOnly] = useState<boolean>(saved.urgentOnly || false)
  const [groupBy, setGroupBy] = useState<GroupBy>(saved.groupBy || 'none')
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  // Persist UI state
  useEffect(() => {
    localStorage.setItem(UI_STATE_KEY, JSON.stringify({
      viewMode, filter, sort, waiterFilter, cashierFilter, typeFilter, urgentOnly, groupBy
    }))
  }, [viewMode, filter, sort, waiterFilter, cashierFilter, typeFilter, urgentOnly, groupBy])

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 200)
    return () => clearTimeout(t)
  }, [search])

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
        // Invoice auto-prints from backend when Ready to Serve
        await loadOrders()
        setSelectedOrderId(null)
      }
    } finally {
      setLoading(false)
    }
  }

  // Filter by date first (using local date comparison)
  const dateFiltered = useMemo(() => orders.filter((o) => {
    if (!o.created_at) return false
    const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(o.created_at)
    const d = new Date(hasTz ? o.created_at : o.created_at + 'Z')
    if (isNaN(d.getTime())) return false
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}` === dateFilter
  }), [orders, dateFilter])

  // Unique values for dropdowns (based on date-filtered set)
  const waiterOptions = useMemo(() => {
    const s = new Set<string>()
    dateFiltered.forEach((o) => { if (o.waiter_name) s.add(o.waiter_name) })
    return Array.from(s).sort()
  }, [dateFiltered])
  const cashierOptions = useMemo(() => {
    const s = new Set<string>()
    dateFiltered.forEach((o) => { if (o.cashier_name) s.add(o.cashier_name) })
    return Array.from(s).sort()
  }, [dateFiltered])
  const typeOptions = useMemo(() => {
    const s = new Set<string>()
    dateFiltered.forEach((o) => { if (o.order_type) s.add(o.order_type) })
    return Array.from(s).sort()
  }, [dateFiltered])

  const isUrgent = (o: ActiveOrder) =>
    o.status === 'Ready to Serve' && getElapsedMinutes(o.created_at) > 10

  // Apply all filters + sort
  const filtered = useMemo(() => {
    let result = dateFiltered
    if (filter !== 'all') result = result.filter((o) => o.status === filter)
    if (waiterFilter !== 'all') result = result.filter((o) => (o.waiter_name || '') === waiterFilter)
    if (cashierFilter !== 'all') result = result.filter((o) => (o.cashier_name || '') === cashierFilter)
    if (typeFilter !== 'all') result = result.filter((o) => o.order_type === typeFilter)
    if (urgentOnly) result = result.filter(isUrgent)
    if (debouncedSearch) {
      const q = debouncedSearch
      result = result.filter((o) =>
        (o.order_number || '').toLowerCase().includes(q) ||
        (o.table_name || '').toLowerCase().includes(q) ||
        (o.waiter_name || '').toLowerCase().includes(q) ||
        (o.cashier_name || '').toLowerCase().includes(q) ||
        (o.items_summary || '').toLowerCase().includes(q)
      )
    }

    const sorted = [...result]
    const getTime = (s: string) => {
      const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(s)
      return new Date(hasTz ? s : s + 'Z').getTime()
    }
    sorted.sort((a, b) => {
      switch (sort) {
        case 'newest': return getTime(b.created_at) - getTime(a.created_at)
        case 'oldest': return getTime(a.created_at) - getTime(b.created_at)
        case 'elapsed_desc': return getTime(a.created_at) - getTime(b.created_at)
        case 'table': return (a.table_name || '').localeCompare(b.table_name || '', undefined, { numeric: true })
        case 'status': return (STATUS_PRIORITY[a.status] ?? 9) - (STATUS_PRIORITY[b.status] ?? 9)
        case 'priority':
        default: {
          const pa = STATUS_PRIORITY[a.status] ?? 9
          const pb = STATUS_PRIORITY[b.status] ?? 9
          if (pa !== pb) return pa - pb
          // Within same status: urgent (older) first for Ready, newest for others
          if (a.status === 'Ready to Serve') return getTime(a.created_at) - getTime(b.created_at)
          return getTime(b.created_at) - getTime(a.created_at)
        }
      }
    })
    return sorted
  }, [dateFiltered, filter, waiterFilter, cashierFilter, typeFilter, urgentOnly, debouncedSearch, sort])

  const statusCounts = {
    all: dateFiltered.length,
    Open: dateFiltered.filter((o) => o.status === 'Open' || o.status === 'Hold').length,
    Preparing: dateFiltered.filter((o) => o.status === 'Preparing').length,
    'Ready to Serve': dateFiltered.filter((o) => o.status === 'Ready to Serve').length,
    Invoiced: dateFiltered.filter((o) => o.status === 'Invoiced').length
  }
  const urgentCount = dateFiltered.filter(isUrgent).length

  // Stable selection — re-resolve selected order from latest orders list
  const selectedOrder = useMemo(
    () => (selectedOrderId ? orders.find((o) => o.id === selectedOrderId) || null : null),
    [orders, selectedOrderId]
  )

  // Grouped view
  const groups = useMemo(() => {
    if (groupBy === 'none') return null
    const map = new Map<string, ActiveOrder[]>()
    const keyFn = groupBy === 'waiter'
      ? (o: ActiveOrder) => o.waiter_name || 'Unassigned'
      : (o: ActiveOrder) => o.status
    filtered.forEach((o) => {
      const k = keyFn(o)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(o)
    })
    // Sort group keys: status → priority order, waiter → alphabetical (Unassigned last)
    const keys = Array.from(map.keys())
    if (groupBy === 'status') {
      keys.sort((a, b) => (STATUS_PRIORITY[a] ?? 9) - (STATUS_PRIORITY[b] ?? 9))
    } else {
      keys.sort((a, b) => {
        if (a === 'Unassigned') return 1
        if (b === 'Unassigned') return -1
        return a.localeCompare(b)
      })
    }
    return keys.map((k) => ({ key: k, orders: map.get(k)! }))
  }, [filtered, groupBy])

  // Keyboard navigation for detail panel
  useEffect(() => {
    if (!selectedOrderId) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedOrderId(null)
        return
      }
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      const idx = filtered.findIndex((o) => o.id === selectedOrderId)
      if (idx < 0) return
      e.preventDefault()
      const next = e.key === 'ArrowDown'
        ? Math.min(filtered.length - 1, idx + 1)
        : Math.max(0, idx - 1)
      setSelectedOrderId(filtered[next].id)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedOrderId, filtered])

  const toggleGroup = (k: string) => setCollapsedGroups((m) => ({ ...m, [k]: !m[k] }))

  return (
    <div className="flex h-screen flex-col bg-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <ChefHat className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-lg font-bold">Coordinator</h1>
            <p className="text-xs text-gray-500">
              {user?.name} | {dateFiltered.length} active
              {urgentCount > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 font-bold text-red-700">
                  <AlertTriangle className="h-3 w-3" /> {urgentCount} urgent
                </span>
              )}
            </p>
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

      {/* Status filter tabs + Date picker */}
      <div className="flex items-center gap-2 border-b bg-white px-6 py-2">
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
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setUrgentOnly((v) => !v)}
            className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
              urgentOnly ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            title="Show only orders marked Ready > 10 min"
          >
            <AlertTriangle className="h-3 w-3" /> Urgent
          </button>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 focus:border-primary focus:outline-none"
          />
          {dateFilter !== todayLocal() && (
            <button
              onClick={() => setDateFilter(todayLocal())}
              className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-200"
            >
              Today
            </button>
          )}
        </div>
      </div>

      {/* Search + filter/sort toolbar */}
      <div className="flex items-center gap-2 border-b bg-white px-6 py-2">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order, table, waiter, item…"
            className="w-full rounded-lg border border-gray-200 py-1.5 pl-8 pr-8 text-xs focus:border-primary focus:outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:bg-gray-100"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <select
          value={waiterFilter}
          onChange={(e) => setWaiterFilter(e.target.value)}
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-700 focus:border-primary focus:outline-none"
        >
          <option value="all">All waiters</option>
          {waiterOptions.map((w) => <option key={w} value={w}>{w}</option>)}
        </select>
        <select
          value={cashierFilter}
          onChange={(e) => setCashierFilter(e.target.value)}
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-700 focus:border-primary focus:outline-none"
        >
          <option value="all">All cashiers</option>
          {cashierOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-700 focus:border-primary focus:outline-none"
        >
          <option value="all">All types</option>
          {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-1 text-xs text-gray-500">
          <span>Group:</span>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupBy)}
            className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-700 focus:border-primary focus:outline-none"
          >
            <option value="none">None</option>
            <option value="waiter">Waiter</option>
            <option value="status">Status</option>
          </select>
          <span className="ml-2">Sort:</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-700 focus:border-primary focus:outline-none"
          >
            <option value="priority">Priority</option>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="elapsed_desc">Elapsed (longest)</option>
            <option value="table">Table</option>
            <option value="status">Status</option>
          </select>
          {(waiterFilter !== 'all' || cashierFilter !== 'all' || typeFilter !== 'all' || urgentOnly || debouncedSearch) && (
            <button
              onClick={() => {
                setWaiterFilter('all'); setCashierFilter('all'); setTypeFilter('all')
                setUrgentOnly(false); setSearch('')
              }}
              className="ml-1 rounded-full bg-gray-100 px-2 py-1 font-semibold text-gray-600 hover:bg-gray-200"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Orders */}
        <div className="flex-1 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-gray-400">
              <ChefHat className="mb-3 h-12 w-12 opacity-30" />
              <p className="text-sm font-medium">
                {debouncedSearch || waiterFilter !== 'all' || cashierFilter !== 'all' || typeFilter !== 'all' || urgentOnly || filter !== 'all'
                  ? 'No orders match the current filters'
                  : 'No active orders'}
              </p>
            </div>
          ) : groups ? (
            <div className="space-y-4">
              {groups.map(({ key, orders: groupOrders }) => {
                const collapsed = collapsedGroups[key]
                return (
                  <div key={key}>
                    <button
                      onClick={() => toggleGroup(key)}
                      className="mb-2 flex w-full items-center gap-2 text-left text-xs font-bold uppercase text-gray-500 hover:text-gray-700"
                    >
                      <span className={`transition-transform ${collapsed ? '' : 'rotate-90'}`}>▶</span>
                      <span>{key}</span>
                      <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px]">{groupOrders.length}</span>
                    </button>
                    {!collapsed && (
                      viewMode === 'grid' ? (
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                          {groupOrders.map((order) => (
                            <GridCard
                              key={order.id}
                              order={order}
                              onSelect={() => setSelectedOrderId(order.id)}
                              isSelected={selectedOrder?.id === order.id}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-xl border bg-white">
                          <table className="w-full text-sm">
                            <tbody className="divide-y">
                              {groupOrders.map((order) => (
                                <ListRow
                                  key={order.id}
                                  order={order}
                                  onSelect={() => setSelectedOrderId(order.id)}
                                  onUpdateStatus={updateStatus}
                                  loading={loading}
                                />
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )
                    )}
                  </div>
                )
              })}
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {filtered.map((order) => (
                <GridCard
                  key={order.id}
                  order={order}
                  onSelect={() => setSelectedOrderId(order.id)}
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
                      onSelect={() => setSelectedOrderId(order.id)}
                      onUpdateStatus={updateStatus}
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
          <div className="w-96 border-l bg-white p-4 overflow-y-auto">
            <OrderDetail
              order={selectedOrder}
              onUpdateStatus={updateStatus}
              onClose={() => setSelectedOrderId(null)}
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
  const isReady = order.status === 'Ready to Serve'
  const tier: 'none' | 'warn' | 'urgent' =
    isReady && elapsed > 10 ? 'urgent' : isReady && elapsed >= 5 ? 'warn' : 'none'
  const tierRing =
    tier === 'urgent' ? 'ring-2 ring-red-400 animate-pulse'
    : tier === 'warn' ? 'ring-2 ring-amber-300'
    : ''

  return (
    <button
      onClick={onSelect}
      className={`rounded-xl border-2 p-3 text-left transition-all hover:shadow-md ${config.border} ${config.bg} ${
        isSelected ? 'ring-2 ring-primary ring-offset-1' : tierRing
      }`}
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
function ListRow({ order, onSelect, onUpdateStatus, loading }: {
  order: ActiveOrder; onSelect: () => void; onUpdateStatus: (id: string, status: string) => void; loading: boolean
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
        {(order.status === 'Open' || order.status === 'Hold' || order.status === 'Preparing') && (
          <button disabled={loading} onClick={() => onUpdateStatus(order.id, 'Ready to Serve')} className="rounded-lg bg-green-600 px-3 py-1 text-[10px] font-bold text-white hover:bg-green-700 disabled:opacity-50">
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
function OrderDetail({ order, onUpdateStatus, onClose, loading }: {
  order: ActiveOrder; onUpdateStatus: (id: string, status: string) => void; onClose: () => void; loading: boolean
}) {
  const config = STATUS_CONFIG[order.status] || STATUS_CONFIG['Open']
  const elapsed = getElapsedMinutes(order.created_at)
  const [items, setItems] = useState<any[]>([])
  const [printLog, setPrintLog] = useState<any[]>([])

  useEffect(() => {
    if (order.is_remote && Array.isArray(order.items)) {
      setItems(order.items)
    } else {
      loadItems()
    }
    loadPrintLog()
  }, [order.id])

  async function loadItems() {
    try {
      const data = await window.api.orderItems.get(order.id)
      setItems(data || [])
    } catch { /* ignore */ }
  }

  async function loadPrintLog() {
    try {
      const data = await window.api.printLog.getForOrder(order.id)
      setPrintLog(data || [])
    } catch { setPrintLog([]) }
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
        <h4 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase text-gray-400">
          <span>Items</span>
          <span className="text-[10px] normal-case text-gray-400">{items.length} line{items.length === 1 ? '' : 's'}</span>
        </h4>
        <div className="space-y-2 rounded-lg border border-gray-100 bg-gray-50/50 p-2">
          {items.length === 0 && (
            <div className="py-3 text-center text-xs text-gray-400">No items</div>
          )}
          {items.map((item) => {
            const rate = Number(item.rate) || 0
            const amount = Number(item.amount) || rate * (Number(item.qty) || 0)
            return (
              <div key={item.id} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold shadow-sm">
                  {item.qty}
                </span>
                <div className="flex-1">
                  <div className="font-medium text-gray-800">{item.item_name}</div>
                  {rate > 0 && (
                    <div className="text-[10px] text-gray-400">@ {rate.toFixed(2)}</div>
                  )}
                  {item.notes && (
                    <div className="mt-0.5 text-[10px] italic text-gray-500">{item.notes}</div>
                  )}
                </div>
                {amount > 0 && (
                  <div className="text-xs font-semibold text-gray-700">{amount.toFixed(2)}</div>
                )}
              </div>
            )
          })}
        </div>
        {order.grand_total > 0 && (
          <div className="mt-2 flex items-center justify-between border-t pt-2 text-sm">
            <span className="font-semibold text-gray-500">Total</span>
            <span className="font-bold text-gray-900">{Number(order.grand_total).toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* Print History */}
      <PrintHistory log={printLog} isRemote={!!order.is_remote} />

      {/* Action buttons */}
      <div className="space-y-2">
        {(order.status === 'Open' || order.status === 'Hold' || order.status === 'Preparing') && (
          <button
            disabled={loading}
            onClick={() => onUpdateStatus(order.id, 'Ready to Serve')}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50"
          >
            <Bell className="h-4 w-4" />
            Mark Ready + Print Invoice
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

// ==================== Print History ====================
const PRINT_TYPE_LABEL: Record<string, string> = {
  kot: 'KOT',
  kot_amendment: 'KOT (Amend)',
  receipt: 'Receipt',
  invoice: 'Invoice',
  prep_doc: 'Prep Doc',
  waiter_copy: 'Waiter Copy'
}

const SOURCE_STYLE: Record<string, string> = {
  auto: 'bg-blue-100 text-blue-700',
  manual: 'bg-gray-100 text-gray-700',
  reprint: 'bg-amber-100 text-amber-800',
  amendment: 'bg-purple-100 text-purple-700'
}

function formatLogTime(s: string): string {
  if (!s) return ''
  // print_log.printed_at is stored via SQLite datetime('now') → UTC without tz marker
  const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(s)
  const d = new Date(hasTz ? s : s + 'Z')
  if (isNaN(d.getTime())) return s
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

function PrintHistory({ log, isRemote }: { log: any[]; isRemote: boolean }) {
  return (
    <div className="mb-4">
      <h4 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase text-gray-400">
        <span>Print History</span>
        <span className="text-[10px] normal-case text-gray-400">{log.length} event{log.length === 1 ? '' : 's'}</span>
      </h4>
      <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-2">
        {isRemote && log.length === 0 ? (
          <div className="py-2 text-center text-[11px] italic text-gray-400">
            Print history is recorded on the cashier machine
          </div>
        ) : log.length === 0 ? (
          <div className="py-2 text-center text-[11px] text-gray-400">No prints yet</div>
        ) : (
          <div className="space-y-1.5">
            {log.map((row) => {
              const source = row.source || 'manual'
              const badge = SOURCE_STYLE[source] || SOURCE_STYLE.manual
              const failed = row.status !== 'success'
              return (
                <div key={row.id} className="flex items-center gap-2 text-[11px]">
                  <span className="w-14 font-mono tabular-nums text-gray-500">{formatLogTime(row.printed_at)}</span>
                  <span className="w-16 font-semibold text-gray-700">
                    {PRINT_TYPE_LABEL[row.print_type] || row.print_type}
                  </span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${badge}`}>
                    {source}
                  </span>
                  <span className="flex-1 truncate text-gray-500" title={row.printer_name || ''}>
                    {row.printer_name || '—'}
                  </span>
                  {row.actor_name && (
                    <span className="truncate text-gray-600" title={row.actor_name}>
                      {row.actor_name}
                    </span>
                  )}
                  {failed ? (
                    <span className="text-red-600" title={row.error || ''}>✗</span>
                  ) : (
                    <span className="text-green-600">✓</span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
