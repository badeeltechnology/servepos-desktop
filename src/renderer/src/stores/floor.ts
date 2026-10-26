import { create } from 'zustand'

// Tables and rooms for the floor view and the table picker. Loaded on demand and refreshed
// by the POS (tables change status when orders are created, held, paid or voided).

export interface FloorTable {
  name: string
  table_name: string
  room: string | null
  capacity: number
  status: string // Available | Occupied | Reserved | Blocked
  current_order_id: string | null
}
export interface FloorRoom {
  name: string
  room_name: string
}

interface FloorState {
  tables: FloorTable[]
  rooms: FloorRoom[]
  loaded: boolean
  load: () => Promise<void>
}

export const useFloor = create<FloorState>((set, get) => ({
  tables: [],
  rooms: [],
  loaded: false,
  load: async () => {
    try {
      const [t, r] = await Promise.all([window.api.tables.get(), window.api.rooms.get()])
      const tables = (t || []) as FloorTable[]
      const rooms = (r || []) as FloorRoom[]
      const prev = get()
      if (!prev.loaded || JSON.stringify(prev.tables) !== JSON.stringify(tables) || JSON.stringify(prev.rooms) !== JSON.stringify(rooms)) {
        set({ tables, rooms, loaded: true })
      }
    } catch {
      set({ loaded: true })
    }
  }
}))

/** Does this till have a floor plan? (drives the Tables screen and the table-first dine-in flow) */
export function hasTables() {
  return useFloor.getState().tables.length > 0
}
