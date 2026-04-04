import { useState, useEffect } from 'react'
import { useAuthStore } from '../stores/auth'
import {
  Users, Settings, Printer, Package, LayoutGrid, ClipboardList,
  Plus, Trash2, Edit3, Eye, EyeOff, Save, RefreshCw, ArrowLeft,
  CheckCircle, XCircle, AlertCircle, ChevronDown, BarChart3, Clock
} from 'lucide-react'

type Tab = 'users' | 'modifiers' | 'items' | 'printers' | 'sync' | 'orders' | 'shifts' | 'reports'

export default function SupervisorSettings({ onBack }: { onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>('users')
  const user = useAuthStore((s) => s.user)

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'reports', label: 'Dashboard', icon: <BarChart3 className="h-4 w-4" /> },
    { key: 'users', label: 'Cashiers', icon: <Users className="h-4 w-4" /> },
    { key: 'modifiers', label: 'Modifiers', icon: <Package className="h-4 w-4" /> },
    { key: 'items', label: 'Items & Modifiers', icon: <LayoutGrid className="h-4 w-4" /> },
    { key: 'printers', label: 'Printers', icon: <Printer className="h-4 w-4" /> },
    { key: 'orders', label: 'Order History', icon: <ClipboardList className="h-4 w-4" /> },
    { key: 'shifts', label: 'Shift History', icon: <Clock className="h-4 w-4" /> },
    { key: 'sync', label: 'Sync', icon: <RefreshCw className="h-4 w-4" /> }
  ]

  return (
    <div className="flex h-screen bg-gray-50">
      <div className="flex w-56 flex-col border-r bg-white">
        <div className="border-b p-4">
          <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back to POS
          </button>
          <h1 className="mt-3 text-lg font-bold">Settings</h1>
        </div>
        <nav className="flex-1 p-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${
                activeTab === tab.key
                  ? 'bg-primary/10 font-medium text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'users' && <UserManagement />}
        {activeTab === 'modifiers' && <ModifierManagement />}
        {activeTab === 'items' && <ItemVisibility />}
        {activeTab === 'printers' && <PrinterManagement />}
        {activeTab === 'orders' && <OrderHistory />}
        {activeTab === 'sync' && <SyncDashboard />}
        {activeTab === 'shifts' && <ShiftHistory />}
        {activeTab === 'reports' && <ReportsDashboard />}
      </div>
    </div>
  )
}

