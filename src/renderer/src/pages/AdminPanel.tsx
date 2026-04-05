import { useState, useEffect } from 'react'
import { useAuthStore } from '../stores/auth'
import { ArrowLeft, Save, Printer, Image, FileText, Users, Settings, Database, Loader2, Wifi } from 'lucide-react'

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

            {/* Receipt Design Selector */}
            <div className="mb-6 rounded-xl border bg-white p-6">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Receipt Design
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {/* Classic Design Preview */}
                <button
                  onClick={() => updateField('receipt_design', 'classic')}
                  className={`rounded-xl border-2 p-3 text-left transition-all ${(receiptConfig.receipt_design || 'classic') === 'classic' ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-bold">Classic</span>
                    {(receiptConfig.receipt_design || 'classic') === 'classic' && <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-white">Active</span>}
                  </div>
                  <div className="rounded-lg bg-white border p-3 font-mono text-[8px] leading-tight text-gray-600">
                    <div className="text-center font-bold text-[9px]">Restaurant Name</div>
                    <div className="my-1 border-t border-dashed border-gray-300" />
                    <div className="text-center text-[7px]">Address Line 1</div>
                    <div className="text-center text-[7px]">Tel: +974 1234 5678</div>
                    <div className="my-1 border-t-2 border-gray-400" />
                    <div>Receipt: POS-T01-001</div>
                    <div>Date: 04 Apr 2026  14:30</div>
                    <div>Cashier: Ahmad</div>
                    <div className="my-1 border-t border-dashed border-gray-300" />
                    <div className="flex justify-between font-bold"><span>Qty  Item</span><span>Amt</span></div>
                    <div className="my-0.5 border-t border-dashed border-gray-300" />
                    <div className="flex justify-between"><span> 2   Cappuccino</span><span>52.00</span></div>
                    <div className="flex justify-between"><span> 1   Croissant</span><span>18.00</span></div>
                    <div className="my-1 border-t border-dashed border-gray-300" />
                    <div className="flex justify-between"><span>Subtotal:</span><span>70.00</span></div>
                    <div className="my-0.5 border-t border-dashed border-gray-300" />
                    <div className="flex justify-between font-bold"><span>TOTAL:</span><span>70.00 QAR</span></div>
                    <div className="my-1 border-t-2 border-gray-400" />
                    <div className="text-center text-[7px]">Thank you!</div>
                  </div>
                </button>

                {/* Modern Design Preview */}
                <button
                  onClick={() => updateField('receipt_design', 'modern')}
                  className={`rounded-xl border-2 p-3 text-left transition-all ${receiptConfig.receipt_design === 'modern' ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-bold">Modern</span>
                    {receiptConfig.receipt_design === 'modern' && <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-white">Active</span>}
                  </div>
                  <div className="rounded-lg bg-white border p-3 font-mono text-[8px] leading-tight text-gray-600">
                    <div className="text-center font-bold text-[10px]">RESTAURANT NAME</div>
                    <div className="text-center text-[7px]">Address Line 1</div>
                    <div className="text-center text-[7px]">CR: 12345 | VAT: 67890</div>
                    <div className="my-1 border-t-2 border-gray-400" />
                    <div className="text-center font-bold text-[8px]">TAX INVOICE</div>
                    <div className="my-1 border-t-2 border-gray-400" />
                    <div className="flex justify-between"><span>#POS-T01-001</span><span>04 Apr 2026</span></div>
                    <div className="flex justify-between"><span>Dine In</span><span>14:30</span></div>
                    <div className="my-1 border-t-2 border-gray-400" />
                    <div className="font-bold">1. Cappuccino</div>
                    <div className="flex justify-between pl-2"><span>2 x 26.00</span><span>52.00</span></div>
                    <div className="font-bold">2. Croissant</div>
                    <div className="flex justify-between pl-2"><span>1 x 18.00</span><span>18.00</span></div>
                    <div className="my-1 border-t-2 border-gray-400" />
                    <div className="flex justify-between"><span>  Subtotal</span><span>70.00</span></div>
                    <div className="my-0.5 border-t border-dashed border-gray-300" />
                    <div className="text-center font-bold text-[10px]">TOTAL: 70.00 QAR</div>
                    <div className="my-0.5 border-t border-dashed border-gray-300" />
                    <div className="my-1 border-t-2 border-gray-400" />
                    <div className="text-center text-[7px]">Thank you!</div>
                  </div>
                </button>
              </div>
            </div>

            {/* Paper Width */}
            <div className="mb-6 rounded-xl border bg-white p-6">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Paper Size
              </h3>
              <div className="flex gap-4">
                {[
                  { value: '80', label: '80mm (standard)' },
                  { value: '58', label: '58mm (compact)' }
                ].map(({ value, label }) => (
                  <label key={value} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="paper_width"
                      checked={(receiptConfig.paper_width || '80') === value}
                      onChange={() => updateField('paper_width', value)}
                    />
                    {label}
                  </label>
                ))}
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
                  { key: 'show_arabic', label: 'Show Arabic name on receipt (header, footer)' },
                  { key: 'show_arabic_items', label: 'Show Arabic item names on receipt' },
                  { key: 'show_cashier_name', label: 'Show cashier name' },
                  { key: 'show_description_on_receipt', label: 'Show item description (English) on receipt' },
                  { key: 'show_description_ar_on_receipt', label: 'Show item description (Arabic) on receipt' },
                  { key: 'show_description_on_pos', label: 'Show item description on POS screen' },
                  { key: 'auto_print_waiter_copy', label: 'Auto-print waiter copy when order is placed' }
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
                  { key: 'kot_show_restaurant_name', label: 'Show restaurant name on KOT' },
                  { key: 'kot_show_arabic_items', label: 'Show Arabic item names on KOT' }
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

            {/* Print Document Settings */}
            <div className="mb-6 rounded-xl border bg-white p-6">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Print Document Settings
              </h3>
              <p className="mb-4 text-xs text-gray-500">
                Configure auto-print behavior and number of copies. Printer routing is managed in Supervisor Settings &gt; Printers.
              </p>
              <div className="space-y-3">
                {[
                  { key: 'waiter_order_auto_accept', label: 'Auto-accept waiter orders', desc: 'Automatically accept incoming waiter orders and print KOT (no manual approval needed)' },
                  { key: 'prep_doc_enabled', label: 'Enable Preparation Document', desc: 'Prints order details without amounts for assembly staff' },
                  { key: 'prep_doc_auto_print', label: 'Auto-print Prep Doc on order', desc: 'Prints automatically when KOT is printed' },
                  { key: 'receipt_auto_print', label: 'Auto-print Receipt on payment', desc: 'Prints automatically when payment is confirmed' }
                ].map(({ key, label, desc }) => (
                  <label key={key} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={receiptConfig[key] !== '0'}
                      onChange={(e) => updateField(key, e.target.checked ? '1' : '0')}
                      className="mt-0.5 rounded"
                    />
                    <div>
                      <span className="font-medium">{label}</span>
                      <p className="text-xs text-gray-400">{desc}</p>
                    </div>
                  </label>
                ))}
              </div>

              {/* Print Copy Count */}
              <h4 className="mb-3 mt-5 text-xs font-semibold uppercase text-gray-400">Number of Copies</h4>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { key: 'kot_copies', label: 'KOT' },
                  { key: 'prep_doc_copies', label: 'Prep Doc' },
                  { key: 'invoice_copies', label: 'Invoice' },
                  { key: 'receipt_copies', label: 'Receipt' }
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label className="mb-1 block text-xs font-medium">{label}</label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={receiptConfig[key] || '1'}
                      onChange={(e) => updateField(key, String(Math.max(1, Math.min(5, parseInt(e.target.value) || 1))))}
                      className="w-full rounded-lg border border-input px-3 py-2 text-center text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                ))}
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

        {activeTab === 'supervisor' && <SupervisorManagement />}
      </div>
    </div>
  )
}

function SupervisorManagement() {
  const [supervisors, setSupervisors] = useState<any[]>([])
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newPin, setNewPin] = useState('')
  const [newPinConfirm, setNewPinConfirm] = useState('')

  useEffect(() => { loadSupervisors() }, [])

  async function loadSupervisors() {
    const users = await window.api.users.getAll('supervisor')
    setSupervisors(users)
  }

  async function handleCreate() {
    setError('')
    setSuccess('')
    if (!name.trim()) { setError('Supervisor name is required'); return }
    if (pin.length < 6 || pin.length > 8) { setError('PIN must be 6-8 digits'); return }
    if (!/^\d+$/.test(pin)) { setError('PIN must contain only numbers'); return }
    if (pin !== pinConfirm) { setError('PINs do not match'); return }

    try {
      await window.api.users.create(name.trim(), pin, 'supervisor')
      setName('')
      setPin('')
      setPinConfirm('')
      setSuccess('Supervisor created successfully')
      await loadSupervisors()
    } catch (err: any) {
      setError(err.message || 'Failed to create supervisor')
    }
  }

  async function handleResetPin(id: string) {
    setError('')
    setSuccess('')
    if (newPin.length < 6 || newPin.length > 8) { setError('PIN must be 6-8 digits'); return }
    if (!/^\d+$/.test(newPin)) { setError('PIN must contain only numbers'); return }
    if (newPin !== newPinConfirm) { setError('PINs do not match'); return }

    try {
      await window.api.users.update(id, { pin: newPin })
      setEditingId(null)
      setNewPin('')
      setNewPinConfirm('')
      setSuccess('PIN updated successfully')
    } catch (err: any) {
      setError(err.message || 'Failed to update PIN')
    }
  }

  async function handleDelete(id: string) {
    if (supervisors.length <= 1) { setError('Cannot delete the last supervisor'); return }
    try {
      await window.api.users.delete(id)
      setSuccess('Supervisor deleted')
      await loadSupervisors()
    } catch (err: any) {
      setError(err.message || 'Failed to delete supervisor')
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-6 text-2xl font-bold">Supervisor Management</h2>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {success && <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>}

      {/* Existing supervisors */}
      {supervisors.length > 0 && (
        <div className="mb-6 rounded-xl border bg-white p-6">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Current Supervisors
          </h3>
          <div className="divide-y">
            {supervisors.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-3">
                <div>
                  <span className="font-medium">{s.user_name}</span>
                  <span className="ml-2 rounded bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">Supervisor</span>
                </div>
                <div className="flex gap-2">
                  {editingId === s.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="password"
                        value={newPin}
                        onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                        className="w-24 rounded-lg border border-input px-2 py-1 text-center font-mono text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="New PIN"
                        inputMode="numeric"
                      />
                      <input
                        type="password"
                        value={newPinConfirm}
                        onChange={(e) => setNewPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 8))}
                        className="w-24 rounded-lg border border-input px-2 py-1 text-center font-mono text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Confirm"
                        inputMode="numeric"
                        onKeyDown={(e) => e.key === 'Enter' && handleResetPin(s.id)}
                      />
                      <button onClick={() => handleResetPin(s.id)} className="rounded px-2 py-1 text-xs font-medium text-primary hover:bg-primary/5">Save</button>
                      <button onClick={() => { setEditingId(null); setNewPin(''); setNewPinConfirm('') }} className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted">Cancel</button>
                    </div>
                  ) : (
                    <>
                      <button onClick={() => setEditingId(s.id)} className="rounded px-2 py-1 text-xs text-primary hover:bg-primary/5">Reset PIN</button>
                      <button onClick={() => handleDelete(s.id)} className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50">Delete</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create new supervisor */}
      <div className="rounded-xl border bg-white p-6">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Create New Supervisor
        </h3>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="e.g., Ahmad"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">PIN (6-8 digits)</label>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                className="w-full rounded-lg border border-input px-3 py-2 text-center font-mono text-lg tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="••••••"
                inputMode="numeric"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Confirm PIN</label>
              <input
                type="password"
                value={pinConfirm}
                onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 8))}
                className="w-full rounded-lg border border-input px-3 py-2 text-center font-mono text-lg tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="••••••"
                inputMode="numeric"
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <button
              onClick={handleCreate}
              className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Users className="h-4 w-4" />
              Create Supervisor
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SystemSettings() {
  const [version, setVersion] = useState('')
  const [updateInfo, setUpdateInfo] = useState<any>(null)
  const [checking, setChecking] = useState(false)
  const [config, setConfig] = useState<Record<string, string>>({})
  const [deleteStep, setDeleteStep] = useState(0) // 0=none, 1=first confirm, 2=type confirm
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

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
      <ErpnextConnectionSettings config={config} onSave={loadData} />

      {/* Sync Data */}
      <SyncNowCard />

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
              onChange={async (e) => { await saveConfig('auto_sync_interval', e.target.value); await window.api.sync.startAuto() }}
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

      {/* Clear Transactions */}
      <div className="mb-6 rounded-xl border-2 border-orange-200 bg-white p-6">
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-orange-600">
          Clear Transactions
        </h3>
        <p className="mb-2 text-sm text-muted-foreground">
          Delete all orders, sessions, shifts, and print logs. Items, modifiers, printers, users, and settings are kept.
        </p>
        <button
          onClick={async () => {
            if (!confirm('Clear all orders and transaction data? This cannot be undone.\n\nItems, printers, users, and settings will NOT be affected.')) return
            const result = await window.api.app.clearTransactions()
            alert(`Cleared ${result.orders} orders and ${result.sessions} sessions.`)
          }}
          className="rounded-lg border-2 border-orange-300 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50"
        >
          Clear All Transactions
        </button>
      </div>

      {/* Danger Zone — Delete Database */}
      <div className="mb-6 rounded-xl border-2 border-red-200 bg-white p-6">
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-red-600">
          Danger Zone
        </h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Permanently delete the entire database. This removes everything including users, settings, and cached data. The app will restart fresh.
        </p>

        {deleteStep === 0 && (
          <button
            onClick={() => setDeleteStep(1)}
            className="rounded-lg border-2 border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Delete Database
          </button>
        )}

        {deleteStep === 1 && (
          <div className="rounded-lg bg-red-50 p-4">
            <p className="mb-3 text-sm font-medium text-red-800">
              Are you sure? This action is <strong>irreversible</strong>. All local data will be permanently deleted.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteStep(2)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Yes, I want to delete
              </button>
              <button
                onClick={() => setDeleteStep(0)}
                className="rounded-lg border border-input px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {deleteStep === 2 && (
          <div className="rounded-lg bg-red-50 p-4">
            <p className="mb-2 text-sm font-medium text-red-800">
              Type <strong>DELETE</strong> to confirm:
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="w-40 rounded-lg border border-red-300 px-3 py-2 text-center font-mono text-sm uppercase focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="DELETE"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { setDeleteStep(0); setDeleteConfirmText('') }
                }}
              />
              <button
                onClick={async () => {
                  setDeleting(true)
                  await window.api.app.deleteDatabase()
                }}
                disabled={deleteConfirmText !== 'DELETE' || deleting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40"
              >
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
              <button
                onClick={() => { setDeleteStep(0); setDeleteConfirmText('') }}
                className="rounded-lg border border-input px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ErpnextConnectionSettings({ config, onSave }: { config: Record<string, string>; onSave: () => void }) {
  const [editing, setEditing] = useState(false)
  const [url, setUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [selectedCompany, setSelectedCompany] = useState('')
  const [selectedProfile, setSelectedProfile] = useState('')
  const [companies, setCompanies] = useState<string[]>([])
  const [profiles, setProfiles] = useState<string[]>([])
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [connected, setConnected] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null)

  function startEditing() {
    setUrl(config.erpnext_url || '')
    setApiKey(config.api_key || '')
    setApiSecret(config.api_secret || '')
    setSelectedCompany(config.company || '')
    setSelectedProfile(config.pos_profile || '')
    setStatus(null)
    setConnected(false)
    setCompanies([])
    setProfiles([])
    setEditing(true)
  }

  async function handleTest() {
    if (!url.trim() || !apiKey.trim() || !apiSecret.trim()) {
      setStatus({ ok: false, message: 'All fields are required' })
      return
    }
    setTesting(true)
    setStatus(null)
    setConnected(false)

    // Temporarily save to test
    await window.api.config.set('erpnext_url', url.trim().replace(/\/+$/, ''))
    await window.api.config.set('api_key', apiKey.trim())
    await window.api.config.set('api_secret', apiSecret.trim())

    const result = await window.api.sync.testConnection()
    if (result.success) {
      setStatus({ ok: true, message: `Connected as ${result.user}` })
      setConnected(true)

      // Fetch companies and POS profiles
      try {
        const fetchedCompanies = await window.api.sync.getCompanies()
        setCompanies(fetchedCompanies)
        if (fetchedCompanies.length > 0 && !selectedCompany) {
          setSelectedCompany(fetchedCompanies[0])
        }

        const fetchedProfiles = await window.api.sync.getPosProfiles()
        const profileNames = fetchedProfiles.map((p: any) => p.name)
        setProfiles(profileNames)
        if (profileNames.length > 0 && !profileNames.includes(selectedProfile)) {
          setSelectedProfile(profileNames[0])
        }
      } catch (err: any) {
        setStatus({ ok: true, message: `Connected but failed to fetch data: ${err.message}` })
      }
    } else {
      // Revert to old values
      await window.api.config.set('erpnext_url', config.erpnext_url || '')
      await window.api.config.set('api_key', config.api_key || '')
      await window.api.config.set('api_secret', config.api_secret || '')
      setStatus({ ok: false, message: `Failed: ${result.error}` })
    }
    setTesting(false)
  }

  async function handleSave() {
    if (!selectedCompany || !selectedProfile) {
      setStatus({ ok: false, message: 'Please select a company and POS profile' })
      return
    }
    setSaving(true)
    setStatus({ ok: true, message: 'Saving and syncing data from ERPNext...' })
    await window.api.config.set('erpnext_url', url.trim().replace(/\/+$/, ''))
    await window.api.config.set('api_key', apiKey.trim())
    await window.api.config.set('api_secret', apiSecret.trim())
    await window.api.config.set('company', selectedCompany)
    await window.api.config.set('pos_profile', selectedProfile)

    // Run full sync to pull fresh data from the new connection
    try {
      await window.api.sync.run()
      setStatus({ ok: true, message: 'Saved and synced successfully!' })
    } catch {
      setStatus({ ok: true, message: 'Saved. Sync will run in background.' })
    }

    setSaving(false)
    setEditing(false)
    onSave()
  }

  function handleCancel() {
    // Revert if we changed during test
    window.api.config.set('erpnext_url', config.erpnext_url || '')
    window.api.config.set('api_key', config.api_key || '')
    window.api.config.set('api_secret', config.api_secret || '')
    setEditing(false)
    setStatus(null)
    setConnected(false)
  }

  return (
    <div className="mb-6 rounded-xl border bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          ERPNext Connection
        </h3>
        {!editing && (
          <button onClick={startEditing}
            className="rounded-lg border border-input px-3 py-1.5 text-xs font-medium hover:bg-muted">
            Edit Connection
          </button>
        )}
      </div>

      {!editing ? (
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
          <div>
            <label className="mb-1 block text-sm font-medium">API Key</label>
            <input type="text" value={config.api_key ? `${config.api_key.slice(0, 8)}...` : ''} readOnly className="w-full rounded-lg border border-input bg-muted/30 px-3 py-2 font-mono text-sm" />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Site URL</label>
            <input type="url" value={url} onChange={(e) => { setUrl(e.target.value); setConnected(false) }}
              className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="https://erp.example.com" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">API Key</label>
            <input type="text" value={apiKey} onChange={(e) => { setApiKey(e.target.value); setConnected(false) }}
              className="w-full rounded-lg border border-input px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">API Secret</label>
            <input type="password" value={apiSecret} onChange={(e) => { setApiSecret(e.target.value); setConnected(false) }}
              className="w-full rounded-lg border border-input px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>

          {status && (
            <div className={`rounded-lg p-3 text-sm ${status.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
              {status.message}
            </div>
          )}

          {/* Company & Profile — shown after successful connection */}
          {connected && companies.length > 0 && (
            <div className="rounded-lg border-2 border-emerald-100 bg-emerald-50/30 p-4 space-y-3">
              <p className="text-xs font-semibold text-emerald-700">Connection verified — select Company & POS Profile</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium">Company</label>
                  <select value={selectedCompany} onChange={(e) => setSelectedCompany(e.target.value)}
                    className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                    <option value="">Select Company...</option>
                    {companies.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">POS Profile</label>
                  <select value={selectedProfile} onChange={(e) => setSelectedProfile(e.target.value)}
                    className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                    <option value="">Select POS Profile...</option>
                    {profiles.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={handleCancel}
              className="rounded-lg border border-input px-4 py-2 text-sm font-medium hover:bg-muted">Cancel</button>
            {!connected ? (
              <button onClick={handleTest} disabled={testing}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {testing ? 'Verifying...' : 'Verify Connection'}
              </button>
            ) : (
              <button onClick={handleSave} disabled={saving || !selectedCompany || !selectedProfile}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {saving ? 'Saving & Syncing...' : 'Save Changes'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function SyncNowCard() {
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [lastSync, setLastSync] = useState<string | null>(null)

  useEffect(() => { loadStatus() }, [])

  async function loadStatus() {
    const s = await window.api.sync.status()
    setLastSync(s.lastSyncAt)
    setResult(s.lastResult)
  }

  async function handleSync() {
    setSyncing(true)
    setResult(null)
    const res = await window.api.sync.run()
    setResult(res)
    const s = await window.api.sync.status()
    setLastSync(s.lastSyncAt)
    setSyncing(false)
  }

  return (
    <div className="mb-6 rounded-xl border bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Sync Data</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Last synced: {lastSync ? new Date(lastSync).toLocaleString() : 'Never'}
          </p>
        </div>
        <button onClick={handleSync} disabled={syncing}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {syncing ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Syncing...</>
          ) : (
            <>Sync Now</>
          )}
        </button>
      </div>

      {result && (
        <div className="space-y-2">
          {result.down && (
            <div className={`rounded-lg p-3 text-sm ${result.down.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
              <span className="font-medium">From ERPNext: </span>
              {result.down.success ? (
                result.down.counts ? Object.entries(result.down.counts).map(([k, v]) => `${k}: ${v}`).join(', ') : 'OK'
              ) : (
                result.down.error || 'Failed'
              )}
            </div>
          )}
          {result.up && (result.up.synced > 0 || result.up.failed > 0) && (
            <div className={`rounded-lg p-3 text-sm ${result.up.failed === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
              <span className="font-medium">To ERPNext: </span>
              {result.up.synced} synced{result.up.failed > 0 ? `, ${result.up.failed} failed` : ''}
            </div>
          )}
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        Pulls items, item groups, payment methods, tables, and rooms from ERPNext.
        Pushes completed orders back to ERPNext.
      </p>
    </div>
  )
}
