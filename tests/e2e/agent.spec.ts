import { expect, test } from '@playwright/test'
import preview from '../../src/preview/generated/amber-real-preview'

const controls = (page: import('@playwright/test').Page) =>
  page.getByRole('complementary', { name: 'Amber recorded replay' })

test('replays recorded output progressively and preserves publication boundaries', async ({
  page,
  isMobile,
}) => {
  await page.goto('/agent')
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
  const history = page.getByRole('log', { name: 'Conversation history' })
  await expect(
    history.getByText(preview.requests.before[0].text, { exact: true }),
  ).toBeVisible()
  await expect(
    history.getByText(preview.input.text, { exact: true }),
  ).toBeVisible()
  const slot = history.getByRole('article', { name: 'Amber reply' })
  const trace = slot.locator('details.reply-workflow-trace')
  const stages = trace.locator('details.workflow-trace-step')
  const composer = page.getByRole('textbox', { name: 'Message Amber' })
  const send = page.getByRole('button', { name: 'Send message' })
  await composer.fill('Draft stays local while the replay runs.')
  await expect(send).toBeDisabled()
  await expect(trace).toHaveAttribute('open', '')
  await expect(stages.nth(0)).toHaveAttribute('open', '')
  await expect(stages.nth(0)).toContainText('Planning queries')

  const play = replay.getByRole('button', { name: 'Play', exact: true })
  await play.click()
  await expect(stages.nth(0)).toContainText('Orbit')
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
  await expect(stages.nth(1)).toContainText('Orbit')
  const retrievedPost = stages
    .nth(1)
    .locator('details.trace-post-preview')
    .filter({ hasText: 'Orbit' })
  await expect(retrievedPost).not.toHaveAttribute('open', '')
  await retrievedPost.locator('summary').click()
  await expect(retrievedPost).toHaveAttribute('open', '')
  await expect(stages.nth(1)).toContainText(
    'Version 0.4 adds patch export for titles and labels',
  )
  await replay.getByRole('button', { name: 'Pause', exact: true }).click()
  await expect(slot.locator(':scope > .chat-bubble')).toHaveCount(0)

  await replay.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(stages.nth(2)).toHaveAttribute('open', '', { timeout: 6_000 })
  await expect(stages.nth(2)).toContainText('Writing answer and changes')
  await replay.getByRole('button', { name: 'Pause', exact: true }).click()
  await expect(slot.locator(':scope > .chat-bubble')).not.toContainText(
    preview.assistant.text,
    {
      timeout: 100,
    },
  )
  await expect(slot.locator(':scope > .chat-bubble')).toHaveAttribute(
    'aria-busy',
    'true',
  )
  await expect(stages.nth(2)).not.toContainText(preview.assistant.text)
  await expect(
    slot.getByRole('region', { name: 'Applied post changes' }),
  ).toHaveCount(0)

  await replay.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(stages.nth(3)).toHaveAttribute('open', '', { timeout: 4_000 })
  await expect(stages.nth(3)).toContainText(
    'Answer and edits ready to publish together',
  )
  await expect(slot.locator(':scope > .chat-bubble')).toHaveAttribute(
    'aria-busy',
    'true',
  )
  await expect(send).toBeDisabled()

  await expect(slot.locator(':scope > .chat-bubble')).toHaveAttribute(
    'aria-busy',
    'false',
    { timeout: 3_000 },
  )
  await replay.getByRole('button', { name: 'Pause', exact: true }).click()
  const applied = slot.getByRole('region', { name: 'Applied post changes' })
  await slot.getByRole('button', { name: '1 post edited', exact: true }).click()
  await expect(stages.nth(3)).toHaveAttribute('open', '')
  await expect(applied).toBeVisible()
  await applied.locator('summary').filter({ hasText: 'Orbit' }).click()
  await expect(applied.locator('del').first()).toBeVisible()
  await expect(applied.locator('ins').first()).toBeVisible()
  await page.screenshot({
    path: isMobile
      ? '/private/tmp/amber-compact-diff-mobile.png'
      : '/private/tmp/amber-compact-diff-desktop.png',
  })
  await expect(applied.locator('summary')).toHaveCount(1)
  await expect(replay).toContainText('Update memory + Resolve requests')
  await expect(stages.nth(4)).toHaveAttribute('open', '')
  await expect(stages.nth(5)).toHaveAttribute('open', '')
  await expect(send).toBeDisabled()
  await page.getByRole('button', { name: 'Open memory (2 saved)' }).click()
  await expect(page.getByRole('region', { name: 'Memory' })).toContainText(
    'Prefer detailed explanations.',
  )

  await replay.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(stages.nth(4)).toContainText('Keep posts concise and factual.')
  await expect(stages.nth(5)).toContainText('No pending requests.')
  await replay.getByRole('button', { name: 'Pause', exact: true }).click()
  await expect(send).toBeDisabled()

  await replay.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(replay).toContainText('Replay complete')
  await expect(page.getByRole('region', { name: 'Memory' })).toContainText(
    'Keep posts concise and factual.',
  )
  await expect(page.getByText('Answered', { exact: true })).toBeVisible()
  await expect(send).toBeEnabled()
  await expect(composer).toHaveValue('Draft stays local while the replay runs.')
  await slot
    .getByRole('button', { name: '1 preference updated', exact: true })
    .click()
  await expect(stages.nth(4)).toHaveAttribute('open', '')
  await expect(stages.nth(4).locator('del')).toHaveText(
    'Prefer detailed explanations.',
  )
  await expect(stages.nth(4).locator('ins')).toHaveText(
    'Keep posts concise and factual.',
  )
  await expect(stages.nth(4).locator('ins')).toBeInViewport()
  await expect(slot.locator(':scope > .applied-changes')).toHaveCount(0)
  await expect(slot.locator(':scope > .memory-saved')).toHaveCount(0)
  await page.screenshot({
    path: isMobile
      ? '/private/tmp/amber-trace-diffs-mobile.png'
      : '/private/tmp/amber-trace-diffs-desktop.png',
  })

  await replay.getByRole('button', { name: 'Restart', exact: true }).click()
  await expect(slot.locator(':scope > .chat-bubble')).toHaveCount(0)
  await expect(composer).toHaveValue('')
  await expect(stages.nth(0)).toHaveAttribute('open', '')
  await page.getByRole('button', { name: 'Open memory (2 saved)' }).click()
  await expect(page.getByRole('region', { name: 'Memory' })).toContainText(
    'Prefer detailed explanations.',
  )
  await expect(
    page.getByText('Keep posts concise and factual.', { exact: true }),
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
  await expect(stages.nth(0)).toContainText('Orbit')
  await expect(stages.nth(0)).toContainText('0.4')
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
  await slot.getByRole('button', { name: '1 post edited', exact: true }).click()
  await expect(
    slot.getByRole('region', { name: 'Applied post changes' }),
  ).toHaveCount(1)
})

test('keeps the Telegram update on its own inspectable notification trace', async ({
  page,
  isMobile,
}) => {
  await page.goto('/agent')
  const replay = controls(page)
  await replay.getByText('More controls', { exact: true }).click()
  await replay
    .getByRole('combobox', { name: 'Preview account' })
    .selectOption('author')
  const completedNotification = page
    .locator('article')
    .filter({ has: page.locator('details.telegram-update-workflow-trace') })
  await expect(
    completedNotification.locator(':scope > .chat-bubble'),
  ).toHaveText('1 post edited · 1 question answered')
  await expect(
    completedNotification.locator('details.telegram-update-workflow-trace'),
  ).not.toHaveAttribute('open', '')
  await replay.getByText('More controls', { exact: true }).click()
  await replay.getByRole('button', { name: 'Restart', exact: true }).click()
  const question = page
    .locator('article')
    .filter({ has: page.locator('details.extraction-workflow-trace') })
  await expect(question).toBeVisible()
  const questionTrace = question.locator('details.extraction-workflow-trace')
  await questionTrace.locator(':scope > summary').click()
  await expect(questionTrace).toHaveAttribute('open', '')
  const questionStages = questionTrace.locator('details.workflow-trace-step')
  await expect(questionStages).toHaveCount(4)
  const questionCheck = questionStages.nth(0).locator('.trace-step-number svg')
  const updateCheck = page
    .locator('.telegram-update-workflow-trace .trace-step-number svg')
    .first()
  await expect(questionCheck).toHaveCSS('width', '13px')
  await expect(questionCheck).toHaveCSS('height', '13px')
  await expect(updateCheck).toHaveCSS('width', '13px')
  await expect(updateCheck).toHaveCSS('height', '13px')
  await questionStages.nth(0).locator('summary').first().click()
  await expect(questionStages.nth(0)).toContainText(
    'I built Orbit, a local-first issue tracker for small hardware teams.',
  )
  await expect(questionStages.nth(0)).toContainText(
    'Maya, which desktop operating systems does the tracker build support?',
  )
  await questionStages.nth(0).locator('summary').first().click()
  await questionStages.nth(2).locator('summary').first().click()
  const created = questionStages.nth(2).locator('details.post-update')
  await created.locator('summary').click()
  await expect(created.locator('ins')).toHaveCount(3)
  await expect(created.locator('del')).toHaveCount(0)
  await questionStages.nth(2).locator('summary').first().click()
  await questionStages.nth(3).locator('summary').click()
  await expect(questionStages.nth(3)).toContainText(
    'Maya, which desktop operating systems does the tracker build support?',
  )
  await questionStages.nth(3).locator('summary').click()
  await expect(questionTrace).not.toContainText('Apply Telegram update')
  await expect(questionTrace).not.toContainText('Close question')

  const notification = page
    .locator('article')
    .filter({ has: page.locator('details.telegram-update-workflow-trace') })
  await expect(notification.locator(':scope > .chat-bubble')).toHaveText(
    '1 post edited · 1 question answered',
  )
  await expect(notification.locator(':scope > .chat-bubble')).not.toContainText(
    'Sources:',
  )
  const updateTrace = notification.locator(
    'details.telegram-update-workflow-trace',
  )
  await expect(updateTrace).not.toHaveAttribute('open', '')
  await updateTrace.locator(':scope > summary').click()
  await expect(updateTrace).toHaveAttribute('open', '')
  const updateStages = updateTrace.locator('details.workflow-trace-step')
  await expect(updateStages).toHaveCount(4)
  await expect(updateStages.nth(0)).toContainText(
    '8 messages · existing Orbit post',
  )
  await updateStages.nth(0).locator(':scope > summary').click()
  await expect(updateStages.nth(0)).toContainText(
    'Patch export shipped in tracker version 0.4',
  )
  await expect(updateStages.nth(0)).toContainText(
    'The desktop build supports macOS 14 and Windows 11; Linux is untested.',
  )
  await expect(
    updateStages.nth(0).locator('details.trace-post-preview'),
  ).toContainText('Orbit')
  await updateStages.nth(1).locator(':scope > summary').click()
  await expect(updateStages.nth(1).locator('.trace-record')).toHaveCount(6)
  await expect(updateStages.nth(1)).toContainText(
    'The tracker never auto-syncs every repository.',
  )
  await updateStages.nth(2).locator(':scope > summary').click()
  const updated = updateStages.nth(2).locator('details.post-update')
  await updated.locator('summary').click()
  await expect(updated.locator('del')).toHaveCount(2)
  await expect(updated.locator('ins')).toHaveCount(2)
  await expect(updated).toContainText('Platform Support')
  await updateStages.nth(3).locator(':scope > summary').click()
  await expect(updateStages.nth(3)).toContainText('Question answered')
  await expect(updateStages.nth(3)).toContainText(
    'Maya confirmed desktop builds support macOS 14 and Windows 11, with Linux untested.',
  )
  await expect(updateTrace).toContainText(
    'makers-north · gemini-3.8-flash-medium',
  )
  await updateStages.nth(0).locator(':scope > summary').click()
  await updateStages.nth(1).locator(':scope > summary').click()
  await updated.locator('summary').click()
  await updateStages.nth(2).locator(':scope > summary').click()
  await updateStages.nth(3).scrollIntoViewIfNeeded()
  await page.screenshot({
    path: isMobile
      ? 'poc/amber-screenshots/telegram-update-trace-mobile.png'
      : 'poc/amber-screenshots/telegram-update-trace-desktop.png',
  })

  await replay.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(replay).toContainText('Replay complete', { timeout: 12_000 })
  await expect(updateTrace).toHaveAttribute('open', '')
  const reply = page.getByRole('article', { name: 'Amber reply' })
  await expect(reply.locator(':scope > .chat-bubble')).toContainText(
    'assignee changes',
  )
  await reply
    .getByRole('button', { name: '1 post edited', exact: true })
    .click()
  await expect(
    reply.getByRole('region', { name: 'Applied post changes' }),
  ).toBeVisible()
  const stageIds = await page
    .locator('[id*="-stage-"]')
    .evaluateAll((nodes) => nodes.map(({ id }) => id))
  expect(stageIds).toHaveLength(14)
  expect(new Set(stageIds).size).toBe(stageIds.length)
  await replay.getByRole('button', { name: 'Restart', exact: true }).click()
  await expect(page.locator('details.extraction-workflow-trace')).toHaveCount(1)
  await expect(
    page.locator('details.telegram-update-workflow-trace'),
  ).toHaveCount(1)
  await expect(
    page.locator('details.telegram-update-workflow-trace'),
  ).not.toHaveAttribute('open', '')
  await expect(replay).toContainText('Plan queries')
})
