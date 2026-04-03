import { getDb, saveDatabase } from '../database/schema'
import { getConfig, getAllReceiptConfig, getOrderItems, getOrderPayments } from '../database/queries'
import { sendToPrinter, getPrinters, getPrintRoutes, PrinterConfig } from './printer'
import { generateReceipt, generateKot } from './templates'
import { v4 as uuidv4 } from 'uuid'

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
  const dbRef = getDb()
  dbRef.run("INSERT OR REPLACE INTO config (key, value) VALUES ('kot_seq_date', ?)", [today])
  dbRef.run("INSERT OR REPLACE INTO config (key, value) VALUES ('kot_seq_number', ?)", [String(num)])
  saveDatabase()
  return num
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
    items: items.map((item: any) => ({
      itemName: item.item_name,
      qty: item.qty,
      rate: item.rate,
      amount: item.amount,
      modifiers: item.modifiers ? JSON.parse(item.modifiers) : undefined,
      specialInstructions: item.special_instructions,
      discountPercent: item.discount_percent,
      discountAmount: item.discount_amount
    })),
    subtotal: order.subtotal || 0,
    taxTotal: order.tax_total || 0,
    taxLabel,
    taxRate,
    discountAmount: (order.discount_amount || 0) + (order.subtotal * (order.discount_percent || 0) / 100),
    grandTotal: order.grand_total || 0,
    payments: payments.map((p: any) => ({ method: p.payment_method, amount: p.amount })),
    change: Math.max(0, totalPaid - (order.grand_total || 0))
  }

  const receipt = generateReceipt(receiptData)
  const result = await sendToPrinter(printer, receipt)
  logPrint(orderId, 'receipt', printer.id, result.success, result.error)
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

  // Build printer -> items mapping
  const printerItems: Record<string, { printer: PrinterConfig; station: string; items: any[] }> = {}

  for (const item of items) {
    // Find route for this item's group
    let route = kotRoutes.find((r) => r.item_group === item.item_group)
    if (!route) {
      // Try kitchen_station
      route = kotRoutes.find((r) => r.kitchen_station && r.kitchen_station === item.kitchen_station)
    }
    if (!route) {
      // Use first KOT route as default
      route = kotRoutes[0]
    }

    const printer = printers.find((p) => p.id === route!.printer_id)
    if (!printer) continue

    if (!printerItems[printer.id]) {
      printerItems[printer.id] = {
        printer,
        station: route.item_group || route.kitchen_station || 'Kitchen',
        items: []
      }
    }
    printerItems[printer.id].items.push(item)
  }

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
      items: group.items.map((item: any) => ({
        itemName: item.item_name,
        qty: item.qty,
        modifiers: item.modifiers ? JSON.parse(item.modifiers) : undefined,
        specialInstructions: item.special_instructions
      }))
    }

    const kot = generateKot(kotData)
    const result = await sendToPrinter(group.printer, kot)
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

  const result = await sendToPrinter(printer, kot)
  logPrint(orderId, 'kot_amendment', printer.id, result.success, result.error)
  return result
}
