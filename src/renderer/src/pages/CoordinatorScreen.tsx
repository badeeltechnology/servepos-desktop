import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useAuthStore } from '../stores/auth'
import { useStatus } from '../stores/status'
import { useMenu, itemColor } from '../stores/menu'
import StatusBand from '../components/StatusBand'
import { chime } from '../components/WaiterOrders'
import { Btn, Sheet, Dot, Cap, SearchIcon, money, useTier } from '../ui'
import { cn } from '../lib/utils'

// Kitchen pass: whole orders as tickets, colour = stage, timer = urgency, an "all day" count of
// what is still to make. Stage counts double as filters. Same data, filters and status changes
// as before (Preparing / Ready to Serve; invoices still auto-print on Ready).

type ViewMode = 'grid' | 'list'
type StatusFilter = 'all' | 'Open' | 'Preparing' | 'Ready to Serve' | 'Invoiced'
type SortKey = 'priority' | 'newest' | 'oldest' | 'elapsed_desc' | 'table' | 'status'
type GroupBy = 'none' | 'waiter' | 'status'
type TextSize = 'sm' | 'md' | 'lg'

// Work in progress first (oldest first across New and Preparing); Ready and billed tickets go to the end
const STATUS_PRIORITY: Record<string, number> = {
  'Open': 0,
  'Hold': 0,
  'Preparing': 0,
  'Ready to Serve': 2,
  'Invoiced': 3
}

const UI_STATE_KEY = 'coordinator_ui_state_v1'
const TICKS_KEY = 'coordinator_ticks_v1'

function loadUiState(): Partial<{
  viewMode: ViewMode; filter: StatusFilter; sort: SortKey;
  waiterFilter: string; cashierFilter: string; typeFilter: string; urgentOnly: boolean;
  groupBy: GroupBy; textSize: TextSize; chimeOn: boolean
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
  order_notes?: string | null
}

interface TicketItem { key: string; qty: number; name: string; code?: string; mods: string; note: string }

const STAGE: Record<string, { label: string; color: string }> = {
  'Open': { label: 'New', color: '#9A958A' },
  'Hold': { label: 'On hold', color: '#8B6F5C' },
  'Preparing': { label: 'Preparing', color: '#F4A52A' },
  'Ready to Serve': { label: 'Ready', color: '#2E8B57' },
  'Invoiced': { label: 'Bill printed', color: '#7C5CBF' }
}

function getElapsedMinutes(createdAt: string): number {
  const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(createdAt)
  const created = new Date(hasTz ? createdAt : createdAt + 'Z')
  return Math.max(0, Math.floor((Date.now() - created.getTime()) / 60000))
}

