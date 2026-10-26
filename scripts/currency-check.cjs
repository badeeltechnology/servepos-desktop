/* Unit-style check for src/renderer/src/ui/currency.ts (decimals, rounding, quick cash, drawer).
 *   node scripts/currency-check.cjs
 * Compiles the module with esbuild (already installed with Vite) and asserts the rules. */
const path = require('path')
const { buildSync } = require('esbuild')
const out = buildSync({ entryPoints: [path.join(__dirname, '../src/renderer/src/ui/currency.ts')], bundle: true, write: false, format: 'cjs', platform: 'node' })
const m = {}
new Function('module', 'exports', out.outputFiles[0].text)(m, (m.exports = {}))
const c = m.exports
let fails = 0
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fails++
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`)
}

// decimals resolution
eq('QAR default 2', c.resolveDecimals(undefined, 'QAR'), 2)
eq('OMR default 3 when currency_decimals unset', c.resolveDecimals('', 'OMR'), 3)
eq('KWD/BHD default 3', [c.resolveDecimals(null, 'KWD'), c.resolveDecimals(null, 'BHD')], [3, 3])
eq('currency_decimals 0 accepted', c.resolveDecimals('0', 'QAR'), 0)
eq('currency_decimals 3 accepted', c.resolveDecimals('3', 'QAR'), 3)
eq('code from symbol', [c.resolveCode('', 'ر.ع.'), c.resolveCode(null, 'OMR'), c.resolveCode('omr', 'QAR')], ['OMR', 'OMR', 'OMR'])

// OMR, 3 decimals
c.setCurrency('OMR', 3)
eq('1.375 stays 1.375 (not 1.38)', c.roundMoney(1.375), 1.375)
eq('VAT 5% of 3.475 = 0.174', c.roundMoney(3.475 * 0.05), 0.174)
eq('binary noise: 1.0045 -> 1.005 at 3dp', c.roundMoney(1.0045), 1.005)
eq('split 1.000 card + 0.375 cash = 1.375', c.roundMoney(1 + 0.375), 1.375)
eq('change for 2.000 on 1.375 = 0.625', c.roundMoney(2 - 1.375), 0.625)
eq('OMR quick cash for 1.375', c.quickCash(1.375), [1.375, 1.5, 2, 5, 10, 20])
eq('OMR quick cash for 3.649', c.quickCash(3.649), [3.649, 4, 5, 10, 20])
eq('OMR drawer', c.denominations(), [50, 20, 10, 5, 1, 0.5, 0.1, 0.05, 0.025, 0.01, 0.005])
eq('OMR labels', [0.5, 0.1, 0.025, 0.005, 20].map((v) => c.denomLabel(v)), ['500 bz', '100 bz', '25 bz', '5 bz', '20'])
const count = { 10: 1, 0.1: 2, 0.025: 3, 0.005: 1 }
eq('close-shift count with baisa coins = 10.280', c.roundMoney(c.denominations().reduce((s, d) => s + (count[d] || 0) * d, 0)), 10.28)

// QAR, 2 decimals: same as before
c.setCurrency('QAR', 2)
// split bill
eq('QAR 100.00 evenly 3 ways = 33.33 + 33.33 + 33.34', c.splitEvenly(100, 3), [33.33, 33.33, 33.34])
eq('QAR 100 evenly sums exactly', c.roundMoney(c.splitEvenly(100, 7).reduce((s, x) => s + x, 0)), 100)
eq('OMR 1.375 evenly 3 ways = 0.458 + 0.458 + 0.459', c.splitEvenly(1.375, 3, 3), [0.458, 0.458, 0.459])
eq('by item 50/30 of 88.00 (after discount/tax) = 55.00 + 33.00', c.splitByWeights(88, [50, 30]), [55, 33])
eq('by item with an empty guest', c.splitByWeights(10, [1, 2, 0]), [3.33, 6.67, 0])
eq('by item sums exactly', c.roundMoney(c.splitByWeights(123.45, [3, 5, 7]).reduce((s, x) => s + x, 0)), 123.45)
const oldQuick = (due) => { const out = [due]; for (const step of [10, 50, 100, 500, 1000]) { const v = Math.ceil(due / step) * step; if (v > due && !out.includes(v)) out.push(v) } return out.slice(0, 4) }
for (const due of [132.8, 408, 46, 22, 999.99, 1000]) eq(`QAR quick cash unchanged for ${due}`, c.quickCash(due), oldQuick(due))
eq('QAR rounding 2dp', [c.roundMoney(24.225), c.roundMoney(1.005), c.roundMoney(0.1 + 0.2)], [24.23, 1.01, 0.3])
eq('QAR drawer unchanged', c.denominations(), [500, 200, 100, 50, 10, 5, 1, 0.5])
eq('QAR 50 dirham label', c.denomLabel(0.5), '50d')

console.log(fails ? `\n${fails} failed` : '\nall currency checks passed')
process.exit(fails ? 1 : 0)
