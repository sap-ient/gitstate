import { test, CONFIG, assert, assertVisible } from '../runner.mjs'

// Admin console (server-rendered Go UI on the API host): log in and assert the
// Analytics / Users / Orgs pages render real data.
// NOTE: the admin console keeps an SSE connection open, so we never wait for
// networkidle here — we wait on concrete elements instead.
test('admin: login + analytics/users/orgs render', async ({ page }) => {
  const admin = (p) => `${CONFIG.apiUrl}${p}`

  // Login form.
  await page.goto(admin('/admin/login'), { waitUntil: 'domcontentloaded' })
  await assertVisible(page.getByText('Restricted to platform super-admins.'), 'admin: login subtitle')
  await page.fill('#email', CONFIG.email)
  await page.fill('#password', CONFIG.password)
  await Promise.all([
    page.waitForURL((u) => /\/admin\/?$/.test(new URL(u).pathname), { timeout: 30_000 }),
    page.click('button[type="submit"]'),
  ])

  // Analytics page.
  await page.waitForSelector('text=Instance Analytics', { timeout: 20_000 })
  await assertVisible(page.getByText('Instance Analytics'), 'admin: "Instance Analytics" title')
  await assertVisible(page.getByText('Total Users'), 'admin: "Total Users" tile')
  await assertVisible(page.getByText('Organizations'), 'admin: "Organizations" tile')
  // The Total Users tile must show a numeric value (real data, not blank).
  const usersVal = await page
    .locator('.tile')
    .filter({ hasText: 'Total Users' })
    .locator('.tile-value')
    .first()
    .innerText()
    .catch(() => '')
  assert(/\d/.test(usersVal), `admin: Total Users tile has no numeric value ("${usersVal}")`)

  // Users page.
  await page.goto(admin('/admin/users'), { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.page-title', { timeout: 20_000 })
  await assertVisible(page.locator('.page-title', { hasText: 'Users' }), 'admin: Users page title')
  const userRows = await page.locator('#users-table tr, table tbody tr').count()
  assert(userRows > 0, 'admin: Users table has no rows')
  // The super-admin demo user should be present with a Super Admin badge.
  await assertVisible(page.getByText(CONFIG.email).first(), `admin: demo user "${CONFIG.email}" in users table`)

  // Organizations page.
  await page.goto(admin('/admin/orgs'), { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.page-title', { timeout: 20_000 })
  await assertVisible(page.locator('.page-title', { hasText: 'Organizations' }), 'admin: Orgs page title')
  const orgRows = await page.locator('table tbody tr').count()
  assert(orgRows > 0, 'admin: Organizations table has no rows')
}, { themes: false })
