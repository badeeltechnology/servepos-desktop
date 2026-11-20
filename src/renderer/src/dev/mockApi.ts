/* eslint-disable @typescript-eslint/no-explicit-any */
// DEV-ONLY browser harness. Installs a stateful, in-memory window.api with realistic data for
// a demo bar so the renderer can run under plain Vite (no Electron, no SQLite).
// Loaded from main.tsx only when VITE_MOCK_API === '1' and window.api is missing; the Electron
// build never defines VITE_MOCK_API, so this module is not even bundled there.
//
// URL switches (all optional):
//   ?shift=closed     no open shift (shows Open shift)
//   ?wo=now|later|none  waiter-app orders: immediately, after 12 s (default), or never
//   ?autoaccept=0     waiter_order_auto_accept off (manual accept)
//   ?setup=1          first-run setup
//   ?empty=1          no open orders
//   ?idle=0.25        inactivity timeout in minutes (default 600)
//   ?floor=large      large-venue layout: ~130 tables in Section A-F, Sofa, Terrace, Dine-in,
//                     ~25 occupied; start_screen left unset so the till opens on Tables
//   ?printfail=1      KOT and receipt printing fail (to test sticky errors + Retry)
//   ?directpay=supervisor|off  receipt config direct_pay (default all)
//   ?update=available|downloading|downloaded|none
//                     in-app update state (default: not checked yet, no chip). "Update now"
//                     from available runs a ~3 s download; install() records __mock.installed.
//   ?channel=pilot|off  update channel (default stable)

import { useSessionGuard } from '../stores/ui'

const q = new URLSearchParams(location.search)
const opt = {
  shiftClosed: q.get('shift') === 'closed',
  wo: (q.get('wo') || 'later') as 'now' | 'later' | 'none',
  autoAccept: q.get('autoaccept') !== '0',
  setup: q.get('setup') === '1',
  empty: q.get('empty') === '1',
  printFail: q.get('printfail') === '1',
  currency: (q.get('currency') || 'QAR').toUpperCase(),
  tax: q.get('tax'),
  floor: q.get('floor'),
  directPay: q.get('directpay'),
  // Popular tab: ?pinned=none|CODE,CODE (server pins) and ?pop=none (a new till with no sales history)
  pinned: q.get('pinned'),
  pop: q.get('pop'),
  update: q.get('update') as 'available' | 'downloading' | 'downloaded' | 'none' | null,
  channel: q.get('channel')
}
const LARGE = opt.floor === 'large'
// ?currency=OMR: Omani outlet. Prices in rials (3 decimals), VAT 5% unless ?tax=0,
// currency_decimals left unset so the decimals come from the currency code.
const OMR = opt.currency === 'OMR'
const OMR_PRICES: Record<string, number> = { 'Cold Brew': 1.375, 'Iced Spanish Latte': 2.1, 'Karak Tea': 0.3, 'Water 500 ml': 0.2, Cappuccino: 1.6 }
/** Convert a QAR mock amount to rials (≈ /9.5, to the nearest 5 baisa). */
const cv = (n: number) => (OMR ? Math.round((n / 9.5) * 200) / 200 : n)

let seq = 1000
const uid = (p = 'id') => `${p}-${++seq}`
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x))
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
/** SQLite-style UTC timestamp, `min` minutes ago. */
function ago(min: number) {
  return new Date(Date.now() - min * 60000).toISOString().slice(0, 19).replace('T', ' ')
}

// ------------------------------------------------------------------ menu
const groups = [
  ['Coffee', 'القهوة'], ['Croissant', 'كرواسون'], ['Sweets', 'الحلويات'], ['Fresh juices', 'عصائر طازجة'],
  ['Mojitos & ice tea', 'موهيتو وشاي مثلج'], ['Mocktails', 'موكتيل'], ['Açai & bowls', 'أساي'], ['Smoothies', 'سموذي'],
  ['Breakfast', 'الفطور'], ['Sandwiches', 'السندويشات'], ['Salads', 'السلطات'], ['Soft drinks', 'المشروبات الغازية'], ['Tea', 'الشاي'], ['Shisha', 'شيشة']
].map(([name, name_ar]) => ({ name, name_ar }))

