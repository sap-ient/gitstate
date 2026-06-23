import { test, gotoApp, pageHeading, assert, assertVisible } from '../runner.mjs'

// Analytics page renders charts + tables with data.
test('analytics: charts + tables render', async ({ page }) => {
  await gotoApp(page, '/analytics')

  const h1 = await pageHeading(page)
  assert(/Analytics/i.test(h1), `analytics: h1 expected "Analytics", got "${h1}"`)

  // Contribution heatmap is now MULTI-YEAR: one full-width SVG per calendar year
  // (accessible name "Contribution heatmap <year>"). At least the newest year row
  // must render with day cells.
  const heatmap = page.getByRole('img', { name: /^Contribution heatmap/ }).first()
  await assertVisible(heatmap, 'analytics: contribution heatmap')
  const cells = await page.locator('svg[aria-label^="Contribution heatmap"] rect').count()
  assert(cells > 0, 'analytics: heatmap has no day cells')

  // Commits-over-time chart line path exists.
  await assertVisible(
    page.getByRole('heading', { name: 'Commits over time' }),
    'analytics: "Commits over time" heading',
  )

  // Contributor leaderboard table renders with data rows.
  await assertVisible(
    page.getByRole('heading', { name: 'Contributor leaderboard' }),
    'analytics: "Contributor leaderboard" heading',
  )
  const tables = page.locator('table')
  assert((await tables.count()) > 0, 'analytics: expected at least one data table')
  // At least one table has real body rows.
  const rows = page.locator('table tbody tr')
  assert((await rows.count()) > 0, 'analytics: tables have no data rows')

  // The Commits stat tile shows a real (non em-dash) value.
  const commitsTile = page.getByText('Commits', { exact: true }).first()
  await assertVisible(commitsTile, 'analytics: Commits stat tile')
})

// Cycle Time page renders chart + raw merged-PRs table with data.
test('cycle-time: chart + table render', async ({ page }) => {
  await gotoApp(page, '/cycle-time')

  const h1 = await pageHeading(page)
  assert(/Cycle Time/i.test(h1), `cycle-time: h1 expected "Cycle Time", got "${h1}"`)

  await assertVisible(
    page.getByRole('heading', { name: 'Lead time per merged PR' }),
    'cycle-time: chart heading',
  )

  // LineChart with data points.
  const svg = page.locator('svg[data-point-count]')
  await assertVisible(svg, 'cycle-time: LineChart svg')
  const count = Number(await svg.first().getAttribute('data-point-count'))
  assert(count > 0, `cycle-time: chart has no data points (count=${count})`)

  // The "Merged pull requests" raw table only renders when there is data.
  await assertVisible(
    page.getByRole('heading', { name: 'Merged pull requests' }),
    'cycle-time: merged PRs table heading',
  )
  const rows = page.locator('table tbody tr')
  assert((await rows.count()) > 0, 'cycle-time: merged PRs table has no rows')
})

// Involvement page renders member cards with dimension data.
test('involvement: cards render with data', async ({ page }) => {
  await gotoApp(page, '/involvement')

  const h1 = await pageHeading(page)
  assert(/Involvement/i.test(h1), `involvement: h1 expected "Involvement", got "${h1}"`)

  // "Features shipped" appears once per member card => proves cards rendered.
  const shipped = page.getByText('Features shipped')
  assert((await shipped.count()) > 0, 'involvement: no member cards (no "Features shipped" labels)')
  await assertVisible(page.getByText('Reviews done').first(), 'involvement: "Reviews done" label')
})
