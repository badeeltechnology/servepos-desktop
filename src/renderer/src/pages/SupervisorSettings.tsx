import { useState, useEffect } from 'react'
import { useAuthStore } from '../stores/auth'
import {
  Users, Settings, Printer, Package, LayoutGrid, ClipboardList,
  Plus, Trash2, Edit3, Eye, EyeOff, Save, RefreshCw, ArrowLeft,
  CheckCircle, XCircle, AlertCircle, ChevronDown, BarChart3, Clock,
  Download, Upload, HardDrive
} from 'lucide-react'

type Tab = 'users' | 'waiters' | 'waiter-orders' | 'modifiers' | 'items' | 'printers' | 'sync' | 'orders' | 'shifts' | 'reports' | 'backup'

export default function SupervisorSettings({ onBack }: { onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>('users')
  const user = useAuthStore((s) => s.user)

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'reports', label: 'Dashboard', icon: <BarChart3 className="h-4 w-4" /> },
    { key: 'users', label: 'Cashiers', icon: <Users className="h-4 w-4" /> },
    { key: 'waiters', label: 'Waiters', icon: <Users className="h-4 w-4" /> },
    { key: 'waiter-orders', label: 'Waiter Orders', icon: <ClipboardList className="h-4 w-4" /> },
    { key: 'modifiers', label: 'Modifiers', icon: <Package className="h-4 w-4" /> },
    { key: 'items', label: 'Items & Modifiers', icon: <LayoutGrid className="h-4 w-4" /> },
    { key: 'printers', label: 'Printers', icon: <Printer className="h-4 w-4" /> },
    { key: 'orders', label: 'Order History', icon: <ClipboardList className="h-4 w-4" /> },
    { key: 'shifts', label: 'Shift History', icon: <Clock className="h-4 w-4" /> },
    { key: 'sync', label: 'Sync', icon: <RefreshCw className="h-4 w-4" /> },
    { key: 'backup', label: 'Backup', icon: <HardDrive className="h-4 w-4" /> }
  ]

  return (
    <div className="flex h-screen bg-n-cream">
      <div className="flex w-56 flex-shrink-0 flex-col bg-n-deep text-white">
        <div className="border-b border-n-dim p-4">
          <button onClick={onBack} className="press flex h-11 items-center gap-2 rounded-md bg-n-rail pl-2 pr-3 text-sm font-semibold text-white">
            <ArrowLeft className="h-4 w-4" />
            Back to POS
          </button>
          <h1 className="cond mt-4 text-[28px] font-bold leading-none">Settings</h1>
          <p className="mt-1 text-xs text-n-mist">{user?.name ? `Signed in as ${user.name}` : 'Supervisor'}</p>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`mb-0.5 flex h-11 w-full items-center gap-2.5 rounded-md px-3 text-sm ${
                activeTab === tab.key
                  ? 'bg-white font-semibold text-n-deep'
                  : 'text-n-frost hover:bg-n-rail'
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
        {activeTab === 'waiters' && <WaiterManagement />}
        {activeTab === 'waiter-orders' && <WaiterOrders />}
        {activeTab === 'modifiers' && <ModifierManagement />}
        {activeTab === 'items' && <ItemVisibility />}
        {activeTab === 'printers' && <PrinterManagement />}
        {activeTab === 'orders' && <OrderHistory />}
        {activeTab === 'sync' && <SyncDashboard />}
        {activeTab === 'shifts' && <ShiftHistory />}
        {activeTab === 'reports' && <ReportsDashboard />}
        {activeTab === 'backup' && <BackupRestore />}
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
  const [userRole, setUserRole] = useState<'cashier' | 'coordinator'>('cashier')
  const [maxDiscount, setMaxDiscount] = useState(0)
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => { loadUsers() }, [])

  async function loadUsers() {
    const cashiers = await window.api.users.getAll('cashier')
    const coordinators = await window.api.users.getAll('coordinator')
    setUsers([...cashiers, ...coordinators])
  }

  async function handleSave() {
    if (!name.trim() || (pin.length < 6 && !editingId)) return
    if (editingId) {
      const updates: any = { name: name.trim(), maxDiscountPct: maxDiscount }
      if (pin) updates.pin = pin
      await window.api.users.update(editingId, updates)
    } else {
      await window.api.users.create(name.trim(), pin, userRole, { maxDiscountPct: userRole === 'cashier' ? maxDiscount : 0 })
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
    setUserRole(u.role === 'coordinator' ? 'coordinator' : 'cashier')
    setMaxDiscount(u.max_discount_pct)
    setShowForm(true)
  }

  function resetForm() {
    setShowForm(false)
    setEditingId(null)
    setName('')
    setPin('')
    setUserRole('cashier')
    setMaxDiscount(0)
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="cond text-[30px] font-bold leading-none text-n-deep">User Management</h2>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Add User
        </button>
      </div>

      {showForm && (
        <div className="mb-4 rounded-md border bg-white p-5">
          <h3 className="mb-3 font-semibold">{editingId ? 'Edit User' : 'New User'}</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium">Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Role</label>
              <select value={userRole} onChange={(e) => setUserRole(e.target.value as any)} className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="cashier">Cashier</option>
                <option value="coordinator">Coordinator</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">PIN (6-8 digits){editingId ? ' — leave blank to keep' : ''}</label>
              <input type="password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" inputMode="numeric" />
            </div>
            {userRole === 'cashier' && (
              <div>
                <label className="mb-1 block text-xs font-medium">Max Discount %</label>
                <input type="number" value={maxDiscount} onChange={(e) => setMaxDiscount(parseFloat(e.target.value) || 0)} className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" min={0} max={100} />
              </div>
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={resetForm} className="rounded-lg border border-input px-4 py-2 text-sm hover:bg-muted">Cancel</button>
            <button onClick={handleSave} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Save</button>
          </div>
        </div>
      )}

      <div className="rounded-md border bg-white">
        {users.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No users yet. Add one above.</p>
        ) : (
          <div className="divide-y">
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <span className={`font-medium ${!u.is_active ? 'text-muted-foreground line-through' : ''}`}>{u.name}</span>
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${u.role === 'coordinator' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{u.role}</span>
                  {u.role === 'cashier' && <span className="ml-2 text-xs text-muted-foreground">Max disc: {u.max_discount_pct}%</span>}
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

// ==================== Waiter Management ====================
function WaiterManagement() {
  const [waiters, setWaiters] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [wName, setWName] = useState('')
  const [wPin, setWPin] = useState('')
  const [wPhone, setWPhone] = useState('')
  const [editingPin, setEditingPin] = useState<string | null>(null)
  const [newPin, setNewPin] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const result = await window.api.waiters.fetchFromServer()
      if (result.success) {
        setWaiters(result.waiters || [])
      } else {
        setError(result.error || 'Failed to fetch waiters')
      }
    } catch (e: any) {
      setError(e.message || 'Failed to fetch waiters')
    }
    setLoading(false)
  }

  async function generateQR() {
    const result = await window.api.app.generateWaiterQR()
    if (result.dataUrl) setQrDataUrl(result.dataUrl)
    else alert(result.error || 'Failed to generate QR code')
  }

  async function handleCreateWaiter() {
    setError(''); setSuccess('')
    if (!wName.trim()) { setError('Name is required'); return }
    if (wPin.length < 4 || wPin.length > 8) { setError('PIN must be 4-8 digits'); return }
    if (!/^\d+$/.test(wPin)) { setError('PIN must be numbers only'); return }

    try {
      const res = await window.api.waiters.create({ waiter_name: wName.trim(), pin: wPin, phone: wPhone.trim() || undefined })
      if (!res.success) { setError(res.error || 'Failed to create waiter'); return }
      setShowAdd(false); setWName(''); setWPin(''); setWPhone('')
      setSuccess('Waiter created')
      loadData()
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function handleResetPin(waiterName: string) {
    setError(''); setSuccess('')
    if (newPin.length < 4 || newPin.length > 8) { setError('PIN must be 4-8 digits'); return }
    if (!/^\d+$/.test(newPin)) { setError('PIN must be numbers only'); return }

    try {
      const res = await window.api.waiters.resetPin(waiterName, newPin)
      if (!res.success) { setError(res.error || 'Failed to update PIN'); return }
      setEditingPin(null); setNewPin('')
      setSuccess('PIN updated')
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function handleDeleteWaiter(waiterName: string) {
    if (!confirm(`Delete waiter "${waiterName}"?`)) return
    try {
      await window.api.waiters.toggleActive(waiterName, false)
      loadData()
    } catch {}
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="cond text-[30px] font-bold leading-none text-n-deep">Waiter Management</h2>
        <div className="flex gap-2">
          <button onClick={generateQR} className="flex items-center gap-1.5 rounded-lg border-2 border-primary/30 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/5">
            QR Code
          </button>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4" /> Add Waiter
          </button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {success && <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>}

      {/* QR Code Modal */}
      {qrDataUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setQrDataUrl(null)}>
          <div className="rounded-md bg-white p-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2 text-center text-lg font-bold">Waiter App QR Code</h3>
            <p className="mb-4 text-center text-sm text-muted-foreground">Scan this from the ServePOS Waiter app</p>
            <img src={qrDataUrl} alt="QR Code" className="mx-auto h-64 w-64" />
            <p className="mt-4 text-center text-xs text-muted-foreground">Contains server URL and API credentials</p>
            <button onClick={() => setQrDataUrl(null)} className="mt-4 w-full rounded-lg border border-input py-2 text-sm hover:bg-muted">Close</button>
          </div>
        </div>
      )}

      {/* Add Waiter Form */}
      {showAdd && (
        <div className="mb-4 rounded-md border bg-white p-5">
          <h3 className="mb-3 font-semibold">New Waiter</h3>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium">Name</label>
              <input type="text" value={wName} onChange={(e) => setWName(e.target.value)} className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="e.g., Ahmad" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">PIN (4-8 digits)</label>
              <input type="password" value={wPin} onChange={(e) => setWPin(e.target.value.replace(/\D/g, '').slice(0, 8))} className="w-full rounded-lg border border-input px-3 py-2 text-center font-mono text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-primary" placeholder="••••" inputMode="numeric" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Phone (optional)</label>
              <input type="text" value={wPhone} onChange={(e) => setWPhone(e.target.value)} className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="+974..." />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={() => setShowAdd(false)} className="rounded-lg border border-input px-4 py-2 text-sm hover:bg-muted">Cancel</button>
            <button onClick={handleCreateWaiter} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Create Waiter</button>
          </div>
        </div>
      )}

      {/* Waiters List */}
      <div className="rounded-md border bg-white">
        {loading ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Loading waiters...</p>
        ) : waiters.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No waiters yet. Create waiters so they can take orders from the mobile app.</p>
        ) : (
          <div className="divide-y">
            {waiters.map((w) => (
              <div key={w.name} className="flex items-center justify-between px-5 py-3">
                <div>
                  <span className="font-medium">{w.waiter_name}</span>
                  {w.phone && <span className="ml-2 text-xs text-muted-foreground">{w.phone}</span>}
                </div>
                <div className="flex items-center gap-2">
                  {editingPin === w.name ? (
                    <div className="flex items-center gap-2">
                      <input type="password" value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                        className="w-24 rounded-lg border border-input px-2 py-1 text-center font-mono text-sm tracking-widest" placeholder="New PIN" inputMode="numeric" autoFocus />
                      <button onClick={() => handleResetPin(w.name)} className="rounded px-2 py-1 text-xs font-medium text-primary hover:bg-primary/5">Save</button>
                      <button onClick={() => { setEditingPin(null); setNewPin('') }} className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted">Cancel</button>
                    </div>
                  ) : (
                    <>
                      <button onClick={() => setEditingPin(w.name)} className="rounded px-2 py-1 text-xs text-primary hover:bg-primary/5">Reset PIN</button>
                      <button onClick={() => handleDeleteWaiter(w.name)} className="rounded p-1.5 text-red-400 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>
                    </>
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

// ==================== Waiter Orders ====================
function WaiterOrders() {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)

  useEffect(() => { loadOrders() }, [])

  // Poll every 10 seconds
  useEffect(() => {
    const timer = setInterval(loadOrders, 10000)
    return () => clearInterval(timer)
  }, [])

  const [fetchError, setFetchError] = useState('')

  async function loadOrders() {
    try {
      setFetchError('')
      const data = await window.api.waiterOrders.getPending()
      setOrders(data || [])
    } catch (e: any) {
      setFetchError(e?.message || 'Failed to fetch waiter orders')
    }
    setLoading(false)
  }

  async function handleAccept(name: string) {
    setProcessing(name)
    const result = await window.api.waiterOrders.accept(name)
    if (result.success) {
      loadOrders()
    } else {
      alert('Failed to accept: ' + (result.error || 'Unknown error'))
    }
    setProcessing(null)
  }

  async function handleReject(name: string) {
    if (!confirm('Reject this waiter order?')) return
    setProcessing(name)
    const result = await window.api.waiterOrders.reject(name)
    if (result.success) {
      loadOrders()
    } else {
      alert('Failed to reject: ' + (result.error || 'Unknown error'))
    }
    setProcessing(null)
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="cond text-[30px] font-bold leading-none text-n-deep">Waiter Orders</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Auto-refreshes every 10s</span>
          <button onClick={loadOrders} className="flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-xs font-medium hover:bg-muted">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </div>

      {fetchError && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <strong>Error:</strong> {fetchError}
        </div>
      )}

      {loading ? (
        <div className="rounded-md border bg-white p-8 text-center text-sm text-muted-foreground">Loading...</div>
      ) : orders.length === 0 && !fetchError ? (
        <div className="rounded-md border bg-white p-8 text-center">
          <ClipboardList className="mx-auto mb-3 h-12 w-12 text-gray-200" />
          <p className="text-sm text-muted-foreground">No pending waiter orders</p>
          <p className="text-xs text-muted-foreground">Orders from the waiter app will appear here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((wo: any) => (
            <div key={wo.name} className="rounded-md border-2 border-orange-200 bg-white overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between bg-orange-50 px-5 py-3">
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-700">{wo.name}</span>
                  <span className="text-sm font-semibold">Waiter: {wo.waiter_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{wo.order_type}</span>
                  {wo.table && <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">Table: {wo.table}</span>}
                  {wo.guests > 0 && <span className="text-xs text-muted-foreground">Guests: {wo.guests}</span>}
                </div>
              </div>

              {/* Items */}
              <div className="px-5 py-3">
                <div className="mb-2 flex justify-between text-xs font-semibold text-gray-500">
                  <span>Qty  Item</span>
                  <span>Amount</span>
                </div>
                {(wo.items || []).map((item: any, i: number) => (
                  <div key={i} className="flex justify-between py-1 text-sm">
                    <div>
                      <span className="font-medium">{item.qty}x  {item.item_name}</span>
                      {item.special_instructions && (
                        <p className="text-xs text-gray-500 italic">"{item.special_instructions}"</p>
                      )}
                    </div>
                    <span className="font-medium">{((item.rate + (item.modifier_total || 0)) * item.qty).toFixed(2)}</span>
                  </div>
                ))}
                <div className="mt-2 flex justify-between border-t pt-2">
                  <span className="font-bold">Total</span>
                  <span className="font-bold text-primary">
                    {(wo.items || []).reduce((s: number, i: any) => s + ((i.rate + (i.modifier_total || 0)) * i.qty), 0).toFixed(2)} QAR
                  </span>
                </div>
                {wo.notes && <p className="mt-2 text-xs text-gray-500">Notes: {wo.notes}</p>}
              </div>

              {/* Actions */}
              <div className="flex gap-2 border-t bg-gray-50 px-5 py-3">
                <button
                  onClick={() => handleAccept(wo.name)}
                  disabled={processing === wo.name}
                  className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {processing === wo.name ? 'Processing...' : 'Accept & Print KOT'}
                </button>
                <button
                  onClick={() => handleReject(wo.name)}
                  disabled={processing === wo.name}
                  className="rounded-lg border-2 border-red-200 px-6 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ==================== Modifier Management (Read-only — synced from ERPNext) ====================
function ModifierManagement() {
  const [groups, setGroups] = useState<any[]>([])
  const [modifiers, setModifiers] = useState<Record<string, any[]>>({})

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

  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="cond text-[30px] font-bold leading-none text-n-deep">Modifier Groups</h2>
        <span className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700">Managed in ERPNext</span>
      </div>

      <p className="mb-4 text-sm text-muted-foreground">
        Modifier groups and item assignments are synced from ERPNext. To add or edit modifiers, update them in ERPNext and sync.
      </p>

      {groups.length === 0 ? (
        <div className="rounded-md border bg-white p-8 text-center text-sm text-muted-foreground">
          No modifier groups synced yet. Create modifier groups in ERPNext and sync.
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.id} className="rounded-md border bg-white">
              <div className="flex items-center justify-between border-b px-5 py-3">
                <div>
                  <span className="font-semibold">{g.group_name}</span>
                  <span className="ml-2 rounded bg-muted px-2 py-0.5 text-[10px] font-medium">{g.selection_type}</span>
                  {g.is_required ? <span className="ml-1 rounded bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600">Required</span> : null}
                  {g.max_selections > 0 && <span className="ml-1 text-xs text-muted-foreground">Max: {g.max_selections}</span>}
                </div>
                {g.erpnext_name && <span className="text-[10px] text-muted-foreground">Synced</span>}
              </div>

              <div className="p-3">
                {(modifiers[g.id] || []).map((m) => (
                  <div key={m.id} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-muted/50">
                    <span className="text-sm font-medium">{m.modifier_name}</span>
                    <span className={`text-xs font-semibold ${m.price > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                      {m.price > 0 ? `+${m.price.toFixed(2)}` : 'Free'}
                    </span>
                  </div>
                ))}
                {(modifiers[g.id] || []).length === 0 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No modifiers in this group.</p>
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
  }

  const filteredItems = selectedGroup ? items.filter((i) => i.item_group === selectedGroup) : items
  const assigningItemData = assigningItem ? items.find((i) => i.item_code === assigningItem) : null

  return (
    <div className="max-w-3xl">
      <h2 className="cond mb-4 text-[30px] font-bold leading-none text-n-deep">Items & Modifiers</h2>

      {/* Group filter */}
      <div className="mb-4 rounded-md border bg-white p-4">
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
      <div className="rounded-md border bg-white">
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

      {/* Modifier assignment modal (read-only — synced from ERPNext) */}
      {assigningItem && assigningItemData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-[450px] rounded-md bg-white shadow-2xl">
            <div className="border-b px-6 py-4">
              <h3 className="text-lg font-bold">Modifiers for {assigningItemData.item_name}</h3>
              <p className="text-sm text-muted-foreground">Modifier assignments are managed in ERPNext</p>
            </div>

            <div className="max-h-[400px] overflow-y-auto px-6 py-4">
              {itemModGroups.length === 0 ? (
                <p className="rounded-lg bg-muted/50 p-4 text-center text-sm text-muted-foreground">
                  No modifier groups assigned. Assign modifiers to this item in ERPNext and sync.
                </p>
              ) : (
                <div className="space-y-2">
                  {itemModGroups.map((img) => (
                    <div key={img.id} className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
                      <div>
                        <span className="text-sm font-medium">{img.group_name}</span>
                        <span className="ml-2 rounded bg-muted px-2 py-0.5 text-[10px]">{img.selection_type}</span>
                      </div>
                      <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${img.is_required ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
                        {img.is_required ? 'Required' : 'Optional'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t px-6 py-3">
              <button onClick={() => setAssigningItem(null)}
                className="w-full rounded-lg border border-input py-2.5 text-sm font-medium hover:bg-muted">
                Close
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
  const [usbDevices, setUsbDevices] = useState<any[]>([])
  const [detecting, setDetecting] = useState(false)
  const [showRouteForm, setShowRouteForm] = useState(false)
  const [routeType, setRouteType] = useState<'receipt' | 'kot'>('receipt')
  const [routePrinter, setRoutePrinter] = useState('')
  const [routeItemGroups, setRouteItemGroups] = useState<string[]>([])
  const [showGroupDropdown, setShowGroupDropdown] = useState(false)
  const [itemGroups, setItemGroups] = useState<any[]>([])

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setPrinters(await window.api.printers.get())
    setRoutes(await window.api.printRoutes.get())
    setItemGroups(await window.api.itemGroups.getAll())
  }

  async function handleDetectUsb() {
    setDetecting(true)
    const devices = await window.api.printers.discoverUsb()
    setUsbDevices(devices)
    if (devices.length === 1) {
      setPAddress(devices[0].name) // Use printer name for Windows spooler API
      if (!pName.trim()) setPName(devices[0].name)
    }
    setDetecting(false)
  }

  async function handleAddPrinter() {
    if (!pName.trim()) return
    if (pType === 'usb' && !pAddress.trim()) return
    await window.api.printers.add({
      printer_name: pName, connection_type: pType,
      address: pAddress || null,
      port: pPort, paper_width: 80,
      usb_vendor_id: null, usb_product_id: null
    })
    setShowForm(false)
    setPName('')
    setPAddress('')
    setUsbDevices([])
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
        <h2 className="cond text-[30px] font-bold leading-none text-n-deep">Printers & Routing</h2>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Add Printer
        </button>
      </div>

      {showForm && (
        <div className="mb-4 rounded-md border bg-white p-5">
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
            {pType === 'usb' && (
              <>
                <div className="col-span-2">
                  <button onClick={handleDetectUsb} disabled={detecting}
                    className="mb-2 rounded-lg border-2 border-dashed border-primary/30 px-4 py-2 text-xs font-medium text-primary hover:bg-primary/5 disabled:opacity-50">
                    {detecting ? 'Detecting...' : 'Detect Printers'}
                  </button>
                  {usbDevices.length > 0 && (
                    <div className="mb-2 space-y-1">
                      {usbDevices.map((d, i) => (
                        <button key={i} onClick={() => { setPAddress(d.name); if (!pName.trim()) setPName(d.name) }}
                          className={`block w-full rounded-lg border px-3 py-2 text-left text-xs ${pAddress === d.name ? 'border-primary bg-primary/5' : 'hover:bg-muted'}`}>
                          <span className="font-medium">{d.name}</span>
                          <span className="ml-2 text-muted-foreground">Port: {d.port}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {usbDevices.length === 0 && !detecting && !pAddress && (
                    <p className="text-xs text-muted-foreground">Click detect to find installed printers, or enter the port name manually.</p>
                  )}
                </div>
                <div className="col-span-2">
                  <label className="mb-1 block text-xs font-medium">Printer Name</label>
                  <input type="text" value={pAddress} onChange={(e) => setPAddress(e.target.value)} className="w-full rounded-lg border border-input px-3 py-2 font-mono text-sm" placeholder="e.g., POS-80C" />
                  <p className="mt-1 text-[10px] text-muted-foreground">Use the exact printer name as shown in Windows Settings → Printers</p>
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

      <div className="mb-6 rounded-md border bg-white">
        {printers.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No printers configured.</p>
        ) : (
          <div className="divide-y">
            {printers.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <span className="font-medium">{p.printer_name}</span>
                  <span className="ml-2 rounded bg-muted px-2 py-0.5 text-[10px]">{p.connection_type}</span>
                  {p.connection_type === 'network' && p.address && <span className="ml-2 font-mono text-xs text-muted-foreground">{p.address}:{p.port}</span>}
                  {p.connection_type === 'usb' && p.address && <span className="ml-2 font-mono text-xs text-muted-foreground">Port: {p.address}</span>}
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

      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">Print Routes</h3>
        {printers.length > 0 && (
          <button onClick={() => { setShowRouteForm(true); setRoutePrinter(printers[0]?.id || '') }}
            className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="h-3.5 w-3.5" /> Add Route
          </button>
        )}
      </div>

      {showRouteForm && (
        <div className="mb-4 rounded-md border bg-white p-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium">Print Type</label>
              <select value={routeType} onChange={(e) => setRouteType(e.target.value as any)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                <option value="kot">KOT</option>
                <option value="prep_doc">Prep Doc</option>
                <option value="invoice">Invoice</option>
                <option value="receipt">Receipt</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Printer</label>
              <select value={routePrinter} onChange={(e) => setRoutePrinter(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                {printers.map((p) => <option key={p.id} value={p.id}>{p.printer_name}</option>)}
              </select>
            </div>
            <div className="relative">
              <label className="mb-1 block text-xs font-medium">Item Groups (KOT only)</label>
              <button
                onClick={() => routeType === 'kot' && setShowGroupDropdown(!showGroupDropdown)}
                disabled={routeType !== 'kot'}
                className="flex w-full items-center justify-between rounded-lg border border-input bg-background px-3 py-2 text-sm text-left disabled:opacity-50"
              >
                <span className={routeItemGroups.length === 0 ? 'text-muted-foreground' : ''}>
                  {routeItemGroups.length === 0 ? 'All Items' : `${routeItemGroups.length} group${routeItemGroups.length > 1 ? 's' : ''} selected`}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              {showGroupDropdown && (
                <div className="absolute top-full left-0 right-0 z-20 mt-1 max-h-48 overflow-y-auto rounded-lg border bg-white shadow-lg">
                  <button
                    onClick={() => { setRouteItemGroups([]); setShowGroupDropdown(false) }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted ${routeItemGroups.length === 0 ? 'bg-primary/5 font-medium text-primary' : ''}`}
                  >
                    All Items
                  </button>
                  {itemGroups.map((g) => (
                    <label key={g.name} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted cursor-pointer">
                      <input
                        type="checkbox"
                        checked={routeItemGroups.includes(g.name)}
                        onChange={(e) => {
                          if (e.target.checked) setRouteItemGroups([...routeItemGroups, g.name])
                          else setRouteItemGroups(routeItemGroups.filter((n) => n !== g.name))
                        }}
                        className="rounded"
                      />
                      {g.name}
                    </label>
                  ))}
                  <div className="sticky bottom-0 border-t bg-white p-2">
                    <button onClick={() => setShowGroupDropdown(false)}
                      className="w-full rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">Done</button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={() => { setShowRouteForm(false); setRouteItemGroups([]); setShowGroupDropdown(false) }}
              className="rounded-lg border border-input px-4 py-2 text-sm hover:bg-muted">Cancel</button>
            <button onClick={async () => {
              if (!routePrinter) return
              if (routeType === 'kot' && routeItemGroups.length > 0) {
                // Create one route per selected group
                for (const group of routeItemGroups) {
                  await window.api.printRoutes.add({ printType: routeType, itemGroup: group, printerId: routePrinter })
                }
              } else {
                await window.api.printRoutes.add({ printType: routeType, itemGroup: null, printerId: routePrinter })
              }
              setShowRouteForm(false)
              setRouteItemGroups([])
              setShowGroupDropdown(false)
              loadData()
            }} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Add Route</button>
          </div>
        </div>
      )}

      <div className="rounded-md border bg-white">
        {routes.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            {printers.length === 0 ? 'Add a printer first, then set up routing.' : 'No routes configured. Add a route for Receipt and KOT printing.'}
          </p>
        ) : (
          <div className="divide-y">
            {routes.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-5 py-2.5">
                <span className="text-sm">
                  <span className={`rounded px-2 py-0.5 text-[10px] font-medium uppercase ${
                    r.print_type === 'receipt' ? 'bg-green-50 text-green-700' :
                    r.print_type === 'kot' ? 'bg-orange-50 text-orange-700' :
                    r.print_type === 'prep_doc' ? 'bg-purple-50 text-purple-700' :
                    r.print_type === 'invoice' ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-700'
                  }`}>{r.print_type === 'prep_doc' ? 'PREP' : r.print_type}</span>
                  <span className="ml-2">{r.item_group || r.kitchen_station || 'All Items'}</span>
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
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const filters: any = { date: today }
    if (filter !== 'all') filters.status = filter
    const data = await window.api.orders.getAll(filters)
    setOrders(data)
  }

  async function voidOrder(id: string) {
    const reason = prompt('Void reason:')
    if (!reason) return
    const remarks = prompt('Remarks (optional):') || ''
    await window.api.orders.update(id, { status: 'Void', voidReason: reason, voidRemarks: remarks || undefined, voidedBy: 'Supervisor' })
    loadOrders()
  }

  return (
    <div className="max-w-3xl">
      <h2 className="cond mb-4 text-[30px] font-bold leading-none text-n-deep">Today's Orders</h2>

      <div className="mb-4 flex gap-2">
        {['all', 'Completed', 'Hold', 'Void'].map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1 text-xs font-medium ${filter === f ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
            {f === 'all' ? 'All' : f}
          </button>
        ))}
      </div>

      <div className="rounded-md border bg-white">
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
                      <button onClick={async () => {
                        const res = await window.api.print.kots(o.id)
                        alert(res?.success ? 'KOT reprinted' : `KOT failed: ${res?.errors?.join(', ') || 'Check printer'}`)
                      }} className="rounded px-2 py-1 text-xs text-orange-600 hover:bg-orange-50">Reprint KOT</button>
                      <button onClick={async () => {
                        const res = await window.api.print.waiterCopy(o.id)
                        alert(res?.success ? 'Waiter copy printed' : `Failed: ${res?.error || 'Check printer'}`)
                      }} className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50">Waiter Copy</button>
                      {o.status === 'Completed' && (
                        <>
                          <button onClick={async () => {
                            const res = await window.api.print.receipt(o.id)
                            alert(res?.success ? 'Receipt reprinted' : `Receipt failed: ${res?.error || 'Check printer'}`)
                          }} className="rounded px-2 py-1 text-xs text-primary hover:bg-primary/5">Reprint Receipt</button>
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
        <h2 className="cond text-[30px] font-bold leading-none text-n-deep">Sync Status</h2>
        <button onClick={handleSync} disabled={syncing} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>

      <div className="space-y-4">
        <div className="rounded-md border bg-white p-5">
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
            <div className="rounded-md border bg-white p-5">
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

            <div className="rounded-md border bg-white p-5">
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
      <h2 className="cond mb-4 text-[30px] font-bold leading-none text-n-deep">Shift History</h2>

      <div className="flex gap-4">
        {/* Shift list */}
        <div className="flex-1 rounded-md border bg-white">
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
          <div className="w-[320px] rounded-md border bg-white p-5">
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
  const [date, setDate] = useState(() => new Date().toLocaleDateString('en-CA'))
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<any>({ totalSales: 0, orderCount: 0, avgOrderValue: 0, voidCount: 0, voidAmount: 0 })
  const [bestItems, setBestItems] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [hourly, setHourly] = useState<any[]>([])
  const [voids, setVoids] = useState<any[]>([])
  const [waiters, setWaiters] = useState<any[]>([])
  const [allItems, setAllItems] = useState<any[]>([])
  const [removedItems, setRemovedItems] = useState<any[]>([])

  async function loadAll(d: string) {
    setLoading(true)
    const [s, bi, cs, pb, hs, vr, wp, ai, ri] = await Promise.all([
      window.api.reports.todaySummary(d),
      window.api.reports.bestSellingItems(d, 10),
      window.api.reports.categorySales(d),
      window.api.reports.paymentBreakdown(d),
      window.api.reports.hourlySales(d),
      window.api.reports.voidReport(d),
      window.api.reports.waiterPerformance(d),
      window.api.reports.allItemsSales(d),
      window.api.reports.removedItems(d)
    ])
    setSummary(s)
    setBestItems(bi)
    setCategories(cs)
    setPayments(pb)
    setHourly(hs)
    setVoids(vr)
    setWaiters(wp)
    setAllItems(ai)
    setRemovedItems(ri)
    setLoading(false)
  }

  useEffect(() => { loadAll(date) }, [date])

  const fmt = (n: number) => (n || 0).toFixed(2)
  const maxCatRevenue = categories.length > 0 ? Math.max(...categories.map((c) => c.revenue || 0)) : 0
  const paymentColors: Record<string, string> = { Cash: 'bg-emerald-500', Card: 'bg-blue-500', Mobile: 'bg-purple-500' }

  // Build full hour range 06–23
  const hourMap: Record<string, { orders: number; revenue: number }> = {}
  for (let h = 6; h <= 23; h++) hourMap[String(h).padStart(2, '0')] = { orders: 0, revenue: 0 }
  for (const h of hourly) {
    hourMap[h.hour] = { orders: h.orders, revenue: h.revenue }
  }
  const hourEntries = Object.entries(hourMap).sort(([a], [b]) => a.localeCompare(b))
  const maxHourRevenue = Math.max(...hourEntries.map(([, v]) => v.revenue), 1)

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <h2 className="cond text-[30px] font-bold leading-none text-n-deep">Reports Dashboard</h2>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            onClick={() => loadAll(date)}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="mb-5 grid grid-cols-4 gap-3">
        <div className="rounded-md border bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase text-gray-400 mb-1">Total Sales</p>
          <p className="text-2xl font-bold text-primary">{fmt(summary.totalSales)}</p>
        </div>
        <div className="rounded-md border bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase text-gray-400 mb-1">Orders</p>
          <p className="text-2xl font-bold text-gray-800">{summary.orderCount || 0}</p>
        </div>
        <div className="rounded-md border bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase text-gray-400 mb-1">Avg Order Value</p>
          <p className="text-2xl font-bold text-gray-800">{fmt(summary.avgOrderValue)}</p>
        </div>
        <div className="rounded-md border bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase text-gray-400 mb-1">Voids</p>
          <p className="text-2xl font-bold text-red-500">{summary.voidCount || 0}</p>
          {summary.voidAmount > 0 && <p className="text-xs text-red-400 mt-0.5">{fmt(summary.voidAmount)} lost</p>}
        </div>
      </div>

      {/* Two column layout */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        {/* Left column */}
        <div className="space-y-4">
          {/* Best Selling Items */}
          <div className="rounded-md border bg-white p-5 shadow-sm">
            <h3 className="text-xs font-bold uppercase text-gray-400 mb-3">Best Selling Items</h3>
            {bestItems.length === 0 ? (
              <p className="text-sm text-gray-400">No data</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-gray-400">
                    <th className="pb-2">#</th>
                    <th className="pb-2">Item</th>
                    <th className="pb-2 text-right">Qty</th>
                    <th className="pb-2 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {bestItems.map((item, idx) => (
                    <tr key={item.item_name} className={idx % 2 === 1 ? 'bg-gray-50' : ''}>
                      <td className="py-1.5 text-gray-400">{idx + 1}</td>
                      <td className="py-1.5 font-medium">{item.item_name}</td>
                      <td className="py-1.5 text-right">{item.qty_sold}</td>
                      <td className="py-1.5 text-right font-semibold">{fmt(item.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Void Report */}
          <div className="rounded-md border bg-white p-5 shadow-sm">
            <h3 className="text-xs font-bold uppercase text-gray-400 mb-3">Void Report</h3>
            {voids.length === 0 ? (
              <p className="text-sm text-gray-400">No voided orders</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-gray-400">
                    <th className="pb-2">Order #</th>
                    <th className="pb-2">Reason</th>
                    <th className="pb-2 text-right">Amount</th>
                    <th className="pb-2">Cashier</th>
                    <th className="pb-2">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {voids.map((v, idx) => (
                    <tr key={v.order_number} className={idx % 2 === 1 ? 'bg-gray-50' : ''}>
                      <td className="py-1.5 font-mono text-xs">{v.order_number}</td>
                      <td className="py-1.5 text-xs max-w-[120px] truncate">{v.void_reason || '-'}</td>
                      <td className="py-1.5 text-right font-semibold text-red-500">{fmt(v.grand_total)}</td>
                      <td className="py-1.5 text-xs text-gray-500">{v.cashier_name || '-'}</td>
                      <td className="py-1.5 text-xs text-gray-400">
                        {v.created_at ? new Date(v.created_at + 'Z').toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Payment Breakdown */}
          <div className="rounded-md border bg-white p-5 shadow-sm">
            <h3 className="text-xs font-bold uppercase text-gray-400 mb-3">Payment Breakdown</h3>
            {payments.length === 0 ? (
              <p className="text-sm text-gray-400">No data</p>
            ) : (
              <div className="space-y-3">
                {payments.map((p) => {
                  const colorClass = paymentColors[p.payment_method] || 'bg-gray-400'
                  return (
                    <div key={p.payment_method}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`inline-block h-2.5 w-2.5 rounded-full ${colorClass}`} />
                          <span className="text-sm font-medium">{p.payment_method}</span>
                          <span className="text-xs text-gray-400">({p.count})</span>
                        </div>
                        <span className="text-sm font-bold">{fmt(p.total)}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${summary.totalSales > 0 ? (p.total / summary.totalSales) * 100 : 0}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Category Sales */}
          <div className="rounded-md border bg-white p-5 shadow-sm">
            <h3 className="text-xs font-bold uppercase text-gray-400 mb-3">Category Sales</h3>
            {categories.length === 0 ? (
              <p className="text-sm text-gray-400">No data</p>
            ) : (
              <div className="space-y-2.5">
                {categories.map((c) => (
                  <div key={c.item_group}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{c.item_group}</span>
                      <div className="text-right">
                        <span className="text-sm font-bold">{fmt(c.revenue)}</span>
                        <span className="ml-2 text-xs text-gray-400">x{c.qty_sold}</span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full bg-primary/70" style={{ width: `${maxCatRevenue > 0 ? (c.revenue / maxCatRevenue) * 100 : 0}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Waiter Performance */}
          <div className="rounded-md border bg-white p-5 shadow-sm">
            <h3 className="text-xs font-bold uppercase text-gray-400 mb-3">Waiter Performance</h3>
            {waiters.length === 0 ? (
              <p className="text-sm text-gray-400">No data</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-gray-400">
                    <th className="pb-2">Waiter</th>
                    <th className="pb-2 text-right">Orders</th>
                    <th className="pb-2 text-right">Revenue</th>
                    <th className="pb-2 text-right">Tips</th>
                  </tr>
                </thead>
                <tbody>
                  {waiters.map((w, idx) => (
                    <tr key={w.waiter_name} className={idx % 2 === 1 ? 'bg-gray-50' : ''}>
                      <td className="py-1.5 font-medium">{w.waiter_name}</td>
                      <td className="py-1.5 text-right">{w.orders}</td>
                      <td className="py-1.5 text-right font-semibold">{fmt(w.revenue)}</td>
                      <td className="py-1.5 text-right text-emerald-600">{fmt(w.tips)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* All Items Sales — full width scrollable */}
      <div className="rounded-md border bg-white p-5 shadow-sm mb-5">
        <h3 className="text-xs font-bold uppercase text-gray-400 mb-3">All Items Sales</h3>
        {allItems.length === 0 ? (
          <p className="text-sm text-gray-400">No data</p>
        ) : (
          <div className="max-h-[300px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b text-left text-xs text-gray-400">
                  <th className="pb-2">#</th>
                  <th className="pb-2">Item</th>
                  <th className="pb-2 text-right">Qty Sold</th>
                  <th className="pb-2 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {allItems.map((item, idx) => (
                  <tr key={item.item_name} className={idx % 2 === 1 ? 'bg-gray-50' : ''}>
                    <td className="py-1.5 text-gray-400">{idx + 1}</td>
                    <td className="py-1.5 font-medium">{item.item_name}</td>
                    <td className="py-1.5 text-right">{item.qty_sold}</td>
                    <td className="py-1.5 text-right font-semibold">{fmt(item.revenue)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t">
                <tr className="font-bold">
                  <td className="py-2" colSpan={2}>Total</td>
                  <td className="py-2 text-right">{allItems.reduce((s, i) => s + (i.qty_sold || 0), 0)}</td>
                  <td className="py-2 text-right">{fmt(allItems.reduce((s, i) => s + (i.revenue || 0), 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Removed Items Report — full width */}
      {removedItems.length > 0 && (
        <div className="rounded-md border bg-white p-5 shadow-sm mb-5">
          <h3 className="text-xs font-bold uppercase text-gray-400 mb-3">Removed Items</h3>
          <div className="max-h-[250px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b text-left text-xs text-gray-400">
                  <th className="pb-2">Order #</th>
                  <th className="pb-2">Item</th>
                  <th className="pb-2 text-right">Qty</th>
                  <th className="pb-2 text-right">Amount</th>
                  <th className="pb-2">Reason</th>
                  <th className="pb-2">Removed By</th>
                  <th className="pb-2">Time</th>
                </tr>
              </thead>
              <tbody>
                {removedItems.map((ri, idx) => (
                  <tr key={ri.id} className={idx % 2 === 1 ? 'bg-gray-50' : ''}>
                    <td className="py-1.5 font-mono text-xs">{ri.order_number || '-'}</td>
                    <td className="py-1.5 font-medium">{ri.item_name}</td>
                    <td className="py-1.5 text-right">{ri.qty}</td>
                    <td className="py-1.5 text-right font-semibold text-red-500">{fmt(ri.amount)}</td>
                    <td className="py-1.5 text-xs max-w-[120px] truncate">{ri.reason}</td>
                    <td className="py-1.5 text-xs text-gray-500">{ri.removed_by || '-'}</td>
                    <td className="py-1.5 text-xs text-gray-400">
                      {ri.removed_at ? new Date(ri.removed_at + 'Z').toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t">
                <tr className="font-bold text-red-500">
                  <td className="py-2" colSpan={3}>Total Removed</td>
                  <td className="py-2 text-right">{fmt(removedItems.reduce((s, i) => s + (i.amount || 0), 0))}</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Hourly Sales — full width bar chart */}
      <div className="rounded-md border bg-white p-5 shadow-sm">
        <h3 className="text-xs font-bold uppercase text-gray-400 mb-3">Hourly Sales</h3>
        {hourEntries.every(([, v]) => v.revenue === 0) ? (
          <p className="text-sm text-gray-400">No data</p>
        ) : (
          <div className="flex items-end gap-1" style={{ height: '140px' }}>
            {hourEntries.map(([hour, data]) => {
              const pct = maxHourRevenue > 0 ? (data.revenue / maxHourRevenue) * 100 : 0
              return (
                <div key={hour} className="flex flex-1 flex-col items-center gap-1 h-full justify-end">
                  {data.revenue > 0 && (
                    <span className="text-[8px] font-bold text-gray-500">{data.revenue.toFixed(0)}</span>
                  )}
                  <div
                    className="w-full rounded-t bg-primary/80 transition-all"
                    style={{ height: `${pct}%`, minHeight: data.revenue > 0 ? '4px' : '0px' }}
                  />
                  <span className="text-[9px] text-gray-400">{hour}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ==================== Backup & Restore ====================
function BackupRestore() {
  const [status, setStatus] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  const handleExport = async (full = false) => {
    setIsExporting(true)
    setStatus(null)
    try {
      const result = full ? await window.api.backup.exportFull() : await window.api.backup.export()
      if (result.canceled) {
        setStatus(null)
      } else if (result.success) {
        setStatus('Backup exported successfully!')
      } else {
        setStatus(`Export failed: ${result.error}`)
      }
    } catch (err: any) {
      setStatus(`Export failed: ${err.message}`)
    } finally {
      setIsExporting(false)
    }
  }

  const handleImport = async () => {
    setIsImporting(true)
    setStatus(null)
    try {
      const result = await window.api.backup.import()
      if (result.canceled) {
        setStatus(null)
      } else if (result.success) {
        setStatus(`Settings restored from backup (v${result.meta?.version}, ${result.meta?.exported_at ? new Date(result.meta.exported_at).toLocaleString() : ''}). Reloading...`)
      } else {
        setStatus(`Import failed: ${result.error}`)
      }
    } catch (err: any) {
      setStatus(`Import failed: ${err.message}`)
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Backup & Restore</h2>
        <p className="text-sm text-muted-foreground">Save a full database backup or transfer settings between terminals</p>
      </div>

      {status && (
        <div className={`flex items-center gap-2 rounded-lg p-3 text-sm ${
          status.includes('failed') || status.includes('Failed')
            ? 'bg-red-50 text-red-700'
            : 'bg-green-50 text-green-700'
        }`}>
          {status.includes('failed') || status.includes('Failed')
            ? <XCircle className="h-4 w-4" />
            : <CheckCircle className="h-4 w-4" />
          }
          {status}
        </div>
      )}

      <div className="rounded-md border bg-white p-6">
        <h3 className="font-medium">Full Database Backup</h3>
        <p className="my-3 text-sm text-muted-foreground">Includes orders, payments, shifts, and settings. Keep a copy on another device. Contact support to restore a full backup.</p>
        <button onClick={() => handleExport(true)} disabled={isExporting || isImporting}
          className="rounded-lg bg-primary px-4 py-3 text-sm font-medium text-white disabled:opacity-50">
          {isExporting ? 'Exporting...' : 'Export Full Database Backup'}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-md border bg-white p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-lg bg-blue-50 p-2.5">
              <Download className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-medium">Export Backup</h3>
              <p className="text-xs text-muted-foreground">Save settings to a file</p>
            </div>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            Exports all settings including admin account, cashiers, printers, print routes, receipt config, payment methods, waiters, and modifiers.
          </p>
          <p className="mb-4 text-xs text-muted-foreground">
            Order history and payments are not included. Use Full Database Backup to protect local transactions.
          </p>
          <button
            onClick={() => handleExport()}
            disabled={isExporting}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {isExporting ? 'Exporting...' : 'Export Settings Backup'}
          </button>
        </div>

        <div className="rounded-md border bg-white p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-lg bg-amber-50 p-2.5">
              <Upload className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h3 className="font-medium">Restore Backup</h3>
              <p className="text-xs text-muted-foreground">Load settings from a file</p>
            </div>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            Restores all settings from a previously exported backup file. Current settings will be replaced. The app will reload after restore.
          </p>
          <p className="mb-4 text-xs font-medium text-amber-600">
            Warning: This will overwrite all current settings.
          </p>
          <button
            onClick={handleImport}
            disabled={isImporting}
            className="w-full rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
          >
            {isImporting ? 'Restoring...' : 'Import Settings Backup'}
          </button>
        </div>
      </div>
    </div>
  )
}