type MI = [string, string, number, string, string?] // name, ar, rate, group, description
const menuRaw: MI[] = [
  ['Iced Spanish Latte', 'سبانش لاتيه مثلج', 28, 'Coffee', 'Double espresso, condensed milk and cold milk over ice.'],
  ['Hot Latte', 'لاتيه ساخن', 28, 'Coffee'], ['Cappuccino', 'كابتشينو', 26, 'Coffee'], ['Iced Latte', 'لاتيه مثلج', 28, 'Coffee'],
  ['Hot Espresso', 'إسبريسو', 18, 'Coffee'], ['Hot Americano', 'أمريكانو ساخن', 20, 'Coffee'], ['Iced Americano', 'أمريكانو مثلج', 20, 'Coffee'],
  ['Cold Brew', 'كولد برو', 22, 'Coffee'], ['Hot Cortado', 'كورتادو', 23, 'Coffee'], ['Hot Macchiato', 'ماكياتو', 24, 'Coffee'],
  ['Hot Doppio', 'دوبيو', 25, 'Coffee'], ['Frappe', 'فرابيه', 26, 'Coffee'], ['Hot Flat White', 'فلات وايت', 26, 'Coffee'],
  ['Hot Spanish Latte', 'سبانش لاتيه ساخن', 28, 'Coffee'], ['Hot Affogato', 'أفوجاتو', 28, 'Coffee'], ['Hot Mocha', 'موكا', 30, 'Coffee'], ['Hot Chocolate', 'شوكولاتة ساخنة', 35, 'Coffee'],
  ['Croissant Zaatar', 'كرواسون زعتر', 24, 'Croissant'], ['Croissant Cheese', 'كرواسون جبنة', 27, 'Croissant'], ['Croissant Plain', 'كرواسون سادة', 22, 'Croissant'], ['Croissant Almond', 'كرواسون لوز', 29, 'Croissant'],
  ['Brownies', 'براونيز', 24, 'Sweets'], ['Mango Cake', 'كيكة المانجو', 38, 'Sweets'], ['Cookies', 'كوكيز', 24, 'Sweets'], ['Crepe Nutella', 'كريب نوتيلا', 25, 'Sweets'], ['Crepe Kinder', 'كريب كندر', 27, 'Sweets'], ['Profit Roll', 'بروفيترول', 28, 'Sweets'],
  ['Orange Juice 12 oz', 'عصير برتقال', 25, 'Fresh juices'], ['Mix Fruit Juice 12 oz', 'عصير فواكه مشكلة', 35, 'Fresh juices'], ['Carrot Juice 12 oz', 'عصير جزر', 25, 'Fresh juices'], ['Carrot Orange Juice', 'جزر وبرتقال', 25, 'Fresh juices'], ['Exotic Juice 12 oz', 'عصير استوائي', 34, 'Fresh juices'],
  ['Blue Lagoon Mojito', 'موهيتو بلو لاجون', 30, 'Mojitos & ice tea'], ['Classic Mint Mojito 16 oz', 'موهيتو نعناع', 28, 'Mojitos & ice tea'], ['Karkadeh', 'كركديه', 25, 'Mojitos & ice tea'], ['Iced Tea Peach', 'شاي مثلج بالخوخ', 29, 'Mojitos & ice tea'],
  ['Mango Mojito 16 oz', 'موهيتو مانجو', 30, 'Mojitos & ice tea'], ['Peach Mojito 16 oz', 'موهيتو خوخ', 30, 'Mojitos & ice tea'], ['Passion Fruit Mojito 16 oz', 'موهيتو باشن فروت', 30, 'Mojitos & ice tea'],
  ['Mango Tango 16 oz', 'مانجو تانجو', 34, 'Mocktails'], ['Coconut Cloud 16 oz', 'كوكونت كلاود', 38, 'Mocktails'], ['High Waves 16 oz', 'هاي ويفز', 32, 'Mocktails'], ['Melon Rush 16 oz', 'ميلون راش', 34, 'Mocktails'],
  ['Açai Bowl (L)', 'وعاء أساي كبير', 45, 'Açai & bowls', 'Açai, granola, banana, berries and honey.'], ['Açai Bowl (M)', 'وعاء أساي وسط', 35, 'Açai & bowls'], ['Açai Smoothie (M)', 'سموذي أساي', 42, 'Açai & bowls'],
  ['Berry Blast', 'بيري بلاست', 32, 'Smoothies'], ['Green Detox', 'جرين ديتوكس', 32, 'Smoothies'],
  ['Shakshuka', 'شكشوكة', 38, 'Breakfast'], ['Halloumi Plate', 'طبق حلوم', 42, 'Breakfast'],
  ['Club Sandwich', 'كلوب ساندويتش', 42, 'Sandwiches'], ['Chicken Pesto Panini', 'بانيني دجاج بيستو', 39, 'Sandwiches'], ['Fries', 'بطاطس مقلية', 18, 'Sandwiches'],
  ['Chicken Caesar', 'سلطة سيزر بالدجاج', 44, 'Salads'], ['Greek Salad', 'سلطة يونانية', 36, 'Salads'],
  ['Water 500 ml', 'ماء ٥٠٠ مل', 6, 'Soft drinks'], ['Soft Drinks', 'مشروبات غازية', 10, 'Soft drinks'], ['Red Bull', 'ريد بول', 20, 'Soft drinks'], ['Sparkling Water', 'مياه غازية', 12, 'Soft drinks'],
  ['Karak Tea', 'شاي كرك', 12, 'Tea'], ['Moroccan Mint Tea', 'شاي مغربي', 18, 'Tea'],
  ['Shisha Double Apple', 'شيشة تفاحتين', 80, 'Shisha'], ['Shisha Grape Mint', 'شيشة عنب ونعناع', 80, 'Shisha']
]
const code = (n: string) => n.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '')
const items: any[] = menuRaw.map(([n, ar, qarRate, g, desc]) => ({
  item_code: code(n), item_name: n, item_name_ar: ar, description: desc || null, description_ar: desc ? 'وصف الصنف بالعربية' : null,
  item_group: g, rate: OMR ? (OMR_PRICES[n] ?? cv(qarRate)) : qarRate, image: null, has_variants: n === 'Soft Drinks' ? 1 : 0, variant_of: null, attributes: null, is_visible: 1
}))
for (const [v, ar] of [['Coca-Cola', 'كوكا كولا'], ['Sprite', 'سبرايت'], ['Fanta Orange', 'فانتا برتقال'], ['Diet Coke', 'دايت كولا']]) {
  items.push({ item_code: 'SOFT-DRINKS-' + code(v), item_name: 'Soft Drinks - ' + v, item_name_ar: ar, description: null, description_ar: null, item_group: 'Soft drinks', rate: cv(10), image: null, has_variants: 0, variant_of: 'SOFT-DRINKS', attributes: JSON.stringify({ Flavour: v }) })
}

// modifier groups
const modGroups: any[] = [
  { id: 'mg-size', name: 'mg-size', group_name: 'Size', selection_type: 'Single', is_required: 1, max_selections: 1 },
  { id: 'mg-milk', name: 'mg-milk', group_name: 'Milk', selection_type: 'Single', is_required: 1, max_selections: 1 },
  { id: 'mg-extras', name: 'mg-extras', group_name: 'Extras', selection_type: 'Multiple', is_required: 0, max_selections: 3 },
  { id: 'mg-top', name: 'mg-top', group_name: 'Toppings', selection_type: 'Multiple', is_required: 0, max_selections: 2 },
  { id: 'mg-ice', name: 'mg-ice', group_name: 'Ice', selection_type: 'Single', is_required: 0, max_selections: 1 }
]
const mods: Record<string, any[]> = {
  'mg-size': [['Regular', 0, 1], ['Large', 4]],
  'mg-milk': [['Full cream', 0, 1], ['Skimmed', 0], ['Oat', 3], ['Almond', 3], ['Lactose free', 2]],
  'mg-extras': [['Extra shot', 5], ['Vanilla', 3], ['Caramel', 3], ['Hazelnut', 3], ['Decaf', 0], ['Whipped cream', 3]],
  'mg-top': [['Cashew nut', 3], ['Peanut butter', 4], ['Extra berries', 5], ['Coconut flakes', 2]],
  'mg-ice': [['Less ice', 0], ['No ice', 0], ['Extra ice', 0]]
} as any
const modsByGroup: Record<string, any[]> = {}
for (const g of Object.keys(mods)) modsByGroup[g] = (mods[g] as any[]).map(([n, p, d], i) => ({ id: `${g}-${i}`, modifier_name: n, price: p, is_default: d ? 1 : 0 }))
function itemModGroups(itemCode: string): any[] {
  const it = items.find((i) => i.item_code === itemCode)
  if (!it) return []
  const assign = (ids: string[]) => ids.map((gid, i) => { const g = modGroups.find((x) => x.id === gid); return { id: `${itemCode}-${gid}`, modifier_group_id: gid, group_name: g.group_name, selection_type: g.selection_type, is_required: g.is_required, max_selections: g.max_selections, display_order: i } })
  if (['Hot Latte', 'Cappuccino', 'Iced Latte', 'Hot Flat White', 'Hot Mocha', 'Hot Cortado', 'Frappe'].includes(it.item_name)) return assign(['mg-size', 'mg-milk', 'mg-extras'])
  if (['Hot Espresso', 'Hot Americano', 'Iced Americano', 'Hot Macchiato'].includes(it.item_name)) return assign(['mg-size', 'mg-extras'])
  if (it.item_group === 'Açai & bowls') return assign(['mg-top'])
  if (it.item_group === 'Mojitos & ice tea') return assign(['mg-ice'])
  return []
}

