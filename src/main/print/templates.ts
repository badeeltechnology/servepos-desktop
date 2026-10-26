import { CMD } from './printer'
import { getDb } from '../database/schema'
import { getAllReceiptConfig, getConfig } from '../database/queries'

/** Currencies whose minor unit is 1/1000 (Omani rial = 1000 baisa, etc.). */
const THREE_DECIMAL = ['OMR', 'KWD', 'BHD', 'JOD', 'IQD', 'LYD', 'TND']
/**
 * Money decimals for printing: receipt config currency_decimals (0-4) when set, else by the
 * POS Profile currency (3 for OMR/KWD/BHD…, 2 otherwise). Unset + QAR stays 2, as before.
 */
export function currencyDecimals(config?: Record<string, string>): number {
  const raw = (config || getAllReceiptConfig()).currency_decimals
  const n = raw !== undefined && raw !== null && String(raw).trim() !== '' ? parseInt(String(raw), 10) : NaN
  if (Number.isFinite(n) && n >= 0 && n <= 4) return n
  let code = ''
  try { code = String(getConfig('currency') || '').toUpperCase() } catch { /* no db */ }
  return THREE_DECIMAL.includes(code) ? 3 : 2
}

const LF = '\x0A'

function padRight(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length)
}

function padLeft(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : ' '.repeat(len - str.length) + str
}

function getLineWidth(): number {
  const config = getAllReceiptConfig()
  const paperWidth = parseInt(config.paper_width || '80')
  return paperWidth >= 80 ? 48 : 32
}

function formatLine(left: string, right: string, width?: number): string {
  const w = width ?? getLineWidth()
  const space = w - left.length - right.length
  if (space <= 0) return left.slice(0, w - right.length - 1) + ' ' + right
  return left + ' '.repeat(space) + right
}

function getSeparatorLine(): string {
  const w = getLineWidth()
  return '='.repeat(w)
}

function getDashLine(): string {
  const w = getLineWidth()
  return '-'.repeat(w)
}

interface ReceiptData {
  orderNumber: string
  orderType: string
  tableName?: string
  guests?: number
  cashierName: string
  items: {
    itemName: string
    itemNameAr?: string
    qty: number
    rate: number
    amount: number
    description?: string
    descriptionAr?: string
    modifiers?: { name: string; price: number }[]
    specialInstructions?: string
    discountPercent?: number
    discountAmount?: number
  }[]
  subtotal: number
  taxTotal: number
  taxLabel: string
  taxRate: number
  discountAmount: number
  grandTotal: number
  payments: { method: string; amount: number }[]
  change: number
  waiterName?: string
  promoName?: string
  orderNotes?: string
  tipAmount?: number
}

export function generateReceipt(data: ReceiptData): string {
  const config = getAllReceiptConfig()
  const design = config.receipt_design || 'classic'
  if (design === 'modern') return generateReceiptModern(data, config)
  return generateReceiptClassic(data, config)
}

