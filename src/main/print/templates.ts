import { CMD } from './printer'
import { getDb } from '../database/schema'
import { getAllReceiptConfig } from '../database/queries'

const LF = '\x0A'

function padRight(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length)
}

function padLeft(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : ' '.repeat(len - str.length) + str
}

function formatLine(left: string, right: string, width = 32): string {
  const space = width - left.length - right.length
  if (space <= 0) return left.slice(0, width - right.length - 1) + ' ' + right
  return left + ' '.repeat(space) + right
}

interface ReceiptData {
  orderNumber: string
  orderType: string
  tableName?: string
  guests?: number
  cashierName: string
  items: {
    itemName: string
    qty: number
    rate: number
    amount: number
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
}

export function generateReceipt(data: ReceiptData): string {
  const config = getAllReceiptConfig()
  const showArabic = config.show_arabic === '1'
  const showCashier = config.show_cashier_name !== '0'
  const showCr = config.show_cr_number === '1' && config.cr_number
  const showVat = config.show_vat_number === '1' && config.vat_number
  const currSym = config.currency_symbol || 'QAR'
  const currPos = config.currency_position || 'after'
  const decimals = parseInt(config.currency_decimals || '2')

  const fmtAmt = (n: number) => {
    const num = n.toFixed(decimals)
    return currPos === 'before' ? `${currSym} ${num}` : `${num} ${currSym}`
  }

  const lines: string[] = [CMD.INIT]

  // Header
  lines.push(CMD.ALIGN_CENTER)
  if (showArabic && config.restaurant_name_ar) {
    lines.push(CMD.BOLD_ON, config.restaurant_name_ar, CMD.BOLD_OFF)
  }
  if (config.restaurant_name) {
    lines.push(CMD.BOLD_ON, config.restaurant_name, CMD.BOLD_OFF)
  }
  lines.push(CMD.DASH_LINE)

  if (config.address_line_1) lines.push(config.address_line_1)
  if (showArabic && config.address_line_1_ar) lines.push(config.address_line_1_ar)
  if (config.address_line_2) lines.push(config.address_line_2)
  if (config.phone) lines.push(`Tel: ${config.phone}`)
  if (showCr) lines.push(`CR: ${config.cr_number}`)
  if (showVat) lines.push(`VAT: ${config.vat_number}`)

  lines.push(CMD.LINE)

  // Order info
  lines.push(CMD.ALIGN_LEFT)
  lines.push(`Receipt: ${data.orderNumber}`)
  lines.push(`Date: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}    ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`)
  if (data.tableName) {
    lines.push(formatLine(`Table: ${data.tableName}`, data.guests ? `Guests: ${data.guests}` : ''))
  }
  if (showCashier) lines.push(`Cashier: ${data.cashierName}`)
  lines.push(`Type: ${data.orderType}`)

  lines.push(CMD.DASH_LINE)
  lines.push(formatLine('Qty  Item', 'Amount'))
  lines.push(CMD.DASH_LINE)

  // Items
  for (const item of data.items) {
    const qtyStr = ` ${item.qty}   `
    const amtStr = item.amount.toFixed(decimals)
    lines.push(formatLine(`${qtyStr}${item.itemName}`, amtStr))

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

  lines.push(CMD.DASH_LINE)

  // Totals
  lines.push(formatLine('Subtotal:', fmtAmt(data.subtotal)))
  if (data.discountAmount > 0) {
    lines.push(formatLine('Discount:', `-${fmtAmt(data.discountAmount)}`))
  }
  if (data.taxTotal > 0) {
    lines.push(formatLine(`${data.taxLabel} (${data.taxRate}%):`, fmtAmt(data.taxTotal)))
  }
  lines.push(CMD.DASH_LINE)
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

  lines.push(CMD.LINE)

  // Footer
  lines.push(CMD.ALIGN_CENTER)
  if (showArabic && config.footer_message_ar) lines.push(config.footer_message_ar)
  if (config.footer_message) lines.push(config.footer_message)
  lines.push(CMD.LINE)

  lines.push(CMD.FEED_5)
  lines.push(CMD.PARTIAL_CUT)
  lines.push(CMD.OPEN_DRAWER)

  return lines.join(LF)
}

interface KotData {
  kotNumber: number
  stationName: string
  orderNumber: string
  orderType: string
  tableName?: string
  cashierName: string
  items: {
    itemName: string
    qty: number
    modifiers?: { name: string }[]
    specialInstructions?: string
  }[]
  isAmendment?: boolean
  amendmentActions?: { action: string; itemName: string; detail?: string }[]
}

export function generateKot(data: KotData): string {
  const config = getAllReceiptConfig()
  const showRestName = config.kot_show_restaurant_name !== '0'
  const showTable = config.kot_show_table !== '0'
  const showOrderNum = config.kot_show_order_number !== '0'
  const largeFont = config.kot_font_size === 'large'

  const lines: string[] = [CMD.INIT]

  lines.push(CMD.ALIGN_CENTER)
  lines.push(CMD.LINE)

  if (data.isAmendment) {
    lines.push(CMD.DOUBLE_BOTH, '** AMENDMENT **', CMD.NORMAL_SIZE)
  }

  lines.push(CMD.BOLD_ON, `*** KOT #${String(data.kotNumber).padStart(4, '0')} ***`, CMD.BOLD_OFF)
  if (showRestName && config.restaurant_name) {
    lines.push(config.restaurant_name)
  }
  lines.push(CMD.LINE)

  lines.push(CMD.ALIGN_LEFT)
  lines.push(` Station: ${data.stationName.toUpperCase()}`)
  if (showTable && data.tableName) {
    lines.push(formatLine(` Table: ${data.tableName}`, data.orderType))
  }
  lines.push(` Time: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}  ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`)

  lines.push(CMD.LINE)

  if (largeFont) lines.push(CMD.DOUBLE_BOTH)

  if (data.isAmendment && data.amendmentActions) {
    for (const action of data.amendmentActions) {
      const prefix = action.action === 'item_added' ? ' ADD: ' : action.action === 'item_removed' ? ' CANCEL: ' : ' CHG: '
      lines.push(CMD.BOLD_ON, `${prefix}${action.itemName}`, CMD.BOLD_OFF)
      if (action.detail) lines.push(`     ${action.detail}`)
      lines.push('')
    }
  } else {
    for (const item of data.items) {
      lines.push(CMD.BOLD_ON, ` ${item.qty}x  ${item.itemName.toUpperCase()}`, CMD.BOLD_OFF)
      if (item.modifiers) {
        for (const mod of item.modifiers) {
          lines.push(`     >> ${mod.name}`)
        }
      }
      if (item.specialInstructions) {
        lines.push(`     !! ${item.specialInstructions}`)
      }
      lines.push('')
    }
  }

  if (largeFont) lines.push(CMD.NORMAL_SIZE)

  lines.push(CMD.LINE)
  lines.push(CMD.ALIGN_LEFT)
  if (showOrderNum) lines.push(` Order: ${data.orderNumber}`)
  lines.push(` Cashier: ${data.cashierName}`)
  lines.push(CMD.LINE)
  lines.push(CMD.ALIGN_CENTER, '** END OF KOT **')
  lines.push(CMD.LINE)
  lines.push(CMD.FEED_3, CMD.PARTIAL_CUT)

  return lines.join(LF)
}
