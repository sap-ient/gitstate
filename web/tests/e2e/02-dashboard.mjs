import { test, gotoApp, pageHeading, assert, assertVisible } from '../runner.mjs'

// Dashboard renders stat tiles and the cycle-time-trend chart with real data points.
test('dashboard: tiles + cycle-time chart render', async ({ page }) => {
  await gotoApp(page, '/dashboard')

  const h1 = await pageHeading(page)
  assert(/Dashboard/i.test(h1), `dashboard: h1 expected "Dashboard", got "${h1}"`)

  // State rollup tiles — the labels must be present.
  for (const label of ['Open', 'In progress', 'Done']) {
    await assertVisible(page.getByText(label, { exact: true }), `dashboard: stat tile "${label}"`)
  }

  // Cycle time trend section heading.
  await assertVisible(
    page.getByRole('heading', { name: 'Cycle time trend' }),
    'dashboard: "Cycle time trend" heading',
  )

  // The chart must have rendered with data points. LineChart exposes
  // data-point-count on its <svg>; the section also shows an "N data points" badge.
  const svg = page.locator('svg[data-point-count]')
  await assertVisible(svg, 'dashboard: cycle-time LineChart svg')
  const count = Number(await svg.first().getAttribute('data-point-count'))
  assert(count > 0, `dashboard: cycle-time chart has no data points (count=${count})`)

  // And the line path itself must have geometry (multiple points => contains "L").
  const d = await page.locator('svg[data-point-count] path[fill="none"]').first().getAttribute('d')
  assert(d && d.length > 5, 'dashboard: cycle-time line path has no geometry')
})