// ==================== Design A: Classic ====================
function generateReceiptClassic(data: ReceiptData, config: Record<string, string>): string {
  const showArabic = config.show_arabic === '1'
  const showCashier = config.show_cashier_name !== '0'
  const showCr = config.show_cr_number === '1' && config.cr_number
  const showVat = config.show_vat_number === '1' && config.vat_number
  const currSym = config.currency_symbol || getConfig('currency') || 'QAR'
  const currPos = config.currency_position || 'after'
  const decimals = currencyDecimals(config)

  const fmtAmt = (n: number) => {
    const num = n.toFixed(decimals)
    return currPos === 'before' ? `${currSym} ${num}` : `${num} ${currSym}`
  }

  const lines: string[] = [CMD.INIT, CMD.ALIGN_CENTER]

  // Header
  if (showArabic && config.restaurant_name_ar) {
    lines.push(CMD.BOLD_ON + config.restaurant_name_ar + CMD.BOLD_OFF)
  }
  if (config.restaurant_name) {
    lines.push(CMD.BOLD_ON + config.restaurant_name + CMD.BOLD_OFF)
  }
  lines.push(getDashLine())
  if (config.address_line_1) lines.push(config.address_line_1)
  if (showArabic && config.address_line_1_ar) lines.push(config.address_line_1_ar)
  if (config.address_line_2) lines.push(config.address_line_2)
  if (config.phone) lines.push(`Tel: ${config.phone}`)
  if (showCr) lines.push(`CR: ${config.cr_number}`)
  if (showVat) lines.push(`VAT: ${config.vat_number}`)
  lines.push(getSeparatorLine())
  lines.push(CMD.BOLD_ON + 'RECEIPT' + CMD.BOLD_OFF)
  lines.push(getSeparatorLine())

  // Order info
  lines.push(CMD.ALIGN_LEFT)
  lines.push(`Receipt: ${data.orderNumber}`)
  lines.push(`Date: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}    ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`)
  if (data.tableName) {
    lines.push(formatLine(`Table: ${data.tableName}`, data.guests ? `Guests: ${data.guests}` : ''))
  }
  if (showCashier) lines.push(`Cashier: ${data.cashierName}`)
  lines.push(`Type: ${data.orderType}`)
  if (data.orderNotes) {
    lines.push(`Notes: ${data.orderNotes}`)
  }

  lines.push(getDashLine())
  lines.push(formatLine('Qty  Item', 'Amount'))
  lines.push(getDashLine())

  const showDescEn = config.show_description_on_receipt === '1'
  const showDescAr = config.show_description_ar_on_receipt === '1'
  const showArabicItems = config.show_arabic_items === '1'

  // Items
  for (const item of data.items) {
    const qtyStr = ` ${item.qty}   `
    const amtStr = item.amount.toFixed(decimals)
    lines.push(formatLine(`${qtyStr}${item.itemName}`, amtStr))

    // Arabic item name
    if (showArabicItems && item.itemNameAr) {
      lines.push(`     ${item.itemNameAr}`)
    }

    // English description
    if (showDescEn && item.description) {
      const desc = item.description
      const maxLen = 27
      for (let i = 0; i < desc.length; i += maxLen) {
        lines.push(`     ${desc.slice(i, i + maxLen)}`)
      }
    }

    // Arabic description
    if (showDescAr && item.descriptionAr) {
      const desc = item.descriptionAr
      const maxLen = 27
      for (let i = 0; i < desc.length; i += maxLen) {
        lines.push(`     ${desc.slice(i, i + maxLen)}`)
      }
    }

    if (item.modifiers) {
      for (const mod of item.modifiers) {
        const modLine = `     + ${mod.name}`
        if (mod.price > 0) {
          lines.push(formatLine(modLine, mod.price.toFixed(decimals)))
        } else {
          lines.push(modLine)
        }
      }
    }
    if (item.specialInstructions) {
      lines.push(`     "${item.specialInstructions}"`)
    }
  }

  lines.push(getDashLine())

  // Totals
  lines.push(formatLine('Subtotal:', fmtAmt(data.subtotal)))
  if (data.discountAmount > 0) {
    const discLabel = data.promoName ? `Discount (${data.promoName}):` : 'Discount:'
    lines.push(formatLine(discLabel, `-${fmtAmt(data.discountAmount)}`))
  }
  if (data.taxTotal > 0) {
    lines.push(formatLine(`${data.taxLabel} (${data.taxRate}%):`, fmtAmt(data.taxTotal)))
  }
  lines.push(getDashLine())
  lines.push(CMD.BOLD_ON)
  lines.push(formatLine('TOTAL:', fmtAmt(data.grandTotal)))
  lines.push(CMD.BOLD_OFF)

  // Payments
  for (const p of data.payments) {
    lines.push(formatLine(`Paid: ${p.method}`, fmtAmt(p.amount)))
  }
  if (data.change > 0) {
    lines.push(formatLine('Change:', fmtAmt(data.change)))
  }
  if (data.tipAmount && data.tipAmount > 0) {
    lines.push(formatLine('Tip:', fmtAmt(data.tipAmount)))
  }
  if (data.waiterName) {
    lines.push(formatLine('Waiter:', data.waiterName))
  }

  lines.push(getSeparatorLine())

  // Footer
  lines.push(CMD.ALIGN_CENTER)
  if (showArabic && config.footer_message_ar) lines.push(config.footer_message_ar)
  if (config.footer_message) lines.push(config.footer_message)
  lines.push(getSeparatorLine())

  lines.push(CMD.FEED_5)
  lines.push(CMD.PARTIAL_CUT)
  lines.push(CMD.OPEN_DRAWER)

  return lines.join(LF)
}

