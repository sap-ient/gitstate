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
  assert(/builders|cheapest|compare/i.test(h1), `marketing: compare h1 "${h1}"`)

  // Slider calculator inputs (Builders is a range slider now).
  const builders = page.getByLabel('Builders').first()
  await assertVisible(builders, 'marketing: Builders slider')
  // Always-cheapest headline computed from the inputs.
  await assertVisible(
    page.getByText(/cheapest at every team size|less than the next-cheapest|cheapest/i).first(),
    'marketing: always-cheapest headline',
  )
  // Dragging the slider should recompute the costs — drive it with the keyboard.
  const beforeText = await page.locator('body').innerText()
  await builders.focus()
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight')
  await settle(page, { extra: 250 })
  const afterText = await page.locator('body').innerText()
  assert(beforeText !== afterText, 'marketing: slider calculator did not recompute on slider change')
})

// Docs home renders.
test('marketing: docs home renders', async ({ page }) => {
  await gotoPublic(page, '/docs')
  await assertVisible(page.getByText('Documentation').first(), 'marketing: docs "Documentation" label')
})
