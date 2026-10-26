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
let ready: Promise<void> | null = null

function getOffscreenWindow(): { win: BrowserWindow; ready: Promise<void> } {
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
    // Wait for the blank page before the first executeJavaScript (it used to race on the first print)
    ready = offscreenWin.loadURL('about:blank').then(() => undefined, () => undefined)
  }
  return { win: offscreenWin, ready: ready! }
}

/** Create the offscreen renderer at startup and draw one line, so the first KOT doesn't pay for it. */
export async function warmArabicRenderer(): Promise<void> {
  const t0 = Date.now()
  await renderBatch([{ text: 'تجربة', bold: false, doubleSize: false, align: 'right' }], 576)
  console.log(`[Print] Arabic renderer warm in ${Date.now() - t0} ms`)
}

export function cleanupRenderer(): void {
  if (offscreenWin && !offscreenWin.isDestroyed()) {
    offscreenWin.destroy()
    offscreenWin = null
    ready = null
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

interface LineJob { text: string; bold: boolean; doubleSize: boolean; align: 'left' | 'center' | 'right' }

// Rendered lines, by text + style + width. Item names repeat across tickets all day.
const cache = new Map<string, Buffer>()
const CACHE_MAX = 600
const keyOf = (j: LineJob, w: number) => `${w}|${j.bold ? 1 : 0}${j.doubleSize ? 1 : 0}${j.align}|${j.text}`

/**
 * Render many Arabic lines in ONE executeJavaScript round trip (it used to be one per line).
 * The page packs each line into ESC/POS raster bytes itself, so only small arrays come back.
 */
async function renderBatch(jobs: LineJob[], dotsWidth: number): Promise<Buffer[]> {
  const out: (Buffer | null)[] = jobs.map((j) => cache.get(keyOf(j, dotsWidth)) || null)
  const todo: LineJob[] = []
  const todoKeys: string[] = []
  jobs.forEach((j, i) => { if (!out[i]) { const k = keyOf(j, dotsWidth); if (!todoKeys.includes(k)) { todoKeys.push(k); todo.push(j) } } })
  if (todo.length) {
    const { win, ready: loaded } = getOffscreenWindow()
    await loaded
    const specs = todo.map((j) => {
      const fontSize = j.doubleSize ? 36 : 22
      const lineHeight = Math.ceil(fontSize * 1.5)
      const x = j.align === 'center' ? Math.floor(dotsWidth / 2) : j.align === 'left' ? 10 : dotsWidth - 10
      return { t: j.text, f: `${j.bold ? 'bold ' : ''}${fontSize}px Tahoma, Arial, 'Geeza Pro', 'Noto Sans Arabic', sans-serif`, h: lineHeight, x, a: j.align }
    })
    const script = `
      (function(specs, W) {
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d', { willReadFrequently: true });
        var bpl = Math.ceil(W / 8);
        return specs.map(function(s) {
          canvas.width = W; canvas.height = s.h;
          ctx.fillStyle = 'white'; ctx.fillRect(0, 0, W, s.h);
          ctx.fillStyle = 'black'; ctx.font = s.f; ctx.direction = 'rtl';
          ctx.textAlign = s.a; ctx.textBaseline = 'middle';
          ctx.fillText(s.t, s.x, Math.floor(s.h / 2));
          var d = ctx.getImageData(0, 0, W, s.h).data;
          var bytes = new Array(bpl * s.h).fill(0);
          for (var y = 0; y < s.h; y++) for (var x = 0; x < W; x++) {
            var i = (y * W + x) * 4;
            if ((d[i] + d[i+1] + d[i+2]) / 3 < 128) bytes[y * bpl + (x >> 3)] |= 1 << (7 - (x & 7));
          }
          return { w: W, h: s.h, b: bytes };
        });
      })(${JSON.stringify(specs)}, ${dotsWidth})
    `
    const results: { w: number; h: number; b: number[] }[] = await win.webContents.executeJavaScript(script)
    results.forEach((r, k) => {
      const buf = packedToRaster(r.b, r.w, r.h)
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string)
      cache.set(todoKeys[k], buf)
    })
    jobs.forEach((j, i) => { if (!out[i]) out[i] = cache.get(keyOf(j, dotsWidth))! })
  }
  return out as Buffer[]
}

function packedToRaster(bytes: number[], width: number, height: number): Buffer {
  const bytesPerLine = Math.ceil(width / 8)
  const header = Buffer.from([0x1d, 0x76, 0x30, 0x00, bytesPerLine & 0xff, (bytesPerLine >> 8) & 0xff, height & 0xff, (height >> 8) & 0xff])
  return Buffer.concat([header, Buffer.from(bytes)])
}

/**
 * Process template output: replace Arabic text lines with bitmap images,
 * encode everything else as raw bytes (latin1 to preserve ESC/POS commands).
 */
export async function processForPrinter(templateOutput: string, paperWidth: number): Promise<Buffer> {
  const dotsWidth = getPrinterDotsWidth(paperWidth)
  const lines = templateOutput.split('\x0A')
  const parts: (Buffer | number)[] = [] // a number is the index of an Arabic job
  const jobs: LineJob[] = []

  // Track ESC/POS state across lines
  let currentAlign: 'left' | 'center' | 'right' = 'left'

  for (const line of lines) {
    // Track alignment commands on this line
    if (line.includes('\x1Ba\x01')) currentAlign = 'center'
    if (line.includes('\x1Ba\x00')) currentAlign = 'left'
    if (line.includes('\x1Ba\x02')) currentAlign = 'right'

    const plainText = stripEscPos(line)

    if (containsArabic(plainText)) {
      parts.push(jobs.length)
      jobs.push({ text: plainText.trim(), bold: line.includes('\x1BE\x01'), doubleSize: line.includes('\x1D!\x11'), align: currentAlign })
    } else {
      // Use latin1 encoding to preserve ESC/POS command bytes (especially > 0x7F)
      parts.push(Buffer.from(line + '\x0A', 'latin1'))
    }
  }

  const bitmaps = jobs.length ? await renderBatch(jobs, dotsWidth) : []
  return Buffer.concat(parts.map((p) => (typeof p === 'number' ? bitmaps[p] : p)))
}
