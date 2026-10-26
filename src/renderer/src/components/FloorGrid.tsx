import { Fragment, useMemo, useRef, useState } from 'react'
import { useFloor, FloorTable } from '../stores/floor'
import { useAuthStore } from '../stores/auth'
import { useT } from '../stores/i18n'
import { ActiveOrderRow, stageOf } from './orderStatus'
import { Chip, SearchIcon, money, staffColor, initial, useTier } from '../ui'
import { minutesSince, ageLabel, useTick } from '../ui/hosts'
import { cn } from '../lib/utils'

// The floor: every table as a tile that says what is happening on it. Used as the till's Floor tab
// and inside the table picker. Type-to-find, stage filters (incl. Over 30m and Mine), room tabs with
// counts, and section headers ("SECTION A · 13 FREE OF 18") when all rooms are shown.

export type FloorMode = 'floor' | 'pick'
type Filter = 'all' | 'free' | 'seated' | 'ready' | 'bill' | 'late' | 'mine'

export type TileState = 'free' | 'occupied' | 'draft' | 'bill' | 'ready' | 'hold' | 'reserved' | 'blocked'
export interface TileInfo {
  table: FloorTable
  order: ActiveOrderRow | null
  state: TileState
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
  const state: TileState = st === 'invoiced' ? 'bill' : st === 'ready' ? 'ready' : st === 'hold' ? 'hold' : st === 'draft' ? 'draft' : 'occupied'
  return { table, order, state, late: minutes >= 30 && state !== 'bill', minutes }
}
export const isSeated = (i: TileInfo) => i.state !== 'free' && i.state !== 'reserved' && i.state !== 'blocked'

/** Font size that keeps "A1", "B20B" and "Dine-in 3" on one line inside a tile. */
function nameSize(name: string, small: boolean) {
  const n = name.length
  if (n <= 3) return small ? 32 : 36
  if (n <= 5) return small ? 28 : 32
  if (n <= 7) return small ? 24 : 26
  return small ? 19 : 21
}

const LOOK: Record<TileState, { tile: string; tag?: string; tagCls?: string }> = {
  free: { tile: 'bg-white border border-n-edge text-n-ink' },
  occupied: { tile: 'bg-[#E3EFF2] border-2 border-n-teal text-n-deep' },
  draft: { tile: 'bg-[#FFF6E5] border-2 border-dashed border-n-amber text-n-deep', tag: 'NOT SENT', tagCls: 'bg-n-amber text-n-ink' },
  ready: { tile: 'bg-n-wash border-2 border-n-green text-n-deep', tag: 'READY', tagCls: 'text-n-green' },
  bill: { tile: 'bg-[#EFE9F8] border-2 border-[#7C5CBF] text-n-deep', tag: 'BILL', tagCls: 'text-[#7C5CBF]' },
  hold: { tile: 'bg-[#F3ECE6] border-2 border-[#8B6F5C] text-n-deep', tag: 'HOLD', tagCls: 'text-[#8B6F5C]' },
  reserved: { tile: 'bg-[#FBEFD9] border border-[#F1D7A5] text-[#8A5A00]' },
  blocked: { tile: 'bg-n-sand border border-transparent text-n-stone' }
}

