import { expect, type Page, test } from '@playwright/test'
import { openMoreControls, selectPreviewAccount } from './preview-controls'

const scenarios = async (page: Page) => {
  await openMoreControls(page)
  return page.getByRole('combobox', { name: 'Agent scenario' })
}

test('walks the complete guided preview without typing or waiting', async ({
  page,
}) => {
  await page.goto('/')
  const guide = page.getByRole('complementary', {
    name: 'Amber guided preview',
  })
  await expect(
    page.getByRole('combobox', { name: 'Agent scenario' }),
  ).toBeHidden()
  await guide.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page).toHaveURL(/\/agent$/)
  await expect(guide).toContainText('1 of 10 · Guided fixture')
  await expect(guide).toContainText('New requests')
  await expect(page.locator('#message-request-license')).toBeFocused()
  await expect(page.locator('.request-intent')).toHaveCount(0)
  await expect(
    page.getByText('Does Atlas already support shared workspaces?', {
      exact: true,
    }),
  ).toBeVisible()

  const next = guide.getByRole('button', { name: 'Next', exact: true })
  await next.click()
  await expect(guide).toContainText('2 of 10 · Guided fixture')
  await expect(guide).toContainText('A turn starts')
  const tasks = page.getByRole('list', { name: 'Task progress' })
  await expect(tasks).toContainText('Plan queries: Running')
  const composer = page.getByRole('textbox', { name: 'Message Amber' })
  await expect(composer).toHaveValue(
    'I can draft the next message while this turn finishes.',
  )
  await expect(
    page.getByRole('button', { name: 'Send message' }),
  ).toBeDisabled()
  await composer.fill('A stale draft.')
  await guide.getByRole('button', { name: 'Back', exact: true }).click()
  await next.click()
  await expect(composer).toHaveValue(
    'I can draft the next message while this turn finishes.',
  )

  await next.click()
  await expect(guide).toContainText('3 of 10 · Guided fixture')
  await expect(page.getByText('Finishing in the background')).toBeVisible()
  await expect(
    page.getByText(
      'I updated Atlas to say it works offline and kept the wording concise.',
    ),
  ).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Changes to Atlas' }),
  ).toBeVisible()
  await expect(tasks.locator('[data-status="running"]')).toHaveText([
    'Update memory: Running',
    'Resolve requests: Running',
  ])

  await next.click()
  await expect(guide).toContainText('4 of 10 · Guided fixture')
  await expect(page.getByText('Ignored', { exact: true })).toBeVisible()
  await expect(
    page.getByText('Answered', { exact: true }).first(),
  ).toBeVisible()
  await expect(page.getByText('Deferred', { exact: true })).toBeVisible()
  await expect(
    page.getByText('Created Clipwise', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Changes to Clipwise' }),
  ).toBeVisible()

  await next.click()
  await expect(guide).toContainText('5 of 10 · Guided fixture')
  await expect(page.getByText('3 posts changed', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Changes to Atlas' }),
  ).toBeVisible()
  const memoryHistory = page.getByRole('list', { name: 'Memory history' })
  await expect(memoryHistory).toContainText('Preference created')
  await expect(memoryHistory).toContainText('Preference replaced')
  await expect(memoryHistory).toContainText('Preference deleted')
  await expect(page.getByText('Earlier message', { exact: true })).toBeVisible()
  await expect(
    page.getByText('Aurora should remain invite-only.', { exact: true }),
  ).toBeVisible()

  await next.click()
  await expect(guide).toContainText('6 of 10 · Guided fixture')
  await expect(page.getByText('Clipwise · details needed')).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Applied post changes' }),
  ).toHaveCount(0)

  await next.click()
  await expect(guide).toContainText('7 of 10 · Guided fixture')
  await expect(page.getByText('1 post created', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Changes to Clipwise' }),
  ).toBeVisible()

  await next.click()
  await expect(guide).toContainText('8 of 10 · Guided fixture')
  await expect(page.getByText(/Nothing was published/)).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Applied post changes' }),
  ).toHaveCount(0)

  await next.click()
  await expect(guide).toContainText('9 of 10 · Guided fixture')
  await expect(
    page.getByRole('button', { name: 'Retry memory save' }),
  ).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Changes to Atlas' }),
  ).toBeVisible()
  await guide.getByText('Retry safeguards', { exact: true }).click()
  await guide.getByRole('button', { name: 'Retry limit' }).click()
  await expect(
    page.getByText(/Retry limit reached\. Your answer/),
  ).toBeVisible()
  await guide.getByRole('button', { name: 'Stale retry' }).click()
  await expect(page.getByText(/newer turn has started/)).toBeVisible()

  await next.click()
  await expect(guide).toContainText('10 of 10 · Guided fixture')
  await expect(tasks).toContainText('Update memory: Complete')
  await expect(tasks).toContainText('Resolve requests: Complete')
  await expect(
    page.getByRole('button', { name: /Preference replaced/ }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Retry memory save' }),
  ).toHaveCount(0)

  await next.click()
  await expect(guide).toContainText('10 of 10 · Complete')
  await expect(
    guide.getByRole('button', { name: 'Replay', exact: true }),
  ).toBeVisible()
  await guide.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(guide).toContainText('10 of 10 · Guided fixture')
  await next.click()
  await guide.getByRole('button', { name: 'Replay', exact: true }).click()
  await expect(guide).toContainText('1 of 10 · Guided fixture')
  await expect(page.locator('#message-request-license')).toBeFocused()
})

