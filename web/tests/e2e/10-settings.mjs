import { test, gotoApp, pageHeading, settle, assert, assertVisible } from '../runner.mjs'

// Settings: sections render (Calendars, Notifications, Webhooks) + digest preview.
test('settings: sections + digest preview render', async ({ page }) => {
  await gotoApp(page, '/settings')

  const h1 = await pageHeading(page)
  assert(/Settings/i.test(h1), `settings: h1 expected "Settings", got "${h1}"`)

  // Section headings.
  await assertVisible(
    page.getByRole('heading', { name: 'Calendars' }),
    'settings: "Calendars" section',
  )
  await assertVisible(
    page.getByRole('heading', { name: 'Notifications' }),
    'settings: "Notifications" section',
  )
  await assertVisible(
    page.getByRole('heading', { name: 'Webhooks & CI/CD' }),
    'settings: "Webhooks & CI/CD" section',
  )

  // Notifications digest preview renders with its three tabs.
  await assertVisible(page.getByText('Live digest preview'), 'settings: digest preview label')
  for (const tab of ['Weekly status', 'Stale PRs', "Who's OOO"]) {
    await assertVisible(
      page.getByRole('button', { name: tab }),
      `settings: digest preview tab "${tab}"`,
    )
  }
  // The preview should resolve to real content (not stuck on "Building preview…").
  await settle(page, { extra: 800 })
  const building = await page.getByText('Building preview…').count()
  assert(building === 0, 'settings: digest preview stuck on "Building preview…"')
})
