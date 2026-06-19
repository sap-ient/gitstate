import { test, gotoPublic, settle, assert, assertVisible } from '../runner.mjs'

// Landing renders the hero headline and CTAs.
test('marketing: landing renders', async ({ page }) => {
  await gotoPublic(page, '/')
  await assertVisible(page.locator('h1'), 'marketing: landing h1')
  const h1 = (await page.locator('h1').first().innerText()).trim()
  assert(/nobody updates by hand/i.test(h1), `marketing: unexpected landing h1 "${h1}"`)
  await assertVisible(page.getByRole('link', { name: 'Start free' }).first(), 'marketing: "Start free" CTA')
})

// Pricing renders plan model + estimator.
test('marketing: pricing renders', async ({ page }) => {
  await gotoPublic(page, '/pricing')
  const h1 = (await page.locator('h1').first().innerText()).trim()
  assert(/pricing/i.test(h1), `marketing: pricing h1 "${h1}"`)
  await assertVisible(page.getByText('The builder / stakeholder model'), 'marketing: builder/stakeholder section')
  await assertVisible(page.getByText('Estimate your cost'), 'marketing: cost estimator section')
})

// Compare renders the cost calculator and produces a number.
test('marketing: compare calculator', async ({ page }) => {
  await gotoPublic(page, '/compare')
  const h1 = (await page.locator('h1').first().innerText()).trim()
  assert(/Pay for builders/i.test(h1), `marketing: compare h1 "${h1}"`)

  // Calculator inputs.
  const builders = page.getByLabel('Builders')
  await assertVisible(builders, 'marketing: Builders input')
  // Savings headline computed from the inputs.
  await assertVisible(
    page.getByText(/cheaper than/i),
    'marketing: "~N% cheaper than X" savings headline',
  )
  // Increasing builders should change the gitstate cost — assert it recomputes.
  const beforeText = await page.locator('body').innerText()
  await page.getByLabel('Increase Builders').click()
  await settle(page, { extra: 200 })
  const afterText = await page.locator('body').innerText()
  assert(beforeText !== afterText, 'marketing: compare calculator did not recompute on input change')
})

// Docs home renders.
test('marketing: docs home renders', async ({ page }) => {
  await gotoPublic(page, '/docs')
  await assertVisible(page.getByText('Documentation').first(), 'marketing: docs "Documentation" label')
})