// ==================== User Management ====================
function UserManagement() {
  const [users, setUsers] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [maxDiscount, setMaxDiscount] = useState(0)
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => { loadUsers() }, [])

  async function loadUsers() {
    const data = await window.api.users.getAll('cashier')
    setUsers(data)
  }

  async function handleSave() {
    if (!name.trim() || (pin.length < 6 && !editingId)) return
    if (editingId) {
      const updates: any = { name: name.trim(), maxDiscountPct: maxDiscount }
      if (pin) updates.pin = pin
      await window.api.users.update(editingId, updates)
    } else {
      await window.api.users.create(name.trim(), pin, 'cashier', { maxDiscountPct: maxDiscount })
    }
    resetForm()
    loadUsers()
  }

  async function toggleActive(id: string, isActive: number) {
    await window.api.users.update(id, { isActive: isActive ? 0 : 1 })
    loadUsers()
  }

  function editUser(u: any) {
    setEditingId(u.id)
    setName(u.name)
    setPin('')
    setMaxDiscount(u.max_discount_pct)
    setShowForm(true)
  }

  function resetForm() {
    setShowForm(false)
    setEditingId(null)
    setName('')
    setPin('')
    setMaxDiscount(0)
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold">Cashier Management</h2>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Add Cashier
        </button>
      </div>

      {showForm && (
        <div className="mb-4 rounded-xl border bg-white p-5">
          <h3 className="mb-3 font-semibold">{editingId ? 'Edit Cashier' : 'New Cashier'}</h3>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium">Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">PIN (6-8 digits){editingId ? ' — leave blank to keep' : ''}</label>
              <input type="password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" inputMode="numeric" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Max Discount %</label>
              <input type="number" value={maxDiscount} onChange={(e) => setMaxDiscount(parseFloat(e.target.value) || 0)} className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" min={0} max={100} />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={resetForm} className="rounded-lg border border-input px-4 py-2 text-sm hover:bg-muted">Cancel</button>
            <button onClick={handleSave} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Save</button>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-white">
        {users.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No cashiers yet. Add one above.</p>
        ) : (
          <div className="divide-y">
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <span className={`font-medium ${!u.is_active ? 'text-muted-foreground line-through' : ''}`}>{u.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">Max disc: {u.max_discount_pct}%</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => editUser(u)} className="rounded p-1.5 text-muted-foreground hover:bg-muted"><Edit3 className="h-3.5 w-3.5" /></button>
                  <button onClick={() => toggleActive(u.id, u.is_active)} className={`rounded p-1.5 ${u.is_active ? 'text-green-600 hover:bg-green-50' : 'text-red-400 hover:bg-red-50'}`}>
                    {u.is_active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ==================== Modifier Management ====================
function ModifierManagement() {
  const [groups, setGroups] = useState<any[]>([])
  const [modifiers, setModifiers] = useState<Record<string, any[]>>({})
  const [showGroupForm, setShowGroupForm] = useState(false)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [groupName, setGroupName] = useState('')
  const [selType, setSelType] = useState('Single')
  const [isRequired, setIsRequired] = useState(false)
  const [maxSel, setMaxSel] = useState(0)
  const [showModForm, setShowModForm] = useState<string | null>(null) // groupId to add modifier to
  const [modName, setModName] = useState('')
  const [modPrice, setModPrice] = useState(0)

  useEffect(() => { loadGroups() }, [])

  async function loadGroups() {
    const g = await window.api.modifiers.getGroups()
    setGroups(g)
    const mods: Record<string, any[]> = {}
    for (const grp of g) {
      mods[grp.id] = await window.api.modifiers.getForGroup(grp.id)
    }
    setModifiers(mods)
  }

  function resetGroupForm() {
    setShowGroupForm(false)
    setEditingGroupId(null)
    setGroupName('')
    setSelType('Single')
    setIsRequired(false)
    setMaxSel(0)
  }

  async function handleSaveGroup() {
    if (!groupName.trim()) return
    if (editingGroupId) {
      await window.api.modifiers.updateGroup(editingGroupId, {
        groupName: groupName.trim(), selectionType: selType, isRequired, maxSelections: maxSel
      })
    } else {
      await window.api.modifiers.createGroup({
        groupName: groupName.trim(), selectionType: selType, isRequired, maxSelections: maxSel
      })
    }
    resetGroupForm()
    loadGroups()
  }

  function editGroup(g: any) {
    setEditingGroupId(g.id)
    setGroupName(g.group_name)
    setSelType(g.selection_type)
    setIsRequired(!!g.is_required)
    setMaxSel(g.max_selections)
    setShowGroupForm(true)
  }

  async function handleDeleteGroup(id: string) {
    if (!confirm('Delete this modifier group and all its modifiers?')) return
    await window.api.modifiers.deleteGroup(id)
    loadGroups()
  }

  async function handleAddModifier() {
    if (!modName.trim() || !showModForm) return
    await window.api.modifiers.create({
      modifierGroupId: showModForm, modifierName: modName.trim(), price: modPrice
    })
    setModName('')
    setModPrice(0)
    setShowModForm(null)
    loadGroups()
  }

  async function handleDeleteModifier(id: string) {
    await window.api.modifiers.delete(id)
    loadGroups()
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold">Modifier Groups</h2>
        <button onClick={() => { resetGroupForm(); setShowGroupForm(true) }}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Add Group
        </button>
      </div>

      {/* Group form */}
      {showGroupForm && (
        <div className="mb-4 rounded-xl border bg-white p-5">
          <h3 className="mb-3 font-semibold">{editingGroupId ? 'Edit Group' : 'New Modifier Group'}</h3>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Group Name</label>
              <input type="text" value={groupName} onChange={(e) => setGroupName(e.target.value)}
                className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="e.g., Spice Level, Add-ons, Size" autoFocus />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500">Selection Type</label>
                <select value={selType} onChange={(e) => setSelType(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                  <option value="Single">Single (pick one)</option>
                  <option value="Multiple">Multiple (pick many)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500">Required?</label>
                <label className="flex items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm">
                  <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} />
                  Required
                </label>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500">Max Selections</label>
                <input type="number" value={maxSel} onChange={(e) => setMaxSel(parseInt(e.target.value) || 0)}
                  className="w-full rounded-lg border border-input px-3 py-2 text-sm" min={0} placeholder="0 = unlimited" />
              </div>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={resetGroupForm} className="rounded-lg border border-input px-4 py-2 text-sm hover:bg-muted">Cancel</button>
            <button onClick={handleSaveGroup} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              {editingGroupId ? 'Update' : 'Create Group'}
            </button>
          </div>
        </div>
      )}

      {/* Groups list */}
      {groups.length === 0 ? (
        <div className="rounded-xl border bg-white p-8 text-center text-sm text-muted-foreground">
          No modifier groups yet. Create groups like "Spice Level", "Add-ons", "Size".
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.id} className="rounded-xl border bg-white">
              <div className="flex items-center justify-between border-b px-5 py-3">
                <div>
                  <span className="font-semibold">{g.group_name}</span>
                  <span className="ml-2 rounded bg-muted px-2 py-0.5 text-[10px] font-medium">{g.selection_type}</span>
                  {g.is_required ? <span className="ml-1 rounded bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600">Required</span> : null}
                  {g.max_selections > 0 && <span className="ml-1 text-xs text-muted-foreground">Max: {g.max_selections}</span>}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setShowModForm(showModForm === g.id ? null : g.id)}
                    className="rounded px-2 py-1 text-xs font-medium text-primary hover:bg-primary/5">+ Add Modifier</button>
                  <button onClick={() => editGroup(g)} className="rounded p-1.5 text-muted-foreground hover:bg-muted"><Edit3 className="h-3.5 w-3.5" /></button>
                  <button onClick={() => handleDeleteGroup(g.id)} className="rounded p-1.5 text-red-400 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>

              {/* Add modifier form inline */}
              {showModForm === g.id && (
                <div className="flex items-end gap-2 border-b bg-muted/30 px-5 py-3">
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-semibold text-gray-500">Modifier Name</label>
                    <input type="text" value={modName} onChange={(e) => setModName(e.target.value)}
                      className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="e.g., Extra Cheese" autoFocus />
                  </div>
                  <div className="w-28">
                    <label className="mb-1 block text-xs font-semibold text-gray-500">Price</label>
                    <input type="number" value={modPrice || ''} onChange={(e) => setModPrice(parseFloat(e.target.value) || 0)}
                      className="w-full rounded-lg border border-input px-3 py-2 text-sm" min={0} step={0.5} placeholder="0" />
                  </div>
                  <button onClick={handleAddModifier}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Add</button>
                  <button onClick={() => { setShowModForm(null); setModName(''); setModPrice(0) }}
                    className="rounded-lg border border-input px-3 py-2 text-sm hover:bg-muted">Cancel</button>
                </div>
              )}

              {/* Modifiers list */}
              <div className="p-3">
                {(modifiers[g.id] || []).map((m) => (
                  <div key={m.id} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-muted/50">
                    <span className="text-sm font-medium">{m.modifier_name}</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold ${m.price > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                        {m.price > 0 ? `+${m.price.toFixed(2)}` : 'Free'}
                      </span>
                      <button onClick={() => handleDeleteModifier(m.id)} className="rounded p-1 text-red-300 hover:bg-red-50 hover:text-red-500">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
                {(modifiers[g.id] || []).length === 0 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No modifiers yet. Click "+ Add Modifier" above.</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ==================== Item Visibility ====================
function ItemVisibility() {
  const [groups, setGroups] = useState<any[]>([])
  const [items, setItems] = useState<any[]>([])
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [modifierGroups, setModifierGroups] = useState<any[]>([])
  const [assigningItem, setAssigningItem] = useState<string | null>(null)
  const [itemModGroups, setItemModGroups] = useState<any[]>([])
  const [selectedModGroup, setSelectedModGroup] = useState('')
  const [modRequired, setModRequired] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [g, i, mg] = await Promise.all([
      window.api.itemGroups.getAll(),
      window.api.items.getAll(),
      window.api.modifiers.getGroups()
    ])
    setGroups(g)
    setItems(i)
    setModifierGroups(mg)
  }

  async function toggleGroup(name: string, visible: boolean) {
    await window.api.items.setGroupVisibility(name, !visible)
    loadData()
  }

  async function toggleItem(code: string, visible: boolean) {
    await window.api.items.setVisibility(code, !visible)
    loadData()
  }

  async function openModifierAssign(itemCode: string) {
    setAssigningItem(itemCode)
    const assigned = await window.api.modifiers.getItemGroups(itemCode)
    setItemModGroups(assigned)
    setSelectedModGroup('')
    setModRequired(false)
  }

  async function handleAssignModifier() {
    if (!assigningItem || !selectedModGroup) return
    await window.api.modifiers.assignToItem(assigningItem, selectedModGroup, modRequired, itemModGroups.length)
    const assigned = await window.api.modifiers.getItemGroups(assigningItem)
    setItemModGroups(assigned)
    setSelectedModGroup('')
    setModRequired(false)
  }

  async function handleRemoveModifier(id: string) {
    await window.api.modifiers.removeFromItem(id)
    if (assigningItem) {
      const assigned = await window.api.modifiers.getItemGroups(assigningItem)
      setItemModGroups(assigned)
    }
  }

  const filteredItems = selectedGroup ? items.filter((i) => i.item_group === selectedGroup) : items
  const assigningItemData = assigningItem ? items.find((i) => i.item_code === assigningItem) : null

  return (
    <div className="max-w-3xl">
      <h2 className="mb-4 text-xl font-bold">Items & Modifiers</h2>

      {/* Group filter */}
      <div className="mb-4 rounded-xl border bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Item Groups</h3>
        <div className="flex flex-wrap gap-2">
          {groups.map((g) => (
            <button
              key={g.name}
              onClick={() => setSelectedGroup(selectedGroup === g.name ? null : g.name)}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedGroup === g.name ? 'border-primary bg-primary/5' : ''
              } ${!g.is_visible ? 'opacity-50' : ''}`}
            >
              <button
                onClick={(e) => { e.stopPropagation(); toggleGroup(g.name, g.is_visible) }}
                className={`rounded-full p-0.5 ${g.is_visible ? 'text-green-500' : 'text-red-400'}`}
              >
                {g.is_visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              </button>
              {g.name}
            </button>
          ))}
        </div>
      </div>

      {/* Items list */}
      <div className="rounded-xl border bg-white">
        <div className="border-b px-5 py-3">
          <span className="text-sm font-semibold">{selectedGroup || 'All Items'}</span>
          <span className="ml-2 text-xs text-muted-foreground">{filteredItems.length} items</span>
        </div>
        <div className="max-h-[500px] divide-y overflow-y-auto">
          {filteredItems.map((item) => (
            <div key={item.item_code} className="flex items-center justify-between px-5 py-2.5">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${!item.is_visible ? 'text-muted-foreground line-through' : ''}`}>
                    {item.item_name}
                  </span>
                  <span className="text-xs text-muted-foreground">{item.rate?.toFixed(2)}</span>
                </div>
                {item.description && (
                  <p className="mt-0.5 truncate text-xs text-gray-400">{item.description}</p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => openModifierAssign(item.item_code)}
                  className="rounded px-2 py-1 text-xs font-medium text-primary hover:bg-primary/5"
                  title="Manage modifiers for this item"
                >
                  Modifiers
                </button>
                <button
                  onClick={() => toggleItem(item.item_code, item.is_visible)}
                  className={`rounded-lg p-1.5 ${item.is_visible ? 'text-green-500 hover:bg-green-50' : 'text-red-400 hover:bg-red-50'}`}
                >
                  {item.is_visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modifier assignment modal */}
      {assigningItem && assigningItemData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-[500px] rounded-2xl bg-white shadow-2xl">
            <div className="border-b px-6 py-4">
              <h3 className="text-lg font-bold">Modifiers for {assigningItemData.item_name}</h3>
              <p className="text-sm text-muted-foreground">Assign modifier groups that will show when this item is added to cart</p>
            </div>

            <div className="px-6 py-4">
              {/* Currently assigned */}
              {itemModGroups.length > 0 ? (
                <div className="mb-4 space-y-2">
                  <p className="text-xs font-semibold text-gray-500">Assigned Modifier Groups</p>
                  {itemModGroups.map((img) => (
                    <div key={img.id} className="flex items-center justify-between rounded-lg border px-4 py-2.5">
                      <div>
                        <span className="text-sm font-medium">{img.group_name}</span>
                        <span className="ml-2 rounded bg-muted px-2 py-0.5 text-[10px]">{img.selection_type}</span>
                        {img.is_required ? <span className="ml-1 rounded bg-red-50 px-2 py-0.5 text-[10px] text-red-600">Required</span> : null}
                      </div>
                      <button onClick={() => handleRemoveModifier(img.id)}
                        className="rounded p-1.5 text-red-400 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mb-4 rounded-lg bg-muted/50 p-4 text-center text-sm text-muted-foreground">
                  No modifier groups assigned. Add one below.
                </p>
              )}

              {/* Add new assignment */}
              <div className="rounded-lg border bg-muted/20 p-4">
                <p className="mb-2 text-xs font-semibold text-gray-500">Add Modifier Group</p>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <select value={selectedModGroup} onChange={(e) => setSelectedModGroup(e.target.value)}
                      className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm">
                      <option value="">Select a group...</option>
                      {modifierGroups
                        .filter((mg) => !itemModGroups.some((img) => img.modifier_group_id === mg.id))
                        .map((mg) => (
                          <option key={mg.id} value={mg.id}>{mg.group_name} ({mg.selection_type})</option>
                        ))}
                    </select>
                  </div>
                  <label className="flex items-center gap-1.5 rounded-lg border border-input bg-white px-3 py-2 text-sm">
                    <input type="checkbox" checked={modRequired} onChange={(e) => setModRequired(e.target.checked)} />
                    Required
                  </label>
                  <button onClick={handleAssignModifier} disabled={!selectedModGroup}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                    Assign
                  </button>
                </div>
              </div>
            </div>

            <div className="border-t px-6 py-3">
              <button onClick={() => setAssigningItem(null)}
                className="w-full rounded-lg border border-input py-2.5 text-sm font-medium hover:bg-muted">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ==================== Printer Management ====================
function PrinterManagement() {
  const [printers, setPrinters] = useState<any[]>([])
  const [routes, setRoutes] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [pName, setPName] = useState('')
  const [pType, setPType] = useState<'network' | 'usb'>('network')
  const [pAddress, setPAddress] = useState('')
  const [pPort, setPPort] = useState(9100)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setPrinters(await window.api.printers.get())
    setRoutes(await window.api.printRoutes.get())
  }

  async function handleAddPrinter() {
    if (!pName.trim()) return
    await window.api.printers.add({ printer_name: pName, connection_type: pType, address: pAddress || null, port: pPort, paper_width: 80 })
    setShowForm(false)
    setPName('')
    setPAddress('')
    loadData()
  }

  async function handleTestPrinter(printer: any) {
    const result = await window.api.printers.test(printer)
    alert(result.success ? 'Printer test OK!' : `Test failed: ${result.error}`)
    loadData()
  }

  async function handleDeletePrinter(id: string) {
    await window.api.printers.delete(id)
    loadData()
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold">Printers & Routing</h2>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Add Printer
        </button>
      </div>

      {showForm && (
        <div className="mb-4 rounded-xl border bg-white p-5">
          <h3 className="mb-3 font-semibold">New Printer</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium">Name</label>
              <input type="text" value={pName} onChange={(e) => setPName(e.target.value)} className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="Kitchen Printer" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Type</label>
              <select value={pType} onChange={(e) => setPType(e.target.value as any)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                <option value="network">Network (IP)</option>
                <option value="usb">USB</option>
              </select>
            </div>
            {pType === 'network' && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium">IP Address</label>
                  <input type="text" value={pAddress} onChange={(e) => setPAddress(e.target.value)} className="w-full rounded-lg border border-input px-3 py-2 font-mono text-sm" placeholder="192.168.1.50" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Port</label>
                  <input type="number" value={pPort} onChange={(e) => setPPort(parseInt(e.target.value) || 9100)} className="w-full rounded-lg border border-input px-3 py-2 text-sm" />
                </div>
              </>
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={() => setShowForm(false)} className="rounded-lg border border-input px-4 py-2 text-sm hover:bg-muted">Cancel</button>
            <button onClick={handleAddPrinter} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Save</button>
          </div>
        </div>
      )}

      <div className="mb-6 rounded-xl border bg-white">
        {printers.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No printers configured.</p>
        ) : (
          <div className="divide-y">
            {printers.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <span className="font-medium">{p.printer_name}</span>
                  <span className="ml-2 rounded bg-muted px-2 py-0.5 text-[10px]">{p.connection_type}</span>
                  {p.address && <span className="ml-2 font-mono text-xs text-muted-foreground">{p.address}:{p.port}</span>}
                </div>
                <div className="flex items-center gap-1">
                  {p.test_status === 'ok' && <CheckCircle className="h-4 w-4 text-green-500" />}
                  {p.test_status === 'error' && <XCircle className="h-4 w-4 text-red-500" />}
                  <button onClick={() => handleTestPrinter(p)} className="rounded px-2 py-1 text-xs text-primary hover:bg-primary/5">Test</button>
                  <button onClick={() => handleDeletePrinter(p.id)} className="rounded p-1.5 text-red-400 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <h3 className="mb-3 font-semibold">Print Routes</h3>
      <div className="rounded-xl border bg-white">
        {routes.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No print routes configured. Add printers first, then set up routing.</p>
        ) : (
          <div className="divide-y">
            {routes.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-5 py-2">
                <span className="text-sm">
                  <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium uppercase">{r.print_type}</span>
                  <span className="ml-2">{r.item_group || r.kitchen_station || 'All'}</span>
                  <span className="ml-2 text-muted-foreground">→</span>
                  <span className="ml-2 font-medium">{r.printer_name}</span>
                </span>
                <button onClick={() => window.api.printRoutes.delete(r.id).then(loadData)} className="rounded p-1.5 text-red-400 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ==================== Order History ====================
function OrderHistory() {
  const [orders, setOrders] = useState<any[]>([])
  const [filter, setFilter] = useState('all')

  useEffect(() => { loadOrders() }, [filter])

  async function loadOrders() {
    const today = new Date().toISOString().split('T')[0]
    const filters: any = { date: today }
    if (filter !== 'all') filters.status = filter
    const data = await window.api.orders.getAll(filters)
    setOrders(data)
  }

  async function voidOrder(id: string) {
    const reason = prompt('Void reason:')
    if (!reason) return
    await window.api.orders.update(id, { status: 'Void', voidReason: reason })
    loadOrders()
  }

  return (
    <div className="max-w-3xl">
      <h2 className="mb-4 text-xl font-bold">Today's Orders</h2>

      <div className="mb-4 flex gap-2">
        {['all', 'Completed', 'Hold', 'Void'].map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1 text-xs font-medium ${filter === f ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
            {f === 'all' ? 'All' : f}
          </button>
        ))}
      </div>

      <div className="rounded-xl border bg-white">
        {orders.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No orders found.</p>
        ) : (
          <div className="divide-y">
            {orders.map((o) => (
              <div key={o.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <span className="font-mono text-sm font-medium">{o.order_number}</span>
                  <span className={`ml-2 rounded px-2 py-0.5 text-[10px] font-medium ${
                    o.status === 'Completed' ? 'bg-green-50 text-green-700' :
                    o.status === 'Hold' ? 'bg-yellow-50 text-yellow-700' :
                    o.status === 'Void' ? 'bg-red-50 text-red-700' : 'bg-muted'
                  }`}>{o.status}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{o.order_type}</span>
                  {o.table_name && <span className="ml-1 text-xs text-muted-foreground">• {o.table_name}</span>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-medium">{(o.grand_total || 0).toFixed(2)}</span>
                  <span className="text-xs text-muted-foreground">{o.cashier_name}</span>
                  {(o.status === 'Completed' || o.status === 'Hold' || o.status === 'Open') && (
                    <div className="flex gap-1">
                      <button onClick={() => window.api.print.kots(o.id)} className="rounded px-2 py-1 text-xs text-orange-600 hover:bg-orange-50">Reprint KOT</button>
                      {o.status === 'Completed' && (
                        <>
                          <button onClick={() => window.api.print.receipt(o.id)} className="rounded px-2 py-1 text-xs text-primary hover:bg-primary/5">Reprint Receipt</button>
                          <button onClick={() => voidOrder(o.id)} className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50">Void</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ==================== Sync Dashboard ====================
function SyncDashboard() {
  const [status, setStatus] = useState<any>(null)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => { loadStatus() }, [])

  async function loadStatus() {
    const s = await window.api.sync.status()
    setStatus(s)
  }

  async function handleSync() {
    setSyncing(true)
    await window.api.sync.run()
    await loadStatus()
    setSyncing(false)
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold">Sync Status</h2>
        <button onClick={handleSync} disabled={syncing} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border bg-white p-5">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Last sync:</span>
              <span className="ml-2 font-medium">{status?.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : 'Never'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Status:</span>
              <span className={`ml-2 font-medium ${status?.isSyncing ? 'text-yellow-600' : 'text-green-600'}`}>
                {status?.isSyncing ? 'Syncing...' : 'Idle'}
              </span>
            </div>
          </div>
        </div>

        {status?.lastResult && (
          <>
            <div className="rounded-xl border bg-white p-5">
              <h3 className="mb-2 font-semibold">Sync Down (ERPNext → Desktop)</h3>
              {status.lastResult.down?.success ? (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  <span>
                    {status.lastResult.down.counts && Object.entries(status.lastResult.down.counts).map(([k, v]) => `${k}: ${v}`).join(', ')}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-red-500">
                  <XCircle className="h-4 w-4" />
                  <span>{status.lastResult.down?.error || 'Failed'}</span>
                </div>
              )}
            </div>

            <div className="rounded-xl border bg-white p-5">
              <h3 className="mb-2 font-semibold">Sync Up (Desktop → ERPNext)</h3>
              <div className="text-sm">
                <span className="text-green-600">Synced: {status.lastResult.up?.synced || 0}</span>
                {(status.lastResult.up?.failed || 0) > 0 && (
                  <span className="ml-3 text-red-500">Failed: {status.lastResult.up.failed}</span>
                )}
              </div>
              {status.lastResult.up?.errors?.length > 0 && (
                <div className="mt-2 space-y-1">
                  {status.lastResult.up.errors.map((e: string, i: number) => (
                    <p key={i} className="text-xs text-red-500">{e}</p>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ==================== Session Management ====================
// ==================== Shift History ====================
function ShiftHistory() {
  const [sessions, setSessions] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)

  useEffect(() => { loadSessions() }, [])

  async function loadSessions() {
    const data = await window.api.sessions.getAll(50)
    setSessions(data)
  }

  return (
    <div className="max-w-3xl">
      <h2 className="mb-4 text-xl font-bold">Shift History</h2>

      <div className="flex gap-4">
        {/* Shift list */}
        <div className="flex-1 rounded-xl border bg-white">
          {sessions.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No shifts yet.</p>
          ) : (
            <div className="divide-y">
              {sessions.map((s) => {
                const opened = new Date(s.opened_at + 'Z')
                const closed = s.closed_at ? new Date(s.closed_at + 'Z') : null
                return (
                  <button key={s.id} onClick={() => setSelected(s)}
                    className={`flex w-full items-center justify-between px-5 py-3 text-left hover:bg-gray-50 ${selected?.id === s.id ? 'bg-primary/5' : ''}`}>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold">{s.user_name}</span>
                        <span className={`rounded-lg px-2 py-0.5 text-[10px] font-bold ${s.status === 'Open' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                          {s.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400">
                        {opened.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} {opened.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        {closed && ` — ${closed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold">{(s.total_sales || 0).toFixed(2)}</span>
                      <p className="text-xs text-gray-400">{s.total_orders || 0} orders</p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Shift detail */}
        {selected && (
          <div className="w-[320px] rounded-xl border bg-white p-5">
            <h3 className="mb-3 font-bold">Shift Detail</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Cashier</span><span className="font-medium">{selected.user_name}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Status</span><span className="font-medium">{selected.status}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Orders</span><span className="font-medium">{selected.total_orders || 0}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Total Sales</span><span className="font-bold text-primary">{(selected.total_sales || 0).toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Opening Cash</span><span>{(selected.opening_cash || 0).toFixed(2)}</span></div>
              {selected.closing_cash !== null && (
                <div className="flex justify-between"><span className="text-gray-500">Closing Cash</span><span>{(selected.closing_cash || 0).toFixed(2)}</span></div>
              )}
            </div>

            {/* Payment breakdown */}
            {selected.payment_breakdown && (
              <div className="mt-4">
                <h4 className="mb-2 text-xs font-bold text-gray-400 uppercase">Payment Breakdown</h4>
                <div className="space-y-1">
                  {Object.entries(JSON.parse(selected.payment_breakdown)).map(([method, amount]: [string, any]) => (
                    <div key={method} className="flex justify-between text-sm">
                      <span className="text-gray-500">{method}</span>
                      <span className="font-medium">{amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Remarks */}
            {selected.remarks && (
              <div className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
                <strong>Remarks:</strong> {selected.remarks}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ==================== Reports Dashboard ====================
function ReportsDashboard() {
  const [orders, setOrders] = useState<any[]>([])
  const [sessions, setSessions] = useState<any[]>([])
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month'>('today')

  useEffect(() => { loadData() }, [dateRange])

  async function loadData() {
    const today = new Date().toISOString().split('T')[0]
    const allOrders = await window.api.orders.getAll({ date: today })
    setOrders(allOrders)
    const allSessions = await window.api.sessions.getAll(20)
    setSessions(allSessions)
  }

  const completedOrders = orders.filter((o) => o.status === 'Completed')
  const voidedOrders = orders.filter((o) => o.status === 'Void')
  const totalSales = completedOrders.reduce((s, o) => s + (o.grand_total || 0), 0)
  const totalOrders = completedOrders.length
  const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0

  // Top items
  const [topItems, setTopItems] = useState<{ name: string; qty: number; amount: number }[]>([])
  useEffect(() => {
    async function loadTopItems() {
      const itemCounts: Record<string, { name: string; qty: number; amount: number }> = {}
      for (const order of completedOrders) {
        const items = await window.api.orderItems.get(order.id)
        for (const item of items) {
          if (!itemCounts[item.item_code]) {
            itemCounts[item.item_code] = { name: item.item_name, qty: 0, amount: 0 }
          }
          itemCounts[item.item_code].qty += item.qty
          itemCounts[item.item_code].amount += item.amount
        }
      }
      const sorted = Object.values(itemCounts).sort((a, b) => b.qty - a.qty).slice(0, 10)
      setTopItems(sorted)
    }
    if (completedOrders.length > 0) loadTopItems()
  }, [completedOrders.length])

  // Payment method breakdown
  const [paymentBreakdown, setPaymentBreakdown] = useState<Record<string, number>>({})
  useEffect(() => {
    async function loadPayments() {
      const breakdown: Record<string, number> = {}
      for (const order of completedOrders) {
        const payments = await window.api.orderPayments.get(order.id)
        for (const p of payments) {
          breakdown[p.payment_method] = (breakdown[p.payment_method] || 0) + p.amount
        }
      }
      setPaymentBreakdown(breakdown)
    }
    if (completedOrders.length > 0) loadPayments()
  }, [completedOrders.length])

  // Hourly sales
  const hourlySales: Record<string, number> = {}
  for (const order of completedOrders) {
    const hour = new Date(order.created_at + 'Z').getHours()
    const label = `${String(hour).padStart(2, '0')}:00`
    hourlySales[label] = (hourlySales[label] || 0) + (order.grand_total || 0)
  }

  return (
    <div className="max-w-4xl">
      <h2 className="mb-4 text-xl font-bold">Dashboard</h2>

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-4 gap-3">
        <div className="rounded-xl bg-white border p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase">Total Sales</p>
          <p className="mt-1 text-2xl font-bold text-primary">{totalSales.toFixed(2)}</p>
        </div>
        <div className="rounded-xl bg-white border p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase">Orders</p>
          <p className="mt-1 text-2xl font-bold text-gray-800">{totalOrders}</p>
        </div>
        <div className="rounded-xl bg-white border p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase">Avg Order Value</p>
          <p className="mt-1 text-2xl font-bold text-gray-800">{avgOrderValue.toFixed(2)}</p>
        </div>
        <div className="rounded-xl bg-white border p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase">Voided</p>
          <p className="mt-1 text-2xl font-bold text-red-500">{voidedOrders.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Payment breakdown */}
        <div className="rounded-xl border bg-white p-5">
          <h3 className="mb-3 text-sm font-bold text-gray-500 uppercase">Payment Methods</h3>
          {Object.entries(paymentBreakdown).length === 0 ? (
            <p className="text-sm text-gray-400">No data</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(paymentBreakdown).map(([method, amount]) => (
                <div key={method} className="flex items-center justify-between">
                  <span className="text-sm font-medium">{method}</span>
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-32 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${totalSales > 0 ? (amount / totalSales) * 100 : 0}%` }} />
                    </div>
                    <span className="text-sm font-bold w-20 text-right">{amount.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top selling items */}
        <div className="rounded-xl border bg-white p-5">
          <h3 className="mb-3 text-sm font-bold text-gray-500 uppercase">Top Items</h3>
          {topItems.length === 0 ? (
            <p className="text-sm text-gray-400">No data</p>
          ) : (
            <div className="space-y-2">
              {topItems.map((item, idx) => (
                <div key={item.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-[10px] font-bold text-gray-500">{idx + 1}</span>
                    <span className="text-sm font-medium">{item.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold">{item.amount.toFixed(2)}</span>
                    <span className="ml-2 text-xs text-gray-400">x{item.qty}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Hourly sales */}
        <div className="rounded-xl border bg-white p-5 col-span-2">
          <h3 className="mb-3 text-sm font-bold text-gray-500 uppercase">Sales by Hour</h3>
          {Object.keys(hourlySales).length === 0 ? (
            <p className="text-sm text-gray-400">No data</p>
          ) : (
            <div className="flex items-end gap-1 h-32">
              {Object.entries(hourlySales).sort().map(([hour, amount]) => {
                const maxSale = Math.max(...Object.values(hourlySales))
                const height = maxSale > 0 ? (amount / maxSale) * 100 : 0
                return (
                  <div key={hour} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[9px] font-bold text-gray-500">{amount.toFixed(0)}</span>
                    <div className="w-full rounded-t bg-primary/80" style={{ height: `${height}%`, minHeight: '2px' }} />
                    <span className="text-[9px] text-gray-400">{hour}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
