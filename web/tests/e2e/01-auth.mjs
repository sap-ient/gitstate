import { test, url, settle, assert } from '../runner.mjs'

// Login with valid creds reaches the app and renders the dashboard.
test('auth: login succeeds', async ({ page }) => {
  await page.goto(url('/login'), { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#email')
  // The login card renders.
  assert(await page.getByText('Welcome back').isVisible(), 'auth: login card "Welcome back" not visible')
  await page.fill('#email', process.env.EMAIL || 'demo@gitstate.dev')
  await page.fill('#password', process.env.PASSWORD || 'demo1234')
  await Promise.all([
    page.waitForURL((u) => !/\/login$/.test(new URL(u).pathname), { timeout: 60_000 }),
    page.click('button[type="submit"]'),
  ])
  await settle(page)
  // A token must now be stored, and the dashboard heading must render.
  const tok = await page.evaluate(() => localStorage.getItem('gs_access_token'))
  assert(!!tok, 'auth: no access token stored after login')
  await page.waitForSelector('h1', { timeout: 20_000 })
  const h1 = (await page.locator('h1').first().innerText()).trim()
  assert(/Dashboard/i.test(h1), `auth: expected Dashboard after login, got h1="${h1}"`)
})

// Bad credentials are rejected with an error and no token is stored.
test('auth: bad credentials rejected', async ({ page }) => {
  await page.goto(url('/login'), { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#email')
  await page.fill('#email', 'demo@gitstate.dev')
  await page.fill('#password', 'definitely-wrong-password')
  await page.click('button[type="submit"]')
  // Stay on /login and surface an inline error.
  await page.waitForTimeout(1500)
  assert(/\/login$/.test(new URL(page.url()).pathname), 'auth: bad creds navigated away from /login')
  const tok = await page.evaluate(() => localStorage.getItem('gs_access_token'))
  assert(!tok, 'auth: a token was stored despite bad credentials')
  // Error message box (red) should appear.
  const errVisible = await page
    .locator('text=/invalid|incorrect|wrong|unable|credential/i')
    .first()
    .isVisible()
    .catch(() => false)
  assert(errVisible, 'auth: no error message shown for bad credentials')
}, { themes: false })