// ==================== Design B: Modern ====================
function generateReceiptModern(data: ReceiptData, config: Record<string, string>): string {
  const showArabic = config.show_arabic === '1'
  const showCashier = config.show_cashier_name !== '0'
  const showCr = config.show_cr_number === '1' && config.cr_number
  const showVat = config.show_vat_number === '1' && config.vat_number
  const currSym = config.currency_symbol || getConfig('currency') || 'QAR'
  const currPos = config.currency_position || 'after'
  const decimals = currencyDecimals(config)
  const showDescEn = config.show_description_on_receipt === '1'
  const showDescAr = config.show_description_ar_on_receipt === '1'
  const showArabicItems = config.show_arabic_items === '1'

  const fmtAmt = (n: number) => {
    const num = n.toFixed(decimals)
    return currPos === 'before' ? `${currSym} ${num}` : `${num} ${currSym}`
  }

  const lines: string[] = [CMD.INIT]

  // Header — restaurant name large and centered
  lines.push(CMD.ALIGN_CENTER)
  if (showArabic && config.restaurant_name_ar) {
    lines.push(CMD.DOUBLE_BOTH + config.restaurant_name_ar + CMD.NORMAL_SIZE)
  }
  if (config.restaurant_name) {
    lines.push(CMD.DOUBLE_BOTH + config.restaurant_name + CMD.NORMAL_SIZE)
  }

  // Address and details — compact centered block
  if (config.address_line_1) lines.push(config.address_line_1)
  if (showArabic && config.address_line_1_ar) lines.push(config.address_line_1_ar)
  if (config.address_line_2) lines.push(config.address_line_2)
  if (config.phone) lines.push(`Tel: ${config.phone}`)

  // CR and VAT on one line if both exist
  const taxInfo: string[] = []
  if (showCr) taxInfo.push(`CR: ${config.cr_number}`)
  if (showVat) taxInfo.push(`VAT: ${config.vat_number}`)
  if (taxInfo.length > 0) lines.push(taxInfo.join('  |  '))

  lines.push(getSeparatorLine())
  lines.push(CMD.ALIGN_CENTER)
  lines.push(CMD.BOLD_ON + 'RECEIPT' + CMD.BOLD_OFF)
  lines.push(getSeparatorLine())

  // Order info — two-column style
  lines.push(CMD.ALIGN_LEFT)
  lines.push(formatLine(`#${data.orderNumber}`, new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })))
  lines.push(formatLine(data.orderType, new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })))
  if (data.tableName) {
    lines.push(formatLine(`Table: ${data.tableName}`, data.guests ? `Guests: ${data.guests}` : ''))
  }
  if (showCashier) lines.push(`Cashier: ${data.cashierName}`)
  if (data.orderNotes) lines.push(`Notes: ${data.orderNotes}`)

  lines.push(getSeparatorLine())

  // Items — with item number, cleaner layout
  let itemNum = 0
  for (const item of data.items) {
    itemNum++
    // Item name on its own line, bold
    lines.push(CMD.BOLD_ON + `${itemNum}. ${item.itemName}` + CMD.BOLD_OFF)

    // Arabic name
    if (showArabicItems && item.itemNameAr) {
      lines.push(`   ${item.itemNameAr}`)
    }

    // Qty x Rate = Amount on next line, right-aligned amount
    const qtyLine = `   ${item.qty} x ${item.rate.toFixed(decimals)}`
    lines.push(formatLine(qtyLine, item.amount.toFixed(decimals)))

    // Descriptions
    if (showDescEn && item.description) {
      const desc = item.description
      const maxLen = 29
      for (let i = 0; i < desc.length; i += maxLen) {
        lines.push(`   ${desc.slice(i, i + maxLen)}`)
      }
    }
    if (showDescAr && item.descriptionAr) {
      const desc = item.descriptionAr
      const maxLen = 29
      for (let i = 0; i < desc.length; i += maxLen) {
        lines.push(`   ${desc.slice(i, i + maxLen)}`)
      }
    }

    // Modifiers
    if (item.modifiers) {
      for (const mod of item.modifiers) {
        if (mod.price > 0) {
          lines.push(formatLine(`   + ${mod.name}`, `+${mod.price.toFixed(decimals)}`))
        } else {
          lines.push(`   + ${mod.name}`)
        }
      }
    }
    if (item.specialInstructions) {
      lines.push(`   * ${item.specialInstructions}`)
    }
  }

  lines.push(getSeparatorLine())

  // Totals — right-aligned with clear labels
  lines.push(formatLine('  Subtotal', fmtAmt(data.subtotal)))
  if (data.discountAmount > 0) {
    const discLabel = data.promoName ? `  Discount (${data.promoName})` : '  Discount'
    lines.push(formatLine(discLabel, `-${fmtAmt(data.discountAmount)}`))
  }
  if (data.taxTotal > 0) {
    lines.push(formatLine(`  ${data.taxLabel} ${data.taxRate}%`, fmtAmt(data.taxTotal)))
  }

  lines.push(getDashLine())

  // Grand total — large bold
  lines.push(CMD.ALIGN_CENTER)
  lines.push(CMD.DOUBLE_BOTH + CMD.BOLD_ON)
  lines.push(`TOTAL: ${fmtAmt(data.grandTotal)}`)
  lines.push(CMD.NORMAL_SIZE + CMD.BOLD_OFF)

  lines.push(getDashLine())

  // Payments
  lines.push(CMD.ALIGN_LEFT)
  for (const p of data.payments) {
    lines.push(formatLine(`  ${p.method}`, fmtAmt(p.amount)))
  }
  if (data.change > 0) {
    lines.push(CMD.BOLD_ON + formatLine('  Change', fmtAmt(data.change)) + CMD.BOLD_OFF)
  }
  if (data.tipAmount && data.tipAmount > 0) {
    lines.push(formatLine('  Tip', fmtAmt(data.tipAmount)))
  }
  if (data.waiterName) {
    lines.push(formatLine('  Waiter', data.waiterName))
  }

  lines.push('')
  lines.push(getSeparatorLine())

  // Footer
  lines.push(CMD.ALIGN_CENTER)
  if (showArabic && config.footer_message_ar) lines.push('', config.footer_message_ar)
  if (config.footer_message) lines.push(config.footer_message)
  lines.push('')
  lines.push(`${new Date().toLocaleDateString('en-GB')}  ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`)
  lines.push('')

  lines.push(CMD.FEED_5)
  lines.push(CMD.PARTIAL_CUT)
  lines.push(CMD.OPEN_DRAWER)

  return lines.join(LF)
}

// ==================== Waiter Copy ====================
interface WaiterCopyData {
  orderNumber: string
  orderType: string
  tableName?: string
  guests?: number
  cashierName: string
  items: {
    itemName: string
    itemNameAr?: string
    qty: number
    rate: number
    amount: number
    modifiers?: { name: string; price: number }[]
    specialInstructions?: string
  }[]
  subtotal: number
  discountAmount: number
  promoName?: string
  grandTotal: number
  orderNotes?: string
}

