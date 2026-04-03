import { useState, useEffect, useMemo } from 'react'
import { Search, X, Info } from 'lucide-react'
import { useCartStore, CartModifier } from '../stores/cart'
import ModifierModal from './ModifierModal'

interface Item {
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

interface ItemGroup {
  name: string
  name_ar: string | null
}

// Vibrant category colors
const categoryColors = [
  'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-fuchsia-500', 'bg-lime-500',
  'bg-orange-500', 'bg-teal-500', 'bg-indigo-500', 'bg-pink-500'
]

const categoryBgColors = [
  'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
  'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
  'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100',
  'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
  'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100',
  'bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-100',
  'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 hover:bg-fuchsia-100',
  'bg-lime-50 text-lime-700 border-lime-200 hover:bg-lime-100',
  'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100',
  'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100',
]

export default function ItemGrid() {
  const [items, setItems] = useState<Item[]>([])
  const [groups, setGroups] = useState<ItemGroup[]>([])
  const [activeGroup, setActiveGroup] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [variantItems, setVariantItems] = useState<Item[]>([])
  const [showVariants, setShowVariants] = useState(false)
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  const [showModifiers, setShowModifiers] = useState(false)
  const [pendingItem, setPendingItem] = useState<Item | null>(null)
  const [detailItem, setDetailItem] = useState<Item | null>(null)

  const [showDescription, setShowDescription] = useState(false)
  const addItem = useCartStore((s) => s.addItem)

  useEffect(() => { loadData(); loadConfig() }, [])

  async function loadConfig() {
    const config = await window.api.receiptConfig.getAll()
    setShowDescription(config.show_description_on_pos === '1')
  }

  async function loadData() {
    const [itemsData, groupsData] = await Promise.all([
      window.api.items.get(),
      window.api.itemGroups.get()
    ])
    setItems(itemsData)
    setGroups(groupsData)
  }

  const filteredItems = useMemo(() => {
    let filtered = items.filter((i) => !i.variant_of)
    if (activeGroup) filtered = filtered.filter((i) => i.item_group === activeGroup)
    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter((i) =>
        i.item_name.toLowerCase().includes(q) ||
        i.item_code.toLowerCase().includes(q) ||
        (i.item_name_ar && i.item_name_ar.includes(q))
      )
    }
    return filtered
  }, [items, activeGroup, search])

  async function handleItemClick(item: Item) {
    if (item.has_variants) {
      const variants = await window.api.items.getVariants(item.item_code)
      setVariantItems(variants)
      setSelectedItem(item)
      setShowVariants(true)
      return
    }
    const modGroups = await window.api.modifiers.getItemGroups(item.item_code)
    if (modGroups.length > 0) {
      setPendingItem(item)
      setShowModifiers(true)
      return
    }
    addItem({ itemCode: item.item_code, itemName: item.item_name, qty: 1, rate: item.rate })
  }

  async function handleVariantSelect(variant: Item) {
    setShowVariants(false)
    const modGroups = await window.api.modifiers.getItemGroups(variant.item_code)
    if (modGroups.length > 0) {
      setPendingItem(variant)
      setShowModifiers(true)
      return
    }
    addItem({ itemCode: variant.item_code, itemName: variant.item_name, qty: 1, rate: variant.rate })
  }

  function handleModifierConfirm(modifiers: CartModifier[], instructions: string) {
    if (pendingItem) {
      addItem({
        itemCode: pendingItem.item_code, itemName: pendingItem.item_name,
        qty: 1, rate: pendingItem.rate, modifiers, specialInstructions: instructions
      })
    }
    setPendingItem(null)
    setShowModifiers(false)
  }