// ------------------------------------------------------------------ people, places
const users: any[] = [
  { id: 'u-mariam', name: 'Mariam', full_name: 'Mariam Haddad', role: 'cashier', max_discount_pct: 15, pin: '111111', is_active: 1 },
  { id: 'u-fatima', name: 'Fatima', full_name: 'Fatima Noor', role: 'cashier', max_discount_pct: 10, pin: '555555', is_active: 1 },
  { id: 'u-joseph', name: 'Joseph', full_name: 'Joseph Mathew', role: 'supervisor', max_discount_pct: 100, pin: '222222', is_active: 1 },
  { id: 'u-layla', name: 'Layla', full_name: 'Layla Saleh', role: 'supervisor', max_discount_pct: 100, pin: '333333', is_active: 1 },
  { id: 'u-pass', name: 'Kitchen pass', full_name: 'Kitchen pass', role: 'coordinator', max_discount_pct: 0, pin: '444444', is_active: 1 }
]
const waiters = [['Ahmed', '5550 1001'], ['Sara', '5550 1002'], ['Omar', '5550 1003'], ['Fatima', '5550 1004']].map(([n, phone]) => ({ name: n, waiter_name: n, phone, is_active: 1 }))
const rooms = LARGE
  ? [...'ABCDEF'.split('').map((l) => ({ name: `Section ${l}`, room_name: `Section ${l}` })), { name: 'Sofa', room_name: 'Sofa' }, { name: 'Terrace', room_name: 'Terrace' }, { name: 'Dine-in', room_name: 'Dine-in' }]
  : [{ name: 'Terrace', room_name: 'Terrace' }, { name: 'Main hall', room_name: 'Main hall' }, { name: 'Pool', room_name: 'Pool' }]
const tables: any[] = []
if (LARGE) {
  const add = (name: string, room: string, capacity = 4, status = 'Available') => tables.push({ name, table_name: name, room, capacity, status, current_order_id: null })
  for (const l of 'ABCDEF') {
    for (let i = 1; i <= 16; i++) {
      add(`${l}${i}`, `Section ${l}`, i % 4 === 0 ? 6 : 4)
      // split tables (A1A / A1B) where the section has them
      if ((l === 'A' || l === 'B') && i <= 3) { add(`${l}${i}A`, `Section ${l}`, 2); add(`${l}${i}B`, `Section ${l}`, 2) }
    }
  }
  for (let i = 1; i <= 6; i++) add(`Sofa ${i}`, 'Sofa', 6)
  for (let i = 1; i <= 8; i++) add(`T${i}`, 'Terrace', 4, i === 8 ? 'Blocked' : 'Available')
  for (let i = 1; i <= 9; i++) add(`Dine-in ${i}`, 'Dine-in', 2, i === 9 ? 'Reserved' : 'Available')
}
/** Table names in the seeded orders, re-seated on the large floor. */
const LARGE_SEAT: Record<string, string> = { T12: 'A12', T8: 'B3', T7: 'A7', T5: 'C5', T3: 'A1B', T6: 'Sofa 2', T9: 'D9', T2: 'T2', 'Bed 4': 'Dine-in 3', 'Bed 2': 'E4', T14: 'C14', T4: 'A4', T10: 'B10', 'Bed 3': 'F1' }
if (!LARGE) {
  for (let i = 1; i <= 12; i++) tables.push({ name: `T${i}`, table_name: `T${i}`, room: 'Terrace', capacity: i % 3 === 0 ? 6 : 4, status: 'Available', current_order_id: null })
  for (let i = 13; i <= 20; i++) tables.push({ name: `T${i}`, table_name: `T${i}`, room: 'Main hall', capacity: 4, status: i === 17 ? 'Reserved' : 'Available', current_order_id: null })
  for (let i = 1; i <= 8; i++) tables.push({ name: `Bed ${i}`, table_name: `Bed ${i}`, room: 'Pool', capacity: 2, status: i === 7 ? 'Blocked' : 'Available', current_order_id: null })
}

const paymentMethods = [
  { name: 'pm-cash', mode_of_payment: 'Cash', is_default: 1 },
  { name: 'pm-card', mode_of_payment: 'Card', is_default: 0 },
  { name: 'pm-room', mode_of_payment: 'Room charge', is_default: 0 },
  { name: 'pm-talabat', mode_of_payment: 'Talabat', is_default: 0 }
]
const voidReasons = ['Guest changed their mind', 'Wrong item entered', 'Kitchen mistake', 'Quality complaint', 'Took too long'].map((r, i) => ({ name: `vr-${i}`, reason_name: r }))
const promos = [
  { name: 'p-hh', promo_name: 'Happy hour', discount_type: 'Percentage', discount_value: 20 },
  { name: 'p-staff', promo_name: 'Staff meal', discount_type: 'Percentage', discount_value: 50 },
  { name: 'p-loyal', promo_name: 'Loyalty card', discount_type: 'Amount', discount_value: 10 }
]
const printers = [
  { id: 'pr-1', name: 'Counter', printer_name: 'Counter', type: 'network', is_active: 1 },
  { id: 'pr-2', name: 'Kitchen', printer_name: 'Kitchen', type: 'network', is_active: 1 },
  { id: 'pr-3', name: 'Bar', printer_name: 'Bar', type: 'network', is_active: 1 }
]

const config: Record<string, string> = {
  setup_complete: opt.setup ? '0' : '1', currency: OMR ? 'OMR' : 'QAR', erpnext_url: 'https://erp.example.com', pos_profile: LARGE ? 'Garden Hall' : 'Cocktail · POS 2', company: 'Demo Restaurants',
  // the bar checks start on the menu; the large floor uses the default (Tables, because it has tables)
  ...(LARGE ? {} : { start_screen: 'menu' }),
  pinned_items: JSON.stringify(opt.pinned === 'none' ? [] : opt.pinned ? opt.pinned.split(',') : [code('Club Sandwich'), 'BROWNIES', 'NOT-ON-THIS-MENU']),
  inactivity_timeout: q.get('idle') || '600', touch_keyboard_enabled: '0', last_sync_at: new Date(Date.now() - 4 * 60000).toISOString()
}
const receiptConfig: Record<string, string> = {
  restaurant_name: 'DEMO BAR', restaurant_name_ar: 'بار تجريبي', address_line_1: 'Seafront Road', address_line_1_ar: 'طريق الواجهة البحرية', phone: '+974 4400 1234',
  footer_message: 'Thank you, visit again', footer_message_ar: 'شكراً لزيارتكم', show_arabic: '1', show_arabic_items: '1', currency_symbol: OMR ? 'OMR' : 'QAR', currency_position: 'before', currency_decimals: OMR ? '' : '2',
  tax_enabled: OMR && opt.tax !== '0' ? '1' : '0', tax_rate: OMR && opt.tax !== '0' ? '5' : '0', tax_label: 'VAT', discount_enabled: '1', discount_permission: 'all_users', show_description_on_pos: '1',
  waiter_order_auto_accept: opt.autoAccept ? '1' : '0', receipt_auto_print: '1', kot_copies: '1', receipt_copies: '1', show_cashier_name: '1', vat_number: '', cr_number: '',
  ...(opt.directPay ? { direct_pay: opt.directPay } : {})
}