export function generateWaiterCopy(data: WaiterCopyData): string {
  const config = getAllReceiptConfig()
  const showArabicItems = config.show_arabic_items === '1'
  const currSym = config.currency_symbol || getConfig('currency') || 'QAR'
  const currPos = config.currency_position || 'after'
  const decimals = currencyDecimals(config)

  const fmtAmt = (n: number) => {
    const num = n.toFixed(decimals)
    return currPos === 'before' ? `${currSym} ${num}` : `${num} ${currSym}`
  }

  const lines: string[] = [CMD.INIT]

  lines.push(CMD.ALIGN_CENTER)
  lines.push(CMD.BOLD_ON + CMD.DOUBLE_BOTH)
  lines.push('WAITER COPY')
  lines.push(CMD.NORMAL_SIZE + CMD.BOLD_OFF)
  lines.push(getSeparatorLine())

  // Order info
  lines.push(CMD.ALIGN_LEFT)
  lines.push(formatLine(`#${data.orderNumber}`, data.orderType))
  lines.push(`Date: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}  ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`)
  if (data.tableName) {
    lines.push(formatLine(`Table: ${data.tableName}`, data.guests ? `Guests: ${data.guests}` : ''))
  }
  lines.push(`Cashier: ${data.cashierName}`)
  if (data.orderNotes) lines.push(`Notes: ${data.orderNotes}`)

  lines.push(getSeparatorLine())

  // Items
  lines.push(CMD.BOLD_ON + formatLine('Qty  Item', 'Amount') + CMD.BOLD_OFF)
  lines.push(getDashLine())

  for (const item of data.items) {
    const qtyStr = ` ${item.qty}   `
    lines.push(formatLine(`${qtyStr}${item.itemName}`, item.amount.toFixed(decimals)))

    if (showArabicItems && item.itemNameAr) {
      lines.push(`     ${item.itemNameAr}`)
    }

    if (item.modifiers) {
      for (const mod of item.modifiers) {
        if (mod.price > 0) {
          lines.push(formatLine(`     + ${mod.name}`, `+${mod.price.toFixed(decimals)}`))
        } else {
          lines.push(`     + ${mod.name}`)
        }
      }
    }
    if (item.specialInstructions) {
      lines.push(`     * ${item.specialInstructions}`)
    }
  }

  lines.push(getSeparatorLine())

  // Subtotal + discount
  lines.push(CMD.ALIGN_LEFT)
  lines.push(formatLine('Subtotal:', fmtAmt(data.subtotal)))
  if (data.discountAmount > 0) {
    const discLabel = data.promoName ? `Discount (${data.promoName}):` : 'Discount:'
    lines.push(formatLine(discLabel, `-${fmtAmt(data.discountAmount)}`))
  }

  // Total
  lines.push(CMD.ALIGN_CENTER)
  lines.push(CMD.BOLD_ON + CMD.DOUBLE_BOTH)
  lines.push(`TOTAL: ${fmtAmt(data.grandTotal)}`)
  lines.push(CMD.NORMAL_SIZE + CMD.BOLD_OFF)

  lines.push(getSeparatorLine())
  lines.push(CMD.ALIGN_CENTER)
  lines.push('** WAITER COPY **')
  lines.push(getSeparatorLine())

  lines.push(CMD.FEED_3)
  lines.push(CMD.PARTIAL_CUT)

  return lines.join(LF)
}

interface KotData {
  kotNumber: number
  stationName: string
  orderNumber: string
  orderType: string
  tableName?: string
  cashierName: string
  waiterName?: string
  items: {
    itemName: string
    itemNameAr?: string
    qty: number
    modifiers?: { name: string }[]
    specialInstructions?: string
  }[]
  isAmendment?: boolean
  amendmentActions?: { action: string; itemName: string; detail?: string }[]
  orderNotes?: string
}

export function generateKot(data: KotData): string {
  const config = getAllReceiptConfig()
  const showRestName = config.kot_show_restaurant_name !== '0'
  const showTable = config.kot_show_table !== '0'
  const showOrderNum = config.kot_show_order_number !== '0'
  const showArabicItems = config.kot_show_arabic_items === '1'
  const largeFont = config.kot_font_size === 'large'

  const lines: string[] = [CMD.INIT, CMD.ALIGN_CENTER, getSeparatorLine()]

  if (data.isAmendment) {
    lines.push(CMD.DOUBLE_BOTH + '** AMENDMENT **' + CMD.NORMAL_SIZE)
  }

  // Order number on top — last 4 digits in large font for quick identification
  if (showOrderNum) {
    const orderNum = data.orderNumber || ''
    const last4 = orderNum.split('-').pop() || orderNum.slice(-4)
    lines.push(CMD.BOLD_ON + CMD.DOUBLE_BOTH + `#${last4}` + CMD.NORMAL_SIZE + CMD.BOLD_OFF)
    lines.push(`${orderNum}`)
  }

  lines.push(CMD.BOLD_ON + `KOT #${String(data.kotNumber).padStart(4, '0')}` + CMD.BOLD_OFF)
  if (showRestName && config.restaurant_name) {
    lines.push(config.restaurant_name)
  }
  lines.push(getSeparatorLine())

  lines.push(CMD.ALIGN_LEFT)
  lines.push(` Station: ${data.stationName.toUpperCase()}`)
  if (showTable && data.tableName) {
    lines.push(formatLine(` Table: ${data.tableName}`, data.orderType))
  }
  lines.push(` Time: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}  ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`)

  lines.push(getSeparatorLine())

  if (largeFont) lines.push(CMD.DOUBLE_BOTH)

  if (data.isAmendment && data.amendmentActions) {
    for (const action of data.amendmentActions) {
      const prefix = action.action === 'item_added' ? ' ADD: ' : action.action === 'item_removed' ? ' CANCEL: ' : ' CHG: '
      lines.push(CMD.BOLD_ON + `${prefix}${action.itemName}` + CMD.BOLD_OFF)
      if (action.detail) lines.push(`     ${action.detail}`)
    }
  } else {
    for (const item of data.items) {
      lines.push(CMD.BOLD_ON + ` ${item.qty}x  ${item.itemName.toUpperCase()}` + CMD.BOLD_OFF)
      if (showArabicItems && item.itemNameAr) {
        lines.push(`     ${item.itemNameAr}`)
      }
      if (item.modifiers) {
        for (const mod of item.modifiers) {
          lines.push(`     >> ${mod.name}`)
        }
      }
      if (item.specialInstructions) {
        lines.push(`     !! ${item.specialInstructions}`)
      }
    }
  }

  if (largeFont) lines.push(CMD.NORMAL_SIZE)

  lines.push(getSeparatorLine())
  lines.push(CMD.ALIGN_LEFT)
  lines.push(` Cashier: ${data.cashierName}`)
  if (data.waiterName) lines.push(` Waiter: ${data.waiterName}`)
  if (data.orderNotes) {
    lines.push(getDashLine())
    lines.push(CMD.BOLD_ON + ` NOTES: ${data.orderNotes}` + CMD.BOLD_OFF)
  }
  lines.push(getSeparatorLine())
  lines.push(CMD.ALIGN_CENTER + '** END OF KOT **')
  lines.push(getSeparatorLine())
  lines.push(CMD.FEED_3 + CMD.PARTIAL_CUT)

  return lines.join(LF)
}

