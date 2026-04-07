import { getDb, saveDatabase } from '../database/schema'
import { getConfig, getAllReceiptConfig, getOrderItems, getOrderPayments } from '../database/queries'
import { sendToPrinter, getPrinters, getPrintRoutes, PrinterConfig } from './printer'
import { generateReceipt, generateKot, generateWaiterCopy, generatePrepDoc, generateInvoice } from './templates'
import { processForPrinter } from './arabic-bitmap'
import { v4 as uuidv4 } from 'uuid'

// Get number of copies for a print type from config
function getCopyCount(printType: string): number {
  const config = getAllReceiptConfig()
  const key = `${printType}_copies`
  return Math.max(1, Math.min(5, parseInt(config[key] || '1')))
}

// Send data to printer multiple times based on copy count
async function sendWithCopies(printer: PrinterConfig, buffer: Buffer, copies: number): Promise<{ success: boolean; error?: string }> {
  if (copies <= 1) return sendToPrinter(printer, buffer)

  // For multiple copies, send all data as one job to avoid spooler conflicts
  const allCopies = Buffer.concat(Array(copies).fill(buffer))
  return sendToPrinter(printer, allCopies)
}

// Get next KOT number
function getNextKotNumber(): number {
  const db = getDb()
  const today = new Date().toISOString().slice(0, 10)
  const lastDate = getConfig('kot_seq_date')
  let num = 1
  if (lastDate === today) {
    const current = getConfig('kot_seq_number')
    num = (current ? parseInt(current) : 0) + 1
  }
  db.run("INSERT OR REPLACE INTO config (key, value) VALUES ('kot_seq_date', ?)", [today])
  db.run("INSERT OR REPLACE INTO config (key, value) VALUES ('kot_seq_number', ?)", [String(num)])
  saveDatabase()
  return num
}

// Shared helper: lookup item info (Arabic name, descriptions) from items table
function lookupItemInfo(db: any, itemCode: string): { item_name_ar?: string; description?: string; description_ar?: string; item_group?: string; kitchen_station?: string } {
  const stmt = db.prepare('SELECT item_name_ar, description, description_ar, item_group, kitchen_station FROM items WHERE item_code = ?')
  stmt.bind([itemCode])
  const info = stmt.step() ? stmt.getAsObject() as any : {}
  stmt.free()
  return info
}

// Log print action
function logPrint(orderId: string, printType: string, printerId: string, success: boolean, error?: string): void {
  const db = getDb()
  db.run(
    'INSERT INTO print_log (id, order_id, print_type, printer_id, status, error) VALUES (?, ?, ?, ?, ?, ?)',
    [uuidv4(), orderId, printType, printerId, success ? 'success' : 'failed', error || null]
  )
  saveDatabase()
}

export async function printReceipt(orderId: string): Promise<{ success: boolean; error?: string }> {
  const db = getDb()

  // Get order
  const orderStmt = db.prepare('SELECT * FROM orders WHERE id = ?')
  orderStmt.bind([orderId])
  if (!orderStmt.step()) { orderStmt.free(); return { success: false, error: 'Order not found' } }
  const order = orderStmt.getAsObject() as any
  orderStmt.free()

  // Get order items
  const items = getOrderItems(orderId)
  const payments = getOrderPayments(orderId)

  // Get receipt printer
  const routes = getPrintRoutes()
  const receiptRoute = routes.find((r) => r.print_type === 'receipt')
  if (!receiptRoute) return { success: false, error: 'No receipt printer configured' }

  const printers = getPrinters()
  const printer = printers.find((p) => p.id === receiptRoute.printer_id)
  if (!printer) return { success: false, error: 'Receipt printer not found' }

  const config = getAllReceiptConfig()
  const taxEnabled = config.tax_enabled === '1'
  const taxRate = taxEnabled ? parseFloat(config.tax_rate || '0') : 0
  const taxLabel = config.tax_label || 'VAT'

  const totalPaid = payments.reduce((sum: number, p: any) => sum + p.amount, 0)

  const receiptData = {
    orderNumber: order.order_number,
    orderType: order.order_type,
    tableName: order.table_name,
    guests: order.guests,
    cashierName: order.cashier_name || '',
    waiterName: order.waiter_name || undefined,
    items: items.map((item: any) => {
      const info = lookupItemInfo(db, item.item_code)
      return {
        itemName: item.item_name,
        itemNameAr: info.item_name_ar || null,
        qty: item.qty,
        rate: item.rate,
        amount: item.amount,
        description: info.description || null,
        descriptionAr: info.description_ar || null,
        modifiers: item.modifiers ? JSON.parse(item.modifiers) : undefined,
        specialInstructions: item.special_instructions,
        discountPercent: item.discount_percent,
        discountAmount: item.discount_amount
      }
    }),
    subtotal: order.subtotal || 0,
    taxTotal: order.tax_total || 0,
    taxLabel,
    taxRate,
    discountAmount: (order.discount_amount || 0) + (order.subtotal * (order.discount_percent || 0) / 100),
    grandTotal: order.grand_total || 0,
    payments: payments.map((p: any) => ({ method: p.payment_method, amount: p.amount })),
    change: Math.max(0, totalPaid - (order.grand_total || 0)),
    promoName: order.promo_name || undefined,
    orderNotes: order.order_notes || undefined
  }

  const receipt = generateReceipt(receiptData)
  const printBuffer = await processForPrinter(receipt, printer.paper_width || 80)
  const result = await sendWithCopies(printer, printBuffer, getCopyCount('receipt'))
  logPrint(orderId, 'receipt', printer.id, result.success, result.error)
  return result
}

