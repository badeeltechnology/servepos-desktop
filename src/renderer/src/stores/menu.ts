import { create } from 'zustand'
import { PALETTE } from '../ui'

// Menu data shared by the item grid, the ticket (category colours on qty chips),
// waiter orders and the coordinator. Loaded once per POS session, reloaded on demand.

export interface MenuItem {
  attributes?: string | null
  item_code: string
  item_name: string
  item_name_ar: string | null
  description: string | null
  description_ar: string | null
  item_group: string | null
  rate: number
  image: string | null
  has_variants: number
  variant_of: string | null
}
export interface MenuGroup {
  name: string
  name_ar: string | null
}

interface MenuState {
  items: MenuItem[]
  groups: MenuGroup[]
  loaded: boolean
  byCode: Record<string, MenuItem>
  byName: Record<string, MenuItem>
  groupColors: Record<string, string>
  load: () => Promise<void>
}

export const useMenu = create<MenuState>((set) => ({
  items: [],
  groups: [],
  loaded: false,
  byCode: {},
  byName: {},
  groupColors: {},
  load: async () => {
    const [items, groups] = await Promise.all([window.api.items.get(), window.api.itemGroups.get()])
    const byCode: Record<string, MenuItem> = {}
    const byName: Record<string, MenuItem> = {}
    for (const i of items || []) { byCode[i.item_code] = i; if (!byName[i.item_name]) byName[i.item_name] = i }
    // Variants inherit their template's group when missing
    for (const i of items || []) if (!i.item_group && i.variant_of && byCode[i.variant_of]) i.item_group = byCode[i.variant_of].item_group
    const groupColors: Record<string, string> = {}
    ;(groups || []).forEach((g: MenuGroup, idx: number) => { groupColors[g.name] = PALETTE[(idx + 1) % PALETTE.length] })
    set({ items: items || [], groups: groups || [], byCode, byName, groupColors, loaded: true })
  }
}))

const FALLBACK = '#7A7F85'
/** Category colour for an item code (falls back to a name lookup, then grey). */
export function itemColor(code?: string | null, name?: string | null): string {
  const s = useMenu.getState()
  const it = (code && s.byCode[code]) || (name && s.byName[name]) || null
  if (!it || !it.item_group) return FALLBACK
  return s.groupColors[it.item_group] || FALLBACK
}
export function groupColor(group?: string | null): string {
  if (!group) return FALLBACK
  return useMenu.getState().groupColors[group] || FALLBACK
}