// ------------------------------------------------------------------ session + orders
let session: any = opt.shiftClosed ? null : { id: 'sess-1', user_id: 'u-mariam', user_name: 'Mariam', opened_at: ago(380), status: 'Open', opening_balance: JSON.stringify([{ mode: 'Cash', amount: cv(1000) }]) }
const closedSessions = new Set<string>(['sess-0'])
const lastSession = { id: 'sess-0', user_name: 'Joseph', opened_at: ago(60 * 24), closed_at: ago(60 * 9), status: 'Closed', opening_balance: JSON.stringify([{ mode: 'Cash', amount: cv(1000) }]), closing_balance: JSON.stringify([{ mode: 'Cash', amount: cv(7420) }]) }
const orders: any[] = []
const orderItems: any[] = []
const payments: any[] = []
const printLog: any[] = []
let orderSeq = 130

function lineFor(name: string, qty: number, extra: Partial<any> = {}) {
  const it = items.find((i) => i.item_name === name)!
  const modifiers = extra.modifiers || null
  const modTotal = modifiers ? JSON.parse(modifiers).reduce((s: number, m: any) => s + m.price, 0) : 0
  return { item_code: it.item_code, item_name: it.item_name, qty, rate: it.rate, modifiers, modifier_total: modTotal, amount: (it.rate + modTotal) * qty, special_instructions: extra.special_instructions || null, kot_printed: extra.kot_printed ?? 1 }
}
function makeOrder(o: any, lines: any[]) {
  if (LARGE && o.table_name && LARGE_SEAT[o.table_name]) {
    o.table_name = LARGE_SEAT[o.table_name]
    o.room = tables.find((t) => t.name === o.table_name)?.room || null
  }
  const id = uid('ord')
  const order = {
    id, order_number: `NC-T02-${String(++orderSeq).padStart(4, '0')}`, status: 'Open', order_type: 'Dine In', table_name: null, room: null, guests: 2,
    cashier_id: 'u-mariam', cashier_name: 'Mariam', waiter_id: null, waiter_name: null, session_id: session?.id || 'sess-1', created_at: ago(10),
    subtotal: 0, discount_amount: 0, discount_percent: 0, discount_reason: null, promo_name: null, voucher_code: null, tax_total: 0, grand_total: 0, tip_amount: 0,
    kot_printed: 1, sync_status: 'pending', sync_error: null, erpnext_docname: null, void_reason: null, order_notes: null, completed_at: null, ...o
  }
  for (const l of lines) orderItems.push({ id: uid('oi'), order_id: id, discount_amount: 0, discount_percent: 0, voided: 0, sent_at: l.kot_printed ? order.created_at : null, ...l })
  const sub = lines.reduce((s, l) => s + l.amount, 0)
  order.subtotal = sub
  order.grand_total = order.grand_total || sub
  orders.push(order)
  if (order.table_name && ['Open', 'Hold', 'Preparing', 'Ready to Serve', 'Invoiced'].includes(order.status)) {
    const t = tables.find((x) => x.name === order.table_name); if (t) { t.status = 'Occupied'; t.current_order_id = id }
  }
  return order
}
const M = (arr: [string, string, number][]) => JSON.stringify(arr.map(([group, name, price], i) => ({ id: `m${i}`, name, group, price })))