// ==================== Preparation Document ====================
interface PrepDocData {
  orderNumber: string
  orderType: string
  tableName?: string
  guests?: number
  waiterName?: string
  cashierName: string
  items: {
    itemName: string
    itemNameAr?: string
    qty: number
    modifiers?: { name: string }[]
    specialInstructions?: string
  }[]
  orderNotes?: string
}

export function generatePrepDoc(data: PrepDocData): string {
  const config = getAllReceiptConfig()
  const showArabicItems = config.show_arabic_items === '1'

  const lines: string[] = [CMD.INIT]

  lines.push(CMD.ALIGN_CENTER)
  lines.push(CMD.DOUBLE_BOTH + CMD.BOLD_ON)
  lines.push('PREPARATION')
  lines.push(CMD.NORMAL_SIZE + CMD.BOLD_OFF)
  lines.push(getSeparatorLine())

  lines.push(CMD.ALIGN_LEFT)
  lines.push(formatLine(`Order: #${data.orderNumber}`, data.orderType))
  lines.push(`Date: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}  ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`)
  if (data.tableName) {
    lines.push(formatLine(`Table: ${data.tableName}`, data.guests ? `Guests: ${data.guests}` : ''))
  }
  if (data.waiterName) lines.push(`Waiter: ${data.waiterName}`)
  lines.push(`Cashier: ${data.cashierName}`)
  if (data.orderNotes) lines.push(`Notes: ${data.orderNotes}`)

  lines.push(getSeparatorLine())

  for (const item of data.items) {
    lines.push(CMD.BOLD_ON + ` ${item.qty}x  ${item.itemName}` + CMD.BOLD_OFF)
    if (showArabicItems && item.itemNameAr) {
      lines.push(`     ${item.itemNameAr}`)
    }
    if (item.modifiers) {
      for (const mod of item.modifiers) {
        lines.push(`     + ${mod.name}`)
      }
    }
    if (item.specialInstructions) {
      lines.push(`     !! ${item.specialInstructions}`)
    }
  }

  lines.push(getSeparatorLine())
  lines.push(CMD.ALIGN_CENTER)
  lines.push(CMD.BOLD_ON + '** NO AMOUNTS **' + CMD.BOLD_OFF)
  lines.push(getSeparatorLine())

  lines.push(CMD.FEED_3)
  lines.push(CMD.PARTIAL_CUT)

  return lines.join(LF)
}

// ==================== Invoice (pre-payment bill) ====================

export function generateInvoice(data: ReceiptData): string {
  const config = getAllReceiptConfig()
  const design = config.receipt_design || 'classic'
  if (design === 'modern') return generateInvoiceModern(data, config)
  return generateInvoiceClassic(data, config)
}

function generateInvoiceClassic(data: ReceiptData, config: Record<string, string>): string {
  const showArabic = config.show_arabic === '1'
  const showCashier = config.show_cashier_name !== '0'
  const showCr = config.show_cr_number === '1' && config.cr_number
  const showVat = config.show_vat_number === '1' && config.vat_number
  const currSym = config.currency_symbol || getConfig('currency') || 'QAR'
  const currPos = config.currency_position || 'after'
  const decimals = currencyDecimals(config)

  const fmtAmt = (n: number) => {
    const num = n.toFixed(decimals)
    return currPos === 'before' ? `${currSym} ${num}` : `${num} ${currSym}`
  }

  const lines: string[] = [CMD.INIT, CMD.ALIGN_CENTER]

  if (showArabic && config.restaurant_name_ar) {
    lines.push(CMD.BOLD_ON + config.restaurant_name_ar + CMD.BOLD_OFF)
  }
  if (config.restaurant_name) {
    lines.push(CMD.BOLD_ON + config.restaurant_name + CMD.BOLD_OFF)
  }
  lines.push(getDashLine())
  if (config.address_line_1) lines.push(config.address_line_1)
  if (showArabic && config.address_line_1_ar) lines.push(config.address_line_1_ar)
  if (config.address_line_2) lines.push(config.address_line_2)
  if (config.phone) lines.push(`Tel: ${config.phone}`)
  if (showCr) lines.push(`CR: ${config.cr_number}`)
  if (showVat) lines.push(`VAT: ${config.vat_number}`)
  lines.push(getSeparatorLine())
  lines.push(CMD.BOLD_ON + 'INVOICE' + CMD.BOLD_OFF)
  lines.push(getSeparatorLine())

  lines.push(CMD.ALIGN_LEFT)
  lines.push(`Invoice: ${data.orderNumber}`)
  lines.push(`Date: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}    ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`)
  if (data.tableName) {
    lines.push(formatLine(`Table: ${data.tableName}`, data.guests ? `Guests: ${data.guests}` : ''))
  }
  if (showCashier) lines.push(`Cashier: ${data.cashierName}`)
  if (data.waiterName) lines.push(`Waiter: ${data.waiterName}`)
  lines.push(`Type: ${data.orderType}`)

  lines.push(getDashLine())
  lines.push(formatLine('Qty  Item', 'Amount'))
  lines.push(getDashLine())

  const showDescEn = config.show_description_on_receipt === '1'
  const showDescAr = config.show_description_ar_on_receipt === '1'
  const showArabicItems = config.show_arabic_items === '1'

  for (const item of data.items) {
    const qtyStr = ` ${item.qty}   `
    const amtStr = item.amount.toFixed(decimals)
    lines.push(formatLine(`${qtyStr}${item.itemName}`, amtStr))

    if (showArabicItems && item.itemNameAr) {
      lines.push(`     ${item.itemNameAr}`)
    }
    if (showDescEn && item.description) {
      const maxLen = 27
      for (let i = 0; i < item.description.length; i += maxLen) {
        lines.push(`     ${item.description.slice(i, i + maxLen)}`)
      }
    }
    if (showDescAr && item.descriptionAr) {
      const maxLen = 27
      for (let i = 0; i < item.descriptionAr.length; i += maxLen) {
        lines.push(`     ${item.descriptionAr.slice(i, i + maxLen)}`)
      }
    }
    if (item.modifiers) {
      for (const mod of item.modifiers) {
        if (mod.price > 0) {
          lines.push(formatLine(`     + ${mod.name}`, mod.price.toFixed(decimals)))
        } else {
          lines.push(`     + ${mod.name}`)
        }
      }
    }
    if (item.specialInstructions) {
      lines.push(`     "${item.specialInstructions}"`)
    }
  }

  lines.push(getDashLine())
  lines.push(formatLine('Subtotal:', fmtAmt(data.subtotal)))
  if (data.discountAmount > 0) {
    const discLabel = data.promoName ? `Discount (${data.promoName}):` : 'Discount:'
    lines.push(formatLine(discLabel, `-${fmtAmt(data.discountAmount)}`))
  }
  if (data.taxTotal > 0) {
    lines.push(formatLine(`${data.taxLabel} (${data.taxRate}%):`, fmtAmt(data.taxTotal)))
  }
  lines.push(getDashLine())
  lines.push(CMD.BOLD_ON)
  lines.push(formatLine('TOTAL:', fmtAmt(data.grandTotal)))
  lines.push(CMD.BOLD_OFF)

  lines.push(getSeparatorLine())
  lines.push(CMD.ALIGN_CENTER)
  if (showArabic && config.footer_message_ar) lines.push(config.footer_message_ar)
  if (config.footer_message) lines.push(config.footer_message)
  lines.push(getSeparatorLine())

  lines.push(CMD.FEED_5)
  lines.push(CMD.PARTIAL_CUT)

  return lines.join(LF)
}

