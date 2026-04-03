import { useState, useEffect, useMemo } from 'react'
import { Search } from 'lucide-react'
import { useCartStore, CartModifier } from '../stores/cart'
import ModifierModal from './ModifierModal'

interface Item {
  item_code: string
  item_name: string
  item_name_ar: string | null
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

  const addItem = useCartStore((s) => s.addItem)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const [itemsData, groupsData] = await Promise.all([
      window.api.items.get(),
      window.api.itemGroups.get()
    ])
    setItems(itemsData)
    setGroups(groupsData)
    if (groupsData.length > 0 && !activeGroup) {
      setActiveGroup(null) // show all by default
    }
  }

  const filteredItems = useMemo(() => {
    let filtered = items.filter((i) => !i.variant_of) // hide variants from main grid
    if (activeGroup) {
      filtered = filtered.filter((i) => i.item_group === activeGroup)
    }
    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter(
        (i) =>
          i.item_name.toLowerCase().includes(q) ||
          i.item_code.toLowerCase().includes(q) ||
          (i.item_name_ar && i.item_name_ar.includes(q))
      )
    }
    return filtered
  }, [items, activeGroup, search])

  async function handleItemClick(item: Item) {
    // If item has variants, show variant picker
    if (item.has_variants) {
      const variants = await window.api.items.getVariants(item.item_code)
      setVariantItems(variants)
      setSelectedItem(item)
      setShowVariants(true)
      return
    }

    // Check for modifiers
    const modGroups = await window.api.modifiers.getItemGroups(item.item_code)
    if (modGroups.length > 0) {
      setPendingItem(item)
      setShowModifiers(true)
      return
    }

    // Simple item — add directly
    addItem({
      itemCode: item.item_code,
      itemName: item.item_name,
      qty: 1,
      rate: item.rate
    })
  }

  function handleVariantSelect(variant: Item) {
    setShowVariants(false)
    // Check modifiers for the variant too
    handleItemAfterVariant(variant)
  }

  async function handleItemAfterVariant(item: Item) {
    const modGroups = await window.api.modifiers.getItemGroups(item.item_code)
    if (modGroups.length > 0) {
      setPendingItem(item)
      setShowModifiers(true)
      return
    }
    addItem({
      itemCode: item.item_code,
      itemName: item.item_name,
      qty: 1,
      rate: item.rate
    })
  }

  function handleModifierConfirm(modifiers: CartModifier[], instructions: string) {
    if (pendingItem) {
      addItem({
        itemCode: pendingItem.item_code,
        itemName: pendingItem.item_name,
        qty: 1,
        rate: pendingItem.rate,
        modifiers,
        specialInstructions: instructions
      })
    }
    setPendingItem(null)
    setShowModifiers(false)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Search bar */}
      <div className="border-b bg-white px-4 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items..."
            className="w-full rounded-lg border border-input bg-muted/30 py-2 pl-9 pr-3 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 overflow-x-auto border-b bg-white px-4 py-2">
        <button
          onClick={() => setActiveGroup(null)}
          className={`whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
            !activeGroup
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          All
        </button>
        {groups.map((g) => (
          <button
            key={g.name}
            onClick={() => setActiveGroup(g.name)}
            className={`whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
              activeGroup === g.name
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {g.name}
          </button>
        ))}
      </div>

      {/* Item grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredItems.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            {search ? 'No items match your search' : 'No items available'}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 lg:grid-cols-4 xl:grid-cols-5">
            {filteredItems.map((item) => (
              <button
                key={item.item_code}
                onClick={() => handleItemClick(item)}
                className="group flex flex-col rounded-xl border bg-white p-3 text-left shadow-sm transition-all hover:border-primary/30 hover:shadow-md active:scale-[0.98]"
              >
                {item.image ? (
                  <div className="mb-2 aspect-square overflow-hidden rounded-lg bg-muted">
                    <img
                      src={item.image}
                      alt={item.item_name}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="mb-2 flex aspect-square items-center justify-center rounded-lg bg-gradient-to-br from-primary/5 to-primary/10">
                    <span className="text-2xl font-bold text-primary/20">
                      {item.item_name.charAt(0)}
                    </span>
                  </div>
                )}
                <h3 className="text-sm font-medium leading-tight group-hover:text-primary">
                  {item.item_name}
                </h3>
                {item.item_name_ar && (
                  <p className="mt-0.5 text-xs text-muted-foreground" dir="rtl">
                    {item.item_name_ar}
                  </p>
                )}
                <div className="mt-auto pt-2">
                  <span className="text-sm font-semibold text-primary">
                    {item.rate.toFixed(2)}
                  </span>
                  {item.has_variants ? (
                    <span className="ml-1 text-xs text-muted-foreground">+</span>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Variant picker modal */}
      {showVariants && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-96 rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="mb-1 text-lg font-bold">{selectedItem.item_name}</h3>
            <p className="mb-4 text-sm text-muted-foreground">Select a size / variant</p>
            <div className="space-y-2">
              {variantItems.map((v) => {
                const attrs = v.attributes ? JSON.parse(v.attributes) : {}
                const label = Object.values(attrs).join(' / ') || v.item_name
                return (
                  <button
                    key={v.item_code}
                    onClick={() => handleVariantSelect(v)}
                    className="flex w-full items-center justify-between rounded-lg border p-3 text-sm hover:border-primary hover:bg-primary/5"
                  >
                    <span className="font-medium">{label}</span>
                    <span className="font-semibold text-primary">{v.rate.toFixed(2)}</span>
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => setShowVariants(false)}
              className="mt-4 w-full rounded-lg border border-input py-2 text-sm font-medium hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Modifier modal */}
      {showModifiers && pendingItem && (
        <ModifierModal
          itemCode={pendingItem.item_code}
          itemName={pendingItem.item_name}
          onConfirm={handleModifierConfirm}
          onCancel={() => {
            setShowModifiers(false)
            setPendingItem(null)
          }}
        />
      )}
    </div>
  )
}
