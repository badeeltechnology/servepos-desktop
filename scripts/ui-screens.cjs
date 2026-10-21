/* Dev-only UI check: screenshots every screen and clicks through the main flows against the
 * browser harness (mock window.api). Start the harness first:
 *   npx vite --config vite.renderer.dev.config.ts
 * then:
 *   node scripts/ui-screens.cjs [outDir]
 * Env: BASE (default http://127.0.0.1:5199/), PLAYWRIGHT (module path), SIZES ("1024,1366").
 * Exits non-zero if a flow fails or the page logs an error. */
const path = require('path')
let playwright
try { playwright = require(process.env.PLAYWRIGHT || 'playwright') } catch { playwright = require('/opt/npm-tools/node_modules/playwright') }
const { chromium } = playwright

const BASE = process.env.BASE || 'http://127.0.0.1:5199/'
const OUT = path.resolve(process.argv[2] || 'out/pos_screens')
const SIZES = (process.env.SIZES || '1024,1366').split(',').map(Number)
const errors = []
const failures = []
const shots = []

async function newPage(browser, width, query = '?wo=none') {
  const page = await browser.newPage({ viewport: { width, height: 768 } })
  page.setDefaultTimeout(6000)
  page.on('pageerror', (e) => errors.push(`[${width}] pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${width}] console: ${m.text()}`) })
  await page.goto(BASE + query)
  await page.waitForTimeout(700)
  return page
}
async function shot(page, name) {
  const w = page.viewportSize().width
  const file = path.join(OUT, `${name}-${w}.png`)
  await page.waitForTimeout(250)
  await page.screenshot({ path: file })
  shots.push(path.basename(file))
}
async function pin(page, digits) {
  for (const d of digits) await page.getByRole('button', { name: d, exact: true }).first().click()
  await page.waitForTimeout(600)
}
async function step(name, fn) {
  try { await fn(); console.log('  ok  ', name) } catch (e) { failures.push(`${name}: ${e.message.split('\n')[0]}`); console.log('  FAIL', name, '-', e.message.split('\n')[0]) }
}
const btn = (page, name, exact = false) => page.getByRole('button', { name, exact }).first()