if (!opt.empty) {
  const t12 = makeOrder({ table_name: 'T12', room: 'Terrace', guests: 4, waiter_id: 'Ahmed', waiter_name: 'Ahmed', created_at: ago(16) }, [
    lineFor('Hot Latte', 1, { modifiers: M([['Milk', 'Oat', 3]]) }), lineFor('Iced Spanish Latte', 2), lineFor('Cappuccino', 1),
    lineFor('Classic Mint Mojito 16 oz', 2, { modifiers: M([['Ice', 'Less ice', 0]]) }), lineFor('Açai Bowl (L)', 1, { modifiers: M([['Toppings', 'Cashew nut', 3]]) }), lineFor('Croissant Cheese', 1)
  ])
  // a second round, sent 10 minutes after the first
  orderItems.filter((i) => i.order_id === t12.id).slice(-2).forEach((i) => { i.sent_at = ago(6) })
  makeOrder({ table_name: 'T8', room: 'Terrace', guests: 4, waiter_id: 'Ahmed', waiter_name: 'Ahmed', created_at: ago(41), order_notes: 'Nut allergy, seat 2' }, [lineFor('Mango Tango 16 oz', 2), lineFor('Club Sandwich', 1, { special_instructions: 'No mayo' }), lineFor('Açai Bowl (L)', 2)])
  makeOrder({ table_name: 'T7', room: 'Terrace', guests: 2, waiter_id: 'Ahmed', waiter_name: 'Ahmed', status: 'Preparing', created_at: ago(9) }, [lineFor('Cappuccino', 2)])
  makeOrder({ order_type: 'Takeaway', guests: 1, status: 'Ready to Serve', created_at: ago(14), order_notes: 'Fatima · 5550 1234' }, [lineFor('Iced Spanish Latte', 1), lineFor('Cookies', 1)])
  makeOrder({ order_type: 'Delivery', guests: 1, created_at: ago(19), order_notes: 'Talabat 4412' }, [lineFor('Chicken Caesar', 1, { special_instructions: 'Dressing on the side' }), lineFor('Iced Latte', 2), lineFor('Brownies', 1)])
  makeOrder({ table_name: 'T5', room: 'Main hall', guests: 4, waiter_id: 'Sara', waiter_name: 'Sara', status: 'Ready to Serve', created_at: ago(27) }, [lineFor('Cappuccino', 2), lineFor('Croissant Cheese', 1), lineFor('Crepe Kinder', 1)])
  makeOrder({ table_name: 'T3', room: 'Terrace', guests: 2, status: 'Hold', created_at: ago(33) }, [lineFor('Karak Tea', 2), lineFor('Croissant Zaatar', 1)])
  makeOrder({ table_name: 'T6', room: 'Terrace', guests: 3, status: 'Hold', cashier_name: 'Joseph', kot_printed: 0, created_at: ago(48) }, [lineFor('Orange Juice 12 oz', 1, { kot_printed: 0 }), lineFor('Mango Cake', 1, { kot_printed: 0 })])
  makeOrder({ table_name: 'T9', room: 'Terrace', guests: 8, waiter_id: 'Sara', waiter_name: 'Sara', status: 'Invoiced', created_at: ago(52) }, [lineFor('Cappuccino', 3), lineFor('Orange Juice 12 oz', 2), lineFor('Crepe Nutella', 2), lineFor('Mango Cake', 1, { special_instructions: 'Birthday candle' })])
  // opened before midnight and still open (must stay visible on the kitchen pass)
  makeOrder({ table_name: 'T2', room: 'Terrace', guests: 2, waiter_id: 'Sara', waiter_name: 'Sara', status: 'Preparing', created_at: ago(new Date().getHours() * 60 + new Date().getMinutes() + 25) }, [lineFor('Moroccan Mint Tea', 2)])
  if (LARGE) {
    // a busy evening: ~25 tables in use across the sections
    const W = ['Ahmed', 'Sara', 'Omar', 'Fatima', null]
    const seats: [string, string, number, number][] = [
      ['A2', 'Open', 6, 3], ['A5', 'Preparing', 12, 2], ['A9', 'Ready to Serve', 22, 4], ['A14', 'Open', 37, 5], ['A1A', 'Preparing', 4, 2],
      ['B1', 'Invoiced', 58, 4], ['B7', 'Open', 15, 2], ['B12', 'Hold', 26, 3], ['C2', 'Preparing', 8, 6], ['C9', 'Open', 44, 4],
      ['D1', 'Ready to Serve', 19, 2], ['D4', 'Open', 2, 2], ['E8', 'Invoiced', 71, 5], ['F3', 'Preparing', 13, 4], ['Sofa 5', 'Open', 31, 6], ['Dine-in 1', 'Open', 7, 2]
    ]
    seats.forEach(([tb, status, min, g], i) => makeOrder({ table_name: tb, room: tables.find((t) => t.name === tb)?.room, guests: g, waiter_id: W[i % 5], waiter_name: W[i % 5], status, created_at: ago(min) },
      [lineFor(['Cappuccino', 'Karak Tea', 'Iced Spanish Latte', 'Mango Tango 16 oz'][i % 4], 1 + (i % 3)), lineFor(['Club Sandwich', 'Croissant Cheese', 'Crepe Nutella', 'Brownies'][i % 4], 1 + (i % 2))]))
  }
  makeOrder({ table_name: 'Bed 4', room: 'Pool', guests: 2, waiter_id: 'Omar', waiter_name: 'Omar', created_at: ago(11) }, [lineFor('Peach Mojito 16 oz', 2), lineFor('Açai Smoothie (M)', 1)])
}
// completed history
const histDefs: [string, string | null, string, number, string, string, string | null][] = [
  ['Takeaway', null, 'Cash', 46, 'synced', '', null], ['Dine In', 'T2', 'Card', 96, 'synced', '', null], ['Dine In', 'Bed 3', 'Room charge', 164, 'synced', '', null],
  ['Takeaway', null, 'Cash', 74, 'failed', 'ERPNext timed out', null], ['Dine In', 'T4', 'Card', 212, 'failed', 'Item "Crepe Kinder" disabled in ERPNext', null],
  ['Delivery', null, 'Talabat', 88, 'synced', '', null], ['Dine In', 'T6', 'Card', 240, 'pending', '', null], ['Takeaway', null, 'Cash', 28, 'synced', '', null]
]
histDefs.forEach(([type, table, method, qarTotal, sync, err], i) => {
  const total = cv(qarTotal)
  const o = makeOrder({ order_type: type, table_name: table, status: 'Completed', created_at: ago(300 - i * 30), completed_at: ago(290 - i * 30), sync_status: sync, sync_error: err || null, erpnext_docname: sync === 'synced' ? `ACC-PSINV-2026-0${4100 + i}` : null, grand_total: total }, [lineFor('Cappuccino', 1), lineFor('Brownies', 1)])
  o.subtotal = total
  payments.push({ id: uid('pay'), order_id: o.id, payment_method: method, amount: total, reference: null })
})
// Popular tab: 7-day sales history of this till (hoursAgo, voided) feeding reports.popularItems, plus
// completed orders rung up in the harness. Same weighting as the main-process query.
const salesHistory: { item_code: string; item_name: string; qty: number; hoursAgo: number; voided?: boolean }[] = opt.pop === 'none' ? [] : [
  ...[['Iced Spanish Latte', 34], ['Hot Latte', 28], ['Blue Lagoon Mojito', 22], ['Açai Bowl (L)', 19], ['Croissant Zaatar', 17], ['Cappuccino', 15], ['Orange Juice 12 oz', 12], ['Mango Tango 16 oz', 11]]
    .map(([n, q], i) => ({ item_code: code(n as string), item_name: n as string, qty: q as number, hoursAgo: i % 3 === 2 ? 26 : 1 })),
  { item_code: code('Club Sandwich'), item_name: 'Club Sandwich', qty: 6, hoursAgo: 50 },
  // a big voided line must never make Popular
  { item_code: code('Hot Mocha'), item_name: 'Hot Mocha', qty: 90, hoursAgo: 1, voided: true }
]
function popularItems(limit = 18) {
  const now = Date.now()
  const lines = [
    ...salesHistory.map((l) => ({ ...l, at: now - l.hoursAgo * 3600000 })),
    ...orderItems.filter((l) => orders.find((o) => o.id === l.order_id)?.status === 'Completed' && opt.pop !== 'none').map((l) => ({ ...l, voided: !!l.voided, at: Date.parse(orders.find((o) => o.id === l.order_id)!.created_at.replace(' ', 'T') + 'Z') || now }))
  ]
  const day = (t: number) => new Date(t).toLocaleDateString('en-CA')
  const today = day(now), yesterday = day(now - 86400000), hour = new Date(now).getHours()
  const score: Record<string, { item_code: string; item_name: string; score: number }> = {}
  for (const l of lines) {
    if (l.voided || now - l.at > 7 * 86400000) continue
    const dh = Math.abs(new Date(l.at).getHours() - hour)
    const w = l.qty * (Math.min(dh, 24 - dh) <= 2 ? 1 : 0.35) * (day(l.at) === today ? 1 : day(l.at) === yesterday ? 0.7 : 0.5)
    const e = (score[l.item_code] ||= { item_code: l.item_code, item_name: l.item_name, score: 0 })
    e.score += w
  }
  return Object.values(score).sort((a, b) => b.score - a.score).slice(0, limit)
}

const voided = makeOrder({ order_type: 'Dine In', table_name: 'T10', status: 'Void', void_reason: 'Guest changed their mind', created_at: ago(200), sync_status: 'synced' }, [lineFor('Hot Mocha', 1)])
void voided
for (const t of tables) if (t.current_order_id && !orders.find((o) => o.id === t.current_order_id && !['Completed', 'Void'].includes(o.status))) { t.status = 'Available'; t.current_order_id = null }

// waiter-app orders (pending at ERPNext)
let waiterOrders: any[] = [
  { name: 'WO-2026-00119', waiter_name: 'Omar', table: 'Bed 2', room: 'Pool', order_type: 'Dine In', guests: 2, created: ago(1), status: 'Pending', notes: '',
    items: [{ item_code: code('Blue Lagoon Mojito'), item_name: 'Blue Lagoon Mojito', qty: 2, rate: 30, modifier_total: 0, modifiers: [{ group: 'Ice', name: 'Less ice', price: 0 }] }, { item_code: 'FRIES', item_name: 'Fries', qty: 1, rate: 18, modifier_total: 0 }, { item_code: code('Club Sandwich'), item_name: 'Club Sandwich', qty: 1, rate: 42, modifier_total: 0, special_instructions: 'No mayo' }, { item_code: code('Water 500 ml'), item_name: 'Water 500 ml', qty: 2, rate: 6, modifier_total: 0 }] },
  { name: 'WO-2026-00118', waiter_name: 'Sara', table: 'T14', room: 'Main hall', order_type: 'Dine In', guests: 3, created: ago(3), status: 'Pending', notes: '',
    items: [{ item_code: code('Mango Tango 16 oz'), item_name: 'Mango Tango 16 oz', qty: 1, rate: 34, modifier_total: 0 }, { item_code: 'BROWNIES', item_name: 'Brownies', qty: 1, rate: 24, modifier_total: 0 }] },
  // waiter app v2: a second round for a table that already has an open order
  { name: 'WO-2026-00121', waiter_name: 'Ahmed', table: 'T8', room: 'Terrace', order_type: 'Dine In', guests: 4, created: ago(0), status: 'Pending', notes: 'Bring with the mains', parent_order: 'WO-2026-00102', round_no: 2,
    items: [{ item_code: code('Iced Latte'), item_name: 'Iced Latte', qty: 2, rate: 28, modifier_total: 0 }, { item_code: code('Water 500 ml'), item_name: 'Water 500 ml', qty: 2, rate: 6, modifier_total: 0 }] }
]
if (LARGE) for (const w of waiterOrders) if (LARGE_SEAT[w.table]) { w.table = LARGE_SEAT[w.table]; w.room = tables.find((t) => t.name === w.table)?.room }
const woVisibleAt = opt.wo === 'now' ? 0 : opt.wo === 'later' ? Date.now() + 12000 : Infinity