function generateInvoiceModern(data: ReceiptData, config: Record<string, string>): string {
  const showArabic = config.show_arabic === '1'
  const showCashier = config.show_cashier_name !== '0'
  const showCr = config.show_cr_number === '1' && config.cr_number
  const showVat = config.show_vat_number === '1' && config.vat_number
  const currSym = config.currency_symbol || getConfig('currency') || 'QAR'
  const currPos = config.currency_position || 'after'
  const decimals = currencyDecimals(config)
  const showDescEn = config.show_description_on_receipt === '1'
  const showDescAr = config.show_description_ar_on_receipt === '1'
  const showArabicItems = config.show_arabic_items === '1'

  const fmtAmt = (n: number) => {
    const num = n.toFixed(decimals)
    return currPos === 'before' ? `${currSym} ${num}` : `${num} ${currSym}`
  }

  const lines: string[] = [CMD.INIT]

  lines.push(CMD.ALIGN_CENTER)
  if (showArabic && config.restaurant_name_ar) {
    lines.push(CMD.DOUBLE_BOTH + config.restaurant_name_ar + CMD.NORMAL_SIZE)
  }
  if (config.restaurant_name) {
    lines.push(CMD.DOUBLE_BOTH + config.restaurant_name + CMD.NORMAL_SIZE)
  }
  if (config.address_line_1) lines.push(config.address_line_1)
  if (showArabic && config.address_line_1_ar) lines.push(config.address_line_1_ar)
  if (config.address_line_2) lines.push(config.address_line_2)
  if (config.phone) lines.push(`Tel: ${config.phone}`)

  const taxInfo: string[] = []
  if (showCr) taxInfo.push(`CR: ${config.cr_number}`)
  if (showVat) taxInfo.push(`VAT: ${config.vat_number}`)
  if (taxInfo.length > 0) lines.push(taxInfo.join('  |  '))

  lines.push(getSeparatorLine())
  lines.push(CMD.BOLD_ON + 'INVOICE' + CMD.BOLD_OFF)
  lines.push(getSeparatorLine())

  lines.push(CMD.ALIGN_LEFT)
  lines.push(formatLine(`#${data.orderNumber}`, new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })))
  lines.push(formatLine(data.orderType, new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })))
  if (data.tableName) {
    lines.push(formatLine(`Table: ${data.tableName}`, data.guests ? `Guests: ${data.guests}` : ''))
  }
  if (showCashier) lines.push(`Cashier: ${data.cashierName}`)
  if (data.waiterName) lines.push(`Waiter: ${data.waiterName}`)
  if (data.orderNotes) lines.push(`Notes: ${data.orderNotes}`)

  lines.push(getSeparatorLine())

  let itemNum = 0
  for (const item of data.items) {
    itemNum++
    lines.push(CMD.BOLD_ON + `${itemNum}. ${item.itemName}` + CMD.BOLD_OFF)
    if (showArabicItems && item.itemNameAr) {
      lines.push(`   ${item.itemNameAr}`)
    }
    lines.push(formatLine(`   ${item.qty} x ${item.rate.toFixed(decimals)}`, item.amount.toFixed(decimals)))
    if (showDescEn && item.description) {
      const maxLen = 29
      for (let i = 0; i < item.description.length; i += maxLen) {
        lines.push(`   ${item.description.slice(i, i + maxLen)}`)
      }
    }
    if (showDescAr && item.descriptionAr) {
      const maxLen = 29
      for (let i = 0; i < item.descriptionAr.length; i += maxLen) {
        lines.push(`   ${item.descriptionAr.slice(i, i + maxLen)}`)
      }
    }
    if (item.modifiers) {
      for (const mod of item.modifiers) {
        if (mod.price > 0) {
          lines.push(formatLine(`   + ${mod.name}`, `+${mod.price.toFixed(decimals)}`))
        } else {
          lines.push(`   + ${mod.name}`)
        }
      }
    }
    if (item.specialInstructions) {
      lines.push(`   * ${item.specialInstructions}`)
    }
  }

  lines.push(getSeparatorLine())
  lines.push(formatLine('  Subtotal', fmtAmt(data.subtotal)))
  if (data.discountAmount > 0) {
    const discLabel = data.promoName ? `  Discount (${data.promoName})` : '  Discount'
    lines.push(formatLine(discLabel, `-${fmtAmt(data.discountAmount)}`))
  }
  if (data.taxTotal > 0) {
    lines.push(formatLine(`  ${data.taxLabel} ${data.taxRate}%`, fmtAmt(data.taxTotal)))
  }
  lines.push(getDashLine())

  lines.push(CMD.ALIGN_CENTER)
  lines.push(CMD.DOUBLE_BOTH + CMD.BOLD_ON)
  lines.push(`TOTAL: ${fmtAmt(data.grandTotal)}`)
  lines.push(CMD.NORMAL_SIZE + CMD.BOLD_OFF)

  lines.push('')
  lines.push(getSeparatorLine())
  lines.push(CMD.ALIGN_CENTER)
  if (showArabic && config.footer_message_ar) lines.push('', config.footer_message_ar)
  if (config.footer_message) lines.push(config.footer_message)
  lines.push('')

  lines.push(CMD.FEED_5)
  lines.push(CMD.PARTIAL_CUT)

  return lines.join(LF)
}

