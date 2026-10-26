import { useMemo, useRef, useState } from 'react'
import { useFloor, FloorTable } from '../stores/floor'
import { useStatus } from '../stores/status'
import { useT } from '../stores/i18n'
import { ActiveOrderRow, stageOf } from './orderStatus'
import { Chip, Dot, SearchIcon, money, staffColor, initial, useTier, C } from '../ui'
import { minutesSince, ageLabel, useTick } from '../ui/hosts'
import { cn } from '../lib/utils'

// The floor: every table as a big tile, coloured by what is happening on it. Used full-screen
// (Tables) and inside the table picker. Room tabs with free/occupied counts, summary chips that
// filter, and a search box to jump to a table by name (A1B, "Dine-in 3"…).

export type FloorMode = 'floor' | 'pick'
type Filter = 'all' | 'free' | 'occupied' | 'bill' | 'ready'

export interface TileInfo {
  table: FloorTable
  order: ActiveOrderRow | null
  state: 'free' | 'occupied' | 'bill' | 'ready' | 'hold' | 'reserved' | 'blocked'
  late: boolean
  minutes: number
}

const ALL = '__all'

export function tileInfo(table: FloorTable, byTable: Map<string, ActiveOrderRow>, byId: Map<string, ActiveOrderRow>): TileInfo {
  const order = byTable.get(table.name) || (table.current_order_id ? byId.get(table.current_order_id) || null : null)
  if (!order) {
    const s = table.status === 'Reserved' ? 'reserved' : table.status === 'Blocked' ? 'blocked' : 'free'
    // A table marked Occupied with no open order on this till (e.g. another till's order) still reads as occupied
    return { table, order: null, state: table.status === 'Occupied' ? 'occupied' : s, late: false, minutes: 0 }
  }
  const st = stageOf(order)
  const minutes = minutesSince(order.created_at)
  const state = st === 'invoiced' ? 'bill' : st === 'ready' ? 'ready' : st === 'hold' ? 'hold' : 'occupied'
  return { table, order, state, late: minutes >= 30 && state !== 'bill', minutes }
}

/** Font size that keeps "A1", "B20B" and "Dine-in 3" readable inside a tile. */
function nameSize(name: string, small: boolean) {
  const n = name.length
  if (n <= 3) return small ? 34 : 40
  if (n <= 5) return small ? 30 : 34
  if (n <= 8) return small ? 24 : 27
  return small ? 20 : 22
}