// ------------------------------------------------------------------ sync
let syncing = false
/** What the next sync pulls as pinned_items (set from Playwright via __mock.setServerPinned) */
let serverPinned: string[] | null = null
let nextSyncAt = Date.now() + 95000
let lastResult: any = { down: { success: true, counts: { items: items.length } }, up: { success: true, synced: 4, failed: 0, errors: [] } }

// ------------------------------------------------------------------ helpers
const ORDER_FIELDS: Record<string, string> = {
  status: 'status', kotPrinted: 'kot_printed', subtotal: 'subtotal', grandTotal: 'grand_total', discountAmount: 'discount_amount', discountPercent: 'discount_percent',
  discountReason: 'discount_reason', promoName: 'promo_name', orderNotes: 'order_notes', taxTotal: 'tax_total', voucherCode: 'voucher_code', tipAmount: 'tip_amount',
  completedAt: 'completed_at', voidReason: 'void_reason', voidRemarks: 'void_remarks', voidedBy: 'voided_by', voidDisposition: 'void_disposition', tableName: 'table_name', room: 'room', guests: 'guests', invoicePrinted: 'invoice_printed',
  waiterId: 'waiter_id', waiterName: 'waiter_name', orderType: 'order_type'
}
function liveItems(orderId: string) { return orderItems.filter((i) => i.order_id === orderId && !i.voided) }
function activeOrders() {
  return orders.filter((o) => ['Open', 'Hold', 'Preparing', 'Ready to Serve', 'Invoiced'].includes(o.status)).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map((o) => Object.assign(o, { unsent_items: orderItems.filter((i) => i.order_id === o.id && !i.kot_printed && !i.voided).length }))
}
function log(orderId: string, type: string, source = 'manual', actor = 'Mariam') { printLog.push({ id: uid('pl'), order_id: orderId, print_type: type, source, printer_name: type === 'kot' ? 'Kitchen' : 'Counter', actor_name: actor, status: 'success', printed_at: new Date().toISOString().slice(0, 19).replace('T', ' ') }) }