async function run(browser, W) {
  console.log(`\n== ${W}×768`)
  let page = await newPage(browser, W)

  await step('login screen', async () => { await shot(page, 'login') })
  await step('PIN sign-in (6 digits, auto-verify)', async () => {
    await pin(page, '111111')
    await page.getByText('Nothing on the ticket').waitFor({ timeout: 4000 })
    await shot(page, 'till-empty')
  })
  await step('category + tap to add, merge qty', async () => {
    await btn(page, /^Coffee/).click()
    await btn(page, /Cold Brew/).click()
    await btn(page, /Cold Brew/).click()
    await btn(page, /Croissant/, true).click().catch(() => {})
    await page.getByRole('button', { name: /^Croissant$/ }).first().click()
    await btn(page, /Croissant Zaatar/).click()
    await page.getByText('Send 3').waitFor({ timeout: 3000 })
  })
  await step('modifiers: required group, qty, add', async () => {
    await btn(page, /^Coffee/).click()
    await btn(page, /Hot Latte/).click()
    await page.getByRole('dialog').waitFor()
    await btn(page, /^Oat/).click()
    await btn(page, /^Vanilla/).click()
    await btn(page, 'One more').click()
    await shot(page, 'modifiers')
    await page.getByRole('dialog').getByRole('button', { name: /^Add 2/ }).click()
    await page.getByText('Send 5').waitFor({ timeout: 3000 })
    await shot(page, 'till-new-lines')
  })
  await step('variants chooser', async () => {
    await page.getByRole('button', { name: /^Soft drinks/ }).first().click()
    await btn(page, /^Soft Drinks/).click()
    await page.getByRole('dialog').waitFor()
    await shot(page, 'variants')
    await page.getByRole('dialog').getByRole('button', { name: /Sprite/ }).click()
    await page.getByText('Send 6').waitFor({ timeout: 3000 })
  })
  await step('search with the on-screen keyboard', async () => {
    await page.getByLabel('Search the menu').click()
    for (const k of 'moj') await page.getByLabel('Keyboard').getByRole('button', { name: k, exact: true }).click()
    await shot(page, 'keyboard-search')
    await page.getByLabel('Keyboard').getByRole('button', { name: 'Done' }).click()
    await page.getByLabel('Clear search').click()
  })
  await step('AR names toggle', async () => {
    await page.getByRole('radio', { name: 'AR' }).click()
    await page.getByRole('radio', { name: 'Both' }).click()
    await shot(page, 'menu-both')
    await page.getByRole('radio', { name: 'AR' }).click()
    await shot(page, 'menu-arabic')
    await page.getByRole('radio', { name: 'EN' }).click()
  })
  await step('order details sheet + table picker', async () => {
    await page.getByLabel('More actions').click()
    await shot(page, 'order-sheet')
    await btn(page, /Choose a table/).click()
    await page.getByRole('dialog', { name: 'Choose a table' }).waitFor()
    await shot(page, 'table-picker')
    await page.getByRole('button', { name: /^T11/ }).click()
    const sheet = page.getByRole('dialog', { name: 'Order details' })
    await sheet.getByRole('button', { name: /Ahmed/ }).click()
    await sheet.getByRole('button', { name: 'Done', exact: true }).click()
  })
  await step('discount / promo / voucher sheet', async () => {
    await btn(page, 'Add discount').click()
    await shot(page, 'offers')
    await page.getByRole('button', { name: 'Promo', exact: true }).click()
    await btn(page, /Happy hour/).click()
    await page.getByText(/Promo · Happy hour/).waitFor({ timeout: 3000 })
  })
  await step('line tray on a new line', async () => {
    await page.getByLabel('Current order').getByRole('button', { name: /Cold Brew/ }).click()
    await shot(page, 'line-tray-new')
    await btn(page, 'One more', true).click()
  })
  await step('Send prints KOT and splits Sent / New', async () => {
    await btn(page, /^Send \d/).click()
    await page.getByText(/^Sent/).first().waitFor({ timeout: 4000 })
    await shot(page, 'till-sent')
  })
  await step('add after KOT asks first', async () => {
    await btn(page, /^Coffee/).click()
    await btn(page, /Cold Brew/).click()
    await page.getByText('Add to a sent order?').waitFor({ timeout: 3000 })
    await shot(page, 'confirm-after-kot')
    await btn(page, 'Add item').click()
  })
  await step('void a sent line with supervisor PIN', async () => {
    await page.getByLabel('Current order').getByRole('button', { name: /Croissant Zaatar/ }).first().click()
    await shot(page, 'line-tray-sent')
    await btn(page, 'Void', true).click()
    await page.getByRole('dialog').waitFor()
    await btn(page, 'Wrong item entered').click()
    await btn(page, 'No, return the stock').click()
    await shot(page, 'void')
    const dlg = page.getByRole('dialog')
    for (const d of '222222') await dlg.getByRole('button', { name: d, exact: true }).click()
    await page.getByText('Approved by Joseph').waitFor({ timeout: 3000 })
    await dlg.getByRole('button', { name: /^Void 1/ }).click()
    await page.getByText(/Voided 1 × Croissant Zaatar/).waitFor({ timeout: 3000 })
  })
  await step('pay cash with change', async () => {
    await btn(page, /^Pay/).click()
    await page.getByRole('dialog', { name: 'Payment' }).waitFor()
    await shot(page, 'payment')
    await page.getByRole('button', { name: /^Received/ }).last().click()
    await shot(page, 'payment-change')
    await btn(page, /Finish sale/).click()
    await page.getByText('Tap for the next order').waitFor({ timeout: 5000 })
    await shot(page, 'payment-done')
    await btn(page, /Done/).click()
    await page.getByText('Nothing on the ticket').waitFor({ timeout: 3000 })
  })
  await step('split payment', async () => {
    await btn(page, /^Coffee/).click()
    await btn(page, /Cappuccino/).click()
    await page.getByRole('dialog').getByRole('button', { name: /^Add 1/ }).click()
    await btn(page, /^Pay/).click()
    await btn(page, 'Split', true).click()
    await btn(page, /Add another method/).click()
    await shot(page, 'payment-split')
    await btn(page, /Back/).click()
  })
  await step('resume order from rail, hold it', async () => {
    await btn(page, /^All open/).click()
    await page.getByRole('main').getByRole('button', { name: /^T12/ }).click()
    await page.getByText('Discard this ticket?').waitFor({ timeout: 3000 })
    await shot(page, 'confirm-discard')
    await btn(page, 'Discard', true).click()
    await page.getByText(/^Sent/).first().waitFor({ timeout: 4000 })
    await shot(page, 'till-resumed')
    await btn(page, 'Hold', true).click()
    await page.getByText(/On hold: T12/).waitFor({ timeout: 4000 })
  })
  await step('all open orders board', async () => {
    await btn(page, /^All open/).click()
    await page.getByText('Open orders', { exact: true }).waitFor()
    await shot(page, 'open-orders')
    await btn(page, /^Back/).click()
  })
  await step('sales today / history + detail', async () => {
    await btn(page, /^Mariam/).click()
    await page.getByRole('menuitem', { name: 'Sales today' }).click()
    await page.getByText('waiting to sync').waitFor({ timeout: 4000 })
    await shot(page, 'history')
    await page.getByRole('button', { name: /NC-T02-0140/ }).first().click().catch(async () => { await page.locator('[role=button]').nth(3).click() })
    await page.waitForTimeout(400)
    await shot(page, 'history-detail')
    await page.keyboard.press('Escape')
    await btn(page, /^Back/).click()
  })
  await step('close shift (blind count)', async () => {
    await btn(page, /^Mariam/).click()
    await page.getByRole('menuitem', { name: 'Close shift' }).click()
    await page.getByText('Count the cash in the drawer').waitFor()
    for (let i = 0; i < 3; i++) await page.getByLabel('One more 500').click()
    await shot(page, 'close-shift')
    await btn(page, /Finished counting/).click()
    await shot(page, 'close-shift-compare')
    await btn(page, /^Back/).click()
  })
  await page.close()

  // Waiter-app orders, manual accept
  page = await newPage(browser, W, '?wo=now&autoaccept=0')
  await step('waiter orders drawer opens with new orders (manual accept)', async () => {
    await pin(page, '111111')
    await page.getByRole('dialog', { name: 'Waiter app orders' }).waitFor({ timeout: 8000 })
    await shot(page, 'waiter-orders')
    await page.getByRole('button', { name: /Accept and send/ }).first().click()
    await page.getByText(/accepted/).waitFor({ timeout: 5000 })
    await btn(page, /Back to the till/).click()
  })
  await page.close()

  // Waiter-app orders, auto-accept (default)
  page = await newPage(browser, W, '?wo=now')
  await step('waiter orders auto-accept after 5 s', async () => {
    await pin(page, '111111')
    await page.getByRole('dialog', { name: 'Waiter app orders' }).waitFor({ timeout: 8000 })
    await page.getByText(/automatically in/).first().waitFor({ timeout: 3000 })
    await shot(page, 'waiter-orders-auto')
    await page.getByText('Nothing waiting').waitFor({ timeout: 15000 })
  })
  await page.close()

  // Open shift
  page = await newPage(browser, W, '?wo=none&shift=closed')
  await step('open shift with denominations', async () => {
    await pin(page, '111111')
    await page.getByText('Count the float in the drawer').waitFor()
    await page.getByLabel('One more 500').click()
    await page.getByLabel('One more 200').click()
    await page.getByLabel('One more 100').click()
    await page.getByLabel('One more 100').click()
    await shot(page, 'open-shift')
    await btn(page, /^Open shift/).click()
    await page.getByText('Nothing on the ticket').waitFor({ timeout: 4000 })
  })
  await page.close()

  // Supervisor: settings + kitchen view
  page = await newPage(browser, W)
  await step('supervisor settings', async () => {
    await pin(page, '222222')
    await btn(page, /^Joseph/).click()
    await page.getByRole('menuitem', { name: 'Settings' }).click()
    await page.waitForTimeout(600)
    await shot(page, 'supervisor-settings')
    await btn(page, /Back to POS/).click()
  })
  await step('kitchen view from the till', async () => {
    await btn(page, /^Joseph/).click()
    await page.getByRole('menuitem', { name: 'Kitchen view' }).click()
    await page.waitForTimeout(800)
    await shot(page, 'coordinator-from-till')
  })
  await page.close()

  // Coordinator role
  page = await newPage(browser, W)
  await step('coordinator sign-in', async () => {
    await pin(page, '444444')
    await page.waitForTimeout(900)
    await shot(page, 'coordinator')
  })
  await page.close()

  // Admin
  page = await newPage(browser, W)
  await step('admin login + panel', async () => {
    await btn(page, 'Supervisor tools').click()
    await shot(page, 'admin-login')
    await page.getByLabel('Username').fill('admin')
    await page.getByLabel('Password').fill('admin')
    await page.getByRole('dialog').getByRole('button', { name: 'Sign in' }).click()
    await page.waitForTimeout(800)
    await shot(page, 'admin')
  })
  await page.close()

  // First-run setup
  page = await newPage(browser, W, '?setup=1')
  await step('setup', async () => { await page.waitForTimeout(500); await shot(page, 'setup') })
  await page.close()
}

;(async () => {
  require('fs').mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch()
  for (const w of SIZES) await run(browser, w)
  await browser.close()
  console.log(`\n${shots.length} screenshots in ${OUT}`)
  const real = errors.filter((e) => !/favicon|cached-image/.test(e))
  if (real.length) { console.log('\nConsole errors:'); real.forEach((e) => console.log('  ' + e)) }
  if (failures.length) { console.log('\nFailures:'); failures.forEach((f) => console.log('  ' + f)) }
  process.exit(failures.length || real.length ? 1 : 0)
})()