export default function FloorGrid({ orders, mode = 'floor', currentTable, onFree, onOccupied, onLongPress, autoFocusSearch }: {
  orders: ActiveOrderRow[]
  mode?: FloorMode
  currentTable?: string | null
  onFree: (t: FloorTable) => void
  onOccupied?: (info: TileInfo) => void
  onLongPress?: (info: TileInfo) => void
  autoFocusSearch?: boolean
}) {
  useTick(30000)
  const t = useT()
  const cur = useStatus((s) => s.currency)
  const { tables, rooms } = useFloor()
  const { wide } = useTier()
  const [room, setRoom] = useState<string>(ALL)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')

  const infos = useMemo(() => {
    const byTable = new Map<string, ActiveOrderRow>()
    const byId = new Map<string, ActiveOrderRow>()
    for (const o of orders) { byId.set(o.id, o); if (o.table_name && o.order_type === 'Dine In' && !byTable.has(o.table_name)) byTable.set(o.table_name, o) }
    return tables.map((tb) => tileInfo(tb, byTable, byId))
  }, [tables, orders])

  const roomNames = useMemo(() => {
    const listed = rooms.map((r) => r.name)
    const extra = Array.from(new Set(tables.map((x) => x.room).filter((r): r is string => !!r && !listed.includes(r))))
    return [...rooms.map((r) => ({ key: r.name, label: r.room_name || r.name })), ...extra.map((r) => ({ key: r, label: r }))]
  }, [rooms, tables])

  const inRoom = infos.filter((i) => room === ALL || i.table.room === room)
  const isOcc = (i: TileInfo) => i.state === 'occupied' || i.state === 'hold' || i.state === 'bill' || i.state === 'ready'
  const counts = {
    free: inRoom.filter((i) => i.state === 'free').length,
    occupied: inRoom.filter(isOcc).length,
    bill: inRoom.filter((i) => i.state === 'bill').length,
    ready: inRoom.filter((i) => i.state === 'ready').length
  }
  const q = query.trim().toLowerCase()
  const shown = (q ? infos : inRoom)
    .filter((i) => !q || i.table.table_name.toLowerCase().includes(q) || i.table.name.toLowerCase().includes(q))
    .filter((i) => filter === 'all' || (filter === 'free' ? i.state === 'free' : filter === 'occupied' ? isOcc(i) : i.state === filter))

  // Long-press
  const timer = useRef<number | null>(null)
  const longPressed = useRef(false)
  const down = (i: TileInfo) => {
    longPressed.current = false
    if (!onLongPress || !i.order) return
    timer.current = window.setTimeout(() => { longPressed.current = true; onLongPress(i) }, 550)
  }
  const up = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null } }

  function tap(i: TileInfo) {
    if (longPressed.current) { longPressed.current = false; return }
    if (i.state === 'free') onFree(i.table)
    else if (isOcc(i) && onOccupied) onOccupied(i)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Rooms */}
      <div role="tablist" aria-label="Rooms" className="scroll-none flex flex-shrink-0 gap-1.5 overflow-x-auto px-3 pt-2.5">
        {[{ key: ALL, label: t('All') }, ...roomNames].map((r) => {
          const list = r.key === ALL ? infos : infos.filter((i) => i.table.room === r.key)
          const free = list.filter((i) => i.state === 'free').length
          const occ = list.filter(isOcc).length
          const on = room === r.key && !q
          return (
            <button key={r.key} type="button" role="tab" aria-selected={on} onClick={() => { setRoom(r.key); setQuery('') }}
              className={cn('press flex h-14 flex-shrink-0 flex-col items-start justify-center rounded-md px-3.5 text-start', on ? 'bg-n-deep text-white' : 'border border-n-edge bg-white text-n-ink')}>
              <span className="whitespace-nowrap text-[15px] font-semibold leading-tight">{r.label}</span>
              <span className={cn('flex items-center gap-2 text-xs', on ? 'text-n-frost' : 'text-n-muted')}>
                <span className="flex items-center gap-1"><Dot color={on ? '#FFFFFF' : C.green} size={7} />{free} {t('free')}</span>
                <span className="flex items-center gap-1"><Dot color={on ? C.amber : C.deep} size={7} />{occ}</span>
              </span>
            </button>
          )
        })}
      </div>

      {/* Summary chips + search */}
      <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5 px-3 pb-1 pt-2">
        {([['all', t('All'), null], ['free', t('Free'), '#FFFFFF'], ['occupied', t('Occupied'), C.deep], ['bill', t('Bill printed'), '#7C5CBF'], ['ready', t('Ready'), C.green]] as [Filter, string, string | null][]).map(([k, l, color]) => (
          (k === 'all' || k === 'free' || k === 'occupied' || counts[k as 'bill' | 'ready'] > 0) && (
            <Chip key={k} active={filter === k} onClick={() => setFilter(filter === k ? 'all' : k)}>
              {color && <span className="h-3 w-3 rounded-sm border border-n-edge" style={{ background: color }} />}
              {l}{k !== 'all' && <span className="num opacity-70">{counts[k as 'free' | 'occupied' | 'bill' | 'ready']}</span>}
            </Chip>
          )
        ))}
        <span className="flex-1" />
        <label className={cn('flex h-11 items-center gap-2 rounded-full bg-white px-3', q ? 'border-2 border-n-teal' : 'border border-[#E0D9CB]')}>
          <SearchIcon size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} data-keyboard="full" autoFocus={autoFocusSearch}
            onKeyDown={(e) => { if (e.key === 'Enter' && shown.length === 1) tap(shown[0]) }}
            placeholder={t('Find a table')} aria-label={t('Find a table')} className="w-36 bg-transparent text-[15px] focus:outline-none" />
          {query && <button type="button" aria-label="Clear" onClick={() => setQuery('')} className="text-lg leading-none text-n-muted">×</button>}
        </label>
      </div>

      {/* Tiles */}
      <div className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto px-3 pb-3 pt-1.5"
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${wide ? 124 : 112}px, 1fr))`, gridAutoRows: wide ? 100 : 96 }}>
        {shown.length === 0 && <div className="col-span-full py-16 text-center text-n-muted">{q ? t('No table called “{q}”', { q: query }) : t('No tables here')}</div>}
        {shown.map((i) => {
          const isCurrent = !!currentTable && i.table.name === currentTable
          const occ = isOcc(i)
          const pickBlocked = mode === 'pick' && !isCurrent && (occ || i.state === 'reserved' || i.state === 'blocked')
          const floorBlocked = mode === 'floor' && (i.state === 'blocked' || (i.state === 'reserved' && false))
          const disabled = pickBlocked || floorBlocked
          const bg = isCurrent ? 'bg-white text-n-deep' :
            i.state === 'free' ? 'bg-white text-n-ink' :
            i.state === 'bill' ? 'bg-[#7C5CBF] text-white' :
            i.state === 'ready' ? 'bg-n-green text-white' :
            i.state === 'hold' ? 'bg-[#5E6B73] text-white' :
            i.state === 'occupied' ? 'bg-n-deep text-white' :
            i.state === 'reserved' ? 'bg-[#FBEFD9] text-[#8A5A00]' : 'bg-n-sand text-n-stone'
          const ring = isCurrent ? 'outline outline-[3px] -outline-offset-[3px] outline-n-amber' : i.late ? 'outline outline-[3px] -outline-offset-[3px] outline-n-red' : i.state === 'free' ? 'border border-n-edge' : ''
          const sub = isCurrent ? t('This order') :
            i.state === 'free' ? `${i.table.capacity} ${t('seats')}` :
            i.state === 'reserved' ? t('Reserved') : i.state === 'blocked' ? t('Blocked') :
            mode === 'pick' ? t('Merge not supported') :
            i.state === 'bill' ? t('Bill printed') : i.state === 'ready' ? t('Ready') : i.state === 'hold' ? t('On hold') : i.order ? null : t('Occupied')
          return (
            <button key={i.table.name} type="button" disabled={disabled}
              aria-label={`${i.table.table_name}${i.order ? `, ${t('Occupied')}` : i.state === 'free' ? `, ${t('Free')}` : ''}`}
              onClick={() => tap(i)} onPointerDown={() => down(i)} onPointerUp={up} onPointerLeave={up}
              onContextMenu={(e) => { if (onLongPress && i.order) { e.preventDefault(); onLongPress(i) } }}
              className={cn('press relative flex min-w-0 flex-col justify-between overflow-hidden rounded-md px-2.5 pb-2 pt-1.5 text-start shadow-tile', bg, ring, disabled && 'cursor-not-allowed opacity-55')}>
              <span className="flex items-start justify-between gap-1">
                <span className="cond min-w-0 break-words font-bold leading-[.95]" style={{ fontSize: nameSize(i.table.table_name, !wide) }}>{i.table.table_name}</span>
                {i.order && (
                  <span className={cn('cond num flex-shrink-0 rounded px-1 text-[15px] font-bold', i.late ? 'bg-n-red text-white' : 'opacity-90')}>{ageLabel(i.minutes)}</span>
                )}
              </span>
              <span className="flex min-w-0 flex-col gap-[3px]">
                {i.order && (
                  <span className="cond num block truncate whitespace-nowrap text-[21px] font-bold leading-none"><span className="text-[13px] font-semibold opacity-75">{cur} </span>{money(i.order.grand_total)}</span>
                )}
                <span className="flex min-h-[18px] items-center gap-1.5">
                  <span className={cn('min-w-0 flex-1 truncate text-xs', i.state === 'free' ? 'text-n-muted' : 'opacity-85')}>{sub}</span>
                  {mode === 'floor' && i.order && (i.order.guests || 0) > 0 && (
                    <span className="flex flex-shrink-0 items-center gap-0.5 text-xs font-semibold opacity-90" title={t('guests')}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0z" /></svg>{i.order.guests}
                    </span>
                  )}
                  {mode === 'floor' && i.order?.waiter_name && (
                    <span className="flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ring-[1.5px] ring-white/70" style={{ background: staffColor(i.order.waiter_name) }} title={i.order.waiter_name}>{initial(i.order.waiter_name)}</span>
                  )}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