export async function printPrepDoc(orderId: string): Promise<{ success: boolean; error?: string }> {
  const db = getDb()

  const orderStmt = db.prepare('SELECT * FROM orders WHERE id = ?')
  orderStmt.bind([orderId])
  if (!orderStmt.step()) { orderStmt.free(); return { success: false, error: 'Order not found' } }
  const order = orderStmt.getAsObject() as any
  orderStmt.free()

  const items = getOrderItems(orderId)

  // Find printer: prep_doc route → receipt route → first printer
  const routes = getPrintRoutes()
  const printers = getPrinters()

  const prepRoute = routes.find((r) => r.print_type === 'prep_doc')
  const receiptRoute = routes.find((r) => r.print_type === 'receipt')
  const route = prepRoute || receiptRoute
  const printer = route ? printers.find((p) => p.id === route.printer_id) : printers[0]
  if (!printer) return { success: false, error: 'No printer configured for preparation document' }

  const prepData = {
    orderNumber: order.order_number,
    orderType: order.order_type,
    tableName: order.table_name,
    guests: order.guests,
    waiterName: order.waiter_name || undefined,
    cashierName: order.cashier_name || '',
    orderNotes: order.order_notes || undefined,
    items: items.map((item: any) => {
      const info = lookupItemInfo(db, item.item_code)
      return {
        itemName: item.item_name,
        itemNameAr: info.item_name_ar || undefined,
        qty: item.qty,
        modifiers: item.modifiers ? JSON.parse(item.modifiers) : undefined,
        specialInstructions: item.special_instructions
      }
    })
  }

  const doc = generatePrepDoc(prepData)
  const printBuffer = await processForPrinter(doc, printer.paper_width || 80)
  const result = await sendWithCopies(printer, printBuffer, getCopyCount('prep_doc'))
  logPrint(orderId, 'prep_doc', printer.id, result.success, result.error)
  return result
}

export async function printInvoice(orderId: string): Promise<{ success: boolean; error?: string }> {
  const db = getDb()

  const orderStmt = db.prepare('SELECT * FROM orders WHERE id = ?')
  orderStmt.bind([orderId])
  if (!orderStmt.step()) { orderStmt.free(); return { success: false, error: 'Order not found' } }
  const order = orderStmt.getAsObject() as any
  orderStmt.free()

  const items = getOrderItems(orderId)

  // Find printer: invoice route → receipt route → first printer
  const routes = getPrintRoutes()
  const printers = getPrinters()

  const invoiceRoute = routes.find((r) => r.print_type === 'invoice')
  const receiptRoute = routes.find((r) => r.print_type === 'receipt')
  const route = invoiceRoute || receiptRoute
  const printer = route ? printers.find((p) => p.id === route.printer_id) : printers[0]
  if (!printer) return { success: false, error: 'No printer configured for invoice' }

  const config = getAllReceiptConfig()
  const taxEnabled = config.tax_enabled === '1'
  const taxRate = taxEnabled ? parseFloat(config.tax_rate || '0') : 0
  const taxLabel = config.tax_label || 'VAT'

  const invoiceData = {
    orderNumber: order.order_number,
    orderType: order.order_type,
    tableName: order.table_name,
    guests: order.guests,
    cashierName: order.cashier_name || '',
    waiterName: order.waiter_name || undefined,
    items: items.map((item: any) => {
      const info = lookupItemInfo(db, item.item_code)
      return {
        itemName: item.item_name,
        itemNameAr: info.item_name_ar || null,
        qty: item.qty,
        rate: item.rate,
        amount: item.amount,
        description: info.description || null,
        descriptionAr: info.description_ar || null,
        modifiers: item.modifiers ? JSON.parse(item.modifiers) : undefined,
        specialInstructions: item.special_instructions,
        discountPercent: item.discount_percent,
        discountAmount: item.discount_amount
      }
    }),
    subtotal: order.subtotal || 0,
    taxTotal: order.tax_total || 0,
    taxLabel,
    taxRate,
    discountAmount: (order.discount_amount || 0) + (order.subtotal * (order.discount_percent || 0) / 100),
    grandTotal: order.grand_total || 0,
    payments: [],
    change: 0,
    promoName: order.promo_name || undefined,
    orderNotes: order.order_notes || undefined
  }

  const invoice = generateInvoice(invoiceData)
  const printBuffer = await processForPrinter(invoice, printer.paper_width || 80)
  const result = await sendWithCopies(printer, printBuffer, getCopyCount('invoice'))
  logPrint(orderId, 'invoice', printer.id, result.success, result.error)
  return result
}

