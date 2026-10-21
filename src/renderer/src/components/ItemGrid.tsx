import { useState, useEffect, useMemo, memo, useCallback, useRef } from 'react'
import { useCartStore, CartModifier } from '../stores/cart'
import { useMenu, MenuItem, groupColor } from '../stores/menu'
import ModifierModal from './ModifierModal'
import { Btn, Dialog, Option, SearchIcon, useTier, money, C } from '../ui'
import { cn } from '../lib/utils'

// Menu side of the till: the category shelf (folder tabs) and the item grid, with an inline
// search keyboard. Tapping a tile adds one; items with variants or modifiers open a chooser.

function cachedImageUrl(itemCode: string): string {
  const sanitized = itemCode.replace(/[^a-zA-Z0-9_-]/g, '_')
  return `cached-image://file/${sanitized}.png`
}

function ItemImage({ item, className }: { item: { item_code: string; item_name: string; image: string | null }; className?: string }) {
  const [src, setSrc] = useState(() => cachedImageUrl(item.item_code))
  const onError = useCallback(() => {
    if (item.image && src !== item.image) {
      setSrc(item.image)
    }
  }, [item.image, src])

  return <img src={src} alt={item.item_name} className={className} onError={onError} />
}

type Lang = 'en' | 'ar' | 'both'
type ViewMode = 'grid' | 'list'
const ALL = '__all'
const POPULAR = '__popular'
const UI_KEY = 'pos_menu_ui_v2'

function loadUi(): { lang?: Lang; view?: ViewMode } {
  try { return JSON.parse(localStorage.getItem(UI_KEY) || '{}') } catch { return {} }
}

