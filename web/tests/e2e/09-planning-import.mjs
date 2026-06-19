import { test, gotoApp, pageHeading, settle, assert, assertVisible } from '../runner.mjs'

// Planning: capacity timeline + forecast render.
test('planning: timeline + forecast render', async ({ page }) => {
  await gotoApp(page, '/planning')

  const h1 = await pageHeading(page)
  assert(/Planning/i.test(h1), `planning: h1 expected "Planning…", got "${h1}"`)

  await assertVisible(
    page.getByText('Weekly capacity timeline'),
    'planning: "Weekly capacity timeline" section',
  )
  // Stat tiles for capacity/velocity/backlog/forecast.
  await assertVisible(page.getByText('Team capacity'), 'planning: "Team capacity" tile')
  await assertVisible(page.getByText(/Projected finish/i), 'planning: "Projected finish" tile')
  // The timeline renders an SVG.
  assert((await page.locator('svg').count()) > 0, 'planning: no SVG (timeline) rendered')
})

// Import: wizard loads, source picker renders.
test('import: wizard + source picker render', async ({ page }) => {
  await gotoApp(page, '/import')

  const h1 = await pageHeading(page)
  assert(/Import/i.test(h1), `import: h1 expected "Import issues", got "${h1}"`)

  // Stepper labels.
  await assertVisible(page.getByText('Source', { exact: true }).first(), 'import: "Source" step')

  // Source picker cards (Jira / Linear).
  await assertVisible(page.getByText('Jira', { exact: true }).first(), 'import: Jira source card')
  await assertVisible(page.getByText('Linear', { exact: true }).first(), 'import: Linear source card')

  // Selecting a source advances the wizard to the Connect step.
  await page.getByText('Jira', { exact: true }).first().click()
  await settle(page, { extra: 300 })
  await assertVisible(page.getByText(/Connect Jira/i), 'import: "Connect Jira" step after selecting Jira')
})
