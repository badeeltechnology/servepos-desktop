/**
 * Arabic Bitmap Renderer for Thermal Printers
 *
 * Most thermal printers don't have Arabic fonts in firmware.
 * This module renders Arabic text as bitmap images using Electron's
 * Chromium engine, then converts them to ESC/POS raster format.
 * Non-Arabic text continues to use normal ESC/POS text mode.
 */
import { BrowserWindow } from 'electron'

const ARABIC_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/

let offscreenWin: BrowserWindow | null = null

function getOffscreenWindow(): BrowserWindow {
  if (!offscreenWin || offscreenWin.isDestroyed()) {
    offscreenWin = new BrowserWindow({
      width: 800,
      height: 600,
      show: false,
      webPreferences: {
        offscreen: true,
        contextIsolation: false
      }
    })
    offscreenWin.loadURL('about:blank')
  }
  return offscreenWin
}

export function cleanupRenderer(): void {
  if (offscreenWin && !offscreenWin.isDestroyed()) {
    offscreenWin.destroy()
    offscreenWin = null
  }
}

export function containsArabic(text: string): boolean {
  return ARABIC_REGEX.test(text)
}

/** Strip ESC/POS command sequences, returning only printable text */
function stripEscPos(str: string): string {
  let result = ''
  let i = 0
  while (i < str.length) {
    const c = str.charCodeAt(i)
    if (c === 0x1b) {
      // ESC commands
      const next = i + 1 < str.length ? str.charCodeAt(i + 1) : 0
      if (next === 0x40) {
        i += 2 // ESC @
      } else if (next === 0x70) {
        i += 5 // ESC p n1 n2 n3
      } else {
        i += 3 // ESC x n (E, a, d, etc.)
      }
    } else if (c === 0x1d) {
      i += 3 // GS x n
    } else if (c === 0x1c) {
      i += 2 // FS x
    } else if (c < 0x20 && c !== 0x0a) {
      i++ // skip other control chars
    } else {
      result += str[i]
      i++
    }
  }
  return result
}

/** Get printer dots width based on paper mm width */
function getPrinterDotsWidth(paperWidth: number): number {
  return paperWidth >= 80 ? 576 : 384
}

interface RenderOptions {
  bold?: boolean
  doubleSize?: boolean
  align?: 'left' | 'center' | 'right'
}

/** Render a line of Arabic text as an ESC/POS raster bitmap */
async function renderArabicLine(
  text: string,
  dotsWidth: number,
  options: RenderOptions = {}
): Promise<Buffer> {
  const win = getOffscreenWindow()
  const fontSize = options.doubleSize ? 36 : 22
  const lineHeight = Math.ceil(fontSize * 1.5)
  const bold = options.bold ? 'bold ' : ''
  const align = options.align || 'right'

  // Escape text for safe embedding in JavaScript string
  const escaped = text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '')

  let alignX: number
  if (align === 'center') alignX = Math.floor(dotsWidth / 2)
  else if (align === 'left') alignX = 10
  else alignX = dotsWidth - 10

  const canvasAlign = align === 'right' ? 'right' : align

  const script = `
    (function() {
      var canvas = document.createElement('canvas');
      canvas.width = ${dotsWidth};
      canvas.height = ${lineHeight};
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'black';
      ctx.font = "${bold}${fontSize}px Tahoma, Arial, 'Geeza Pro', 'Noto Sans Arabic', sans-serif";
      ctx.direction = 'rtl';
      ctx.textAlign = '${canvasAlign}';
      ctx.textBaseline = 'middle';
      ctx.fillText("${escaped}", ${alignX}, ${Math.floor(lineHeight / 2)});
      var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      var mono = new Array(canvas.width * canvas.height);
      for (var i = 0; i < imageData.data.length; i += 4) {
        var gray = (imageData.data[i] + imageData.data[i+1] + imageData.data[i+2]) / 3;
        mono[i / 4] = gray < 128 ? 1 : 0;
      }
      return { w: canvas.width, h: canvas.height, px: mono };
    })()
  `

  const result = await win.webContents.executeJavaScript(script)
  return monoToEscPosRaster(result.px, result.w, result.h)
}

/** Convert monochrome pixel array to ESC/POS GS v 0 raster command */
function monoToEscPosRaster(pixels: number[], width: number, height: number): Buffer {
  const bytesPerLine = Math.ceil(width / 8)
  const xL = bytesPerLine & 0xff
  const xH = (bytesPerLine >> 8) & 0xff
  const yL = height & 0xff
  const yH = (height >> 8) & 0xff

  // GS v 0 m xL xH yL yH d1...dk
  const header = Buffer.from([0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH])

  const bitmapData = Buffer.alloc(bytesPerLine * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[y * width + x]) {
        const byteIdx = y * bytesPerLine + Math.floor(x / 8)
        bitmapData[byteIdx] |= 1 << (7 - (x % 8))
      }
    }
  }

  return Buffer.concat([header, bitmapData])
}

/**
 * Process template output: replace Arabic text lines with bitmap images,
 * encode everything else as raw bytes (latin1 to preserve ESC/POS commands).
 */
export async function processForPrinter(templateOutput: string, paperWidth: number): Promise<Buffer> {
  const dotsWidth = getPrinterDotsWidth(paperWidth)
  const lines = templateOutput.split('\x0A')
  const buffers: Buffer[] = []

  // Track ESC/POS state across lines
  let currentAlign: 'left' | 'center' | 'right' = 'left'

  for (const line of lines) {
    // Track alignment commands on this line
    if (line.includes('\x1Ba\x01')) currentAlign = 'center'
    if (line.includes('\x1Ba\x00')) currentAlign = 'left'
    if (line.includes('\x1Ba\x02')) currentAlign = 'right'

    const plainText = stripEscPos(line)

    if (containsArabic(plainText)) {
      const isBold = line.includes('\x1BE\x01')
      const isDouble = line.includes('\x1D!\x11')

      const bitmap = await renderArabicLine(plainText.trim(), dotsWidth, {
        bold: isBold,
        doubleSize: isDouble,
        align: currentAlign
      })
      buffers.push(bitmap)
    } else {
      // Use latin1 encoding to preserve ESC/POS command bytes (especially > 0x7F)
      buffers.push(Buffer.from(line + '\x0A', 'latin1'))
    }
  }

  return Buffer.concat(buffers)
}