export async function printKots(orderId: string): Promise<{ success: boolean; printed: number; errors: string[] }> {
  const db = getDb()
  const errors: string[] = []
  let printed = 0

  // Get order
  const orderStmt = db.prepare('SELECT * FROM orders WHERE id = ?')
  orderStmt.bind([orderId])
  if (!orderStmt.step()) { orderStmt.free(); return { success: false, printed: 0, errors: ['Order not found'] } }
  const order = orderStmt.getAsObject() as any
  orderStmt.free()

  const items = getOrderItems(orderId)
  const routes = getPrintRoutes()
  const printers = getPrinters()

  // Group items by their print route (item_group → printer)
  const kotRoutes = routes.filter((r) => r.print_type === 'kot')
  if (kotRoutes.length === 0) return { success: false, printed: 0, errors: ['No KOT printers configured'] }

  // Routes with a specific item_group filter
  const specificRoutes = kotRoutes.filter((r) => r.item_group)
  // Catch-all route: one without item_group, or fallback to first route
  const catchAllRoute = kotRoutes.find((r) => !r.item_group && !r.kitchen_station) || kotRoutes[0]

  // Build route -> items mapping (group by route, NOT by printer — separate KOTs per station)
  const routeItems: Record<string, { printer: PrinterConfig; station: string; items: any[] }> = {}

  for (const item of items) {
    const itemInfo = lookupItemInfo(db, item.item_code)
    const itemGroup = itemInfo.item_group || ''
    const kitchenStation = itemInfo.kitchen_station || ''

    // Find matching specific route for this item's group
    let route = specificRoutes.find((r) => r.item_group === itemGroup)
    if (!route) {
      // Try kitchen_station
      route = kotRoutes.find((r) => r.kitchen_station && r.kitchen_station === kitchenStation)
    }
    if (!route) {
      // No specific match — use catch-all route
      route = catchAllRoute
    }

    const printer = printers.find((p) => p.id === route!.printer_id)
    if (!printer) continue

    // Group by route ID (not printer ID) so each item group gets its own KOT
    const routeKey = route.id
    if (!routeItems[routeKey]) {
      routeItems[routeKey] = {
        printer,
        station: route.item_group || route.kitchen_station || 'Kitchen',
        items: []
      }
    }
    routeItems[routeKey].items.push(item)
  }

  // Alias for the loop below
  const printerItems = routeItems

  // Print KOT to each printer
  for (const [, group] of Object.entries(printerItems)) {
    const kotNumber = getNextKotNumber()
    const kotData = {
      kotNumber,
      stationName: group.station,
      orderNumber: order.order_number,
      orderType: order.order_type,
      tableName: order.table_name,
      cashierName: order.cashier_name || '',
      waiterName: order.waiter_name || undefined,
      orderNotes: order.order_notes || undefined,
      items: group.items.map((item: any) => {
        const info = lookupItemInfo(db, item.item_code)
        return {
          itemName: item.item_name,
          itemNameAr: info.item_name_ar || undefined,
          qty: item.qty,
          modifiers: item.modifiers ? JSON.parse(item.modifiers) : undefined,
          specialInstructions: item.special_instructions
        }
      })
    }

    const kot = generateKot(kotData)
    const kotBuffer = await processForPrinter(kot, group.printer.paper_width || 80)
    const result = await sendWithCopies(group.printer, kotBuffer, getCopyCount('kot'))
    logPrint(orderId, 'kot', group.printer.id, result.success, result.error)

    if (result.success) {
      printed++
    } else {
      errors.push(`${group.printer.printer_name}: ${result.error}`)
    }
  }

  // Mark KOT as printed on order
  db.run('UPDATE orders SET kot_printed = 1 WHERE id = ?', [orderId])
  saveDatabase()

  // Auto-print Prep Doc alongside KOT if enabled
  const prepDocConfig = getAllReceiptConfig()
  if (prepDocConfig.prep_doc_enabled !== '0' && prepDocConfig.prep_doc_auto_print !== '0') {
    try {
      await printPrepDoc(orderId)
    } catch (err: any) {
      errors.push(`Prep Doc: ${err.message}`)
    }
  }

  return { success: errors.length === 0, printed, errors }
}