// ==================== Void Slip ====================

interface VoidSlipData {
  orderNumber: string
  orderType: string
  tableName?: string
  cashierName: string
  voidReason: string
  voidedBy: string
  voidRemarks?: string
  voidDisposition?: string
  items: { itemName: string; qty: number; rate: number; amount: number }[]
  grandTotal: number
}

export function generateVoidSlip(data: VoidSlipData): string {
  const config = getAllReceiptConfig()
  const lines: string[] = [CMD.INIT, CMD.ALIGN_CENTER]

  if (config.restaurant_name) {
    lines.push(CMD.BOLD_ON + config.restaurant_name + CMD.BOLD_OFF)
  }
  lines.push(getSeparatorLine())
  lines.push(CMD.BOLD_ON + '*** VOID ***' + CMD.BOLD_OFF)
  lines.push(getSeparatorLine())

  lines.push(CMD.ALIGN_LEFT)
  lines.push(`Order: ${data.orderNumber}`)
  lines.push(`Type: ${data.orderType}`)
  if (data.tableName) lines.push(`Table: ${data.tableName}`)
  lines.push(`Cashier: ${data.cashierName}`)
  lines.push(`Voided by: ${data.voidedBy}`)
  lines.push(`Date: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}    ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`)

  lines.push(getDashLine())
  lines.push(formatLine('Qty  Item', 'Amount'))
  lines.push(getDashLine())

  const voidDecimals = currencyDecimals()
  for (const item of data.items) {
    lines.push(formatLine(`${item.qty}x ${item.itemName}`, item.amount.toFixed(voidDecimals)))
  }

  lines.push(getDashLine())
  lines.push(CMD.BOLD_ON + formatLine('TOTAL (VOIDED)', data.grandTotal.toFixed(voidDecimals)) + CMD.BOLD_OFF)
  lines.push(getDashLine())

  lines.push('')
  lines.push(CMD.BOLD_ON + `Reason: ${data.voidReason}` + CMD.BOLD_OFF)
  if (data.voidDisposition) {
    lines.push(CMD.BOLD_ON + `Action: ${data.voidDisposition}` + CMD.BOLD_OFF)
  }
  if (data.voidRemarks) {
    lines.push(`Remarks: ${data.voidRemarks}`)
  }
  lines.push('')
  lines.push(getSeparatorLine())
  lines.push(CMD.ALIGN_CENTER)
  lines.push('This order has been voided')
  lines.push('No payment collected')
  lines.push(getSeparatorLine())

  lines.push(CMD.FEED_5)
  lines.push(CMD.PARTIAL_CUT)

  return lines.join(LF)
}

// ==================== Guest share slip (split bill) ====================

export interface GuestShareData {
  orderNumber: string | null
  label: string
  guestNo: number
  guestCount: number
  items: { qty: number; itemName: string; amount: number }[]
  share: number
  payments: { method: string; amount: number }[]
  change: number
}

