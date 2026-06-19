import { test, gotoApp, pageHeading, settle, assert, assertVisible } from '../runner.mjs'

// Capacity (Leave) page: balances render, Approvals tab shows pending requests.
test('capacity: balances + approvals render', async ({ page }) => {
  await gotoApp(page, '/capacity')

  const h1 = await pageHeading(page)
  assert(/Leave & Capacity/i.test(h1), `capacity: h1 expected "Leave & Capacity", got "${h1}"`)

  // My leave tab (default): balances section.
  await assertVisible(page.getByText('Your balances'), 'capacity: "Your balances" section')

  // The leave-request form is collapsed behind a "Request leave" button. Opening
  // it should reveal the form controls (date inputs + a submit button).
  const requestBtn = page.getByRole('button', { name: 'Request leave' })
  await assertVisible(requestBtn, 'capacity: "Request leave" button')
  await requestBtn.click()
  await settle(page, { extra: 250 })
  await assertVisible(
    page.getByRole('button', { name: 'Submit request' }),
    'capacity: leave form "Submit request" after opening',
  )
  const dateInputs = await page.locator('input[type="date"]').count()
  assert(dateInputs >= 1, 'capacity: leave form has no date inputs after opening')
  // Collapse again so the rest of the page is in a clean state.
  await page.getByRole('button', { name: 'Cancel' }).click().catch(() => {})

  // Approvals tab (owner/admin) — switch and assert pending requests area.
  const approvals = page.getByRole('button', { name: /Approvals/ })
  if ((await approvals.count()) > 0) {
    await approvals.first().click()
    await settle(page, { extra: 300 })
    await assertVisible(
      page.getByText('Pending requests'),
      'capacity: "Pending requests" on Approvals tab',
    )
  } else {
    // Demo user is owner/admin in the seed, so Approvals should be present.
    throw new Error('capacity: Approvals tab not found (expected for owner/admin demo user)')
  }
})
