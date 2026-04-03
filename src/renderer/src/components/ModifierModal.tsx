import { useState, useEffect } from 'react'
import { Check } from 'lucide-react'
import { CartModifier } from '../stores/cart'

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
  onConfirm: (modifiers: CartModifier[], instructions: string) => void
  onCancel: () => void
}

export default function ModifierModal({ itemCode, itemName, onConfirm, onCancel }: Props) {
  const [groups, setGroups] = useState<ModifierGroup[]>([])
  const [modifiersByGroup, setModifiersByGroup] = useState<Record<string, Modifier[]>>({})
  const [selected, setSelected] = useState<Record<string, string[]>>({}) // groupId -> [modifierId]
  const [instructions, setInstructions] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    loadModifiers()
  }, [itemCode])

  async function loadModifiers() {
    const grps = await window.api.modifiers.getItemGroups(itemCode)
    setGroups(grps)

    const modMap: Record<string, Modifier[]> = {}
    const defaultSelected: Record<string, string[]> = {}

    for (const g of grps) {
      const mods = await window.api.modifiers.getForGroup(g.modifier_group_id)
      modMap[g.modifier_group_id] = mods

      // Select defaults
      const defaults = mods.filter((m) => m.is_default).map((m) => m.id)
      if (defaults.length > 0) {
        defaultSelected[g.modifier_group_id] = defaults
      } else {
        defaultSelected[g.modifier_group_id] = []
      }
    }

    setModifiersByGroup(modMap)
    setSelected(defaultSelected)
  }

  function toggleModifier(groupId: string, modId: string, selectionType: string, maxSelections: number) {
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
        setError(`Please select from "${g.group_name}"`)
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

    onConfirm(cartModifiers, instructions)
  }

  const totalExtra = groups.reduce((total, g) => {
    const groupMods = modifiersByGroup[g.modifier_group_id] || []
    const selectedIds = selected[g.modifier_group_id] || []
    return total + selectedIds.reduce((sum, id) => {
      const mod = groupMods.find((m) => m.id === id)
      return sum + (mod?.price || 0)
    }, 0)
  }, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="flex max-h-[80vh] w-[480px] flex-col rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="border-b px-6 py-4">
          <h3 className="text-lg font-bold">{itemName}</h3>
          <p className="text-sm text-muted-foreground">Customize your order</p>
        </div>

        {/* Modifier groups */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {groups.map((g) => {
            const mods = modifiersByGroup[g.modifier_group_id] || []
            const selectedIds = selected[g.modifier_group_id] || []

            return (
              <div key={g.id} className="mb-5">
                <div className="mb-2 flex items-center gap-2">
                  <h4 className="text-sm font-semibold">{g.group_name}</h4>
                  {g.is_required ? (
                    <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                      Required
                    </span>
                  ) : null}
                  {g.selection_type === 'Single' ? (
                    <span className="text-xs text-muted-foreground">Choose one</span>
                  ) : g.max_selections > 0 ? (
                    <span className="text-xs text-muted-foreground">
                      Max {g.max_selections}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Choose any</span>
                  )}
                </div>
                <div className="space-y-1">
                  {mods.map((mod) => {
                    const isSelected = selectedIds.includes(mod.id)
                    return (
                      <button
                        key={mod.id}
                        onClick={() =>
                          toggleModifier(g.modifier_group_id, mod.id, g.selection_type, g.max_selections)
                        }
                        className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                          isSelected
                            ? 'border-primary bg-primary/5 text-foreground'
                            : 'border-transparent bg-muted/40 text-foreground hover:bg-muted'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                              isSelected
                                ? 'border-primary bg-primary'
                                : 'border-muted-foreground/30'
                            }`}
                          >
                            {isSelected && <Check className="h-3 w-3 text-white" />}
                          </div>
                          <span className={isSelected ? 'font-medium' : ''}>{mod.modifier_name}</span>
                        </div>
                        {mod.price > 0 && (
                          <span className="text-xs font-medium text-muted-foreground">
                            +{mod.price.toFixed(2)}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* Special instructions */}
          <div>
            <h4 className="mb-2 text-sm font-semibold">Special Instructions</h4>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g., No onions, extra spicy..."
              className="w-full resize-none rounded-lg border border-input bg-muted/30 px-3 py-2 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary"
              rows={2}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-4">
          {error && <p className="mb-2 text-sm text-destructive">{error}</p>}

          {totalExtra > 0 && (
            <p className="mb-2 text-sm text-muted-foreground">
              Add-ons: <span className="font-medium text-foreground">+{totalExtra.toFixed(2)}</span>
            </p>
          )}

          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 rounded-lg border border-input py-2.5 text-sm font-medium hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Add to Order
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
