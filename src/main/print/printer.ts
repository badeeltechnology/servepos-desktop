import * as net from 'net'
import { getDb, saveDatabase } from '../database/schema'
import { v4 as uuidv4 } from 'uuid'

// ESC/POS command constants
const ESC = '\x1B'
const GS = '\x1D'
const LF = '\x0A'

export const CMD = {
  INIT: `${ESC}@`,
  BOLD_ON: `${ESC}E\x01`,
  BOLD_OFF: `${ESC}E\x00`,
  ALIGN_CENTER: `${ESC}a\x01`,
  ALIGN_LEFT: `${ESC}a\x00`,
  ALIGN_RIGHT: `${ESC}a\x02`,
  DOUBLE_WIDTH: `${GS}!\x10`,
  DOUBLE_HEIGHT: `${GS}!\x01`,
  DOUBLE_BOTH: `${GS}!\x11`,
  NORMAL_SIZE: `${GS}!\x00`,
  CUT: `${GS}V\x00`,
  PARTIAL_CUT: `${GS}V\x01`,
  FEED_3: `${ESC}d\x03`,
  FEED_5: `${ESC}d\x05`,
  OPEN_DRAWER: `${ESC}p\x00\x19\xFA`,
  LINE: '================================',
  DASH_LINE: '--------------------------------'
}

export interface PrinterConfig {
  id: string
  printer_name: string
  connection_type: 'usb' | 'network' | 'bluetooth'
  address: string | null
  port: number
  paper_width: number
}

export async function sendToPrinter(printer: PrinterConfig, data: string): Promise<{ success: boolean; error?: string }> {
  if (printer.connection_type === 'network' && printer.address) {
    return sendToNetworkPrinter(printer.address, printer.port, data)
  }
  // USB printing — use system print dialog as fallback
  return { success: false, error: 'USB printing requires driver setup. Use network printer.' }
}

function sendToNetworkPrinter(address: string, port: number, data: string): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    const timeout = setTimeout(() => {
      socket.destroy()
      resolve({ success: false, error: 'Connection timeout' })
    }, 5000)

    socket.connect(port, address, () => {
      socket.write(Buffer.from(data, 'binary'), () => {
        clearTimeout(timeout)
        socket.end()
        resolve({ success: true })
      })
    })

    socket.on('error', (err) => {
      clearTimeout(timeout)
      socket.destroy()
      resolve({ success: false, error: err.message })
    })
  })
}

export async function testPrinter(printer: PrinterConfig): Promise<{ success: boolean; error?: string }> {
  const testData = [
    CMD.INIT,
    CMD.ALIGN_CENTER,
    CMD.BOLD_ON,
    'Printer Test',
    CMD.BOLD_OFF,
    LF,
    CMD.ALIGN_LEFT,
    CMD.LINE,
    `Printer: ${printer.printer_name}`,
    `Type: ${printer.connection_type}`,
    `Time: ${new Date().toLocaleString()}`,
    CMD.LINE,
    CMD.ALIGN_CENTER,
    'Test OK',
    CMD.FEED_3,
    CMD.PARTIAL_CUT
  ].join(LF)

  const result = await sendToPrinter(printer, testData)

  // Update test status
  const db = getDb()
  db.run(
    'UPDATE printers SET test_status = ?, last_tested_at = datetime("now") WHERE id = ?',
    [result.success ? 'ok' : 'error', printer.id]
  )
  saveDatabase()

  return result
}

// ==================== Printer CRUD ====================

export function getPrinters(): PrinterConfig[] {
  const db = getDb()
  const stmt = db.prepare('SELECT * FROM printers WHERE is_active = 1 ORDER BY printer_name')
  const rows: PrinterConfig[] = []
  while (stmt.step()) rows.push(stmt.getAsObject() as any)
  stmt.free()
  return rows
}

export function addPrinter(data: Omit<PrinterConfig, 'id'>): string {
  const db = getDb()
  const id = uuidv4()
  db.run(
    `INSERT INTO printers (id, printer_name, connection_type, address, port, paper_width)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, data.printer_name, data.connection_type, data.address, data.port || 9100, data.paper_width || 80]
  )
  saveDatabase()
  return id
}

export function updatePrinter(id: string, data: Partial<PrinterConfig>): void {
  const db = getDb()
  const sets: string[] = []
  const vals: any[] = []
  if (data.printer_name) { sets.push('printer_name = ?'); vals.push(data.printer_name) }
  if (data.connection_type) { sets.push('connection_type = ?'); vals.push(data.connection_type) }
  if (data.address !== undefined) { sets.push('address = ?'); vals.push(data.address) }
  if (data.port) { sets.push('port = ?'); vals.push(data.port) }
  if (sets.length === 0) return
  vals.push(id)
  db.run(`UPDATE printers SET ${sets.join(', ')} WHERE id = ?`, vals)
  saveDatabase()
}

export function deletePrinter(id: string): void {
  const db = getDb()
  db.run('DELETE FROM printers WHERE id = ?', [id])
  db.run('DELETE FROM print_routes WHERE printer_id = ?', [id])
  saveDatabase()
}

// ==================== Print Routes ====================

export interface PrintRoute {
  id: string
  print_type: 'receipt' | 'kot'
  item_group: string | null
  kitchen_station: string | null
  printer_id: string
  printer_name?: string
}

export function getPrintRoutes(): PrintRoute[] {
  const db = getDb()
  const stmt = db.prepare(
    `SELECT pr.*, p.printer_name FROM print_routes pr
     JOIN printers p ON p.id = pr.printer_id
     WHERE pr.is_active = 1
     ORDER BY pr.print_type, pr.item_group`
  )
  const rows: PrintRoute[] = []
  while (stmt.step()) rows.push(stmt.getAsObject() as any)
  stmt.free()
  return rows
}

export function addPrintRoute(data: { printType: string; itemGroup?: string; kitchenStation?: string; printerId: string }): string {
  const db = getDb()
  const id = uuidv4()
  db.run(
    'INSERT INTO print_routes (id, print_type, item_group, kitchen_station, printer_id) VALUES (?, ?, ?, ?, ?)',
    [id, data.printType, data.itemGroup || null, data.kitchenStation || null, data.printerId]
  )
  saveDatabase()
  return id
}

export function deletePrintRoute(id: string): void {
  const db = getDb()
  db.run('DELETE FROM print_routes WHERE id = ?', [id])
  saveDatabase()
}
