import { expect, type Page, test } from '@playwright/test'

const scenarios = (page: Page) =>
  page.getByRole('combobox', { name: 'Agent scenario' })

test('shows the grounded private conversation, applied post changes and memory history', async ({
  page,
}) => {
  await page.goto('/agent')
  await page
    .getByRole('combobox', { name: 'Preview account' })
    .selectOption('author')
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
  await expect(
    page.getByText('Deferred · still open', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('I indexed the latest project messages.'),
  ).toBeVisible()
  await expect(page.getByText('Needs your reply', { exact: true })).toHaveCount(
    0,
  )
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
  await page
    .getByRole('combobox', { name: 'Preview account' })
    .selectOption('author')
  const selector = scenarios(page)
  await selector.selectOption('incoming')
  const next = page.getByRole('button', {
    name: 'Next pending request (4 open)',
  })
  await next.click()
  const first = await page.locator('.chat-message:focus').getAttribute('id')
  await next.click()
  const second = await page.locator('.chat-message:focus').getAttribute('id')
  expect(first).not.toBe(second)
  await expect(page.getByText('Needs your reply', { exact: true })).toHaveCount(
    3,
  )
  await expect(
    page.getByText('Deferred · still open', { exact: true }),
  ).toHaveCount(1)

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
  await scenarios(page).selectOption('stage-planning')
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
  const selector = scenarios(page)
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
  const selector = scenarios(page)
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

test('captures the finished design on desktop and mobile without overflow', async ({
  page,
  isMobile,
}) => {
  await page.goto('/agent')
  await page
    .getByRole('combobox', { name: 'Preview account' })
    .selectOption('author')
  await expect(
    page.getByRole('button', { name: 'Send message' }),
  ).toBeInViewport()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: isMobile
      ? '/private/tmp/amber-agent-ui-mobile.png'
      : '/private/tmp/amber-agent-ui-desktop.png',
    fullPage: true,
  })
})
