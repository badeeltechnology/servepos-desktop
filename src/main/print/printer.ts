import * as net from 'net'
import { execSync } from 'child_process'
import { writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
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
  usb_vendor_id: string | null
  usb_product_id: string | null
}

export async function sendToPrinter(printer: PrinterConfig, data: string): Promise<{ success: boolean; error?: string }> {
  if (printer.connection_type === 'network' && printer.address) {
    return sendToNetworkPrinter(printer.address, printer.port, data)
  }
  if (printer.connection_type === 'usb') {
    return sendToUsbPrinter(printer, data)
  }
  return { success: false, error: 'Unsupported printer connection type' }
}

function sendToUsbPrinter(printer: PrinterConfig, data: string): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    try {
      const printerName = printer.address
      if (!printerName) {
        resolve({ success: false, error: 'Printer name is required. Use "Detect Printers" to find available printers.' })
        return
      }

      const tempFile = join(tmpdir(), `servepos-print-${Date.now()}.bin`)
      writeFileSync(tempFile, Buffer.from(data, 'binary'))

      try {
        if (process.platform === 'win32') {
          // Windows: send raw ESC/POS data through the print spooler using WritePrinter Win32 API
          const psFile = join(tmpdir(), 'servepos-rawprint-' + Date.now() + '.ps1')
          const filePath = tempFile.replace(/\\/g, '\\\\')
          const psScript = [
            'Add-Type -TypeDefinition @"',
            'using System;',
            'using System.Runtime.InteropServices;',
            'public class RawPrint {',
            '  [StructLayout(LayoutKind.Sequential)] public struct DOCINFOA {',
            '    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;',
            '    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;',
            '    [MarshalAs(UnmanagedType.LPStr)] public string pDatatype;',
            '  }',
            '  [DllImport("winspool.drv",CharSet=CharSet.Ansi,SetLastError=true)]',
            '  public static extern bool OpenPrinter(string p, out IntPtr h, IntPtr d);',
            '  [DllImport("winspool.drv",SetLastError=true)]',
            '  public static extern bool StartDocPrinter(IntPtr h, int l, ref DOCINFOA di);',
            '  [DllImport("winspool.drv",SetLastError=true)]',
            '  public static extern bool StartPagePrinter(IntPtr h);',
            '  [DllImport("winspool.drv",SetLastError=true)]',
            '  public static extern bool WritePrinter(IntPtr h, IntPtr b, int c, out int w);',
            '  [DllImport("winspool.drv",SetLastError=true)]',
            '  public static extern bool EndPagePrinter(IntPtr h);',
            '  [DllImport("winspool.drv",SetLastError=true)]',
            '  public static extern bool EndDocPrinter(IntPtr h);',
            '  [DllImport("winspool.drv",SetLastError=true)]',
            '  public static extern bool ClosePrinter(IntPtr h);',
            '  public static bool Send(string name, byte[] data) {',
            '    IntPtr h;',
            '    if (!OpenPrinter(name, out h, IntPtr.Zero)) return false;',
            '    var di = new DOCINFOA { pDocName = "ServePOS", pDatatype = "RAW" };',
            '    StartDocPrinter(h, 1, ref di);',
            '    StartPagePrinter(h);',
            '    IntPtr ptr = Marshal.AllocCoTaskMem(data.Length);',
            '    Marshal.Copy(data, 0, ptr, data.Length);',
            '    int w;',
            '    bool ok = WritePrinter(h, ptr, data.Length, out w);',
            '    Marshal.FreeCoTaskMem(ptr);',
            '    EndPagePrinter(h);',
            '    EndDocPrinter(h);',
            '    ClosePrinter(h);',
            '    return ok && w == data.Length;',
            '  }',
            '}',
            '"@',
            '$bytes = [System.IO.File]::ReadAllBytes(\'' + filePath + '\')',
            '$result = [RawPrint]::Send(\'' + printerName + '\', $bytes)',
            'if ($result) { exit 0 } else { Write-Error "WritePrinter failed for printer: ' + printerName + '"; exit 1 }'
          ].join('\r\n')
          writeFileSync(psFile, psScript)
          try {
            execSync('powershell -NoProfile -ExecutionPolicy Bypass -File "' + psFile + '"', {
              windowsHide: true,
              timeout: 15000
            })
          } finally {
            try { unlinkSync(psFile) } catch {}
          }
        } else if (process.platform === 'darwin') {
          execSync(`lp -d "${printerName}" -o raw "${tempFile}"`, { timeout: 10000 })
        } else {
          execSync(`lp -d "${printerName}" -o raw "${tempFile}"`, { timeout: 10000 })
        }
        resolve({ success: true })
      } catch (err: any) {
        resolve({ success: false, error: `Print failed: ${err.message}` })
      } finally {
        try { unlinkSync(tempFile) } catch {}
      }
    } catch (err: any) {
      resolve({ success: false, error: `Print error: ${err.message}` })
    }
  })
}

// Discover printers installed on the OS
export function discoverUsbPrinters(): { name: string; port: string }[] {
  try {
    if (process.platform === 'win32') {
      // Windows: list printers with their port names using PowerShell
      const output = execSync(
        'powershell -Command "Get-WmiObject -Query \\"SELECT Name,PortName FROM Win32_Printer\\" | ForEach-Object { $_.Name + \'||\' + $_.PortName }"',
        { encoding: 'utf8', windowsHide: true, timeout: 10000 }
      )
      return output.trim().split('\n').filter(Boolean).map((line) => {
        const [name, port] = line.trim().split('||')
        return { name: name || '', port: port || '' }
      }).filter((p) => p.name)
    } else if (process.platform === 'darwin') {
      // macOS: use lpstat
      const output = execSync('lpstat -a 2>/dev/null || true', { encoding: 'utf8', timeout: 10000 })
      return output.trim().split('\n').filter(Boolean).map((line) => {
        const name = line.split(' ')[0]
        return { name, port: name }
      })
    } else {
      // Linux: use lpstat
      const output = execSync('lpstat -a 2>/dev/null || true', { encoding: 'utf8', timeout: 10000 })
      return output.trim().split('\n').filter(Boolean).map((line) => {
        const name = line.split(' ')[0]
        return { name, port: name }
      })
    }
  } catch {
    return []
  }
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
    `INSERT INTO printers (id, printer_name, connection_type, address, port, paper_width, usb_vendor_id, usb_product_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, data.printer_name, data.connection_type, data.address, data.port || 9100, data.paper_width || 80, data.usb_vendor_id || null, data.usb_product_id || null]
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
  if (data.usb_vendor_id !== undefined) { sets.push('usb_vendor_id = ?'); vals.push(data.usb_vendor_id) }
  if (data.usb_product_id !== undefined) { sets.push('usb_product_id = ?'); vals.push(data.usb_product_id) }
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
