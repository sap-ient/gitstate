import { test, gotoApp, pageHeading, settle, assert, assertVisible, api, apiPatch } from '../runner.mjs'

/**
 * Drag a card from one dnd-kit column to another using real pointer events.
 * dnd-kit's PointerSensor needs an 8px activation move + several intermediate
 * steps before the drop, so we move in small increments.
 */
async function dragCardToColumn(page, cardLocator, targetColumnLocator) {
  const card = await cardLocator.boundingBox()
  const target = await targetColumnLocator.boundingBox()
  assert(card, 'board: source card has no bounding box')
  assert(target, 'board: target column has no bounding box')

  const startX = card.x + card.width / 2
  const startY = card.y + card.height / 2
  const endX = target.x + target.width / 2
  const endY = target.y + Math.min(80, target.height / 2)

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  // Cross the 8px activation threshold first.
  await page.mouse.move(startX + 12, startY + 4, { steps: 3 })
  // Then glide to the target in steps so dragOver fires over the column.
  const steps = 12
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      startX + ((endX - startX) * i) / steps,
      startY + ((endY - startY) * i) / steps,
      { steps: 2 },
    )
  }
  await page.mouse.move(endX, endY, { steps: 3 })
  await page.waitForTimeout(120)
  await page.mouse.up()
}

// Columns render, and dragging a card to another column persists via the API.
test('board: columns render + drag persists', async ({ page }) => {
  await gotoApp(page, '/board', { waitFor: 'h1' })

  // Page heading (board page titles the work view "Work").
  const h1 = await pageHeading(page)
  assert(/Work/i.test(h1), `board: h1 expected "Work", got "${h1}"`)

  // All four kanban columns render. Column headers are uppercase spans with
  // tracking-widest; scope to those to avoid matching the (hidden) state-filter
  // <option> elements that share the same label text.
  for (const label of ['Open', 'In Progress', 'Done', 'Closed']) {
    const header = page.locator('span.uppercase.tracking-widest', { hasText: label })
    await assertVisible(header.first(), `board: column "${label}"`)
  }

  // Pick a known clean "open" native issue from the API (no derivedState/override),
  // so the move is observable and reversible.
  const issues = await api('/api/issues')
  const list = Array.isArray(issues) ? issues : issues.issues || []
  const candidate = list.find(
    (i) =>
      i.manualStateOverride == null &&
      i.derivedState == null &&
      i.state === 'open' &&
      i.source === 'native' &&
      typeof i.title === 'string',
  )
  assert(candidate, 'board: no clean open native issue found to drag')

  // Find that card on the board by its title text.
  const card = page.locator('div').filter({ hasText: candidate.title }).last()
  await assertVisible(card, `board: card "${candidate.title}" on board`)

  // The "In Progress" column wrapper (w-[276px] flex column that contains the
  // uppercase header span). We drop onto its card-list area.
  const inProgressCol = page
    .locator('div.flex.flex-col')
    .filter({ has: page.locator('span.uppercase.tracking-widest', { hasText: 'In Progress' }) })
    .first()

  await dragCardToColumn(page, card, inProgressCol)
  await settle(page, { extra: 500 })

  // Verify persistence via the API (authoritative; avoids UI re-group flakiness).
  let moved = false
  for (let attempt = 0; attempt < 6; attempt++) {
    const after = await api('/api/issues')
    const afterList = Array.isArray(after) ? after : after.issues || []
    const found = afterList.find((i) => i.id === candidate.id)
    const eff = found?.manualStateOverride ?? found?.derivedState ?? found?.state
    if (eff === 'in_progress') {
      moved = true
      break
    }
    await page.waitForTimeout(400)
  }

  // Restore original state regardless of assertion outcome.
  try {
    await apiPatch(`/api/issues/${candidate.id}`, { state: 'open' })
  } catch {
    /* best-effort restore */
  }

  assert(moved, `board: card "${candidate.title}" did not persist to in_progress after drag`)
})