/** One guest's part of a split bill: their items (or "even share"), their share and how they paid. */
export function generateGuestShare(data: GuestShareData): string {
  const config = getAllReceiptConfig()
  const currSym = config.currency_symbol || getConfig('currency') || 'QAR'
  const decimals = currencyDecimals(config)
  const amt = (n: number) => (n || 0).toFixed(decimals)
  const lines: string[] = [CMD.INIT, CMD.ALIGN_CENTER]
  if (config.restaurant_name) lines.push(CMD.BOLD_ON + config.restaurant_name + CMD.BOLD_OFF)
  lines.push(CMD.BOLD_ON + `GUEST ${data.guestNo} OF ${data.guestCount}` + CMD.BOLD_OFF)
  lines.push(`${data.label}${data.orderNumber ? `  #${data.orderNumber}` : ''}`)
  lines.push(CMD.ALIGN_LEFT)
  lines.push(getDashLine())
  if (data.items.length) {
    for (const i of data.items) lines.push(formatLine(`${i.qty}x ${i.itemName}`, amt(i.amount)))
  } else {
    lines.push('Even share of the bill')
  }
  lines.push(getDashLine())
  lines.push(CMD.BOLD_ON + formatLine(`SHARE (${currSym})`, amt(data.share)) + CMD.BOLD_OFF)
  for (const p of data.payments) lines.push(formatLine(`Paid: ${p.method}`, amt(p.amount)))
  if (data.change > 0) lines.push(formatLine('Change:', amt(data.change)))
  lines.push(getSeparatorLine())
  lines.push(CMD.ALIGN_CENTER)
  lines.push('Part of a split bill. The full')
  lines.push('receipt prints when all have paid.')
  lines.push(CMD.FEED_5)
  lines.push(CMD.PARTIAL_CUT)
  return lines.join(LF)
}

// ==================== Close Shift Slip ====================

interface CloseShiftData {
  userName: string
  openedAt: string
  closedAt: string
  totalSales: number
  totalOrders: number
  openingCash: number
  closingCash: number
  paymentBreakdown: Record<string, number>
  expectedBalance: { mode: string; amount: number }[]
  closingBalance: { mode: string; amount: number }[]
  remarks: string
  voidedOrders?: { order_number: string; void_reason: string; cashier_name: string; grand_total: number }[]
  voidedItems?: { item_name: string; qty: number; amount: number; void_reason: string; voided_by: string; order_number: string }[]
}

export function generateCloseShiftSlip(data: CloseShiftData): string {
  const config = getAllReceiptConfig()
  const currSym = config.currency_symbol || getConfig('currency') || 'QAR'
  const decimals = currencyDecimals(config)
  const fmtAmt = (n: number) => `${(n || 0).toFixed(decimals)} ${currSym}`

  const lines: string[] = [CMD.INIT, CMD.ALIGN_CENTER]

  if (config.restaurant_name) {
    lines.push(CMD.BOLD_ON + config.restaurant_name + CMD.BOLD_OFF)
  }
  lines.push(getSeparatorLine())
  lines.push(CMD.BOLD_ON + 'SHIFT CLOSING REPORT' + CMD.BOLD_OFF)
  lines.push(getSeparatorLine())

  lines.push(CMD.ALIGN_LEFT)
  lines.push(`Cashier: ${data.userName}`)
  const fmtTime = (s: string) => {
    try { const d = new Date(s.includes('Z') ? s : s.replace(' ', 'T') + 'Z'); return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) } catch { return s }
  }
  lines.push(`Opened: ${fmtTime(data.openedAt)}`)
  lines.push(`Closed: ${fmtTime(data.closedAt)}`)

  lines.push(getDashLine())
  lines.push(CMD.BOLD_ON + formatLine('SUMMARY', '') + CMD.BOLD_OFF)
  lines.push(formatLine('Total Orders:', String(data.totalOrders)))
  lines.push(formatLine('Total Sales:', fmtAmt(data.totalSales)))
  lines.push(formatLine('Opening Cash:', fmtAmt(data.openingCash)))
  lines.push(formatLine('Closing Cash:', fmtAmt(data.closingCash)))

  if (Object.keys(data.paymentBreakdown).length > 0) {
    lines.push(getDashLine())
    lines.push(CMD.BOLD_ON + 'PAYMENT BREAKDOWN' + CMD.BOLD_OFF)
    for (const [method, amount] of Object.entries(data.paymentBreakdown)) {
      lines.push(formatLine(`  ${method}:`, fmtAmt(amount as number)))
    }
  }

  if (data.expectedBalance.length > 0) {
    lines.push(getDashLine())
    lines.push(CMD.BOLD_ON + 'EXPECTED vs ACTUAL' + CMD.BOLD_OFF)
    for (const exp of data.expectedBalance) {
      const actual = data.closingBalance.find((c) => c.mode === exp.mode)
      const diff = (actual?.amount || 0) - exp.amount
      lines.push(formatLine(`  ${exp.mode}:`, `Exp ${fmtAmt(exp.amount)}`))
      if (actual) {
        lines.push(formatLine('', `Act ${fmtAmt(actual.amount)}${diff !== 0 ? ` (${diff > 0 ? '+' : ''}${diff.toFixed(decimals)})` : ''}`))
      }
    }
  }

  if (data.voidedOrders && data.voidedOrders.length > 0) {
    lines.push(getDashLine())
    lines.push(CMD.BOLD_ON + 'VOIDED ORDERS' + CMD.BOLD_OFF)
    for (const v of data.voidedOrders) {
      lines.push(formatLine(`  #${v.order_number}`, fmtAmt(v.grand_total)))
      lines.push(`    Reason: ${v.void_reason || '-'}`)
    }
    const voidTotal = data.voidedOrders.reduce((s, v) => s + (v.grand_total || 0), 0)
    lines.push(CMD.BOLD_ON + formatLine(`  Total (${data.voidedOrders.length} orders):`, fmtAmt(voidTotal)) + CMD.BOLD_OFF)
  }

  if (data.voidedItems && data.voidedItems.length > 0) {
    lines.push(getDashLine())
    lines.push(CMD.BOLD_ON + 'REMOVED ITEMS' + CMD.BOLD_OFF)
    for (const vi of data.voidedItems) {
      lines.push(formatLine(`  ${vi.qty}x ${vi.item_name}`, fmtAmt(vi.amount)))
      lines.push(`    #${vi.order_number} | ${vi.void_reason || '-'}`)
    }
    const removeTotal = data.voidedItems.reduce((s, vi) => s + (vi.amount || 0), 0)
    lines.push(CMD.BOLD_ON + formatLine(`  Total (${data.voidedItems.length} items):`, fmtAmt(removeTotal)) + CMD.BOLD_OFF)
  }

  if (data.remarks) {
    lines.push(getDashLine())
    lines.push(`Remarks: ${data.remarks}`)
  }

  lines.push(getSeparatorLine())
  lines.push(CMD.ALIGN_CENTER)
  lines.push(`Printed: ${new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`)
  lines.push(getSeparatorLine())

  lines.push(CMD.FEED_5)
  lines.push(CMD.PARTIAL_CUT)

  return lines.join(LF)
}
