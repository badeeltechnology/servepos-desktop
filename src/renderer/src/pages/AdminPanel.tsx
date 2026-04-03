import { useState, useEffect } from 'react'
import { useAuthStore } from '../stores/auth'
import { ArrowLeft, Save, Printer, Image, FileText, Users, Settings, Database } from 'lucide-react'

type Tab = 'print-format' | 'system' | 'supervisor'

export default function AdminPanel() {
  const { setAdminMode } = useAuthStore()
  const [activeTab, setActiveTab] = useState<Tab>('print-format')
  const [saving, setSaving] = useState(false)

  // Receipt config state
  const [receiptConfig, setReceiptConfig] = useState<Record<string, string>>({})

  useEffect(() => {
    loadReceiptConfig()
  }, [])

  async function loadReceiptConfig() {
    const config = await window.api.receiptConfig.getAll()
    setReceiptConfig(config)
  }

  function updateField(key: string, value: string) {
    setReceiptConfig((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      await window.api.receiptConfig.setBulk(receiptConfig)
    } finally {
      setSaving(false)
    }
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'print-format', label: 'Print Format', icon: <FileText className="h-4 w-4" /> },
    { key: 'system', label: 'System', icon: <Settings className="h-4 w-4" /> },
    { key: 'supervisor', label: 'Supervisor', icon: <Users className="h-4 w-4" /> }
  ]

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="flex w-64 flex-col border-r bg-white">
        <div className="border-b p-4">
          <button
            onClick={() => setAdminMode(false)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Login
          </button>
          <h1 className="mt-3 text-lg font-bold">Admin Panel</h1>
        </div>

        <nav className="flex-1 p-3">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${
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

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        {activeTab === 'print-format' && (
          <div className="mx-auto max-w-2xl">
            <h2 className="mb-6 text-2xl font-bold">Print Format Configuration</h2>

            {/* Restaurant Identity */}
            <div className="mb-6 rounded-xl border bg-white p-6">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Restaurant Identity
              </h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium">Name (English)</label>
                    <input
                      type="text"
                      value={receiptConfig.restaurant_name || ''}
                      onChange={(e) => updateField('restaurant_name', e.target.value)}
                      className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="Garden Cafe"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Name (Arabic)</label>
                    <input
                      type="text"
                      value={receiptConfig.restaurant_name_ar || ''}
                      onChange={(e) => updateField('restaurant_name_ar', e.target.value)}
                      className="w-full rounded-lg border border-input px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="مطعمي"
                      dir="rtl"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium">Address Line 1</label>
                    <input
                      type="text"
                      value={receiptConfig.address_line_1 || ''}
                      onChange={(e) => updateField('address_line_1', e.target.value)}
                      className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="The Pearl, Tower 12"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Address Line 1 (Arabic)</label>
                    <input
                      type="text"
                      value={receiptConfig.address_line_1_ar || ''}
                      onChange={(e) => updateField('address_line_1_ar', e.target.value)}
                      className="w-full rounded-lg border border-input px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      dir="rtl"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium">Address Line 2</label>
                    <input
                      type="text"
                      value={receiptConfig.address_line_2 || ''}
                      onChange={(e) => updateField('address_line_2', e.target.value)}
                      className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="Doha, Qatar"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Address Line 2 (Arabic)</label>
                    <input
                      type="text"
                      value={receiptConfig.address_line_2_ar || ''}
                      onChange={(e) => updateField('address_line_2_ar', e.target.value)}
                      className="w-full rounded-lg border border-input px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      dir="rtl"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium">Phone</label>
                    <input
                      type="text"
                      value={receiptConfig.phone || ''}
                      onChange={(e) => updateField('phone', e.target.value)}
                      className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="+974 4444 5555"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Phone 2</label>
                    <input
                      type="text"
                      value={receiptConfig.phone_2 || ''}
                      onChange={(e) => updateField('phone_2', e.target.value)}
                      className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Legal / Tax */}
            <div className="mb-6 rounded-xl border bg-white p-6">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Legal / Tax
              </h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium">CR Number</label>
                    <input
                      type="text"
                      value={receiptConfig.cr_number || ''}
                      onChange={(e) => updateField('cr_number', e.target.value)}
                      className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">VAT Number</label>
                    <input
                      type="text"
                      value={receiptConfig.vat_number || ''}
                      onChange={(e) => updateField('vat_number', e.target.value)}
                      className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
                <div className="flex gap-6">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={receiptConfig.show_cr_number === '1'}
                      onChange={(e) => updateField('show_cr_number', e.target.checked ? '1' : '0')}
                      className="rounded"
                    />
                    Show CR on receipt
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={receiptConfig.show_vat_number === '1'}
                      onChange={(e) => updateField('show_vat_number', e.target.checked ? '1' : '0')}
                      className="rounded"
                    />
                    Show VAT on receipt
                  </label>
                </div>
              </div>
            </div>

            {/* Tax */}
            <div className="mb-6 rounded-xl border bg-white p-6">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Tax
              </h3>
              <div className="space-y-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={receiptConfig.tax_enabled === '1'}
                    onChange={(e) => updateField('tax_enabled', e.target.checked ? '1' : '0')}
                    className="rounded"
                  />
                  <span className="font-medium">Enable tax on orders</span>
                </label>
                {receiptConfig.tax_enabled === '1' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium">Tax Label</label>
                      <input
                        type="text"
                        value={receiptConfig.tax_label || 'VAT'}
                        onChange={(e) => updateField('tax_label', e.target.value)}
                        className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="VAT"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">Tax Rate (%)</label>
                      <input
                        type="number"
                        value={receiptConfig.tax_rate || ''}
                        onChange={(e) => updateField('tax_rate', e.target.value)}
                        className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="5"
                        min={0}
                        max={100}
                        step={0.1}
                      />
                    </div>
                  </div>
                )}
                {receiptConfig.tax_enabled !== '1' && (
                  <p className="text-xs text-muted-foreground">
                    Tax is disabled. No tax will be calculated or shown on receipts.
                  </p>
                )}
              </div>
            </div>

            {/* Discount */}
            <div className="mb-6 rounded-xl border bg-white p-6">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Discount
              </h3>
              <div className="space-y-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={receiptConfig.discount_enabled === '1'}
                    onChange={(e) => updateField('discount_enabled', e.target.checked ? '1' : '0')}
                    className="rounded"
                  />
                  <span className="font-medium">Enable discounts</span>
                </label>
                {receiptConfig.discount_enabled === '1' && (
                  <div className="space-y-3 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 p-4">
                    <p className="text-xs font-medium text-muted-foreground">Who can apply discounts?</p>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="discount_permission"
                          checked={(receiptConfig.discount_permission || 'supervisor_only') === 'supervisor_only'}
                          onChange={() => updateField('discount_permission', 'supervisor_only')}
                        />
                        Supervisor only
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="discount_permission"
                          checked={receiptConfig.discount_permission === 'all_users'}
                          onChange={() => updateField('discount_permission', 'all_users')}
                        />
                        All users (cashiers use their max discount limit)
                      </label>
                    </div>
                    {receiptConfig.discount_permission === 'all_users' && (
                      <div>
                        <label className="mb-1 block text-sm font-medium">Default max discount for cashiers (%)</label>
                        <input
                          type="number"
                          value={receiptConfig.default_max_discount_pct || ''}
                          onChange={(e) => updateField('default_max_discount_pct', e.target.value)}
                          className="w-32 rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder="10"
                          min={0}
                          max={100}
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                          Per-cashier limits can be set in supervisor user management.
                        </p>
                      </div>
                    )}
                  </div>
                )}
                {receiptConfig.discount_enabled !== '1' && (
                  <p className="text-xs text-muted-foreground">
                    Discounts are disabled. No discounts can be applied to orders or items.
                  </p>
                )}
              </div>
            </div>

            {/* Currency */}
            <div className="mb-6 rounded-xl border bg-white p-6">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Currency
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium">Symbol</label>
                  <input
                    type="text"
                    value={receiptConfig.currency_symbol || 'QAR'}
                    onChange={(e) => updateField('currency_symbol', e.target.value)}
                    className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Position</label>
                  <select
                    value={receiptConfig.currency_position || 'after'}
                    onChange={(e) => updateField('currency_position', e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="before">Before amount</option>
                    <option value="after">After amount</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Decimals</label>
                  <select
                    value={receiptConfig.currency_decimals || '2'}
                    onChange={(e) => updateField('currency_decimals', e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="0">0</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Receipt & KOT Options */}
            <div className="mb-6 rounded-xl border bg-white p-6">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Receipt Options
              </h3>
              <div className="space-y-3">
                {[
                  { key: 'show_logo', label: 'Show logo on receipt' },
                  { key: 'show_arabic', label: 'Show bilingual (Arabic + English)' },
                  { key: 'show_cashier_name', label: 'Show cashier name' }
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={receiptConfig[key] === '1'}
                      onChange={(e) => updateField(key, e.target.checked ? '1' : '0')}
                      className="rounded"
                    />
                    {label}
                  </label>
                ))}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium">Footer (English)</label>
                  <input
                    type="text"
                    value={receiptConfig.footer_message || ''}
                    onChange={(e) => updateField('footer_message', e.target.value)}
                    className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Thank you! Visit again"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Footer (Arabic)</label>
                  <input
                    type="text"
                    value={receiptConfig.footer_message_ar || ''}
                    onChange={(e) => updateField('footer_message_ar', e.target.value)}
                    className="w-full rounded-lg border border-input px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    dir="rtl"
                  />
                </div>
              </div>
            </div>

            {/* KOT Options */}
            <div className="mb-6 rounded-xl border bg-white p-6">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                KOT Options
              </h3>
              <div className="space-y-3">
                {[
                  { key: 'kot_show_order_number', label: 'Show order number on KOT' },
                  { key: 'kot_show_table', label: 'Show table on KOT' },
                  { key: 'kot_show_restaurant_name', label: 'Show restaurant name on KOT' }
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={receiptConfig[key] !== '0'}
                      onChange={(e) => updateField(key, e.target.checked ? '1' : '0')}
                      className="rounded"
                    />
                    {label}
                  </label>
                ))}
                <div className="pt-2">
                  <label className="mb-1 block text-sm font-medium">KOT Font Size</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="kot_font_size"
                        checked={(receiptConfig.kot_font_size || 'normal') === 'normal'}
                        onChange={() => updateField('kot_font_size', 'normal')}
                      />
                      Normal
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="kot_font_size"
                        checked={receiptConfig.kot_font_size === 'large'}
                        onChange={() => updateField('kot_font_size', 'large')}
                      />
                      Large
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Save button */}
            <div className="flex justify-end gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'system' && <SystemSettings />}

        {activeTab === 'supervisor' && (
          <div className="mx-auto max-w-2xl">
            <h2 className="mb-6 text-2xl font-bold">Supervisor Management</h2>
            <div className="rounded-xl border bg-white p-6">
              <p className="text-sm text-muted-foreground">
                Create or replace the supervisor account for this terminal.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function SystemSettings() {
  const [version, setVersion] = useState('')
  const [updateInfo, setUpdateInfo] = useState<any>(null)
  const [checking, setChecking] = useState(false)
  const [config, setConfig] = useState<Record<string, string>>({})

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const v = await window.api.app.getVersion()
    setVersion(v)
    const c = await window.api.config.getAll()
    setConfig(c)
  }

  async function checkUpdate() {
    setChecking(true)
    const info = await window.api.app.checkForUpdate()
    setUpdateInfo(info)
    setChecking(false)
  }

  async function saveConfig(key: string, value: string) {
    await window.api.config.set(key, value)
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-6 text-2xl font-bold">System Settings</h2>

      {/* Version & Update */}
      <div className="mb-6 rounded-xl border bg-white p-6">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Version
        </h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-bold">ServePOS v{version}</p>
            <p className="text-xs text-muted-foreground">By Badeel Technology</p>
          </div>
          <button
            onClick={checkUpdate}
            disabled={checking}
            className="rounded-lg border border-input px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            {checking ? 'Checking...' : 'Check for Update'}
          </button>
        </div>
        {updateInfo && (
          <div className={`mt-4 rounded-lg p-3 text-sm ${updateInfo.hasUpdate ? 'bg-primary/5 text-primary' : 'bg-green-50 text-green-700'}`}>
            {updateInfo.hasUpdate ? (
              <div className="flex items-center justify-between">
                <span>New version available: <strong>v{updateInfo.latestVersion}</strong></span>
                <button
                  onClick={() => window.open(updateInfo.releaseUrl, '_blank')}
                  className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Download
                </button>
              </div>
            ) : (
              <span>You're on the latest version.</span>
            )}
          </div>
        )}
      </div>

      {/* ERPNext Connection */}
      <div className="mb-6 rounded-xl border bg-white p-6">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          ERPNext Connection
        </h3>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Site URL</label>
            <input type="text" value={config.erpnext_url || ''} readOnly className="w-full rounded-lg border border-input bg-muted/30 px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Company</label>
              <input type="text" value={config.company || ''} readOnly className="w-full rounded-lg border border-input bg-muted/30 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">POS Profile</label>
              <input type="text" value={config.pos_profile || ''} readOnly className="w-full rounded-lg border border-input bg-muted/30 px-3 py-2 text-sm" />
            </div>
          </div>
        </div>
      </div>

      {/* Sync & Timeout */}
      <div className="mb-6 rounded-xl border bg-white p-6">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Preferences
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Auto-sync Interval</label>
            <select
              value={config.auto_sync_interval || '5'}
              onChange={(e) => saveConfig('auto_sync_interval', e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="1">Every 1 minute</option>
              <option value="2">Every 2 minutes</option>
              <option value="5">Every 5 minutes</option>
              <option value="10">Every 10 minutes</option>
              <option value="15">Every 15 minutes</option>
              <option value="30">Every 30 minutes</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Inactivity Timeout</label>
            <select
              value={config.inactivity_timeout || '10'}
              onChange={(e) => saveConfig('inactivity_timeout', e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="5">5 minutes</option>
              <option value="10">10 minutes</option>
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="60">1 hour</option>
              <option value="0">Never</option>
            </select>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Branch Code</label>
            <input type="text" value={config.branch_code || ''} readOnly className="w-full rounded-lg border border-input bg-muted/30 px-3 py-2 font-mono text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Terminal No.</label>
            <input type="text" value={config.terminal_number || ''} readOnly className="w-full rounded-lg border border-input bg-muted/30 px-3 py-2 font-mono text-sm" />
          </div>
        </div>
      </div>
    </div>
  )
}
