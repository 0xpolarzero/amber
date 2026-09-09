import { expect, test } from '@playwright/test'
import preview from '../../src/preview/generated/amber-real-preview'

const controls = (page: import('@playwright/test').Page) =>
  page.getByRole('complementary', { name: 'Amber recorded replay' })

test('replays recorded output progressively and preserves publication boundaries', async ({
  page,
  isMobile,
}) => {
  await page.goto('/')
  const replay = controls(page)
  await expect(replay).toContainText(
    'Simulated timing · 0.5s per reveal · recorded Gemini output',
  )
  await expect(
    replay.getByRole('list', { name: 'Replay stages' }),
  ).toContainText('Plan queries')
  await expect(
    replay.getByRole('button', { name: /^Inspect stage/ }),
  ).toHaveCount(6)

  await replay.getByRole('button', { name: 'Restart', exact: true }).click()
  await expect(page).toHaveURL(/\/agent$/)
  await expect(page.getByText(preview.requests.before[0].text)).toBeVisible()
  await expect(page.getByText(preview.input.text)).toBeVisible()
  const history = page.getByRole('log', { name: 'Conversation history' })
  const slot = history.getByRole('article', { name: 'Amber reply' })
  const trace = slot.locator('details.reply-workflow-trace')
  const stages = trace.locator('details.workflow-trace-step')
  const composer = page.getByRole('textbox', { name: 'Message Amber' })
  const send = page.getByRole('button', { name: 'Send message' })
  await composer.fill('Draft stays local while the replay runs.')
  await expect(send).toBeDisabled()
  await expect(trace).toHaveAttribute('open', '')
  await expect(stages.nth(0)).toHaveAttribute('open', '')
  await expect(stages.nth(0)).toContainText('Loading recorded query plan')

  const play = replay.getByRole('button', { name: 'Play', exact: true })
  await play.click()
  await expect(stages.nth(0)).toContainText('Terms: Atlas')
  await replay.getByRole('button', { name: 'Pause', exact: true }).click()
  const pausedQueries = await stages.nth(0).locator('.trace-record').count()
  expect(pausedQueries).toBeGreaterThan(0)
  expect(pausedQueries).toBeLessThan(preview.trace.planner.queries.length + 1)
  await page.waitForTimeout(700)
  await expect(stages.nth(0).locator('.trace-record')).toHaveCount(
    pausedQueries,
  )

  await replay.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(stages.nth(1)).toHaveAttribute('open', '', { timeout: 5_000 })
  await expect(stages.nth(1)).toContainText('Noted · v3')
  await expect(stages.nth(1)).toContainText(
    'Offline voice transcription for macOS.',
  )
  await replay.getByRole('button', { name: 'Pause', exact: true }).click()
  await expect(slot.locator(':scope > .chat-bubble')).toHaveCount(0)

  await replay.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(stages.nth(2)).toHaveAttribute('open', '', { timeout: 6_000 })
  await expect(stages.nth(2)).toContainText('Atlas has been updated')
  await replay.getByRole('button', { name: 'Pause', exact: true }).click()
  await expect(stages.nth(2)).not.toContainText(preview.assistant.text, {
    timeout: 100,
  })
  await expect(slot.locator(':scope > .chat-bubble')).toHaveCount(0)
  await expect(
    slot.getByRole('region', { name: 'Applied post changes' }),
  ).toHaveCount(0)

  await replay.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(stages.nth(3)).toHaveAttribute('open', '', { timeout: 4_000 })
  await expect(stages.nth(3)).toContainText('Preparing one atomic publication')
  await expect(slot.locator(':scope > .chat-bubble')).toHaveCount(0)
  await expect(send).toBeDisabled()

  await expect(slot.locator(':scope > .chat-bubble')).toHaveText(
    preview.assistant.text,
    { timeout: 3_000 },
  )
  await replay.getByRole('button', { name: 'Pause', exact: true }).click()
  const applied = slot.getByRole('region', { name: 'Applied post changes' })
  await expect(applied).toBeVisible()
  await expect(applied.getByText(/^Updated /)).toHaveCount(3)
  await expect(replay).toContainText('Update memory + Resolve requests')
  await expect(stages.nth(4)).toHaveAttribute('open', '')
  await expect(stages.nth(5)).toHaveAttribute('open', '')
  await expect(send).toBeDisabled()
  await page.getByRole('button', { name: 'Open memory (1 saved)' }).click()
  await expect(page.getByRole('region', { name: 'Memory' })).toContainText(
    'Prefer detailed factual posts.',
  )

  await replay.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(stages.nth(4)).toContainText('Prefer concise posts.')
  await expect(stages.nth(5)).toContainText('No resolution recorded')
  await expect(stages.nth(5)).toContainText(preview.requests.after[0].text)
  await replay.getByRole('button', { name: 'Pause', exact: true }).click()
  await expect(send).toBeDisabled()

  await replay.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(replay).toContainText('Replay complete')
  await expect(page.getByRole('region', { name: 'Memory' })).toContainText(
    'Prefer concise posts.',
  )
  await expect(page.getByText('Unanswered', { exact: true })).toBeVisible()
  await expect(send).toBeEnabled()
  await expect(composer).toHaveValue('Draft stays local while the replay runs.')

  await replay.getByRole('button', { name: 'Restart', exact: true }).click()
  await expect(slot.locator(':scope > .chat-bubble')).toHaveCount(0)
  await expect(composer).toHaveValue('')
  await expect(stages.nth(0)).toHaveAttribute('open', '')
  await page.getByRole('button', { name: 'Open memory (1 saved)' }).click()
  await expect(page.getByRole('region', { name: 'Memory' })).toContainText(
    'Prefer detailed factual posts.',
  )
  await expect(
    page.getByText('Prefer concise posts.', { exact: true }),
  ).toHaveCount(0)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await expect(composer).toBeInViewport()
  await expect(replay).toBeInViewport()
  const sendBounds = await send.boundingBox()
  const replayBounds = await replay.boundingBox()
  expect(sendBounds).not.toBeNull()
  expect(replayBounds).not.toBeNull()
  if (sendBounds && replayBounds)
    expect(sendBounds.y + sendBounds.height).toBeLessThan(replayBounds.y)
  await page.screenshot({
    path: isMobile
      ? '/private/tmp/amber-recorded-replay-mobile.png'
      : '/private/tmp/amber-recorded-replay-desktop.png',
    fullPage: true,
  })
})