function ItemGrid({ isOrderPlaced }: { isOrderPlaced?: boolean }) {
  const { items, groups, loaded, load } = useMenu()
  const saved = useRef(loadUi()).current
  const [active, setActive] = useState<string>(ALL)
  const [search, setSearch] = useState('')
  const [kbOpen, setKbOpen] = useState(false)
  const [lang, setLang] = useState<Lang>(saved.lang || 'en')
  const [viewMode, setViewMode] = useState<ViewMode>(saved.view || 'grid')
  const [variantItems, setVariantItems] = useState<MenuItem[]>([])
  const [showVariants, setShowVariants] = useState(false)
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null)
  const [showModifiers, setShowModifiers] = useState(false)
  const [pendingItem, setPendingItem] = useState<MenuItem | null>(null)
  const [detailItem, setDetailItem] = useState<MenuItem | null>(null)
  const [showDescription, setShowDescription] = useState(false)
  const [confirmItem, setConfirmItem] = useState<MenuItem | null>(null)
  const [confirmModifiers, setConfirmModifiers] = useState<{ modifiers: CartModifier[]; instructions: string; qty: number } | null>(null)
  const [popular, setPopular] = useState<string[]>([])
  const searchRef = useRef<HTMLInputElement>(null)
  const { wide, large } = useTier()

  const addOrMerge = useCartStore((s) => s.addOrMerge)
  const addItem = useCartStore((s) => s.addItem)
  const cartItems = useCartStore((s) => s.items)
  const tableName = useCartStore((s) => s.tableName)
  const orderType = useCartStore((s) => s.orderType)

  useEffect(() => { if (!loaded) load(); loadConfig(); loadPopular() }, [])
  useEffect(() => { try { localStorage.setItem(UI_KEY, JSON.stringify({ lang, view: viewMode })) } catch {} }, [lang, viewMode])

  async function loadConfig() {
    const config = await window.api.receiptConfig.getAll()
    setShowDescription(config.show_description_on_pos === '1')
  }

  // "Popular" = today's best sellers, topped up from yesterday early in the day.
  async function loadPopular() {
    try {
      const today = (await window.api.reports.bestSellingItems(undefined, 12)) || []
      let names: string[] = today.map((r: any) => r.item_name)
      if (names.length < 6) {
        const y = new Date(Date.now() - 86400000).toLocaleDateString('en-CA')
        const prev = (await window.api.reports.bestSellingItems(y, 12)) || []
        for (const r of prev) if (!names.includes(r.item_name)) names.push(r.item_name)
      }
      names = names.slice(0, 12)
      setPopular(names)
      if (names.length > 0) setActive((a) => (a === ALL ? POPULAR : a))
    } catch { /* report not available */ }
  }

  const mainItems = useMemo(() => items.filter((i) => !i.variant_of), [items])

  const groupCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const i of mainItems) if (i.item_group) counts[i.item_group] = (counts[i.item_group] || 0) + 1
    return counts
  }, [mainItems])

  // Only groups that have items (hides system groups like Raw Material, Services)
  const visibleGroups = useMemo(() => groups.filter((g) => (groupCounts[g.name] || 0) > 0), [groups, groupCounts])

  const popularSet = useMemo(() => new Set(popular.slice(0, 4)), [popular])

  const filteredItems = useMemo(() => {
    if (search) {
      const q = search.toLowerCase()
      return mainItems.filter((i) =>
        i.item_name.toLowerCase().includes(q) ||
        i.item_code.toLowerCase().includes(q) ||
        (i.item_name_ar && i.item_name_ar.includes(search)) ||
        (i.description && i.description.toLowerCase().includes(q))
      )
    }
    let list: MenuItem[]
    if (active === POPULAR) {
      list = popular.map((n) => mainItems.find((i) => i.item_name === n)).filter(Boolean) as MenuItem[]
    } else if (active === ALL) {
      list = mainItems
    } else {
      list = mainItems.filter((i) => i.item_group === active)
    }
    // Best sellers first (they get the big tiles)
    if (active !== ALL) list = [...list].sort((a, b) => Number(popularSet.has(b.item_name)) - Number(popularSet.has(a.item_name)))
    return list
  }, [mainItems, active, search, popular, popularSet])

  // Qty already on the ticket, per tile (variants count toward their template)
  const inCart = useMemo(() => {
    const m: Record<string, number> = {}
    const byCode = useMenu.getState().byCode
    for (const l of cartItems) {
      m[l.itemCode] = (m[l.itemCode] || 0) + l.qty
      const tpl = byCode[l.itemCode]?.variant_of
      if (tpl) m[tpl] = (m[tpl] || 0) + l.qty
    }
    return m
  }, [cartItems])

  function itemName(item: MenuItem): string {
    if (lang === 'ar' && item.item_name_ar) return item.item_name_ar
    return item.item_name
  }

  function doAddItem(item: MenuItem, modifiers?: CartModifier[], instructions?: string, qty = 1) {
    const base = { itemCode: item.item_code, itemName: item.item_name, qty, rate: item.rate }
    if (modifiers && (modifiers.length > 0 || instructions)) addItem({ ...base, modifiers, specialInstructions: instructions })
    else addOrMerge(base)
  }

  function addWithConfirm(item: MenuItem, modifiers?: CartModifier[], instructions?: string, qty = 1) {
    if (isOrderPlaced) {
      setConfirmItem(item)
      setConfirmModifiers({ modifiers: modifiers || [], instructions: instructions || '', qty })
    } else {
      doAddItem(item, modifiers, instructions, qty)
    }
  }

  function confirmAddItem() {
    if (confirmItem) doAddItem(confirmItem, confirmModifiers?.modifiers, confirmModifiers?.instructions, confirmModifiers?.qty || 1)
    setConfirmItem(null); setConfirmModifiers(null)
  }

  async function handleItemClick(item: MenuItem) {
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
    addWithConfirm(item)
  }

  async function handleVariantSelect(variant: MenuItem) {
    setShowVariants(false)
    const modGroups = await window.api.modifiers.getItemGroups(variant.item_code)
    if (modGroups.length > 0) {
      setPendingItem(variant)
      setShowModifiers(true)
      return
    }
    addWithConfirm(variant)
  }

  function handleModifierConfirm(modifiers: CartModifier[], instructions: string, qty = 1) {
    if (pendingItem) {
      addWithConfirm(pendingItem, modifiers, instructions, qty)
    }
    setPendingItem(null)
    setShowModifiers(false)
  }

  function pickCategory(key: string) {
    setActive(key); setSearch(''); setKbOpen(false)
  }

  // Long-press a tile for its description / Arabic name
  const pressTimer = useRef<number | null>(null)
  const longPressed = useRef(false)
  function pressStart(item: MenuItem) {
    longPressed.current = false
    if (pressTimer.current) clearTimeout(pressTimer.current)
    pressTimer.current = window.setTimeout(() => { longPressed.current = true; setDetailItem(item) }, 550)
  }
  function pressEnd() { if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null } }

  const cols = large ? 6 : wide ? 5 : 4
  const title = search ? `${filteredItems.length} result${filteredItems.length === 1 ? '' : 's'}` : active === ALL ? 'All items' : active === POPULAR ? 'Popular' : active
  const activeGroup = visibleGroups.find((g) => g.name === active)
  const target = tableName || (orderType === 'Dine In' ? 'the order' : orderType)

  const shelf: { key: string; label: string; ar?: string | null; color: string; count?: number }[] = [
    ...(popular.length > 0 ? [{ key: POPULAR, label: 'Popular', color: C.teal }] : []),
    ...visibleGroups.map((g) => ({ key: g.name, label: g.name, ar: g.name_ar, color: groupColor(g.name), count: groupCounts[g.name] })),
    { key: ALL, label: 'All items', color: C.stone, count: mainItems.length }
  ]

  return (
    <>
      {/* Categories: folder tabs, the active one joins the menu */}
      <aside aria-label="Categories" className="scroll-none flex flex-shrink-0 flex-col gap-0.5 overflow-y-auto bg-n-rail py-2 pl-1.5" style={{ width: large ? 180 : wide ? 150 : 132 }}>
        {shelf.map((c) => {
          const on = !search && active === c.key
          return (
            <button key={c.key} type="button" aria-pressed={on} onClick={() => pickCategory(c.key)}
              className={cn('flex min-h-[48px] w-full flex-shrink-0 items-center gap-2.5 rounded-l-md py-1 text-left', on ? '-mr-2 bg-n-cream pr-[18px] text-n-ink' : 'bg-transparent pr-2.5 text-white')}>
              <span className="w-1.5 flex-shrink-0 self-stretch rounded-r-[3px]" style={{ background: c.color, height: on ? undefined : 22, alignSelf: on ? 'stretch' : 'center' }} />
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-semibold leading-[1.15]">{c.label}</span>
                {lang !== 'en' && c.ar && <span dir="rtl" className={cn('truncate text-[11px] leading-tight', on ? 'text-n-muted' : 'text-n-mist')}>{c.ar}</span>}
              </span>
            </button>
          )
        })}
      </aside>

      {/* Menu */}
      <section className="flex min-w-0 flex-1 flex-col bg-n-cream">
        <div className="flex flex-shrink-0 items-center gap-2.5 px-3 pb-1.5 pt-2.5">
          <span className="cond min-w-0 truncate text-2xl font-bold tracking-[.02em] text-n-ink">
            {title}
            {!search && lang !== 'en' && activeGroup?.name_ar && <span dir="rtl" className="ml-2 font-sans text-base font-medium text-n-muted">{activeGroup.name_ar}</span>}
          </span>
          <span className="flex-1" />
          {/* EN / AR / Both */}
          <div role="radiogroup" aria-label="Item names" className="flex rounded-full border border-[#E0D9CB] bg-white p-[3px]">
            {(['en', 'ar', 'both'] as Lang[]).map((l) => (
              <button key={l} type="button" role="radio" aria-checked={lang === l} onClick={() => setLang(l)}
                className={cn('h-[34px] min-w-[40px] rounded-full px-2.5 text-xs font-semibold', lang === l ? 'bg-n-deep text-white' : 'text-n-muted')}>
                {l === 'en' ? 'EN' : l === 'ar' ? 'AR' : 'Both'}
              </button>
            ))}
          </div>
          {/* Grid / list */}
          <button type="button" aria-label={viewMode === 'grid' ? 'Show as list' : 'Show as tiles'} onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
            className="press flex h-10 w-10 items-center justify-center rounded-full border border-[#E0D9CB] bg-white text-n-ink">
            {viewMode === 'grid'
              ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>}
          </button>
          {/* Search: a pill that opens the keyboard; also accepts a physical keyboard */}
          <div className={cn('flex h-10 cursor-text items-center gap-2 rounded-full bg-white px-3 text-n-ink', kbOpen ? 'min-w-[220px] border-2 border-n-teal' : 'border border-[#E0D9CB]')}
            onMouseDown={() => { setKbOpen(true); setTimeout(() => searchRef.current?.focus(), 0) }}>
            <SearchIcon />
            <input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} onFocus={() => setKbOpen(true)}
              onKeyDown={(e) => { if (e.key === 'Escape') { setSearch(''); setKbOpen(false); searchRef.current?.blur() } }}
              placeholder="Search" aria-label="Search the menu" inputMode="none"
              className={cn('min-w-0 bg-transparent text-[15px] placeholder:text-sm placeholder:text-n-ink focus:outline-none', kbOpen ? 'w-[150px]' : 'w-[56px]')} />
            {search && <button type="button" aria-label="Clear search" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }} onClick={() => setSearch('')} className="text-lg leading-none text-n-muted">×</button>}
          </div>
        </div>

        <div className="scroll-none min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-0.5">
          {filteredItems.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 text-n-muted">
              <span className="cond text-2xl font-bold text-n-ink">{search ? 'Nothing matches' : loaded ? 'No items here' : 'Loading menu…'}</span>
              <span className="text-sm">{search ? 'Try fewer letters, or the Arabic name' : loaded ? 'Sync items from ERPNext to fill the menu' : ''}</span>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid content-start gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: 72, gridAutoFlow: 'dense' }}>
              {filteredItems.map((item) => {
                const c = groupColor(item.item_group)
                const big = !search && popularSet.has(item.item_name)
                const qty = inCart[item.item_code] || 0
                return (
                  <button key={item.item_code} type="button"
                    onClick={() => { if (longPressed.current) { longPressed.current = false; return } handleItemClick(item) }}
                    onPointerDown={() => pressStart(item)} onPointerUp={pressEnd} onPointerLeave={pressEnd}
                    className="press relative flex h-[72px] items-center gap-2.5 rounded-md bg-white py-[9px] pl-3 pr-2.5 text-left text-n-ink"
                    style={{ boxShadow: `inset 4px 0 0 ${c}, 0 1px 2px rgba(60,45,20,.12)`, gridColumn: big ? 'span 2' : undefined, outline: qty ? `2px solid ${C.deep}` : undefined, outlineOffset: -2 }}>
                    {big && (item.image
                      ? <ItemImage item={item} className="h-[46px] w-[46px] flex-shrink-0 rounded-full object-cover" />
                      : <span className="cond flex h-[46px] w-[46px] flex-shrink-0 items-center justify-center rounded-full text-2xl font-bold text-white" style={{ background: c }}>{item.item_name.replace(/^(Hot|Iced) /, '').charAt(0)}</span>)}
                    <span className="flex h-full min-w-0 flex-1 flex-col justify-between">
                      <span dir={lang === 'ar' ? 'rtl' : 'ltr'} className={cn('flex-shrink-0 font-semibold leading-[1.2]', big ? 'text-[15px]' : 'text-[13.5px]', lang === 'both' ? 'line-clamp-1' : 'line-clamp-2', lang === 'ar' && 'text-right')}>{itemName(item)}</span>
                      {lang === 'both' && item.item_name_ar && <span dir="rtl" className="flex-shrink-0 truncate text-right text-[11px] leading-tight text-n-muted">{item.item_name_ar}</span>}
                      <span className="flex flex-shrink-0 items-baseline gap-1.5 leading-none">
                        <span className={cn('cond num font-semibold', big ? 'text-[19px]' : 'text-[17px]')}>{money(item.rate)}</span>
                        {!!item.has_variants && <span className="text-[11px] text-n-muted">choose</span>}
                      </span>
                    </span>
                    {qty > 0 && <span className="cond num absolute right-1.5 top-1.5 flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-n-deep px-[5px] text-sm font-bold text-white">{qty}</span>}
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {filteredItems.map((item) => {
                const c = groupColor(item.item_group)
                const qty = inCart[item.item_code] || 0
                return (
                  <div key={item.item_code} className="flex items-stretch gap-1.5">
                    <button type="button" onClick={() => handleItemClick(item)}
                      className="press flex min-h-[64px] flex-1 items-center gap-3 rounded-md bg-white px-3 py-2 text-left text-n-ink"
                      style={{ boxShadow: `inset 4px 0 0 ${c}, 0 1px 2px rgba(60,45,20,.12)`, outline: qty ? `2px solid ${C.deep}` : undefined, outlineOffset: -2 }}>
                      {item.image
                        ? <ItemImage item={item} className="h-12 w-12 flex-shrink-0 rounded-md object-cover" />
                        : <span className="cond flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md text-2xl font-bold text-white" style={{ background: c }}>{item.item_name.charAt(0)}</span>}
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span dir={lang === 'ar' ? 'rtl' : 'ltr'} className={cn('truncate text-[15px] font-semibold', lang === 'ar' && 'text-right')}>{itemName(item)}</span>
                        {lang === 'both' && item.item_name_ar && <span dir="rtl" className="truncate text-right text-[13px] text-n-muted">{item.item_name_ar}</span>}
                        {showDescription && item.description && <span className="truncate text-xs text-n-muted">{item.description}</span>}
                        {item.item_group && <span className="text-[11px] text-n-muted">{item.item_group}{item.has_variants ? ' · choose a size' : ''}</span>}
                      </span>
                      {qty > 0 && <span className="cond num flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-n-deep px-[5px] text-sm font-bold text-white">{qty}</span>}
                      <span className="cond num text-xl font-semibold">{money(item.rate)}</span>
                    </button>
                    {(item.description || item.item_name_ar) && (
                      <button type="button" aria-label={`About ${item.item_name}`} onClick={() => setDetailItem(item)}
                        className="press flex w-12 items-center justify-center rounded-md border border-n-edge bg-white text-lg font-semibold text-n-muted">i</button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {kbOpen && (
          <MenuKeyboard
            onKey={(k) => setSearch((s) => (k === 'back' ? s.slice(0, -1) : s + k))}
            onClear={() => setSearch('')}
            onDone={() => { setKbOpen(false); searchRef.current?.blur() }}
            arabic={lang !== 'en'}
          />
        )}
      </section>

      {/* Item detail (long-press a tile, or "i" in the list) */}
      {detailItem && (
        <Dialog onClose={() => setDetailItem(null)} className="w-[440px]" label={detailItem.item_name}>
          {detailItem.image ? (
            <div className="h-48 w-full overflow-hidden bg-white"><ItemImage item={detailItem} className="h-full w-full object-cover" /></div>
          ) : (
            <div className="h-2 w-full" style={{ background: groupColor(detailItem.item_group) }} />
          )}
          <div className="flex flex-col gap-3 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-xl font-bold">{detailItem.item_name}</span>
                {detailItem.item_name_ar && <span dir="rtl" className="text-base text-n-muted">{detailItem.item_name_ar}</span>}
              </div>
              <span className="cond num text-2xl font-bold">{money(detailItem.rate)}</span>
            </div>
            {detailItem.description && <p className="text-sm leading-relaxed text-n-ink/80">{detailItem.description}</p>}
            {detailItem.description_ar && <p dir="rtl" className="text-sm leading-relaxed text-n-muted">{detailItem.description_ar}</p>}
          </div>
          <div className="flex gap-2 bg-white px-4 py-3">
            <Btn size="lg" variant="outline" onClick={() => setDetailItem(null)}>Close</Btn>
            <Btn size="lg" variant="deep" className="flex-1" onClick={() => { handleItemClick(detailItem); setDetailItem(null) }}>Add to order</Btn>
          </div>
        </Dialog>
      )}

      {/* Variant picker */}
      {showVariants && selectedItem && (
        <Dialog onClose={() => setShowVariants(false)} className="w-[520px]" label={`Choose ${selectedItem.item_name}`}>
          <div className="flex items-center gap-3 bg-white px-4 py-3.5" style={{ boxShadow: `inset 4px 0 0 ${groupColor(selectedItem.item_group)}` }}>
            <span className="flex flex-col leading-tight">
              <span className="text-xl font-bold">{selectedItem.item_name}</span>
              <span className="text-[13px] text-n-muted">Choose one</span>
            </span>
          </div>
          <div className="grid max-h-[60vh] grid-cols-2 gap-1.5 overflow-y-auto p-4">
            {variantItems.map((v) => {
              let label = v.item_name
              try { const attrs = v.attributes ? JSON.parse(v.attributes) : {}; label = (Object.values(attrs).join(' / ') as string) || v.item_name } catch {}
              return (
                <Option key={v.item_code} onClick={() => handleVariantSelect(v)} className="h-14">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-semibold">{label}</span>
                    {lang !== 'en' && v.item_name_ar && <span dir="rtl" className="truncate text-xs text-n-muted">{v.item_name_ar}</span>}
                  </span>
                  <span className="cond num text-lg font-semibold">{money(v.rate)}</span>
                </Option>
              )
            })}
          </div>
          <div className="flex bg-white px-4 py-3">
            <Btn size="lg" variant="outline" onClick={() => setShowVariants(false)}>Cancel</Btn>
          </div>
        </Dialog>
      )}

      {/* Modifier chooser */}
      {showModifiers && pendingItem && (
        <ModifierModal itemCode={pendingItem.item_code} itemName={pendingItem.item_name} rate={pendingItem.rate} group={pendingItem.item_group}
          nameAr={pendingItem.item_name_ar} target={target}
          onConfirm={handleModifierConfirm} onCancel={() => { setShowModifiers(false); setPendingItem(null) }} />
      )}

      {/* Confirm adding to an order the kitchen already has */}
      {confirmItem && (
        <Dialog onClose={() => { setConfirmItem(null); setConfirmModifiers(null) }} className="w-[440px]" label="Add to a sent order">
          <div className="flex flex-col gap-2 px-5 pb-4 pt-5">
            <span className="cond text-[26px] font-bold leading-none text-n-deep">Add to a sent order?</span>
            <span className="text-sm text-n-muted">
              The kitchen already has this order. <b className="text-n-ink">{confirmModifiers && confirmModifiers.qty > 1 ? `${confirmModifiers.qty} × ` : ''}{confirmItem.item_name}</b> goes under New; press Send to print the extra KOT.
            </span>
          </div>
          <div className="flex gap-2 bg-white px-4 py-3">
            <Btn size="lg" variant="outline" onClick={() => { setConfirmItem(null); setConfirmModifiers(null) }}>Cancel</Btn>
            <span className="flex-1" />
            <Btn size="lg" variant="teal" onClick={confirmAddItem} autoFocus>Add item</Btn>
          </div>
        </Dialog>
      )}
    </>
  )
}

// ------------------------------------------------------------------ inline search keyboard
const EN_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']
const NUM_ROWS = ['1234567890', '-/()&.,%\'', '@#+*=!?']
const AR_ROWS = ['ضصثقفغعهخحج', 'شسيبلاتنمكط', 'ئءؤرىةوزظد']

function MenuKeyboard({ onKey, onClear, onDone, arabic }: { onKey: (k: string) => void; onClear: () => void; onDone: () => void; arabic: boolean }) {
  const [layout, setLayout] = useState<'en' | 'num' | 'ar'>('en')
  const rows = layout === 'num' ? NUM_ROWS : layout === 'ar' ? AR_ROWS : EN_ROWS
  const key = 'press flex h-12 min-w-0 items-center justify-center rounded-md text-[17px] text-n-ink shadow-key'
  const k = (ch: string) => (
    <button key={ch} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onKey(ch)} className={cn(key, 'flex-1 bg-white')}>{ch}</button>
  )
  return (
    <div aria-label="Keyboard" className="flex flex-shrink-0 flex-col gap-1.5 bg-n-sand p-2">
      <div className="flex gap-1.5">{rows[0].split('').map(k)}</div>
      <div className="flex gap-1.5">
        {rows[1].split('').map(k)}
        <button type="button" aria-label="Delete" onMouseDown={(e) => e.preventDefault()} onClick={() => onKey('back')} className={cn(key, 'flex-[1.3] bg-[#CFC7B8]')}>⌫</button>
      </div>
      <div className="flex gap-1.5">
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setLayout(layout === 'num' ? 'en' : 'num')} className={cn(key, 'flex-[1.3] bg-[#CFC7B8] text-sm')}>{layout === 'num' ? 'ABC' : '123'}</button>
        {rows[2].split('').map(k)}
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onClear} className={cn(key, 'flex-[1.6] bg-[#CFC7B8] text-sm')}>Clear</button>
      </div>
      <div className="flex gap-1.5">
        {arabic && (
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setLayout(layout === 'ar' ? 'en' : 'ar')} className={cn(key, 'flex-[1.3] bg-[#CFC7B8] text-sm')}>{layout === 'ar' ? 'EN' : 'ع'}</button>
        )}
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onKey(' ')} className={cn(key, 'flex-[5] bg-white text-sm text-n-muted')}>Space</button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onDone} className={cn(key, 'flex-[2] bg-n-deep text-[15px] font-semibold text-white')}>Done</button>
      </div>
    </div>
  )
}

export default memo(ItemGrid)