  return (
    <div className="flex h-full flex-col bg-gray-100">
      {/* Search bar */}
      <div className="bg-white px-4 py-3 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground/50" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search menu items..."
            className="w-full rounded-xl border-0 bg-gray-100 py-3 pl-11 pr-10 text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Category tabs — large, scrollable, colorful */}
      <div className="bg-white px-3 pb-3 shadow-sm">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <button
            onClick={() => setActiveGroup(null)}
            className={`flex-shrink-0 rounded-xl border-2 px-5 py-3 text-sm font-semibold transition-all ${
              !activeGroup
                ? 'border-primary bg-primary text-white shadow-md shadow-primary/25'
                : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'
            }`}
          >
            All Items
          </button>
          {groups.map((g, i) => {
            const isActive = activeGroup === g.name
            const colorIdx = i % categoryBgColors.length
            return (
              <button
                key={g.name}
                onClick={() => setActiveGroup(g.name)}
                className={`flex-shrink-0 rounded-xl border-2 px-5 py-3 text-sm font-semibold transition-all ${
                  isActive
                    ? `${categoryColors[colorIdx]} text-white border-transparent shadow-md`
                    : `${categoryBgColors[colorIdx]} border-transparent`
                }`}
              >
                {g.name}
              </button>
            )
          })}
        </div>
      </div>

      {/* Item grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredItems.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
            <Search className="mb-3 h-12 w-12 opacity-20" />
            <p className="text-lg font-medium">{search ? 'No items match your search' : 'No items available'}</p>
            <p className="text-sm opacity-60">Try a different category or search term</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
            {filteredItems.map((item) => (
              <button
                key={item.item_code}
                onClick={() => handleItemClick(item)}
                className="group flex flex-col overflow-hidden rounded-2xl border-2 border-white bg-white shadow-sm transition-all hover:border-primary/20 hover:shadow-lg active:scale-[0.97]"
              >
                {/* Image or placeholder */}
                {item.image ? (
                  <div className="aspect-[4/3] w-full overflow-hidden bg-gray-100">
                    <img src={item.image} alt={item.item_name} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                  </div>
                ) : (
                  <div className="flex aspect-[4/3] w-full items-center justify-center bg-gradient-to-br from-primary/5 to-primary/15">
                    <span className="text-4xl font-black text-primary/15">{item.item_name.charAt(0)}</span>
                  </div>
                )}
                {/* Info */}
                <div className="flex flex-1 flex-col p-3">
                  <h3 className="text-sm font-semibold leading-snug text-gray-800 group-hover:text-primary">
                    {item.item_name}
                  </h3>
                  {item.item_name_ar && (
                    <p className="mt-0.5 text-xs text-gray-400" dir="rtl">{item.item_name_ar}</p>
                  )}
                  {showDescription && item.description && (
                    <p className="mt-1 line-clamp-2 text-[11px] leading-tight text-gray-400">{item.description}</p>
                  )}
                  <div className="mt-auto flex items-center justify-between pt-2">
                    <span className="text-base font-bold text-primary">{item.rate.toFixed(2)}</span>
                    <div className="flex items-center gap-1">
                      {item.has_variants && (
                        <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">SIZES</span>
                      )}
                      {item.description && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setDetailItem(item) }}
                          className="rounded-full p-1 text-gray-300 hover:bg-gray-100 hover:text-gray-500"
                          title="View details"
                        >
                          <Info className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Variant picker */}
      {showVariants && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-96 rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="mb-1 text-xl font-bold">{selectedItem.item_name}</h3>
            <p className="mb-5 text-sm text-muted-foreground">Select a size</p>
            <div className="space-y-2">
              {variantItems.map((v) => {
                const attrs = v.attributes ? JSON.parse(v.attributes) : {}
                const label = Object.values(attrs).join(' / ') || v.item_name
                return (
                  <button key={v.item_code} onClick={() => handleVariantSelect(v)}
                    className="flex w-full items-center justify-between rounded-xl border-2 border-gray-100 p-4 text-sm transition-all hover:border-primary hover:bg-primary/5 active:scale-[0.98]">
                    <span className="font-semibold">{label}</span>
                    <span className="text-lg font-bold text-primary">{v.rate.toFixed(2)}</span>
                  </button>
                )
              })}
            </div>
            <button onClick={() => setShowVariants(false)}
              className="mt-4 w-full rounded-xl border-2 border-gray-200 py-3 text-sm font-semibold text-gray-500 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Item detail popup */}
      {detailItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setDetailItem(null)}>
          <div className="w-[420px] rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {detailItem.image ? (
              <div className="h-48 w-full overflow-hidden rounded-t-2xl bg-gray-100">
                <img src={detailItem.image} alt={detailItem.item_name} className="h-full w-full object-cover" />
              </div>
            ) : (
              <div className="flex h-32 w-full items-center justify-center rounded-t-2xl bg-gradient-to-br from-primary/10 to-primary/20">
                <span className="text-5xl font-black text-primary/20">{detailItem.item_name.charAt(0)}</span>
              </div>
            )}
            <div className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xl font-bold text-gray-800">{detailItem.item_name}</h3>
                  {detailItem.item_name_ar && (
                    <p className="mt-1 text-base text-gray-500" dir="rtl">{detailItem.item_name_ar}</p>
                  )}
                </div>
                <span className="text-xl font-bold text-primary">{detailItem.rate.toFixed(2)}</span>
              </div>
              {detailItem.description && (
                <div className="mt-4">
                  <p className="text-sm leading-relaxed text-gray-600">{detailItem.description}</p>
                </div>
              )}
              {detailItem.description_ar && (
                <div className="mt-2">
                  <p className="text-sm leading-relaxed text-gray-500" dir="rtl">{detailItem.description_ar}</p>
                </div>
              )}
              <div className="mt-5 flex gap-3">
                <button onClick={() => setDetailItem(null)}
                  className="flex-1 rounded-xl border-2 border-gray-200 py-3 text-sm font-semibold text-gray-500 hover:bg-gray-50">
                  Close
                </button>
                <button onClick={() => { handleItemClick(detailItem); setDetailItem(null) }}
                  className="flex-1 rounded-xl bg-primary py-3 text-sm font-semibold text-white hover:bg-primary/90">
                  Add to Order
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modifier modal */}
      {showModifiers && pendingItem && (
        <ModifierModal itemCode={pendingItem.item_code} itemName={pendingItem.item_name}
          onConfirm={handleModifierConfirm} onCancel={() => { setShowModifiers(false); setPendingItem(null) }} />
      )}
    </div>
  )
}