function formatElapsed(minutes: number): string {
  if (minutes < 1) return 'now'
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

function orderTitle(o: ActiveOrder) {
  return o.table_name || `#${o.order_number.split('-').pop()}`
}

function parseItems(o: ActiveOrder, fetched?: any[]): TicketItem[] {
  const src = fetched || (o.is_remote && Array.isArray(o.items) ? o.items : null)
  if (src) {
    return src.map((i: any, idx: number) => {
      let mods: any[] = []
      if (Array.isArray(i.modifiers)) mods = i.modifiers
      else if (typeof i.modifiers === 'string' && i.modifiers) { try { mods = JSON.parse(i.modifiers) } catch {} }
      return { key: i.id || `${idx}`, qty: Number(i.qty) || 1, name: i.item_name, code: i.item_code, mods: mods.map((m: any) => m.name).join(', '), note: i.special_instructions || i.notes || '' }
    })
  }
  // Fallback: "Name x2, Other x1"
  return (o.items_summary || '').split(', ').filter(Boolean).map((s, idx) => {
    const m = /^(.*) x(\d+(?:\.\d+)?)$/.exec(s)
    return { key: `${idx}`, qty: m ? Number(m[2]) : 1, name: m ? m[1] : s, mods: '', note: '' }
  })
}

export default function CoordinatorScreen({ onBack }: { onBack?: () => void } = {}) {
  const saved = useRef(loadUiState()).current
  const [orders, setOrders] = useState<ActiveOrder[]>([])
  const [itemsById, setItemsById] = useState<Record<string, any[]>>({})
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
  const [textSize, setTextSize] = useState<TextSize>(saved.textSize || 'md')
  const [chimeOn, setChimeOn] = useState<boolean>(saved.chimeOn !== false)
  const [showFilters, setShowFilters] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [ticks, setTicks] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem(TICKS_KEY) || '{}') } catch { return {} } })
  const [allDayPage, setAllDayPage] = useState(0)
  const knownIds = useRef<Set<string> | null>(null)
  const lateNotified = useRef<Set<string>>(new Set())
  const lateArmed = useRef(false)
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const { large } = useTier()
  const cur = useStatus((s) => s.currency)

  useEffect(() => { if (!useMenu.getState().loaded) useMenu.getState().load().catch(() => {}) }, [])

  // Persist UI state
  useEffect(() => {
    localStorage.setItem(UI_STATE_KEY, JSON.stringify({
      viewMode, filter, sort, waiterFilter, cashierFilter, typeFilter, urgentOnly, groupBy, textSize, chimeOn
    }))
  }, [viewMode, filter, sort, waiterFilter, cashierFilter, typeFilter, urgentOnly, groupBy, textSize, chimeOn])

  // Ticks are a kitchen-side aid only (local to this screen); keep the last few hundred
  useEffect(() => {
    const keys = Object.keys(ticks)
    const trimmed = keys.length > 400 ? Object.fromEntries(keys.slice(-400).map((k) => [k, ticks[k]])) : ticks
    try { localStorage.setItem(TICKS_KEY, JSON.stringify(trimmed)) } catch {}
  }, [ticks])

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 200)
    return () => clearTimeout(t)
  }, [search])

  const loadOrders = useCallback(async () => {
    try {
      const data: ActiveOrder[] = (await window.api.coordinator.getActiveOrders()) || []
      setOrders(data)
      // Chime when an order appears that we haven't seen (not on first load)
      const ids = new Set(data.map((o) => o.id))
      if (knownIds.current) {
        const fresh = data.some((o) => !knownIds.current!.has(o.id))
        if (fresh && chimeRef.current) chime()
      }
      knownIds.current = ids
      // Escalation: chime once when a ticket still being made passes 30 minutes
      for (const o of data) {
        if (['Open', 'Hold', 'Preparing'].includes(o.status) && getElapsedMinutes(o.created_at) >= 30 && !lateNotified.current.has(o.id)) {
          lateNotified.current.add(o.id)
          // Orders already late when the screen opens don't chime; later ones do
          if (lateArmed.current && chimeRef.current) chime()
        }
      }
      lateArmed.current = true
    } catch { /* ignore */ }
    try { useStatus.getState().setSync(await window.api.sync.status()) } catch {}
  }, [])
  const chimeRef = useRef(chimeOn)
  chimeRef.current = chimeOn

  useEffect(() => {
    loadOrders()
    const interval = setInterval(loadOrders, 10000) // Refresh every 10s
    return () => clearInterval(interval)
  }, [loadOrders])

  // Line items for local tickets (remote ones carry their own); refetch when the count changes
  const fetchedKey = useRef<Record<string, number>>({})
  useEffect(() => {
    const need = orders.filter((o) => !o.is_remote && fetchedKey.current[o.id] !== o.item_count)
    if (!need.length) return
    ;(async () => {
      const next: Record<string, any[]> = {}
      for (const o of need) {
        try { next[o.id] = (await window.api.orderItems.get(o.id)) || [] } catch { next[o.id] = [] }
        fetchedKey.current[o.id] = o.item_count
      }
      setItemsById((m) => ({ ...m, ...next }))
    })()
  }, [orders])

  // Force re-render every 30s to update elapsed timers
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30000)
    return () => clearInterval(timer)
  }, [])

  async function updateStatus(orderId: string, newStatus: string) {
    setLoading(true)
    try {
      const result = await window.api.coordinator.updateStatus(orderId, newStatus, user?.role || 'coordinator')
      if (result.success) {
        // Invoice auto-prints from backend when Ready to Serve
        await loadOrders()
        if (newStatus === 'Ready to Serve') setSelectedOrderId(null)
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
    const key = `${y}-${m}-${day}`
    // "Today" also keeps still-open orders started before midnight (they are still on the pass)
    return dateFilter === todayLocal() ? key <= dateFilter : key === dateFilter
  }), [orders, dateFilter])

  // Unique values for dropdowns (based on date-filtered set)
  const waiterOptions = useMemo(() => Array.from(new Set(dateFiltered.map((o) => o.waiter_name).filter(Boolean) as string[])).sort(), [dateFiltered])
  const cashierOptions = useMemo(() => Array.from(new Set(dateFiltered.map((o) => o.cashier_name).filter(Boolean) as string[])).sort(), [dateFiltered])
  const typeOptions = useMemo(() => Array.from(new Set(dateFiltered.map((o) => o.order_type).filter(Boolean) as string[])).sort(), [dateFiltered])

  const isUrgent = (o: ActiveOrder) =>
    o.status === 'Ready to Serve' && getElapsedMinutes(o.created_at) > 10

  // Apply all filters + sort
  const filtered = useMemo(() => {
    let result = dateFiltered
    if (filter !== 'all') result = result.filter((o) => (filter === 'Open' ? o.status === 'Open' || o.status === 'Hold' : o.status === filter))
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
        case 'newest': return getTime(b.created_at) - getTime(a.created_at) || 0
        case 'oldest': return getTime(a.created_at) - getTime(b.created_at)
        case 'elapsed_desc': return getTime(a.created_at) - getTime(b.created_at)
        case 'table': return (a.table_name || '').localeCompare(b.table_name || '', undefined, { numeric: true })
        case 'status': return (STATUS_PRIORITY[a.status] ?? 9) - (STATUS_PRIORITY[b.status] ?? 9)
        case 'priority':
        default: {
          const pa = STATUS_PRIORITY[a.status] ?? 9
          const pb = STATUS_PRIORITY[b.status] ?? 9
          if (pa !== pb) return pa - pb
          // Kitchens work oldest first, in every lane
          return getTime(a.created_at) - getTime(b.created_at)
        }
      }
    })
    return sorted
  }, [dateFiltered, filter, waiterFilter, cashierFilter, typeFilter, urgentOnly, debouncedSearch, sort])

  const statusCounts: Record<StatusFilter, number> = {
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
  const ticketItems = (o: ActiveOrder) => parseItems(o, itemsById[o.id])
  const tickKey = (o: ActiveOrder, it: TicketItem) => `${o.id}:${it.key}`

  // All day: what the kitchen still owes across New + Preparing tickets
  const allDay = useMemo(() => {
    const m = new Map<string, number>()
    for (const o of dateFiltered) {
      if (!['Open', 'Hold', 'Preparing'].includes(o.status)) continue
      for (const it of ticketItems(o)) if (!ticks[tickKey(o, it)]) m.set(it.name, (m.get(it.name) || 0) + it.qty)
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1])
  }, [dateFiltered, itemsById, ticks])
  const ALLDAY_PAGE = 11
  const allDayPages = Math.max(1, Math.ceil(allDay.length / ALLDAY_PAGE))
  const allDayShown = allDay.slice((allDayPage % allDayPages) * ALLDAY_PAGE, (allDayPage % allDayPages) * ALLDAY_PAGE + ALLDAY_PAGE)

  const filtersActive = waiterFilter !== 'all' || cashierFilter !== 'all' || typeFilter !== 'all' || urgentOnly || !!debouncedSearch || dateFilter !== todayLocal()
  const cols = large ? 5 : 4

  const renderTickets = (list: ActiveOrder[]) => viewMode === 'grid' ? (
    <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: 'minmax(300px, calc((100vh - 40px - 56px - 20px - 10px - 54px) / 2))' }}>
      {list.map((o) => (
        <Ticket key={o.id} order={o} items={ticketItems(o)} ticks={ticks} tickKey={tickKey} textSize={textSize} loading={loading}
          onTick={(k) => setTicks((t) => ({ ...t, [k]: !t[k] }))}
          onAdvance={(status) => updateStatus(o.id, status)}
          onOpen={() => setSelectedOrderId(o.id)} selected={selectedOrderId === o.id} />
      ))}
    </div>
  ) : (
    <div className="overflow-hidden rounded-md bg-white shadow-tile">
      <div className="grid h-9 grid-cols-[110px_90px_1fr_120px_130px_150px] items-center gap-3 border-b border-n-line px-4 text-xs font-bold uppercase tracking-[.08em] text-n-muted">
        <span>Order</span><span>Table</span><span>Items</span><span>Status</span><span>Time</span><span />
      </div>
      {list.map((order) => {
        const elapsed = getElapsedMinutes(order.created_at)
        const urgent = isUrgent(order)
        const st = STAGE[order.status] || STAGE.Open
        return (
          <div key={order.id} role="button" tabIndex={0} onClick={() => setSelectedOrderId(order.id)}
            className={cn('grid min-h-[52px] cursor-pointer grid-cols-[110px_90px_1fr_120px_130px_150px] items-center gap-3 border-b border-[#F0ECE3] px-4 text-sm', urgent && 'bg-[#FBEDEA]')}>
            <span className="cond num text-lg font-bold">#{order.order_number.split('-').pop()}</span>
            <span>{order.table_name || '–'}{order.waiter_name ? <span className="block text-xs text-n-muted">{order.waiter_name}</span> : null}</span>
            <span className="truncate text-n-muted">{order.item_count} items · {order.items_summary}</span>
            <span className="flex items-center gap-1.5"><Dot color={st.color} size={9} square />{st.label}</span>
            <span className="num text-n-muted">{new Date(order.created_at + 'Z').toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · {formatElapsed(elapsed)}</span>
            <span className="flex justify-end" onClick={(e) => e.stopPropagation()}>
              {(order.status === 'Open' || order.status === 'Hold' || order.status === 'Preparing') && (
                <Btn size="sm" variant="green" disabled={loading} onClick={() => updateStatus(order.id, 'Ready to Serve')}>Mark ready</Btn>
              )}
              {order.status === 'Ready to Serve' && <span className="text-xs font-semibold text-n-red">Waiting for waiter</span>}
              {order.status === 'Invoiced' && <span className="text-xs font-semibold text-[#7C5CBF]">Awaiting payment</span>}
            </span>
          </div>
        )
      })}
    </div>
  )

  const stageTabs: [StatusFilter, string, string][] = [
    ['Open', 'New', STAGE.Open.color], ['Preparing', 'Preparing', STAGE.Preparing.color], ['Ready to Serve', 'Ready', STAGE['Ready to Serve'].color], ['Invoiced', 'Bill printed', STAGE.Invoiced.color]
  ]

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-n-cream text-n-ink">
      <StatusBand subtitle="Kitchen pass · Coordinator" showWaiter={false} userName={user?.name}
        right={
          <button type="button" onClick={() => setChimeOn(!chimeOn)} aria-pressed={chimeOn} className="flex h-10 items-center gap-[7px] px-1 text-[13px] text-n-frost">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={chimeOn ? '#5FD38D' : '#9DBAC3'} strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z" />{chimeOn ? <path d="M15.5 8.5a5 5 0 0 1 0 7" /> : <path d="m16 9 5 6m0-6-5 6" />}</svg>
            {chimeOn ? 'Chime on' : 'Chime off'}
          </button>
        } />

      {/* Stage counts double as filters */}
      <div className="flex h-14 flex-shrink-0 items-center gap-2 bg-n-rail px-2.5">
        {onBack && <Btn variant="rail" onClick={onBack}>‹ Back to POS</Btn>}
        <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}
          className={cn('press flex h-11 items-center gap-2.5 rounded-md px-3.5 text-sm font-semibold', filter === 'all' ? 'bg-white text-n-deep' : 'bg-n-deep text-white')}>
          All<span className="cond num text-[22px] font-bold">{statusCounts.all}</span>
        </button>
        {stageTabs.map(([k, l, c]) => (
          <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(filter === k ? 'all' : k)}
            className={cn('press flex h-11 items-center gap-2.5 whitespace-nowrap rounded-md px-3.5 text-sm font-semibold', filter === k ? 'bg-white text-n-deep' : 'bg-n-deep text-white')}>
            <Dot color={c} size={10} square />{l}<span className="cond num text-[22px] font-bold">{statusCounts[k]}</span>
          </button>
        ))}
        {urgentCount > 0 && (
          <button type="button" aria-pressed={urgentOnly} onClick={() => setUrgentOnly(!urgentOnly)}
            className={cn('press flex h-11 items-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-semibold', urgentOnly ? 'bg-n-red text-white' : 'border-[1.5px] border-n-red bg-transparent text-n-coral')}>
            Waiting {'>'} 10m <span className="cond num text-[20px] font-bold">{urgentCount}</span>
          </button>
        )}
        <span className="flex-1" />
        <Btn variant="ghostDark" aria-pressed={showFilters} onClick={() => setShowFilters(!showFilters)} className={cn(filtersActive && 'border-n-amber text-n-gold')}>
          <SearchIcon size={16} />Filters{filtersActive ? ' ·' : ''}
        </Btn>
        <div role="radiogroup" aria-label="Text size" className="flex gap-0.5 rounded-lg bg-n-deep p-[3px]">
          {(['sm', 'md', 'lg'] as TextSize[]).map((s, i) => (
            <button key={s} type="button" role="radio" aria-checked={textSize === s} aria-label={['Small text', 'Medium text', 'Large text'][i]} onClick={() => setTextSize(s)}
              className={cn('h-[38px] w-11 rounded-md', textSize === s ? 'bg-white font-semibold text-n-deep' : 'text-white')} style={{ fontSize: [14, 18, 22][i] }}>A</button>
          ))}
        </div>
        {!onBack && <Btn variant="ghostDark" onClick={logout}>Sign out</Btn>}
      </div>

      {showFilters && (
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-n-line bg-white px-3 py-2 text-[13px]">
          <label className="flex h-11 min-w-[220px] flex-1 items-center gap-2 rounded-full border border-n-edge px-3">
            <SearchIcon size={16} />
            <input type="text" data-keyboard="full" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order, table, waiter, item…" className="min-w-0 flex-1 bg-transparent focus:outline-none" />
            {search && <button type="button" onClick={() => setSearch('')} className="text-lg text-n-muted" aria-label="Clear search">×</button>}
          </label>
          {[
            [waiterFilter, setWaiterFilter, 'All waiters', waiterOptions],
            [cashierFilter, setCashierFilter, 'All cashiers', cashierOptions],
            [typeFilter, setTypeFilter, 'All types', typeOptions]
          ].map(([v, set, all, opts], i) => (
            <select key={i} value={v as string} onChange={(e) => (set as (x: string) => void)(e.target.value)} className="h-11 rounded-md border border-n-edge bg-white px-2 font-medium focus:border-n-teal focus:outline-none">
              <option value="all">{all as string}</option>
              {(opts as string[]).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ))}
          <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="h-11 rounded-md border border-n-edge bg-white px-2 font-medium focus:border-n-teal focus:outline-none" />
          {dateFilter !== todayLocal() && <Btn size="sm" variant="outline" onClick={() => setDateFilter(todayLocal())}>Today</Btn>}
          <span className="text-n-muted">Group</span>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} className="h-11 rounded-md border border-n-edge bg-white px-2 font-medium">
            <option value="none">None</option><option value="waiter">Waiter</option><option value="status">Status</option>
          </select>
          <span className="text-n-muted">Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="h-11 rounded-md border border-n-edge bg-white px-2 font-medium">
            <option value="priority">Priority</option><option value="newest">Newest</option><option value="oldest">Oldest</option>
            <option value="elapsed_desc">Elapsed (longest)</option><option value="table">Table</option><option value="status">Status</option>
          </select>
          <div className="flex overflow-hidden rounded-md border border-n-edge">
            <button type="button" onClick={() => setViewMode('grid')} className={cn('h-11 px-3 font-semibold', viewMode === 'grid' ? 'bg-n-deep text-white' : 'bg-white')}>Tickets</button>
            <button type="button" onClick={() => setViewMode('list')} className={cn('h-11 px-3 font-semibold', viewMode === 'list' ? 'bg-n-deep text-white' : 'bg-white')}>List</button>
          </div>
          <Btn size="sm" variant="outline" onClick={loadOrders}>Refresh</Btn>
          {filtersActive && (
            <Btn size="sm" variant="plain" onClick={() => { setWaiterFilter('all'); setCashierFilter('all'); setTypeFilter('all'); setUrgentOnly(false); setSearch(''); setDateFilter(todayLocal()) }}>Clear</Btn>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-2.5 p-2.5">
        {/* Tickets */}
        <main className="min-w-0 flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 text-n-muted">
              <span className="cond text-3xl font-bold text-n-ink">{filtersActive || filter !== 'all' ? 'No orders match' : 'All clear'}</span>
              <span className="text-sm">{filtersActive || filter !== 'all' ? 'Change the filters to see more.' : 'New orders appear here as soon as the POS sends them.'}</span>
            </div>
          ) : groups ? (
            <div className="flex flex-col gap-3">
              {groups.map(({ key, orders: groupOrders }) => {
                const collapsed = collapsedGroups[key]
                return (
                  <div key={key}>
                    <button type="button" onClick={() => toggleGroup(key)} className="mb-2 flex h-10 w-full items-center gap-2 text-start">
                      <span className={cn('transition-transform', collapsed ? '' : 'rotate-90')}>▶</span>
                      <Cap className="text-n-muted">{groupBy === 'status' ? (STAGE[key]?.label || key) : key}</Cap>
                      <span className="cond num text-lg font-bold">{groupOrders.length}</span>
                    </button>
                    {!collapsed && renderTickets(groupOrders)}
                  </div>
                )
              })}
            </div>
          ) : renderTickets(filtered)}
        </main>

        {/* All-day counts: what the kitchen still owes, across every open order */}
        <aside aria-label="All day counts" className="hidden w-[220px] flex-shrink-0 flex-col overflow-hidden rounded-md bg-n-deep text-white min-[1200px]:flex">
          <div className="flex flex-col gap-0.5 px-3.5 pb-2 pt-3">
            <span className="cond text-[22px] font-bold">All day</span>
            <span className="text-xs text-n-mist">Still to make</span>
          </div>
          <div className="flex flex-1 flex-col px-1.5">
            {allDayShown.length === 0 && <span className="px-2 text-sm text-n-mist">Nothing waiting</span>}
            {allDayShown.map(([name, n]) => (
              <div key={name} className="flex h-10 items-center gap-2.5 border-t border-n-dim px-2">
                <span className="cond num min-w-[28px] text-2xl font-bold text-n-amber">{n}</span>
                <span className="flex-1 truncate text-sm">{name}</span>
              </div>
            ))}
          </div>
          {allDayPages > 1 && (
            <div className="flex h-[52px] items-center justify-between border-t border-n-dim pl-3.5 pr-2 text-[13px] text-n-mist">
              Page {(allDayPage % allDayPages) + 1} of {allDayPages}
              <Btn variant="white" onClick={() => setAllDayPage((p) => p + 1)}>Next</Btn>
            </div>
          )}
        </aside>
      </div>

      {/* Order detail panel */}
      {selectedOrder && (
        <Sheet onClose={() => setSelectedOrderId(null)} className="w-[400px] max-w-[92vw]" label={`Order ${selectedOrder.order_number}`}>
          <OrderDetail
            order={selectedOrder}
            items={ticketItems(selectedOrder)}
            raw={itemsById[selectedOrder.id] || (selectedOrder.is_remote ? selectedOrder.items : undefined)}
            onUpdateStatus={updateStatus}
            onClose={() => setSelectedOrderId(null)}
            loading={loading}
            cur={cur}
          />
        </Sheet>
      )}
    </div>
  )
}