const impl: Record<string, Record<string, (...a: any[]) => any>> = {
  app: {
    getVersion: () => '2.17.0', checkForUpdate: () => ({ hasUpdate: false }), generateWaiterQR: () => ({ success: true, qr: '' })
  },
  config: {
    get: (k: string) => config[k] ?? null, set: (k: string, v: string) => { config[k] = v; return true }, getAll: () => clone(config), isSetupComplete: () => config.setup_complete === '1'
  },
  receiptConfig: {
    get: (k: string) => receiptConfig[k] ?? null, set: (k: string, v: string) => { receiptConfig[k] = v; return true }, getAll: () => clone(receiptConfig),
    setBulk: (c: Record<string, string>) => { Object.assign(receiptConfig, c); return true }
  },
  admin: { verify: (u: string, p: string) => u === 'admin' && p === 'admin', exists: () => true, create: () => true, updatePassword: () => true },
  users: {
    verifyPin: (pin: string) => { const u = users.find((x) => x.pin === pin && x.is_active); if (!u) return null; const { pin: _p, ...rest } = u; void _p; return clone(rest) },
    getAll: (role?: string) => clone(users.filter((u) => !role || u.role === role).map(({ pin: _p, ...r }) => r)),
    create: (name: string, pin: string, role: string) => { users.push({ id: uid('u'), name, full_name: name, role, pin, max_discount_pct: 0, is_active: 1 }); return true },
    update: () => true, delete: () => true
  },
  items: {
    get: () => clone(items.filter((i) => i.is_visible !== 0)), getAll: () => clone(items),
    getVariants: (c: string) => clone(items.filter((i) => i.variant_of === c)), setVisibility: () => true, setGroupVisibility: () => true
  },
  itemGroups: { get: () => clone(groups), getAll: () => clone(groups) },
  tables: {
    get: (room?: string) => clone(tables.filter((t) => !room || t.room === room)),
    updateStatus: (name: string, status: string, orderId?: string) => { const t = tables.find((x) => x.name === name); if (t) { t.status = status; t.current_order_id = orderId || null } return true }
  },
  rooms: { get: () => clone(rooms) },
  orders: {
    create: (d: any) => {
      const o = makeOrder({ order_type: d.orderType, table_name: d.tableName, room: d.room, guests: d.guests, cashier_id: d.cashierId, cashier_name: d.cashierName, session_id: d.sessionId, waiter_id: d.waiterId, waiter_name: d.waiterName, kot_printed: 0, created_at: ago(0), status: 'Open', grand_total: 0 }, [])
      return clone(o)
    },
    get: (id: string) => clone(orders.find((o) => o.id === id) || null),
    getAll: (f: any = {}) => clone(orders.filter((o) => (!f.sessionId || o.session_id === f.sessionId) && (!f.status || o.status === f.status) && (!f.cashierId || o.cashier_id === f.cashierId)).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))),
    getActive: () => clone(activeOrders()),
    update: (id: string, u: any) => {
      const o = orders.find((x) => x.id === id); if (!o) return false
      for (const [k, v] of Object.entries(u)) if (ORDER_FIELDS[k] && v !== undefined) o[ORDER_FIELDS[k]] = v
      if (u.status === 'Completed') o.sync_status = 'pending'
      return true
    }
  },
  orderItems: {
    add: (d: any) => { const id = uid('oi'); orderItems.push({ id, order_id: d.orderId, item_code: d.itemCode, item_name: d.itemName, qty: d.qty, rate: d.rate, discount_amount: d.discountAmount || 0, discount_percent: d.discountPercent || 0, amount: d.amount, modifiers: d.modifiers || null, modifier_total: d.modifierTotal || 0, special_instructions: d.specialInstructions || null, kot_printed: 0, voided: 0 }); return id },
    get: (orderId: string) => clone(liveItems(orderId)),
    update: (id: string, u: any) => { const i = orderItems.find((x) => x.id === id); if (!i) return false; if (u.qty !== undefined) i.qty = u.qty; if (u.amount !== undefined) i.amount = u.amount; if (u.specialInstructions !== undefined) i.special_instructions = u.specialInstructions; return true },
    remove: (id: string) => { const ix = orderItems.findIndex((x) => x.id === id); if (ix >= 0) orderItems.splice(ix, 1); return true },
    void: (id: string, reason: string, by: string, remarks?: string, disp?: string) => { const i = orderItems.find((x) => x.id === id); if (i) Object.assign(i, { voided: 1, void_reason: reason, voided_by: by, void_remarks: remarks, void_disposition: disp }); return true },
    // same as worker-queries markItemsNoKot: unsent live lines -> kot_printed = 1, no_kot = 1; one 'no_kot' log row
    markNoKot: (orderId: string, actor: string) => {
      const rows = liveItems(orderId).filter((i) => !i.kot_printed)
      if (!rows.length) return 0
      for (const i of rows) { i.kot_printed = 1; i.no_kot = 1 }
      printLog.push({ id: uid('pl'), order_id: orderId, print_type: 'no_kot', source: 'manual', printer_name: null, actor_name: actor || null, status: 'success', printed_at: new Date().toISOString().slice(0, 19).replace('T', ' ') })
      return rows.length
    }
  },
  orderPayments: {
    add: (orderId: string, method: string, amount: number, reference?: string, by?: string) => { payments.push({ id: uid('pay'), order_id: orderId, payment_method: method, amount, reference: reference || null, collected_by_waiter: by || null }); return true },
    get: (orderId: string) => clone(payments.filter((p) => p.order_id === orderId))
  },
  paymentMethods: { get: () => clone(paymentMethods) },
  modifiers: {
    getGroups: () => clone(modGroups), getForGroup: (g: string) => clone(modsByGroup[g] || []), getItemGroups: (c: string) => clone(itemModGroups(c))
  },
  sessions: {
    getActive: () => clone(session),
    open: (d: any) => {
      if (session) throw new Error('A shift is already open. Close it first.')
      session = { id: uid('sess'), user_id: d.userId, user_name: d.userName, opened_at: ago(0), status: 'Open', opening_balance: JSON.stringify(d.openingBalance) }
      // same as worker-queries openSession: handed-over orders join the new shift
      for (const o of activeOrders()) if (closedSessions.has(o.session_id)) o.session_id = session.id
      return session.id
    },
    close: (id: string, closing: any, _remarks?: string, opts?: { handOver?: boolean }) => {
      if (activeOrders().length && !opts?.handOver) throw new Error(`Cannot close shift: ${activeOrders().length} order(s) still open or on hold. Supervisor must complete or void them first.`)
      if (session?.id === id) { closedSessions.add(id); Object.assign(lastSession, { ...session, closing_balance: JSON.stringify(closing), closed_at: ago(0), status: 'Closed' }); session = null } return true },
    autoClose: () => true,
    getOrders: (sid: string) => clone(orders.filter((o) => o.session_id === sid)),
    getOpenOrders: (sid: string) => clone(activeOrders().filter((o) => o.session_id === sid)),
    getAllOpenOrders: () => clone(activeOrders()),
    getPendingSync: (sid: string) => clone(orders.filter((o) => o.session_id === sid && o.status === 'Completed' && o.sync_status !== 'synced')),
    getWaiterSummary: () => [
      { waiter_name: 'Ahmed', paid_orders: 6, open_orders: 2, open_order_numbers: 'T12, T8', total_collected: 640 },
      { waiter_name: 'Sara', paid_orders: 5, open_orders: 1, open_order_numbers: 'T5', total_collected: 812 },
      { waiter_name: 'Omar', paid_orders: 3, open_orders: 0, open_order_numbers: '', total_collected: 228 }
    ],
    getAll: () => clone([session, lastSession].filter(Boolean))
  },
  printers: { get: () => clone(printers), test: () => ({ success: true }), discoverUsb: () => [] },
  printRoutes: { get: () => [] },
  print: {
    receipt: async (orderId: string) => { await sleep(300); if (opt.printFail) return { success: false, error: 'Counter printer offline' }; log(orderId, 'receipt'); return { success: true } },
    kots: async (orderId: string, actor?: string, reprint?: boolean) => {
      await sleep(250)
      if (opt.printFail) { opt.printFail = false; return { success: false, errors: ['Kitchen printer offline'] } } // fails once, Retry works
      // like print-engine printKots: nothing unsent (and not a reprint) prints nothing
      if (!reprint && !liveItems(orderId).some((i) => !i.kot_printed)) return { success: true, printed: 0, errors: [] }
      const o = orders.find((x) => x.id === orderId); if (o) o.kot_printed = 1
      if (!reprint) for (const i of liveItems(orderId)) if (!i.kot_printed) { i.kot_printed = 1; i.sent_at = ago(0) }
      log(orderId, 'kot', reprint ? 'reprint' : 'manual', actor || 'Mariam')
      return { success: true, errors: [] }
    },
    amendmentKot: () => ({ success: true }), waiterCopy: (id: string) => { log(id, 'waiter_copy'); return { success: true } }, prepDoc: () => ({ success: true }),
    invoice: (id: string) => { log(id, 'invoice'); return { success: true } }, guestShare: (d: any) => { printLog.push({ id: uid('pl'), order_id: null, print_type: 'guest_share', data: d, status: 'success' }); return { success: true } }, voidSlip: () => ({ success: true }), closeShift: () => ({ success: true }), pollReadyOrders: () => ({ printed: 0 })
  },
  printLog: { getForOrder: (id: string) => clone(printLog.filter((p) => p.order_id === id)) },
  waiters: { list: () => clone(waiters), fetchFromServer: () => clone(waiters), create: () => ({ success: true }), resetPin: () => ({ success: true }), toggleActive: () => ({ success: true }) },
  promos: { list: () => clone(promos) },
  voidReasons: { list: () => clone(voidReasons) },
  voidedItems: { list: () => [] },
  vouchers: {
    validate: async (c: string) => { await sleep(200); return c === '123456' ? { valid: true, discount_percent: 15 } : { valid: false, reason: 'Voucher not found or already used' } },
    use: () => ({ success: true })
  },
  keyboard: { show: () => true },
  coordinator: {
    getActiveOrders: () => clone(activeOrders().map((o) => { const its = liveItems(o.id); return { ...o, items_summary: its.map((i) => `${i.item_name} x${i.qty}`).join(', '), item_count: its.length } })),
    updateStatus: (id: string, status: string) => { const o = orders.find((x) => x.id === id); if (o) o.status = status; if (status === 'Ready to Serve') log(id, 'invoice', 'auto', 'Kitchen pass'); return { success: true } }
  },
  waiterOrders: {
    getPending: () => (Date.now() >= woVisibleAt ? clone(waiterOrders) : []),
    accept: async (name: string) => {
      await sleep(300)
      const wo = waiterOrders.find((w) => w.name === name); if (!wo) return { success: false, error: 'Already handled' }
      waiterOrders = waiterOrders.filter((w) => w.name !== name)
      const o = makeOrder({ table_name: wo.table, room: wo.room, guests: wo.guests, waiter_id: wo.waiter_name, waiter_name: wo.waiter_name, created_at: ago(0) }, wo.items.map((i: any) => ({ item_code: i.item_code, item_name: i.item_name, qty: i.qty, rate: i.rate, modifiers: i.modifiers ? JSON.stringify(i.modifiers) : null, modifier_total: i.modifier_total || 0, amount: (i.rate + (i.modifier_total || 0)) * i.qty, special_instructions: i.special_instructions || null, kot_printed: 1 })))
      log(o.id, 'kot', 'auto', wo.waiter_name)
      return { success: true, orderNumber: o.order_number, kotPrinted: true }
    },
    reject: (name: string) => { waiterOrders = waiterOrders.filter((w) => w.name !== name); return { success: true } }
  },
  backup: { exportFull: () => ({ success: true }), export: () => ({ success: true }), import: () => ({ success: false }) },
  reports: {
    todaySummary: () => ({ total_sales: 7842, order_count: 61, avg_order: 128.56, void_count: 3, discount_total: 214 }),
    bestSellingItems: () => [['Iced Spanish Latte', 34], ['Hot Latte', 28], ['Blue Lagoon Mojito', 22], ['Açai Bowl (L)', 19], ['Croissant Zaatar', 17], ['Cappuccino', 15], ['Orange Juice 12 oz', 12], ['Brownies', 11]].map(([n, q]) => { const it = items.find((i) => i.item_name === n)!; return { item_name: n, qty_sold: q, revenue: (q as number) * it.rate } }),
    popularItems: (limit?: number) => popularItems(limit),
    categorySales: () => [], paymentBreakdown: () => [{ payment_method: 'Cash', total: 3214 }, { payment_method: 'Card', total: 4120 }], hourlySales: () => [], voidReport: () => [], waiterPerformance: () => [], allItemsSales: () => [], removedItems: () => []
  },
  sync: {
    run: async () => {
      syncing = true; await sleep(1500)
      for (const o of orders) if (o.status === 'Completed' && o.sync_status === 'pending') { o.sync_status = 'synced'; o.erpnext_docname = 'ACC-PSINV-2026-0' + (4200 + Math.floor(Math.random() * 99)) }
      if (serverPinned) config.pinned_items = JSON.stringify(serverPinned)
      syncing = false; nextSyncAt = Date.now() + 120000; config.last_sync_at = new Date().toISOString()
      lastResult = { down: { success: true }, up: { success: true, synced: 1, failed: 0, errors: [] } }
      return clone(lastResult)
    },
    status: () => ({ isSyncing: syncing, lastSyncAt: config.last_sync_at, nextSyncIn: Math.max(0, Math.round((nextSyncAt - Date.now()) / 1000)), lastResult: clone(lastResult) }),
    startAuto: () => true, testConnection: () => ({ success: true }), getCompanies: () => [{ name: 'Demo Restaurants' }], getPosProfiles: () => [{ name: 'Cocktail · POS 2' }]
  }
}

