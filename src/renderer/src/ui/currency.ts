// Currency rules for the till. One source of decimals: receipt config `currency_decimals`
// (0-4) when set, else the default for the POS Profile currency (config `currency`), so an
// Omani till works in 3 decimals (1 OMR = 1000 baisa) and a Qatari one in 2, as before.
// Pure module (no React, no stores) so every screen and helper can share it.

export interface CurrencyRule {
  decimals: number
  /** Notes, largest first */
  notes: number[]
  /** Coins, largest first */
  coins: number[]
  /** Quick-cash: round the bill up to these steps (and/or offer these fixed notes) */
  roundUp: number[]
  fixed: number[]
  /** Minor unit label and how many per major unit, e.g. baisa: 1000 */
  minor?: { label: string; per: number }
  /** Max quick-cash buttons including Exact */
  chips: number
}

const TABLE: Record<string, CurrencyRule> = {
  // QAR keeps the original behaviour: exact + bill rounded up to 10/50/100/500/1000, 4 buttons
  QAR: { decimals: 2, notes: [500, 200, 100, 50, 10, 5, 1], coins: [0.5], roundUp: [10, 50, 100, 500, 1000], fixed: [], minor: { label: 'd', per: 100 }, chips: 4 },
  OMR: { decimals: 3, notes: [50, 20, 10, 5, 1, 0.5, 0.1], coins: [0.05, 0.025, 0.01, 0.005], roundUp: [0.5, 1], fixed: [5, 10, 20], minor: { label: 'bz', per: 1000 }, chips: 6 },
  AED: { decimals: 2, notes: [1000, 500, 200, 100, 50, 20, 10, 5], coins: [1, 0.5, 0.25], roundUp: [5, 10, 50, 100], fixed: [200, 500], minor: { label: 'f', per: 100 }, chips: 6 },
  SAR: { decimals: 2, notes: [500, 200, 100, 50, 10, 5, 1], coins: [2, 1, 0.5, 0.25], roundUp: [5, 10, 50, 100], fixed: [200, 500], minor: { label: 'h', per: 100 }, chips: 6 },
  KWD: { decimals: 3, notes: [20, 10, 5, 1, 0.5, 0.25], coins: [0.1, 0.05, 0.02, 0.01, 0.005], roundUp: [0.5, 1], fixed: [5, 10, 20], minor: { label: 'fils', per: 1000 }, chips: 6 },
  BHD: { decimals: 3, notes: [20, 10, 5, 1, 0.5], coins: [0.1, 0.05, 0.025, 0.01, 0.005], roundUp: [0.5, 1], fixed: [5, 10, 20], minor: { label: 'fils', per: 1000 }, chips: 6 },
  USD: { decimals: 2, notes: [100, 50, 20, 10, 5, 1], coins: [0.25, 0.1, 0.05, 0.01], roundUp: [1, 5, 10], fixed: [20, 50, 100], minor: { label: '¢', per: 100 }, chips: 6 }
}
const GENERIC: CurrencyRule = { decimals: 2, notes: [500, 200, 100, 50, 20, 10, 5, 1], coins: [0.5, 0.25, 0.1], roundUp: [1, 5, 10, 50, 100], fixed: [], chips: 6 }

/** Symbols people type in the receipt config, mapped to ISO codes (fallback when config `currency` is missing). */
const SYMBOLS: Record<string, string> = {
  'ر.ع.': 'OMR', 'ر.ع': 'OMR', 'ر.ق': 'QAR', 'ر.ق.': 'QAR', 'د.إ': 'AED', 'ر.س': 'SAR', 'د.ك': 'KWD', 'د.ب': 'BHD', '$': 'USD', 'QR': 'QAR', 'RO': 'OMR', 'OR': 'OMR'
}

let CODE = 'QAR'
let DECIMALS = 2

export function currencyCode() { return CODE }
export function getMoneyDecimals() { return DECIMALS }
export function rule(code = CODE): CurrencyRule { return TABLE[code] || { ...GENERIC, decimals: DECIMALS } }
export function defaultDecimals(code: string) { return (TABLE[code.toUpperCase()] || GENERIC).decimals }

