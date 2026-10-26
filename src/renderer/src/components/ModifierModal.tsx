import { useState, useEffect } from 'react'
import { CartModifier } from '../stores/cart'
import { groupColor } from '../stores/menu'
import { useStatus } from '../stores/status'
import { Btn, Dialog, Option, Stepper, money } from '../ui'
import { cn } from '../lib/utils'
import { useT, useLang } from '../stores/i18n'

interface ModifierGroup {
  id: string
  modifier_group_id: string
  group_name: string
  selection_type: 'Single' | 'Multiple'
  is_required: number
  max_selections: number
}

interface Modifier {
  id: string
  modifier_name: string
  price: number
  is_default: number
}

interface Props {
  itemCode: string
  itemName: string
  nameAr?: string | null
  rate?: number
  group?: string | null
  /** Where it is going, e.g. "T12" — shown on the add button */
  target?: string
  onConfirm: (modifiers: CartModifier[], instructions: string, qty: number) => void
  onCancel: () => void
}

export default function ModifierModal({ itemCode, itemName, nameAr, rate = 0, group, target, onConfirm, onCancel }: Props) {
  const t = useT()
  const ar = useLang((s) => s.lang) === 'ar'
  const [groups, setGroups] = useState<ModifierGroup[]>([])
  const [modifiersByGroup, setModifiersByGroup] = useState<Record<string, Modifier[]>>({})
  const [selected, setSelected] = useState<Record<string, string[]>>({}) // groupId -> [modifierId]
  const [instructions, setInstructions] = useState('')
  const [qty, setQty] = useState(1)
  const [error, setError] = useState('')
  const [maxHit, setMaxHit] = useState<string | null>(null)

  useEffect(() => {
    loadModifiers()
  }, [itemCode])

  async function loadModifiers() {
    const grps = await window.api.modifiers.getItemGroups(itemCode)
    setGroups(grps)

    const modMap: Record<string, Modifier[]> = {}
    const defaultSelected: Record<string, string[]> = {}

    for (const g of grps) {
      const mods: Modifier[] = await window.api.modifiers.getForGroup(g.modifier_group_id)
      modMap[g.modifier_group_id] = mods
      // Select defaults
      defaultSelected[g.modifier_group_id] = mods.filter((m) => m.is_default).map((m) => m.id)
    }

    setModifiersByGroup(modMap)
    setSelected(defaultSelected)
  }

  function toggleModifier(groupId: string, modId: string, selectionType: string, maxSelections: number) {
    setMaxHit(null)
    setSelected((prev) => {
      const current = prev[groupId] || []

      if (selectionType === 'Single') {
        // Single selection — toggle or replace
        return { ...prev, [groupId]: current.includes(modId) ? [] : [modId] }
      }

      // Multiple selection
      if (current.includes(modId)) {
        return { ...prev, [groupId]: current.filter((id) => id !== modId) }
      }

      if (maxSelections > 0 && current.length >= maxSelections) {
        setMaxHit(groupId)
        return prev // max reached
      }

      return { ...prev, [groupId]: [...current, modId] }
    })
    setError('')
  }

  function handleConfirm() {
    // Validate required groups
    for (const g of groups) {
      if (g.is_required && (!selected[g.modifier_group_id] || selected[g.modifier_group_id].length === 0)) {
        setError(`Choose a ${g.group_name.toLowerCase()} first`)
        return
      }
    }

    // Build modifier list
    const cartModifiers: CartModifier[] = []
    for (const g of groups) {
      const groupMods = modifiersByGroup[g.modifier_group_id] || []
      const selectedIds = selected[g.modifier_group_id] || []
      for (const modId of selectedIds) {
        const mod = groupMods.find((m) => m.id === modId)
        if (mod) {
          cartModifiers.push({
            id: mod.id,
            name: mod.modifier_name,
            group: g.group_name,
            price: mod.price
          })
        }
      }
    }

    onConfirm(cartModifiers, instructions, qty)
  }

  const totalExtra = groups.reduce((total, g) => {
    const groupMods = modifiersByGroup[g.modifier_group_id] || []
    const selectedIds = selected[g.modifier_group_id] || []
    return total + selectedIds.reduce((sum, id) => {
      const mod = groupMods.find((m) => m.id === id)
      return sum + (mod?.price || 0)
    }, 0)
  }, 0)
  const lineTotal = (rate + totalExtra) * qty
  const missing = groups.filter((g) => g.is_required && !(selected[g.modifier_group_id] || []).length)
  const c = groupColor(group)
  const cur = useStatus((s) => s.currency)

  return (
    <Dialog onClose={onCancel} className="h-[min(672px,calc(100vh-32px))] w-[556px]" label={`${itemName} options`}>
      {/* review F10: Arabic interface shows the Arabic item name first */}
      <div className="flex items-center gap-3 border-b border-n-line bg-white px-4 pb-2.5 pt-3.5" style={{ boxShadow: `inset 4px 0 0 ${c}` }}>
        <span className="cond flex h-[46px] w-[46px] flex-shrink-0 items-center justify-center rounded-full text-2xl font-bold text-white" style={{ background: c }}>{itemName.replace(/^(Hot|Iced) /, '').charAt(0)}</span>
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-xl font-bold">{ar && nameAr ? nameAr : itemName}</span>
          <span className="truncate text-[13px] text-n-muted">{group ? `${group} · ` : ''}{t('base')} <bdi dir="ltr">{money(rate)}</bdi>{nameAr ? <> · <bdi dir={ar ? 'ltr' : 'rtl'}>{ar ? itemName : nameAr}</bdi></> : null}</span>
        </span>
        <span className="flex-1" />
        <Stepper value={qty} onDec={() => setQty(Math.max(1, qty - 1))} onInc={() => setQty(qty + 1)} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-4 py-3">
        {groups.map((g) => {
          const mods = modifiersByGroup[g.modifier_group_id] || []
          const selectedIds = selected[g.modifier_group_id] || []
          const rule = g.selection_type === 'Single' ? t('choose one') : g.max_selections > 0 ? t('up to {n}', { n: g.max_selections }) : t('any')
          return (
            <div key={g.id} className="flex flex-col gap-1.5">
              <span className="flex items-baseline gap-2">
                <span className="text-sm font-semibold">{g.group_name}</span>
                <span className={cn('text-xs', g.is_required ? 'font-semibold text-n-red' : maxHit === g.modifier_group_id ? 'font-semibold text-n-red' : 'text-n-muted')}>
                  {g.is_required ? `${t('required')}, ${rule}` : maxHit === g.modifier_group_id ? `${rule}, ${t("that's the limit")}` : rule}
                </span>
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {mods.map((mod) => (
                  <Option key={mod.id} active={selectedIds.includes(mod.id)} className={selectedIds.includes(mod.id) ? '!border-n-deep !bg-n-deep !text-white' : undefined} onClick={() => toggleModifier(g.modifier_group_id, mod.id, g.selection_type, g.max_selections)}>
                    <span className="min-w-0 truncate">{mod.modifier_name}</span>
                    <span className="num text-xs opacity-70">{mod.price > 0 ? `+${money(mod.price)}` : ''}</span>
                  </Option>
                ))}
              </div>
            </div>
          )
        })}

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">{t('Note for the kitchen')}</span>
          <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} data-keyboard="full" rows={2}
            placeholder={t('Tap to type, for example “extra hot”')}
            className="min-h-[48px] w-full resize-none rounded-md border border-dashed border-[#B9B2A4] bg-white px-3 py-3 text-sm placeholder:text-n-muted focus:border-solid focus:border-n-teal focus:outline-none" />
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-n-line bg-white px-4 pb-3 pt-2.5">
        {error && <span className="text-sm font-semibold text-n-red">{error}</span>}
        <div className="flex gap-2">
          <Btn size="lg" variant="outline" onClick={onCancel}>{t('Cancel')}</Btn>
          <button type="button" onClick={handleConfirm}
            className={cn('press flex h-14 flex-1 items-center justify-between rounded-md px-[18px] text-base font-bold', missing.length ? 'bg-n-sand text-n-stone' : 'bg-n-deep text-white')}>
            <span>{missing.length ? t('Choose {what}', { what: missing[0].group_name.toLowerCase() }) : target ? t('Add {n} to {target}', { n: qty, target }) : t('Add {n}', { n: qty })}</span>
            <span className="cond num text-2xl">{cur} {money(lineTotal)}</span>
          </button>
        </div>
      </div>
    </Dialog>
  )
}