test('keeps active evidence open and completed stages inspectable', async ({
  page,
}) => {
  await page.goto('/agent')
  const replay = controls(page)
  await replay.getByRole('button', { name: 'Restart', exact: true }).click()
  await replay.getByRole('button', { name: 'Play', exact: true }).click()
  const trace = page.locator('details.reply-workflow-trace')
  const stages = trace.locator('details.workflow-trace-step')
  await expect(stages.nth(1)).toHaveAttribute('open', '', { timeout: 5_000 })
  await replay
    .getByRole('button', { name: 'Inspect stage 1: Plan queries' })
    .click()
  await expect(
    replay.getByRole('button', { name: 'Play', exact: true }),
  ).toBeVisible()
  await expect(trace).toHaveAttribute('open', '')
  await expect(stages.nth(0)).toHaveAttribute('open', '')
  await expect(stages.nth(0)).toContainText('Terms: Atlas')
  await expect(stages.nth(0)).toContainText('Terms: Aurora')
})

test('keeps failure controls secondary and preserves published output on retry', async ({
  page,
}) => {
  await page.goto('/agent')
  const replay = controls(page)
  await replay.getByText('More controls', { exact: true }).click()
  await replay.getByRole('button', { name: 'Background failure' }).click()
  const slot = page.getByRole('article', { name: 'Amber reply' })
  await expect(slot.locator(':scope > .chat-bubble')).toHaveText(
    preview.assistant.text,
  )
  await page.getByRole('button', { name: 'Retry request resolution' }).click()
  await expect(slot.locator(':scope > .chat-bubble')).toHaveCount(1)
  await expect(
    slot.getByRole('region', { name: 'Applied post changes' }),
  ).toHaveCount(1)
})