test('shows the grounded private conversation, applied post changes and memory history', async ({
  page,
}) => {
  await page.goto('/agent')
  await selectPreviewAccount(page, 'author')
  await expect(page.getByRole('heading', { name: 'Amber' })).toBeVisible()
  await expect(
    page.getByText('One private conversation across your posts.'),
  ).toBeVisible()
  await expect(
    page.getByText(
      'Atlas now states that it works offline. Noted emphasizes on-device transcription and marks PDF export as planned. Aurora is invite-only. I’ll keep posts concise.',
      { exact: true },
    ),
  ).toBeInViewport({ ratio: 1 })
  await expect(page.getByRole('log')).toContainText(
    'Noted now reflects Mandarin support',
  )
  await expect(page.getByRole('log')).toContainText(
    'Atlas now states that it works offline',
  )
  await expect(page.getByText('Ignored', { exact: true })).toBeVisible()
  await expect(page.getByText('Deferred', { exact: true })).toBeVisible()
  await expect(
    page.getByText('I indexed the latest project messages.'),
  ).toBeVisible()
  await expect(page.getByText('Unanswered', { exact: true })).toHaveCount(0)
  await expect(page.getByText('1 pending', { exact: true })).toBeVisible()
  await expect(page.getByText('you', { exact: true })).toHaveCount(0)

  const atlasDiff = page.getByRole('region', { name: 'Changes to Atlas' })
  await page.getByText('Updated Atlas', { exact: true }).click()
  await expect(atlasDiff).toBeVisible()
  const changedSummary = await atlasDiff.locator('ins').first().innerText()
  await atlasDiff.getByRole('link', { name: 'View Atlas post' }).click()
  await expect(page.getByText(changedSummary, { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Message Amber', exact: true }).click()
  await expect(page.getByText('About Atlas', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Memory 1', exact: true }).click()
  const memory = page.getByRole('dialog', { name: 'Memory', exact: true })
  await expect(
    memory.getByText('Prefer concise posts.', { exact: true }),
  ).toBeVisible()
  await memory.getByText('Recent memory changes').click()
  await expect(
    memory.getByText('Only mention macOS releases.', { exact: true }),
  ).toBeVisible()
  await expect(memory.getByText('Deleted', { exact: true })).toBeVisible()
})

test('switches and resets stable scenarios and cycles through every pending request', async ({
  page,
}) => {
  await page.goto('/agent')
  await selectPreviewAccount(page, 'author')
  const selector = await scenarios(page)
  await selector.selectOption('incoming')
  const next = page.getByRole('button', {
    name: 'Next pending request (4 open)',
  })
  await next.click()
  const first = await page.locator('.chat-message:focus').getAttribute('id')
  await next.click()
  const second = await page.locator('.chat-message:focus').getAttribute('id')
  expect(first).not.toBe(second)
  await expect(page.getByText('Unanswered', { exact: true })).toHaveCount(3)
  await expect(page.getByText('Deferred', { exact: true })).toHaveCount(1)

  const composer = page.getByRole('textbox', { name: 'Message Amber' })
  await composer.fill('A draft that belongs to this fixture.')
  await page.getByRole('button', { name: 'Reset' }).click()
  await expect(composer).toHaveValue('')
  await expect(page.getByText('4 pending', { exact: true })).toBeVisible()
  await selector.selectOption('empty')
  await expect(
    page.getByRole('heading', { name: 'What would you like to work on?' }),
  ).toBeVisible()
  await expect(page.getByRole('log').locator('.chat-message')).toHaveCount(0)
})

test('manual progress publishes the response before both background jobs finish and keeps sending locked', async ({
  page,
}) => {
  await page.goto('/agent')
  await (await scenarios(page)).selectOption('stage-planning')
  const composer = page.getByRole('textbox', { name: 'Message Amber' })
  const send = page.getByRole('button', { name: 'Send message' })
  await composer.fill('Keep this draft while the current turn finishes.')
  await expect(send).toBeDisabled()
  const step = page.getByRole('button', { name: 'Step', exact: true })
  for (let index = 0; index < 4; index++) await step.click()
  await expect(
    page.getByText('Finishing in the background', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText(
      'I updated Atlas to say it works offline and kept the wording concise.',
    ),
  ).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Changes to Atlas' }),
  ).toBeVisible()
  const tasks = page.getByRole('list', { name: 'Task progress' })
  await expect(tasks.locator('[data-status="running"]')).toHaveText([
    'Update memory: Running',
    'Resolve requests: Running',
  ])
  await expect(send).toBeDisabled()
  await step.click()
  await expect(
    page.getByRole('button', { name: /Preference replaced/ }),
  ).toBeVisible()
  await expect(send).toBeDisabled()
  await step.click()
  await expect(page.getByText('Complete', { exact: true }).last()).toBeVisible()
  await expect(send).toBeEnabled()
  await expect(composer).toHaveValue(
    'Keep this draft while the current turn finishes.',
  )
})

test('background retry preserves the answer and diffs while stale and exhausted retries stay disabled', async ({
  page,
}) => {
  await page.goto('/agent')
  const selector = await scenarios(page)
  await selector.selectOption('failure-memory')
  const answer = page.getByText(
    'I updated Atlas to say it works offline and kept the wording concise.',
  )
  await expect(answer).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Changes to Atlas' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Retry memory save' }).click()
  await expect(
    page.getByText('Finishing in the background', { exact: true }),
  ).toBeVisible()
  await expect(answer).toBeVisible()
  await page.getByRole('button', { name: 'Step', exact: true }).click()
  await expect(
    page.getByRole('button', { name: /Preference replaced/ }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Retry memory save' }),
  ).toHaveCount(0)

  await selector.selectOption('retry-exhausted')
  await expect(
    page.getByText(
      /Retry limit reached\. Your answer and post changes remain saved/,
    ),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: /Retry memory/ })).toHaveCount(
    0,
  )
  await selector.selectOption('retry-stale')
  await expect(page.getByText(/newer turn has started/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Retry memory/ })).toHaveCount(
    0,
  )
})

test('candidate clarification does not publish, while candidate publication creates a linked post', async ({
  page,
}) => {
  await page.goto('/agent')
  const selector = await scenarios(page)
  await selector.selectOption('candidate-clarify')
  await expect(
    page.getByText('Clipwise · details needed', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Applied post changes' }),
  ).toHaveCount(0)
  await selector.selectOption('candidate-publish')
  await expect(page.getByText('1 post created', { exact: true })).toBeVisible()
  const change = page.getByRole('region', { name: 'Changes to Clipwise' })
  await expect(change).toBeVisible()
  await change.getByRole('link', { name: 'View Clipwise post' }).click()
  await expect(
    page.getByText('A clipboard organizer.', { exact: true }),
  ).toBeVisible()
})

test('keeps the guide above the composer on desktop and mobile', async ({
  page,
  isMobile,
}) => {
  await page.goto('/agent')
  const guide = page.getByRole('complementary', {
    name: 'Amber guided preview',
  })
  await guide.getByRole('button', { name: 'Start', exact: true }).click()
  const next = guide.getByRole('button', { name: 'Next', exact: true })
  for (let index = 0; index < 4; index++) await next.click()
  await expect(
    page.getByRole('button', { name: 'Send message' }),
  ).toBeInViewport()
  await expect(next).toBeInViewport()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  const composer = await page.locator('.reply-composer').boundingBox()
  const guideBounds = await guide.boundingBox()
  expect((composer?.y ?? 0) + (composer?.height ?? 0)).toBeLessThanOrEqual(
    guideBounds?.y ?? 0,
  )
  await page.screenshot({
    path: isMobile
      ? '/private/tmp/amber-guide-mobile.png'
      : '/private/tmp/amber-guide-desktop.png',
    fullPage: true,
  })
})