export default function FloorGrid({ orders, mode = 'floor', currentTable, selected, onFree, onOccupied, onOpen, onLongPress }: {
  orders: ActiveOrderRow[]
  mode?: FloorMode
  currentTable?: string | null
  /** Table whose details are showing (floor) */
  selected?: string | null
  onFree: (t: FloorTable) => void
  onOccupied?: (info: TileInfo) => void
  /** Double-tap an occupied table */
  onOpen?: (info: TileInfo) => void
  onLongPress?: (info: TileInfo) => void
}) {
  useTick(30000)
  const t = useT()
  const me = useAuthStore((s) => s.user)
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
    const list = [...rooms.map((r) => ({ key: r.name, label: r.room_name || r.name })), ...extra.map((r) => ({ key: r, label: r }))]
    if (tables.some((x) => !x.room)) list.push({ key: '', label: t('Other') })
    return list
  }, [rooms, tables, t])

  const mine = (i: TileInfo) => !!i.order && !!me && (i.order.cashier_id === me.id || i.order.waiter_name === me.name)
  const match: Record<Filter, (i: TileInfo) => boolean> = {
    all: () => true,
    free: (i) => i.state === 'free',
    seated: isSeated,
    ready: (i) => i.state === 'ready',
    bill: (i) => i.state === 'bill',
    late: (i) => i.late,
    mine
  }
  const q = query.trim().toLowerCase()
  const inRoom = infos.filter((i) => q || room === ALL || (i.table.room || '') === room)
  const shown = inRoom
    .filter((i) => !q || i.table.table_name.toLowerCase().includes(q) || i.table.name.toLowerCase().includes(q))
    .filter(match[filter])
  const count = (f: Filter) => infos.filter((i) => (q || room === ALL || (i.table.room || '') === room)).filter(match[f]).length

  // Section headers when every room is showing
  const groups = room === ALL && !q
    ? roomNames.map((r) => ({ key: r.key, label: r.label, all: infos.filter((i) => (i.table.room || '') === r.key), list: shown.filter((i) => (i.table.room || '') === r.key) })).filter((g) => g.list.length > 0)
    : [{ key: '_', label: '', all: [], list: shown }]

  // Long-press and double-tap
  const timer = useRef<number | null>(null)
  const longPressed = useRef(false)
  const lastTap = useRef<{ name: string; at: number } | null>(null)
  const down = (i: TileInfo) => {
    longPressed.current = false
    if (!onLongPress || !i.order) return
    timer.current = window.setTimeout(() => { longPressed.current = true; onLongPress(i) }, 550)
  }
  const up = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null } }

  function tap(i: TileInfo) {
    if (longPressed.current) { longPressed.current = false; return }
    const now = Date.now()
    const dbl = lastTap.current && lastTap.current.name === i.table.name && now - lastTap.current.at < 450
    lastTap.current = { name: i.table.name, at: now }
    if (i.state === 'free') onFree(i.table)
    else if (isSeated(i)) {
      if (dbl && onOpen && i.order) onOpen(i)
      else onOccupied?.(i)
    }
  }

  const filters: [Filter, string, string | null][] = [
    ['all', t('All'), null], ['free', t('Free'), '#FFFFFF'], ['seated', t('Seated'), '#0E6E86'], ['ready', t('Ready'), '#2E8B57'],
    ['bill', t('Bill out'), '#7C5CBF'], ['late', t('Over 30m'), '#C83E2E'], ['mine', t('Mine'), null]
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Find + stage filters */}
      <div className="scroll-none flex flex-shrink-0 items-center gap-1.5 overflow-x-auto px-3 pt-2.5">
        <label className={cn('flex h-12 flex-shrink-0 items-center gap-2 rounded-md bg-white px-3', q ? 'border-2 border-n-teal' : 'border-[1.5px] border-n-edge')}>
          <SearchIcon size={18} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} data-keyboard="full"
            onKeyDown={(e) => { if (e.key === 'Enter' && shown.length === 1) tap(shown[0]) }}
            placeholder={t('Type a table…')} aria-label={t('Find a table')} className={cn('bg-transparent text-[17px] font-semibold focus:outline-none', wide ? 'w-36' : 'w-28')} />
          {query && <button type="button" aria-label="Clear" onClick={() => setQuery('')} className="text-xl leading-none text-n-muted">×</button>}
        </label>
        {filters.map(([k, l, color]) => {
          const n = count(k)
          if (mode === 'pick' && (k === 'mine' || k === 'late')) return null
          if ((k === 'ready' || k === 'bill' || k === 'late' || k === 'mine') && !n && filter !== k) return null
          return (
            <Chip key={k} active={filter === k} onClick={() => setFilter(filter === k ? 'all' : k)}
              className={cn('flex-shrink-0', k === 'late' && filter !== k && 'border-n-red text-n-red')}>
              {color && <span className="h-3 w-3 rounded-sm border border-n-edge" style={{ background: color }} />}
              {l}<span className="num opacity-70">{n}</span>
            </Chip>
          )
        })}
      </div>

      {/* Rooms */}
      <div role="tablist" aria-label="Rooms" className="scroll-none flex flex-shrink-0 gap-1.5 overflow-x-auto px-3 pt-2">
        {[{ key: ALL, label: t('All rooms') }, ...roomNames].map((r) => {
          const list = r.key === ALL ? infos : infos.filter((i) => (i.table.room || '') === r.key)
          const free = list.filter((i) => i.state === 'free').length
          const on = room === r.key && !q
          return (
            <button key={r.key || '_other'} type="button" role="tab" aria-selected={on} onClick={() => { setRoom(r.key); setQuery('') }}
              className={cn('press flex h-11 flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 text-[14px] font-semibold', on ? 'bg-n-deep text-white' : 'border border-n-edge bg-white text-n-ink')}>
              {r.label}
              <span className={cn('num text-[13px] font-medium', on ? 'text-n-frost' : 'text-n-muted')}>{free} {t('free')}</span>
            </button>
          )
        })}
      </div>

      {/* Tiles */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-1">
        {shown.length === 0 && <div className="py-16 text-center text-n-muted">{q ? t('No table called “{q}”', { q: query }) : t('No tables here')}</div>}
        {groups.map((g) => (
          <Fragment key={g.key}>
            {g.label && (
              <div className="flex items-center gap-2 pb-1.5 pt-2.5">
                <span className="cap whitespace-nowrap text-n-muted">{g.label} · {t('{n} free of {total}', { n: g.all.filter((i) => i.state === 'free').length, total: g.all.length })}</span>
                <span className="h-px flex-1 bg-n-line" />
              </div>
            )}
            <div className={cn('grid gap-2', !g.label && 'pt-1.5')} style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${wide ? 118 : 108}px, 1fr))`, gridAutoRows: wide ? 88 : 84 }}>
              {g.list.map((i) => renderTile(i))}
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  )

  function renderTile(i: TileInfo) {
    const isCurrent = !!currentTable && i.table.name === currentTable
    const isSel = !!selected && i.table.name === selected
    const seated = isSeated(i)
    const disabled = (mode === 'pick' && !isCurrent && (seated || i.state === 'reserved' || i.state === 'blocked')) || i.state === 'blocked'
    const look = LOOK[i.state]
    const o = i.order
    const sub = isCurrent ? t('This order') :
      i.state === 'free' ? `${i.table.capacity} ${t('seats')}` :
      i.state === 'reserved' ? t('Reserved') : i.state === 'blocked' ? t('Blocked') :
      mode === 'pick' ? t('Merge not supported') : !o ? t('Occupied') : null
    const timeCls = i.late ? 'rounded bg-n-red px-1 text-white' : i.minutes >= 20 ? 'text-[#B56A00]' : 'text-n-muted'
    return (
      <button key={i.table.name} type="button" disabled={disabled}
        aria-label={`${i.table.table_name}${seated ? `, ${t('Occupied')}` : i.state === 'free' ? `, ${t('Free')}` : ''}`}
        aria-pressed={mode === 'floor' && seated ? isSel : undefined}
        onClick={() => tap(i)} onPointerDown={() => down(i)} onPointerUp={up} onPointerLeave={up}
        onContextMenu={(e) => { if (onLongPress && o) { e.preventDefault(); onLongPress(i) } }}
        className={cn('press relative flex min-w-0 flex-col justify-between overflow-hidden rounded-md px-2.5 pb-1.5 pt-1.5 text-start shadow-tile', look.tile,
          (isCurrent || isSel) && 'outline outline-[3px] outline-offset-1 outline-n-amber', disabled && 'cursor-not-allowed opacity-55')}>
        <span className="flex items-start gap-1">
          <span className="cond flex-shrink-0 whitespace-nowrap font-bold leading-[.95]" style={{ fontSize: nameSize(i.table.table_name, !wide) }}>{i.table.table_name}</span>
          {look.tag && (wide
            ? <span className={cn('mt-0.5 min-w-0 truncate rounded px-1 text-[10px] font-bold tracking-[.06em]', look.tagCls)}>{t(look.tag)}</span>
            : i.state === 'draft' && <span className="mt-0.5 flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full bg-n-amber text-xs font-bold text-n-ink" title={t(look.tag)}>!</span>)}
          <span className="flex-1" />
          {o?.waiter_name && mode === 'floor' && (
            <span className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: staffColor(o.waiter_name) }} title={o.waiter_name}>{initial(o.waiter_name)}</span>
          )}
        </span>
        {o ? (
          <span className="flex items-end justify-between gap-1">
            <span className={cn('cond num text-[17px] font-bold leading-tight', timeCls)}>{ageLabel(i.minutes)}</span>
            {sub ? <span className="truncate text-xs opacity-80">{sub}</span> : <span className="cond num whitespace-nowrap text-[19px] font-bold leading-tight">{money(o.grand_total)}</span>}
          </span>
        ) : (
          <span className={cn('truncate text-xs', i.state === 'free' ? 'text-n-muted' : 'opacity-85')}>{sub}</span>
        )}
      </button>
    )
  }
}
