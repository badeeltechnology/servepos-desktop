import { useState, useEffect } from 'react'
import { Users, X } from 'lucide-react'

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

const statusColors: Record<string, string> = {
  Available: 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-300',
  Occupied: 'bg-red-50 border-red-200 text-red-600',
  Reserved: 'bg-amber-50 border-amber-200 text-amber-700',
  Blocked: 'bg-gray-100 border-gray-200 text-gray-400'
}

const statusDot: Record<string, string> = {
  Available: 'bg-emerald-500',
  Occupied: 'bg-red-500',
  Reserved: 'bg-amber-500',
  Blocked: 'bg-gray-400'
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

  const filteredTables = activeRoom
    ? tables.filter((t) => t.room === activeRoom)
    : tables

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[90vw] max-w-[900px] max-h-[85vh] flex flex-col rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div>
            <h2 className="text-lg font-bold">Select Table</h2>
            <p className="text-xs text-muted-foreground">{filteredTables.length} tables</p>
          </div>
          <button onClick={onCancel} className="rounded-lg p-2 text-muted-foreground hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Room tabs */}
        <div className="flex flex-wrap gap-1.5 border-b px-5 py-2">
          <button
            onClick={() => setActiveRoom(null)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              !activeRoom ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            All Rooms
          </button>
          {rooms.map((r) => (
            <button
              key={r.name}
              onClick={() => setActiveRoom(r.name)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeRoom === r.name ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {r.room_name}
            </button>
          ))}
        </div>

        {/* Status legend */}
        <div className="flex items-center gap-4 px-5 py-1.5 text-[10px]">
          {['Available', 'Occupied', 'Reserved', 'Blocked'].map((s) => (
            <span key={s} className="flex items-center gap-1">
              <span className={`h-1.5 w-1.5 rounded-full ${statusDot[s]}`} />
              {s}
            </span>
          ))}
        </div>

        {/* Table grid — compact cards */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          <div className="grid grid-cols-6 gap-2 sm:grid-cols-7 md:grid-cols-8 lg:grid-cols-10">
            {filteredTables.map((table) => {
              const isAvailable = table.status === 'Available'
              const isCurrent = table.name === currentTable
              return (
                <button
                  key={table.name}
                  onClick={() => isAvailable && onSelect(table.name, table.room)}
                  disabled={!isAvailable && !isCurrent}
                  className={`relative flex flex-col items-center justify-center rounded-lg border-2 px-1 py-2 transition-all ${
                    isCurrent
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : statusColors[table.status] || statusColors.Available
                  } ${isAvailable ? 'cursor-pointer active:scale-95' : 'cursor-not-allowed'}`}
                >
                  <span className="text-sm font-bold leading-tight">{table.table_name}</span>
                  <div className="flex items-center gap-0.5 text-[9px] opacity-60">
                    <Users className="h-2.5 w-2.5" />
                    <span>{table.capacity}</span>
                  </div>
                </button>
              )
            })}
          </div>
          {filteredTables.length === 0 && (
            <p className="py-12 text-center text-muted-foreground">No tables in this room</p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-5 py-2.5">
          <button onClick={onCancel} className="w-full rounded-lg border border-input py-2 text-sm font-medium hover:bg-muted">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