export async function printAmendmentKot(orderId: string, amendments: { action: string; itemName: string; detail?: string }[]): Promise<{ success: boolean; error?: string }> {
  const db = getDb()

  const orderStmt = db.prepare('SELECT * FROM orders WHERE id = ?')
  orderStmt.bind([orderId])
  if (!orderStmt.step()) { orderStmt.free(); return { success: false, error: 'Order not found' } }
  const order = orderStmt.getAsObject() as any
  orderStmt.free()

  const routes = getPrintRoutes()
  const printers = getPrinters()
  const kotRoute = routes.find((r) => r.print_type === 'kot')
  if (!kotRoute) return { success: false, error: 'No KOT printer configured' }

  const printer = printers.find((p) => p.id === kotRoute.printer_id)
  if (!printer) return { success: false, error: 'KOT printer not found' }

  const kotNumber = getNextKotNumber()
  const kot = generateKot({
    kotNumber,
    stationName: 'KITCHEN',
    orderNumber: order.order_number,
    orderType: order.order_type,
    tableName: order.table_name,
    cashierName: order.cashier_name || '',
    items: [],
    isAmendment: true,
    amendmentActions: amendments
  })

  const kotBuffer = await processForPrinter(kot, printer.paper_width || 80)
  const result = await sendToPrinter(printer, kotBuffer)
  logPrint(orderId, 'kot_amendment', printer.id, result.success, result.error)
  return result
}

export async function printWaiterCopy(orderId: string): Promise<{ success: boolean; error?: string }> {
  const db = getDb()

  const orderStmt = db.prepare('SELECT * FROM orders WHERE id = ?')
  orderStmt.bind([orderId])
  if (!orderStmt.step()) { orderStmt.free(); return { success: false, error: 'Order not found' } }
  const order = orderStmt.getAsObject() as any
  orderStmt.free()

  const items = getOrderItems(orderId)

  // Print to receipt printer
  const routes = getPrintRoutes()
  const receiptRoute = routes.find((r) => r.print_type === 'receipt')
  if (!receiptRoute) return { success: false, error: 'No receipt printer configured' }

  const printers = getPrinters()
  const printer = printers.find((p) => p.id === receiptRoute.printer_id)
  if (!printer) return { success: false, error: 'Receipt printer not found' }

  const config = getAllReceiptConfig()
  const taxEnabled = config.tax_enabled === '1'
  const taxRate = taxEnabled ? parseFloat(config.tax_rate || '0') : 0

  const waiterData = {
    orderNumber: order.order_number,
    orderType: order.order_type,
    tableName: order.table_name,
    guests: order.guests,
    cashierName: order.cashier_name || '',
    orderNotes: order.order_notes || undefined,
    items: items.map((item: any) => {
      const info = lookupItemInfo(db, item.item_code)
      return {
        itemName: item.item_name,
        itemNameAr: info.item_name_ar || undefined,
        qty: item.qty,
        rate: item.rate,
        amount: item.amount,
        modifiers: item.modifiers ? JSON.parse(item.modifiers) : undefined,
        specialInstructions: item.special_instructions
      }
    }),
    grandTotal: order.grand_total || 0
  }

  const copy = generateWaiterCopy(waiterData)
  const copyBuffer = await processForPrinter(copy, printer.paper_width || 80)
  const result = await sendToPrinter(printer, copyBuffer)
  logPrint(orderId, 'waiter_copy', printer.id, result.success, result.error)
  return result
}