// ------------------------------------------------------------------ in-app updates
// Not wrapped by the async proxy below: onState must return its unsubscribe synchronously.
const UPDATE_NOTES = 'What\'s new in 2.18.0\n• Split bill evenly or by item, guest by guest\n• Hold saves without sending to the kitchen\n• Menu and tables reload after every sync\n\nFixes\n• Close shift counts baisa coins correctly'
let updState: any = (() => {
  const base = { channel: ['pilot', 'off'].includes(opt.channel || '') ? opt.channel : 'stable', currentVersion: '2.17.0' }
  const found = { version: '2.18.0', notes: UPDATE_NOTES, date: '2026-10-22T09:00:00Z', lastCheckedAt: new Date().toISOString() }
  switch (opt.update) {
    case 'available': return { ...base, ...found, status: 'available' }
    case 'downloading': return { ...base, ...found, status: 'downloading', percent: 42, transferred: 42 * 1.26e6, total: 126e6, bytesPerSecond: 3.4e6 }
    case 'downloaded': return { ...base, ...found, status: 'downloaded', percent: 100 }
    case 'none': return { ...base, status: 'not-available', lastCheckedAt: new Date().toISOString() }
    default: return { ...base, status: base.channel === 'off' ? 'disabled' : 'idle' }
  }
})()
const updListeners = new Set<(s: any) => void>()
function pushUpd(patch: any, replace = false) {
  updState = replace ? { channel: updState.channel, currentVersion: updState.currentVersion, ...patch } : { ...updState, ...patch }
  ;(window as any).__mock && ((window as any).__mock.update = clone(updState))
  for (const l of updListeners) l(clone(updState))
}
const updatesApi = {
  getState: async () => { await sleep(20); return clone(updState) },
  check: async () => {
    if (updState.channel === 'off') return { ok: false, error: 'Updates are turned off on this POS.', state: clone(updState) }
    if (['downloading', 'downloaded'].includes(updState.status)) return { ok: true, state: clone(updState) }
    pushUpd({ status: 'checking' })
    await sleep(600)
    if (opt.update === 'available' || updState.version) pushUpd({ status: 'available', lastCheckedAt: new Date().toISOString() })
    else pushUpd({ status: 'not-available', lastCheckedAt: new Date().toISOString() }, true)
    return { ok: true, state: clone(updState) }
  },
  download: async () => {
    if (updState.status !== 'available') return { ok: false, error: 'There is no update to download. Check for updates first.', state: clone(updState) }
    pushUpd({ status: 'downloading', percent: 0, transferred: 0, total: 126e6, bytesPerSecond: 0 })
    let pct = 0
    const tick = setInterval(() => {
      pct = Math.min(100, pct + 10)
      if (pct >= 100) { clearInterval(tick); pushUpd({ status: 'downloaded', percent: 100 }); return }
      pushUpd({ percent: pct, transferred: pct * 1.26e6, bytesPerSecond: 4.2e6 })
    }, 300)
    return { ok: true, state: clone(updState) }
  },
  install: async () => {
    await sleep(50)
    if (updState.status !== 'downloaded') return { ok: false, error: 'The update has not finished downloading.', state: clone(updState) }
    ;(window as any).__mock.installed = true
    return { ok: true, state: clone(updState) }
  },
  setChannel: async (ch: string) => {
    await sleep(20)
    if (['downloading', 'downloaded'].includes(updState.status)) pushUpd({ channel: ch })
    else pushUpd({ channel: ch, status: ch === 'off' ? 'disabled' : 'idle' }, true)
    config.update_channel = ch
    return { ok: true, state: clone(updState) }
  },
  pendingSync: async () => { await sleep(20); return orders.filter((o) => o.status === 'Completed' && o.sync_status !== 'synced').length },
  onState: (cb: (s: any) => void) => { updListeners.add(cb); return () => { updListeners.delete(cb) } }
}

export function installMockApi() {
  const api = new Proxy({} as any, {
    get(_t, ns: string) {
      if (ns === 'updates') return updatesApi
      const group = impl[ns] || {}
      return new Proxy({}, {
        get(_g, fn: string) {
          const f = group[fn]
          return async (...args: any[]) => {
            await sleep(20)
            if (!f) { console.debug(`[mockApi] ${ns}.${fn} not mocked`); return null }
            return f(...args)
          }
        }
      })
    }
  })
  ;(window as any).api = api
  ;(window as any).__mock = { orders, orderItems, payments, tables, opt, printLog, waiterOrders: () => waiterOrders, salesHistory, setServerPinned: (c: string[]) => { serverPinned = c }, update: clone(updState), installed: false, pushUpdate: pushUpd, guard: useSessionGuard }
  console.info('[mockApi] installed (dev browser harness)')
}
