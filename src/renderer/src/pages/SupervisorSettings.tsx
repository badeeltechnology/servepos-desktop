import { useState, useEffect } from 'react'
import { useAuthStore } from '../stores/auth'
import {
  Users, Settings, Printer, Package, LayoutGrid, ClipboardList,
  Plus, Trash2, Edit3, Eye, EyeOff, Save, RefreshCw, ArrowLeft,
  CheckCircle, XCircle, AlertCircle, ChevronDown
} from 'lucide-react'

type Tab = 'users' | 'modifiers' | 'items' | 'printers' | 'sync' | 'orders' | 'session'

export default function SupervisorSettings({ onBack }: { onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>('users')
  const user = useAuthStore((s) => s.user)

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'users', label: 'Cashiers', icon: <Users className="h-4 w-4" /> },
    { key: 'modifiers', label: 'Modifiers', icon: <Package className="h-4 w-4" /> },
    { key: 'items', label: 'Item Visibility', icon: <LayoutGrid className="h-4 w-4" /> },
    { key: 'printers', label: 'Printers', icon: <Printer className="h-4 w-4" /> },
    { key: 'orders', label: 'Order History', icon: <ClipboardList className="h-4 w-4" /> },
    { key: 'sync', label: 'Sync', icon: <RefreshCw className="h-4 w-4" /> },
    { key: 'session', label: 'Session', icon: <Settings className="h-4 w-4" /> }
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
        {activeTab === 'session' && <SessionManagement />}
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
  const [groupName, setGroupName] = useState('')
  const [selType, setSelType] = useState('Single')
  const [isRequired, setIsRequired] = useState(false)
  const [maxSel, setMaxSel] = useState(0)
  const [showModForm, setShowModForm] = useState<string | null>(null)
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

  // Simplified CRUD — directly use DB queries via IPC
  // For a complete implementation, we'd add IPC handlers for modifier CRUD
  // For now, showing the UI structure

  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold">Modifier Groups</h2>
        <button onClick={() => setShowGroupForm(true)} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Add Group
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border bg-white p-8 text-center text-sm text-muted-foreground">
          No modifier groups yet. Add groups like "Spice Level", "Add-ons", "Size".
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
                </div>
              </div>
              <div className="p-3">
                {(modifiers[g.id] || []).map((m) => (
                  <div key={m.id} className="flex items-center justify-between rounded-lg px-3 py-1.5 hover:bg-muted/50">
                    <span className="text-sm">{m.modifier_name}</span>
                    <span className="text-xs font-medium text-muted-foreground">
                      {m.price > 0 ? `+${m.price.toFixed(2)}` : 'Free'}
                    </span>
                  </div>
                ))}
                {(modifiers[g.id] || []).length === 0 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No modifiers in this group</p>
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

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const g = await window.api.itemGroups.getAll()
    const i = await window.api.items.getAll()
    setGroups(g)
    setItems(i)
  }

  async function toggleGroup(name: string, visible: boolean) {
    await window.api.items.setGroupVisibility(name, !visible)
    loadData()
  }

  async function toggleItem(code: string, visible: boolean) {
    await window.api.items.setVisibility(code, !visible)
    loadData()
  }

  const filteredItems = selectedGroup ? items.filter((i) => i.item_group === selectedGroup) : items

  return (
    <div className="max-w-3xl">
      <h2 className="mb-4 text-xl font-bold">Item Visibility</h2>

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

      <div className="rounded-xl border bg-white">
        <div className="border-b px-5 py-3">
          <span className="text-sm font-semibold">{selectedGroup || 'All Items'}</span>
          <span className="ml-2 text-xs text-muted-foreground">{filteredItems.length} items</span>
        </div>
        <div className="max-h-[500px] divide-y overflow-y-auto">
          {filteredItems.map((item) => (
            <div key={item.item_code} className="flex items-center justify-between px-5 py-2">
              <div>
                <span className={`text-sm ${!item.is_visible ? 'text-muted-foreground line-through' : ''}`}>
                  {item.item_name}
                </span>
                <span className="ml-2 text-xs text-muted-foreground">{item.rate?.toFixed(2)}</span>
              </div>
              <button
                onClick={() => toggleItem(item.item_code, item.is_visible)}
                className={`rounded-lg p-1.5 ${item.is_visible ? 'text-green-500 hover:bg-green-50' : 'text-red-400 hover:bg-red-50'}`}
              >
                {item.is_visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </button>
            </div>
          ))}
        </div>
      </div>
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
                  {o.status === 'Completed' && (
                    <div className="flex gap-1">
                      <button onClick={() => window.api.print.receipt(o.id)} className="rounded px-2 py-1 text-xs text-primary hover:bg-primary/5">Reprint</button>
                      <button onClick={() => voidOrder(o.id)} className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50">Void</button>
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
function SessionManagement() {
  const user = useAuthStore((s) => s.user)
  const [session, setSession] = useState<any>(null)
  const [openingCash, setOpeningCash] = useState(0)

  useEffect(() => {
    // Check for active session
    // For now, placeholder
  }, [])

  return (
    <div className="max-w-2xl">
      <h2 className="mb-4 text-xl font-bold">Session Management</h2>

      <div className="rounded-xl border bg-white p-6">
        {!session ? (
          <div>
            <h3 className="mb-3 font-semibold">Open New Shift</h3>
            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium">Opening Cash Balance</label>
              <input type="number" value={openingCash} onChange={(e) => setOpeningCash(parseFloat(e.target.value) || 0)} className="w-48 rounded-lg border border-input px-3 py-2 text-sm" min={0} step={0.01} />
            </div>
            <button className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              Open Shift
            </button>
          </div>
        ) : (
          <div>
            <h3 className="mb-3 font-semibold">Current Shift</h3>
            <p className="text-sm text-muted-foreground">Shift management with close/reconcile will be here.</p>
          </div>
        )}
      </div>
    </div>
  )
}
