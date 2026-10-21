import { useState, useEffect } from 'react'
import { Btn, Dialog, Chip, Dot } from '../ui'
import { cn } from '../lib/utils'

interface Table {
  name: string
  table_name: string
  room: string | null
  capacity: number
  status: string
  current_order_id: string | null
}

interface Room {
  name: string
  room_name: string
}

interface Props {
  onSelect: (tableName: string, room: string | null) => void
  onCancel: () => void
  currentTable?: string | null
}

const STATUS: Record<string, { dot: string; tile: string; label: string }> = {
  Available: { dot: '#2E8B57', tile: 'bg-white text-n-ink border border-n-edge', label: 'Free' },
  Occupied: { dot: '#C83E2E', tile: 'bg-[#F6E3DF] text-n-red border border-[#E9C3BB]', label: 'Occupied' },
  Reserved: { dot: '#F4A52A', tile: 'bg-[#FBEFD9] text-[#8A5A00] border border-[#F1D7A5]', label: 'Reserved' },
  Blocked: { dot: '#9A958A', tile: 'bg-n-sand text-n-stone border border-transparent', label: 'Blocked' }
}

export default function TablePicker({ onSelect, onCancel, currentTable }: Props) {
  const [tables, setTables] = useState<Table[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [activeRoom, setActiveRoom] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const [t, r] = await Promise.all([window.api.tables.get(), window.api.rooms.get()])
    setTables(t)
    setRooms(r)
  }

  const filteredTables = activeRoom ? tables.filter((t) => t.room === activeRoom) : tables
  const free = filteredTables.filter((t) => t.status === 'Available').length

  return (
    <Dialog onClose={onCancel} className="h-[min(640px,calc(100vh-32px))] w-[min(900px,calc(100vw-32px))]" label="Choose a table">
      <div className="flex h-14 flex-shrink-0 items-center gap-3 bg-n-deep px-4 text-white">
        <span className="cond text-2xl font-bold">Choose a table</span>
        <span className="text-[13px] text-n-mist">{free} free of {filteredTables.length}</span>
        <span className="flex-1" />
        <span className="hidden items-center gap-3 text-xs text-n-frost min-[900px]:flex">
          {Object.entries(STATUS).map(([k, s]) => <span key={k} className="flex items-center gap-1.5"><Dot color={s.dot} size={8} />{s.label}</span>)}
        </span>
      </div>

      <div className="flex flex-shrink-0 gap-1.5 overflow-x-auto px-4 pb-1 pt-3">
        <Chip active={!activeRoom} onClick={() => setActiveRoom(null)}>All rooms</Chip>
        {rooms.map((r) => (
          <Chip key={r.name} active={activeRoom === r.name} onClick={() => setActiveRoom(r.name)}>
            {r.room_name} <span className="num opacity-60">{tables.filter((t) => t.room === r.name).length}</span>
          </Chip>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))' }}>
          {filteredTables.map((table) => {
            const isAvailable = table.status === 'Available'
            const isCurrent = table.name === currentTable
            const s = STATUS[table.status] || STATUS.Available
            return (
              <button key={table.name} type="button"
                onClick={() => isAvailable && onSelect(table.name, table.room)}
                disabled={!isAvailable && !isCurrent}
                className={cn('press relative flex h-[72px] flex-col items-center justify-center gap-0.5 rounded-md', isCurrent ? 'border-[3px] border-n-amber bg-white text-n-deep' : s.tile, isAvailable ? '' : 'cursor-not-allowed')}>
                <span className="cond text-[26px] font-bold leading-none">{table.table_name}</span>
                <span className="text-[11px] opacity-70">{isCurrent ? 'this order' : isAvailable ? `${table.capacity} seats` : s.label}</span>
              </button>
            )
          })}
        </div>
        {filteredTables.length === 0 && <p className="py-12 text-center text-n-muted">No tables in this room</p>}
      </div>

      <div className="flex flex-shrink-0 gap-2 bg-white px-4 py-3">
        <Btn size="lg" variant="outline" onClick={onCancel}>Cancel</Btn>
      </div>
    </Dialog>
  )
}