/** Resolve the ISO code from config `currency`, else from the receipt symbol. */
export function resolveCode(configCurrency?: string | null, symbol?: string | null): string {
  const c = (configCurrency || '').trim().toUpperCase()
  if (c) return c
  const s = (symbol || '').trim()
  if (SYMBOLS[s]) return SYMBOLS[s]
  if (/^[A-Za-z]{3}$/.test(s)) return s.toUpperCase()
  return 'QAR'
}

/** Decimals: `currency_decimals` when it is a whole number 0-4 (0 and 3 included), else the currency's default. */
export function resolveDecimals(raw: string | null | undefined, code: string): number {
  if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
    const n = parseInt(String(raw), 10)
    if (Number.isFinite(n) && n >= 0 && n <= 4) return n
  }
  return defaultDecimals(code)
}

export function setCurrency(code: string, decimals: number) {
  CODE = (code || 'QAR').toUpperCase()
  DECIMALS = Number.isFinite(decimals) && decimals >= 0 && decimals <= 4 ? decimals : defaultDecimals(CODE)
}

/** Round to the currency's minor unit (half away from zero, immune to binary noise: 1.0045*1000 etc.). */
export function roundMoney(n: number | null | undefined, decimals = DECIMALS): number {
  const v = Number(n) || 0
  const f = Math.pow(10, decimals)
  const scaled = Number((Math.abs(v) * f).toPrecision(15))
  return (Math.sign(v) || 1) * Math.round(scaled) / f || 0
}

/** Quick-cash amounts for a bill: Exact first, then round-ups and common notes above the bill. */
export function quickCash(due: number, code = CODE): number[] {
  const r = rule(code)
  const out: number[] = [roundMoney(due)]
  const add = (v: number) => { v = roundMoney(v); if (v > out[0] && !out.includes(v)) out.push(v) }
  for (const step of r.roundUp) add(Math.ceil(roundMoney(due / step, 6)) * step)
  for (const f of r.fixed) add(f)
  return out.sort((a, b) => a - b).slice(0, r.chips)
}

/** Every note and coin for counting the drawer, largest first. */
export function denominations(code = CODE): number[] {
  const r = rule(code)
  return [...r.notes, ...r.coins]
}

/** Label for a denomination: whole units as is, fractions in the minor unit ("500 bz", "50d"). */
export function denomLabel(v: number, code = CODE): string {
  if (v >= 1) return String(v)
  const r = rule(code)
  if (r.minor) {
    const n = Math.round(v * r.minor.per)
    return r.minor.label.length <= 1 ? `${n}${r.minor.label}` : `${n} ${r.minor.label}`
  }
  return v.toFixed(r.decimals)
}

export function isCoin(v: number, code = CODE) {
  return rule(code).coins.includes(v)
}

/** Split a total into n shares in the currency's minor unit. Every share but the last is the total / n
 *  rounded down; the last takes the remainder, so the shares always add up to the total exactly
 *  (100.00 / 3 → 33.33, 33.33, 33.34; OMR 1.375 / 3 → 0.458, 0.458, 0.459). */
export function splitEvenly(total: number, n: number, decimals = DECIMALS): number[] {
  const f = Math.pow(10, decimals)
  const units = Math.round(roundMoney(total, decimals) * f)
  const base = Math.floor(units / n)
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? units - base * (n - 1) : base) / f)
}

/** Split a total in proportion to weights (e.g. each guest's items before discount and tax). Shares are
 *  rounded down to the minor unit and the last guest with any weight takes the remainder, so they sum
 *  to the total exactly. Discount and tax follow the items proportionally. */
export function splitByWeights(total: number, weights: number[], decimals = DECIMALS): number[] {
  const f = Math.pow(10, decimals)
  const units = Math.round(roundMoney(total, decimals) * f)
  const sum = weights.reduce((s, w) => s + w, 0)
  if (sum <= 0) return splitEvenly(total, weights.length, decimals)
  const last = weights.reduce((k, w, i) => (w > 0 ? i : k), 0)
  const out = weights.map((w) => Math.floor((units * w) / sum + 1e-9))
  out[last] = units - out.reduce((s, u, i) => (i === last ? s : s + u), 0)
  return out.map((u) => u / f)
}
