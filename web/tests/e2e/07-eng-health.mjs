import { test, gotoApp, pageHeading, assert, assertVisible } from '../runner.mjs'

// Engineering Health: DORA cards render (change-failure, lead time, deploy freq).
test('eng-health: DORA cards render', async ({ page }) => {
  await gotoApp(page, '/eng-health')

  const h1 = await pageHeading(page)
  assert(/Engineering Health/i.test(h1), `eng-health: h1 expected "Engineering Health", got "${h1}"`)

  // DORA section + the four headline cards.
  await assertVisible(page.getByText('Delivery (DORA)'), 'eng-health: "Delivery (DORA)" section')
  await assertVisible(page.getByText('Change failure rate'), 'eng-health: Change failure rate card')
  await assertVisible(page.getByText('Lead time p50'), 'eng-health: Lead time p50 card')
  await assertVisible(page.getByText('Deploy frequency'), 'eng-health: Deploy frequency card')

  // Change failure secondary evidence lines prove real (non-placeholder) data.
  await assertVisible(page.getByText(/merged PRs/), 'eng-health: "merged PRs" evidence line')

  // The "Change failure over time" chart renders.
  await assertVisible(
    page.getByRole('heading', { name: 'Change failure over time' }),
    'eng-health: change-failure-over-time chart heading',
  )
})