// ==================== Ticket ====================
const ALLERGY = /allerg|حساسي|nut|gluten|lactose|shellfish|peanut/i
const TEXT: Record<TextSize, string> = { sm: 'text-[13px]', md: 'text-[15px]', lg: 'text-[18px]' }

function Ticket({ order, items, ticks, tickKey, textSize, loading, onTick, onAdvance, onOpen, selected }: {
  order: ActiveOrder; items: TicketItem[]; ticks: Record<string, boolean>; tickKey: (o: ActiveOrder, it: TicketItem) => string; textSize: TextSize
  loading: boolean; onTick: (k: string) => void; onAdvance: (status: string) => void; onOpen: () => void; selected: boolean
}) {
  const elapsed = getElapsedMinutes(order.created_at)
  const st = STAGE[order.status] || STAGE.Open
  const isNew = order.status === 'Open' || order.status === 'Hold'
  const isReady = order.status === 'Ready to Serve'
  const late = !isReady && order.status !== 'Invoiced' && elapsed >= 30
  const warn = !late && !isReady && order.status !== 'Invoiced' && elapsed >= 15
  // The clock stops at Ready: it measures the kitchen, not how long the guests have been sitting
  const urgent = false
  const max = textSize === 'lg' ? 3 : textSize === 'md' ? 4 : 6
  const shown = items.slice(0, max)
  const more = items.length - shown.length
  const sub = [order.order_type === 'Dine In' ? 'Dine in' : order.order_type, order.waiter_name, order.guests ? `${order.guests} guest${order.guests === 1 ? '' : 's'}` : null, order.room].filter(Boolean).join(', ')
  const flag = order.is_remote ? 'Waiter app' : isNew ? 'New' : order.status === 'Hold' ? 'On hold' : ''

  return (
    <article className={cn('flex min-h-0 flex-col overflow-hidden rounded-md shadow-tile', isReady ? 'bg-n-wash' : 'bg-white', selected && 'outline outline-[3px] -outline-offset-[3px] outline-n-teal', urgent && 'animate-edited')}>
      <span className="h-[7px] flex-shrink-0" style={{ background: st.color }} />
      <button type="button" onClick={onOpen} className="flex items-start gap-2 px-3 pb-1.5 pt-2 text-start">
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="flex items-baseline gap-2">
            <span className="cond text-[36px] font-bold leading-none">{orderTitle(order)}</span>
            {flag && <span className={cn('whitespace-nowrap rounded-[5px] px-[7px] py-px text-xs font-bold', order.is_remote ? 'bg-n-teal text-white' : 'text-n-muted')}>{flag}</span>}
          </span>
          <span className="truncate text-[13px] text-n-muted">{sub}</span>
        </span>
        <span className={cn('cond num flex h-[34px] min-w-[54px] items-center justify-center rounded px-2 text-[22px] font-bold', late || urgent ? 'bg-n-red text-white' : warn ? 'text-[#B56A00]' : 'text-n-muted')}>{isReady ? 'Ready' : order.status === 'Invoiced' ? 'Billed' : formatElapsed(elapsed)}</span>
      </button>
      {order.order_notes && (
        <div className={cn('mx-3 mb-1 rounded-md px-2 py-1 text-[13px] font-semibold', ALLERGY.test(order.order_notes) ? 'bg-n-red text-white' : 'line-clamp-2 bg-[#FBEFD9] text-[#8A5A00]')}>{order.order_notes}</div>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-1.5">
        {shown.map((it) => {
          const k = tickKey(order, it)
          const done = !!ticks[k] || isReady || order.status === 'Invoiced'
          return (
            <button key={it.key} type="button" aria-pressed={done} onClick={() => onTick(k)} className="flex min-h-[40px] flex-shrink-0 items-start gap-2.5 rounded-md px-1.5 py-[7px] text-start">
              <span className={cn('flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-md', done ? 'bg-n-green' : 'border-2 border-[#B9B2A4]')}>
                {done && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-px">
                <span className={cn('break-words font-semibold leading-snug', TEXT[textSize], done && 'text-n-stone line-through')}>
                  <span className="cond num me-1.5 inline-block rounded px-1 leading-snug text-white" style={{ background: itemColor(it.code, it.name) }}>{it.qty}</span>{it.name}
                </span>
                {it.mods && <span className="text-[13px] font-semibold text-n-red">{it.mods}</span>}
                {it.note && <span className={cn('text-[13px] font-semibold', ALLERGY.test(it.note) ? 'rounded bg-n-red px-1.5 text-white' : 'text-[#2E6DA4]')}>{it.note}</span>}
              </span>
            </button>
          )
        })}
        {more > 0 && <button type="button" onClick={onOpen} className="px-2 py-0.5 text-start text-[13px] text-n-muted">+ {more} more item{more === 1 ? '' : 's'}, tap to open</button>}
        {items.length === 0 && <span className="px-2 py-1 text-[13px] text-n-muted">{order.item_count} items</span>}
      </div>
      <div className="flex gap-1.5 px-2.5 pb-2.5 pt-2">
        {isNew && <button type="button" disabled={loading} onClick={() => onAdvance('Preparing')} className="press h-[52px] flex-1 rounded-md bg-n-deep text-base font-bold text-white disabled:opacity-50">Start</button>}
        {(isNew || order.status === 'Preparing') && (
          <button type="button" disabled={loading} onClick={() => onAdvance('Ready to Serve')} className={cn('press h-[52px] flex-1 whitespace-nowrap rounded-md px-3 text-base font-bold disabled:opacity-50', isNew ? 'border-2 border-n-green bg-white text-n-green' : 'bg-n-green text-white')}>Mark ready</button>
        )}
        {isReady && <span className="flex h-[52px] flex-1 items-center justify-center rounded-md border-2 border-n-green bg-white text-[15px] font-bold text-n-green">Waiting for waiter</span>}
        {order.status === 'Invoiced' && <span className="flex h-[52px] flex-1 items-center justify-center rounded-md border-2 border-[#7C5CBF] bg-white text-[15px] font-bold text-[#7C5CBF]">Awaiting payment</span>}
        <button type="button" aria-label={`Details for ${orderTitle(order)}`} onClick={onOpen} className="press flex h-[52px] w-[52px] flex-shrink-0 items-center justify-center rounded-md border border-n-edge bg-white">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#1B1F24" aria-hidden="true"><circle cx="5" cy="12" r="2.2" /><circle cx="12" cy="12" r="2.2" /><circle cx="19" cy="12" r="2.2" /></svg>
        </button>
      </div>
    </article>
  )
}

// ==================== Order Detail Panel ====================
function OrderDetail({ order, items, raw, onUpdateStatus, onClose, loading, cur }: {
  order: ActiveOrder; items: TicketItem[]; raw?: any[]; onUpdateStatus: (id: string, status: string) => void; onClose: () => void; loading: boolean; cur: string
}) {
  const st = STAGE[order.status] || STAGE.Open
  const elapsed = getElapsedMinutes(order.created_at)
  const [printLog, setPrintLog] = useState<any[]>([])

  useEffect(() => { loadPrintLog() }, [order.id])

  async function loadPrintLog() {
    try {
      const data = await window.api.printLog.getForOrder(order.id)
      setPrintLog(data || [])
    } catch { setPrintLog([]) }
  }

  return (
    <>
      <div className="flex h-14 flex-shrink-0 items-center gap-3 bg-n-deep px-4 text-white">
        <span className="cond flex-1 text-2xl font-bold">{orderTitle(order)} · #{order.order_number.split('-').pop()}</span>
        <Btn variant="ghostDark" onClick={onClose}>Close</Btn>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 text-sm">
        <div className="flex items-center gap-2 rounded-md bg-white p-3 shadow-tile">
          <Dot color={st.color} size={10} square /><span className="font-bold">{order.status}</span>
          <span className="flex-1" /><span className="text-n-muted">{formatElapsed(elapsed)} ago</span>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-n-muted">
          <span>Type <b className="text-n-ink">{order.order_type}</b></span>
          {order.table_name && <span>Table <b className="text-n-ink">{order.table_name}</b></span>}
          {order.guests > 0 && <span>Guests <b className="text-n-ink">{order.guests}</b></span>}
          {order.waiter_name && <span>Waiter <b className="text-n-ink">{order.waiter_name}</b></span>}
          {order.cashier_name && <span>Cashier <b className="text-n-ink">{order.cashier_name}</b></span>}
        </div>

        <div className="rounded-md bg-white p-3 shadow-tile">
          <span className="flex justify-between"><Cap className="text-n-muted">Items</Cap><span className="text-xs text-n-muted">{items.length} line{items.length === 1 ? '' : 's'}</span></span>
          {items.length === 0 && <div className="py-3 text-center text-xs text-n-muted">No items</div>}
          {items.map((it, i) => {
            const r = raw?.[i]
            const rate = Number(r?.rate) || 0
            const amount = Number(r?.amount) || rate * it.qty
            return (
              <div key={it.key} className="mt-1.5 flex items-start gap-2">
                <span className="cond num flex h-5 min-w-[20px] items-center justify-center rounded bg-n-cream px-1 text-[13px] font-bold">{it.qty}</span>
                <div className="flex-1">
                  <div className="font-medium">{it.name}</div>
                  {it.mods && <div className="text-xs text-n-red">{it.mods}</div>}
                  {it.note && <div className="text-xs italic text-[#2E6DA4]">{it.note}</div>}
                  {rate > 0 && <div className="text-xs text-n-muted">@ {money(rate)}</div>}
                </div>
                {amount > 0 && <div className="num text-xs font-semibold">{money(amount)}</div>}
              </div>
            )
          })}
          {order.grand_total > 0 && (
            <div className="mt-2 flex justify-between border-t border-n-line pt-2"><span className="font-semibold text-n-muted">Total</span><span className="num font-bold">{cur} {money(order.grand_total)}</span></div>
          )}
        </div>

        <PrintHistory log={printLog} isRemote={!!order.is_remote} />
      </div>
      <div className="flex flex-shrink-0 flex-col gap-2 bg-white px-4 py-3">
        {(order.status === 'Open' || order.status === 'Hold') && (
          <Btn size="lg" variant="deep" disabled={loading} onClick={() => onUpdateStatus(order.id, 'Preparing')}>Start preparing</Btn>
        )}
        {(order.status === 'Open' || order.status === 'Hold' || order.status === 'Preparing') && (
          <Btn size="lg" variant="green" disabled={loading} onClick={() => onUpdateStatus(order.id, 'Ready to Serve')}>Mark ready + print invoice</Btn>
        )}
        {order.status === 'Ready to Serve' && (
          <div className="rounded-md border-2 border-n-red bg-[#FBEDEA] p-3 text-center">
            <div className="font-bold text-n-red">Waiting for waiter</div>
            <div className="text-xs text-n-red">{formatElapsed(elapsed)} since the order</div>
          </div>
        )}
        {order.status === 'Invoiced' && (
          <div className="rounded-md border-2 border-[#7C5CBF] bg-[#F1ECF8] p-3 text-center">
            <div className="font-bold text-[#7C5CBF]">Awaiting payment</div>
            <div className="text-xs text-[#7C5CBF]">Invoice given to customer</div>
          </div>
        )}
      </div>
    </>
  )
}

// ==================== Print History ====================
const PRINT_TYPE_LABEL: Record<string, string> = {
  kot: 'KOT',
  kot_amendment: 'KOT (Amend)',
  no_kot: 'No KOT',
  receipt: 'Receipt',
  invoice: 'Invoice',
  prep_doc: 'Prep Doc',
  waiter_copy: 'Waiter Copy'
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
    <div className="rounded-md bg-white p-3 shadow-tile">
      <span className="flex justify-between"><Cap className="text-n-muted">Print history</Cap><span className="text-xs text-n-muted">{log.length} event{log.length === 1 ? '' : 's'}</span></span>
      {isRemote && log.length === 0 ? (
        <div className="py-2 text-center text-xs italic text-n-muted">Print history is recorded on the cashier machine</div>
      ) : log.length === 0 ? (
        <div className="py-2 text-center text-xs text-n-muted">No prints yet</div>
      ) : (
        <div className="mt-1.5 flex flex-col gap-1.5">
          {log.map((row) => {
            const source = row.source || 'manual'
            const failed = row.status !== 'success'
            return (
              <div key={row.id} className="flex items-center gap-2 text-xs">
                <span className="num w-14 text-n-muted">{formatLogTime(row.printed_at)}</span>
                <span className="w-16 font-semibold">{PRINT_TYPE_LABEL[row.print_type] || row.print_type}</span>
                <span className="rounded-full bg-n-cream px-1.5 py-0.5 text-xs font-bold uppercase text-n-muted">{source}</span>
                <span className="flex-1 truncate text-n-muted" title={row.printer_name || ''}>{row.printer_name || '—'}</span>
                {row.actor_name && <span className="truncate text-n-muted" title={row.actor_name}>{row.actor_name}</span>}
                {failed ? <span className="text-n-red" title={row.error || ''}>✗</span> : <span className="text-n-green">✓</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

