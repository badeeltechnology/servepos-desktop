import { useState, useEffect, useMemo, memo } from 'react'
import { Search, X, Info, LayoutGrid, List, ArrowLeft, FolderOpen, Globe } from 'lucide-react'
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

// Category colors for the overview cards
const catColors = [
  { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', accent: 'bg-blue-500' },
  { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', accent: 'bg-emerald-500' },
  { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', accent: 'bg-violet-500' },
  { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', accent: 'bg-amber-500' },
  { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', accent: 'bg-rose-500' },
  { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-700', accent: 'bg-cyan-500' },
  { bg: 'bg-fuchsia-50', border: 'border-fuchsia-200', text: 'text-fuchsia-700', accent: 'bg-fuchsia-500' },
  { bg: 'bg-lime-50', border: 'border-lime-200', text: 'text-lime-700', accent: 'bg-lime-500' },
  { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', accent: 'bg-orange-500' },
  { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700', accent: 'bg-teal-500' },
  { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', accent: 'bg-indigo-500' },
  { bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-700', accent: 'bg-pink-500' },
]

type ViewMode = 'categories' | 'grid' | 'list'

function ItemGrid() {
  const [items, setItems] = useState<Item[]>([])
  const [groups, setGroups] = useState<ItemGroup[]>([])
  const [activeGroup, setActiveGroup] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [variantItems, setVariantItems] = useState<Item[]>([])
  const [showVariants, setShowVariants] = useState(false)
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  const [showModifiers, setShowModifiers] = useState(false)
  const [pendingItem, setPendingItem] = useState<Item | null>(null)
  const [detailItem, setDetailItem] = useState<Item | null>(null)
  const [showDescription, setShowDescription] = useState(false)
  const [lang, setLang] = useState<'en' | 'ar' | 'both'>('en')

  const addItem = useCartStore((s) => s.addItem)

  // Helper to get display name based on language setting
  function itemName(item: Item): string {
    if (lang === 'ar' && item.item_name_ar) return item.item_name_ar
    return item.item_name
  }
  function showArabicName(item: Item): boolean {
    return lang === 'both' && !!item.item_name_ar
  }

  useEffect(() => { loadData(); loadConfig() }, [])

  async function loadData() {
    const [itemsData, groupsData] = await Promise.all([
      window.api.items.get(),
      window.api.itemGroups.get()
    ])
    setItems(itemsData)
    setGroups(groupsData)
  }

  async function loadConfig() {
    const config = await window.api.receiptConfig.getAll()
    setShowDescription(config.show_description_on_pos === '1')
  }

  const filteredItems = useMemo(() => {
    let filtered = items.filter((i) => !i.variant_of)
    if (activeGroup) filtered = filtered.filter((i) => i.item_group === activeGroup)
    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter((i) =>
        i.item_name.toLowerCase().includes(q) ||
        i.item_code.toLowerCase().includes(q) ||
        (i.item_name_ar && i.item_name_ar.includes(q)) ||
        (i.description && i.description.toLowerCase().includes(q))
      )
    }
    return filtered
  }, [items, activeGroup, search])

  // Count items per group and filter out empty/system groups
  const groupCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    const mainItems = items.filter((i) => !i.variant_of)
    for (const g of groups) {
      counts[g.name] = mainItems.filter((i) => i.item_group === g.name).length
    }
    return counts
  }, [items, groups])

  // Only show groups that have actual items (filters out system groups like Raw Material, Services, etc.)
  const visibleGroups = useMemo(() => {
    return groups.filter((g) => (groupCounts[g.name] || 0) > 0)
  }, [groups, groupCounts])

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

  // Show category overview
  const showCategoryOverview = viewMode === 'categories' && !activeGroup && !search

  return (
    <div className="flex h-full flex-col bg-gray-100">
      {/* Top bar: Search + View toggle */}
      <div className="flex items-center gap-3 bg-white px-4 py-3 shadow-sm">
        {/* Back button when drilled into a category (in category view mode) */}
        {activeGroup && viewMode === 'categories' && (
          <button
            onClick={() => setActiveGroup(null)}
            className="flex items-center gap-1.5 rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        )}

        {/* Active group label */}
        {activeGroup && (
          <h2 className="text-lg font-bold text-gray-800">{activeGroup}</h2>
        )}

        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={activeGroup ? `Search in ${activeGroup}...` : 'Search all items...'}
            className="w-full rounded-xl border-0 bg-gray-100 py-2.5 pl-10 pr-10 text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 hover:bg-gray-200">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Language toggle */}
        <div className="flex rounded-lg border border-gray-200 p-0.5">
          <button onClick={() => setLang('en')}
            className={`rounded-md px-2 py-1.5 text-xs font-semibold ${lang === 'en' ? 'bg-primary text-white' : 'text-gray-400 hover:text-gray-600'}`}>
            EN
          </button>
          <button onClick={() => setLang('ar')}
            className={`rounded-md px-2 py-1.5 text-xs font-semibold ${lang === 'ar' ? 'bg-primary text-white' : 'text-gray-400 hover:text-gray-600'}`}>
            AR
          </button>
          <button onClick={() => setLang('both')}
            className={`rounded-md px-2 py-1.5 text-xs font-semibold ${lang === 'both' ? 'bg-primary text-white' : 'text-gray-400 hover:text-gray-600'}`}>
            Both
          </button>
        </div>

        {/* View mode toggle — always visible */}
        <div className="flex rounded-lg border border-gray-200 p-0.5">
          <button
            onClick={() => { setViewMode('categories'); setActiveGroup(null) }}
            className={`rounded-md p-2 ${viewMode === 'categories' ? 'bg-primary text-white' : 'text-gray-400 hover:text-gray-600'}`}
            title="Category view"
          >
            <FolderOpen className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`rounded-md p-2 ${viewMode === 'grid' ? 'bg-primary text-white' : 'text-gray-400 hover:text-gray-600'}`}
            title="Grid view"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`rounded-md p-2 ${viewMode === 'list' ? 'bg-primary text-white' : 'text-gray-400 hover:text-gray-600'}`}
            title="List view"
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Category Overview */}
        {showCategoryOverview && (
          <div>
            <h2 className="mb-4 text-lg font-bold text-gray-700">Menu Categories</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {visibleGroups.map((g, i) => {
                const color = catColors[i % catColors.length]
                const count = groupCounts[g.name] || 0
                return (
                  <button
                    key={g.name}
                    onClick={() => setActiveGroup(g.name)}
                    className={`group flex flex-col items-start rounded-2xl border-2 ${color.border} ${color.bg} p-5 text-left transition-all hover:shadow-lg active:scale-[0.97]`}
                  >
                    <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${color.accent} text-lg font-black text-white`}>
                      {g.name.charAt(0)}
                    </div>
                    <h3 className={`text-base font-bold ${color.text}`}>{g.name}</h3>
                    {g.name_ar && (
                      <p className="mt-0.5 text-xs text-gray-400" dir="rtl">{g.name_ar}</p>
                    )}
                    <p className="mt-1 text-xs text-gray-400">{count} item{count !== 1 ? 's' : ''}</p>
                  </button>
                )
              })}
            </div>

            {visibleGroups.length === 0 && (
              <div className="flex h-64 flex-col items-center justify-center text-gray-400">
                <LayoutGrid className="mb-3 h-12 w-12 opacity-20" />
                <p className="text-lg font-medium">No categories</p>
                <p className="text-sm">Sync items from ERPNext to see categories here</p>
              </div>
            )}
          </div>
        )}

        {/* Search results or category items */}
        {!showCategoryOverview && (
          <>
            {/* Category filter bar for grid/list views — large touch-friendly pills */}
            {(viewMode === 'grid' || viewMode === 'list') && !search && (
              <div className="mb-4 flex flex-wrap gap-2">
                <button onClick={() => setActiveGroup(null)}
                  className={`rounded-xl px-5 py-2.5 text-sm font-bold transition-all active:scale-95 ${
                    !activeGroup ? 'bg-primary text-white shadow-md shadow-primary/25' : 'bg-white text-gray-500 shadow-sm hover:bg-gray-50 hover:shadow-md'
                  }`}>
                  All Items
                </button>
                {visibleGroups.map((g, i) => {
                  const color = catColors[i % catColors.length]
                  return (
                    <button key={g.name} onClick={() => setActiveGroup(g.name)}
                      className={`rounded-xl px-5 py-2.5 text-sm font-bold transition-all active:scale-95 ${
                        activeGroup === g.name
                          ? `${color.accent} text-white shadow-md`
                          : `${color.bg} ${color.text} shadow-sm hover:shadow-md`
                      }`}>
                      {g.name}
                      <span className="ml-1.5 opacity-60">({groupCounts[g.name] || 0})</span>
                    </button>
                  )
                })}
              </div>
            )}

            {/* Quick category pills when in search mode */}
            {search && !activeGroup && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {visibleGroups.map((g, i) => {
                  const itemsInGroup = items.filter((item) => !item.variant_of && item.item_group === g.name)
                  const matchCount = itemsInGroup.filter((item) => {
                    const q = search.toLowerCase()
                    return item.item_name.toLowerCase().includes(q) || (item.description && item.description.toLowerCase().includes(q))
                  }).length
                  if (matchCount === 0) return null
                  return (
                    <button key={g.name} onClick={() => setActiveGroup(g.name)}
                      className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-600 shadow-sm hover:bg-gray-50">
                      {g.name} <span className="text-gray-400">({matchCount})</span>
                    </button>
                  )
                })}
              </div>
            )}

            {filteredItems.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center text-gray-400">
                <Search className="mb-3 h-12 w-12 opacity-20" />
                <p className="text-lg font-medium">{search ? 'No items match your search' : 'No items in this category'}</p>
                <p className="text-sm">Try a different search term or category</p>
              </div>
            ) : viewMode === 'grid' ? (
              /* Grid View — compact, more items visible */
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {filteredItems.map((item) => (
                  <button
                    key={item.item_code}
                    onClick={() => handleItemClick(item)}
                    className="group flex flex-col overflow-hidden rounded-xl border-2 border-white bg-white shadow-sm transition-all hover:border-primary/20 hover:shadow-md active:scale-[0.97]"
                  >
                    {item.image ? (
                      <div className="aspect-square w-full overflow-hidden bg-gray-100">
                        <img src={item.image} alt={item.item_name} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                      </div>
                    ) : (
                      <div className="flex h-16 w-full items-center justify-center bg-gradient-to-br from-primary/5 to-primary/10">
                        <span className="text-2xl font-black text-primary/15">{item.item_name.charAt(0)}</span>
                      </div>
                    )}
                    <div className="flex flex-1 flex-col p-2.5">
                      <h3 className={`text-xs font-semibold leading-snug text-gray-800 group-hover:text-primary line-clamp-2 ${lang === 'ar' ? 'text-right' : ''}`}
                        dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                        {itemName(item)}
                      </h3>
                      {showArabicName(item) && (
                        <p className="mt-0.5 text-[10px] text-gray-400 line-clamp-1" dir="rtl">{item.item_name_ar}</p>
                      )}
                      <div className="mt-auto flex items-center justify-between pt-1.5">
                        <span className="text-sm font-bold text-primary">{item.rate.toFixed(2)}</span>
                        {item.description && (
                          <button onClick={(e) => { e.stopPropagation(); setDetailItem(item) }}
                            className="rounded-full p-0.5 text-gray-300 hover:text-gray-500" title="View details">
                            <Info className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              /* List View — touch-friendly with large rows */
              <div className="space-y-2">
                {filteredItems.map((item) => (
                  <button
                    key={item.item_code}
                    onClick={() => handleItemClick(item)}
                    className="flex w-full items-center gap-4 rounded-2xl border-2 border-white bg-white px-4 py-4 text-left shadow-sm transition-all hover:border-primary/20 hover:shadow-md active:scale-[0.98]"
                  >
                    {/* Thumbnail — larger for touch */}
                    {item.image ? (
                      <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-gray-100">
                        <img src={item.image} alt={item.item_name} className="h-full w-full object-cover" />
                      </div>
                    ) : (
                      <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/5 to-primary/15">
                        <span className="text-2xl font-black text-primary/20">{item.item_name.charAt(0)}</span>
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className={`text-base font-bold text-gray-800 ${lang === 'ar' ? 'text-right' : ''}`}
                        dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                        {itemName(item)}
                      </h3>
                      {showArabicName(item) && (
                        <p className="mt-0.5 text-sm text-gray-400" dir="rtl">{item.item_name_ar}</p>
                      )}
                      {showDescription && item.description && (
                        <p className="mt-1 line-clamp-1 text-xs text-gray-400">{item.description}</p>
                      )}
                      {item.item_group && (
                        <span className="mt-1 inline-block rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-400">{item.item_group}</span>
                      )}
                    </div>

                    {/* Price + info */}
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-lg font-bold text-primary">{item.rate.toFixed(2)}</span>
                      <div className="flex items-center gap-1">
                        {item.has_variants && (
                          <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">SIZES</span>
                        )}
                        {item.description && (
                          <button onClick={(e) => { e.stopPropagation(); setDetailItem(item) }}
                            className="rounded-full p-1.5 text-gray-300 hover:bg-gray-100 hover:text-gray-500">
                            <Info className="h-4 w-4" />
                        </button>
                      )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

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

      {/* Variant picker */}
      {showVariants && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-96 rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="mb-1 text-xl font-bold">{selectedItem.item_name}</h3>
            <p className="mb-5 text-sm text-gray-500">Select a size</p>
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

      {/* Modifier modal */}
      {showModifiers && pendingItem && (
        <ModifierModal itemCode={pendingItem.item_code} itemName={pendingItem.item_name}
          onConfirm={handleModifierConfirm} onCancel={() => { setShowModifiers(false); setPendingItem(null) }} />
      )}
    </div>
  )
}

export default memo(ItemGrid)
