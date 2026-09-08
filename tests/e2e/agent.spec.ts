import { expect, type Page, test } from '@playwright/test'
import preview from '../../src/preview/generated/amber-real-preview'
import { openMoreControls, selectPreviewAccount } from './preview-controls'

const scenarios = async (page: Page) => {
  await openMoreControls(page)
  return page.getByRole('combobox', { name: 'Agent scenario' })
}

const guideFor = (page: Page) =>
  page.getByRole('complementary', { name: 'Amber guided preview' })

test('walks the recorded extraction and messaging guide without typing or waiting', async ({
  page,
}) => {
  await page.goto('/')
  const guide = guideFor(page)
  await guide.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page).toHaveURL(/\/agent$/)
  await expect(guide).toContainText(
    '1 of 6 · Recorded Gemini run · Fake Telegram',
  )
  await expect(guide).toContainText('Invented Telegram source')
  await expect(
    page.locator(`#message-${preview.telegram.questions[0].id}`),
  ).toBeFocused()
  const source = page.locator('details.telegram-source')
  await expect(source).toHaveAttribute('open', '')
  await expect(source).toContainText(preview.disclosure)
  await expect(source).toContainText('carl · #105 · reply to #102')
  await expect(source).toContainText('Does Noted understand Mandarin?')
  await expect(source).toContainText('bea · updated')
  await expect(source).toContainText('0 follow-up questions')
  await expect(source).toContainText('#101 ignored')
  await expect(page.locator('.request-intent')).toHaveCount(0)

  const next = guide.getByRole('button', { name: 'Next', exact: true })
  await next.click()
  await expect(guide).toContainText('2 of 6 · Recorded Gemini run')
  await expect(
    page.getByText(preview.telegram.questions[0].text, { exact: true }),
  ).toBeVisible()
  const recordedPost = preview.telegram.posts.find(
    ({ id }) => id === preview.telegram.questions[0].postId,
  )
  if (!recordedPost) throw new Error('Missing recorded post')
  await page.getByRole('link', { name: 'Noted', exact: true }).click()
  await expect(
    page.getByText(recordedPost.summary, { exact: true }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Message Amber', exact: true }).click()
  await expect(page.getByText('About Noted', { exact: true })).toBeVisible()

  await next.click()
  await expect(guide).toContainText('3 of 6 · Recorded Gemini run')
  await expect(
    page.getByText(preview.messaging.input.text, { exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('list', { name: 'Task progress' })).toContainText(
    'Plan queries: Running',
  )

  await next.click()
  await expect(guide).toContainText('4 of 6 · Recorded Gemini run')
  await expect(
    page.getByText(preview.messaging.assistant.text, { exact: true }),
  ).toBeVisible()
  await expect(page.getByText('Answered', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Changes to Noted' }),
  ).toBeVisible()
  await expect(page.getByRole('region', { name: 'Memory' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Memory' })).toContainText(
    'Keep my posts short and factual. No hype.',
  )
  await expect(page.getByText(/Atlas|Clipwise|Aurora/)).toHaveCount(0)

  await next.click()
  await expect(guide).toContainText('5 of 6 · Recorded Gemini run')
  await expect(guide).toContainText('Simulated background failure')
  await expect(
    page.getByText(preview.messaging.assistant.text, { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Retry request resolution' }),
  ).toBeVisible()
  await guide.getByText('Retry safeguards', { exact: true }).click()
  await guide.getByRole('button', { name: 'Retry limit' }).click()
  await expect(
    page.getByText(/Retry limit reached\. Your answer/),
  ).toBeVisible()
  await guide.getByRole('button', { name: 'Stale retry' }).click()
  await expect(page.getByText(/newer turn has started/)).toBeVisible()

  await next.click()
  await expect(guide).toContainText('6 of 6 · Recorded Gemini run')
  const tasks = page.getByRole('list', { name: 'Task progress' })
  await expect(tasks).toContainText('Update memory: Complete')
  await expect(tasks).toContainText('Resolve requests: Complete')
  await expect(page.getByText('Answered', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Retry request resolution' }),
  ).toHaveCount(0)

  await next.click()
  await expect(guide).toContainText('6 of 6 · Complete · Recorded Gemini run')
  await guide.getByRole('button', { name: 'Replay', exact: true }).click()
  await expect(guide).toContainText('1 of 6 · Recorded Gemini run')
})

test('uses the recorded projection as the default author conversation and linked post', async ({
  page,
}) => {
  await page.goto('/agent')
  await selectPreviewAccount(page, 'author')
  await expect(
    page.getByText(preview.messaging.assistant.text, { exact: true }),
  ).toBeInViewport({
    ratio: 1,
  })
  await expect(page.getByText('Answered', { exact: true })).toBeVisible()
  await expect(page.getByText('Unanswered', { exact: true })).toHaveCount(0)
  await page.getByText('Updated Noted', { exact: true }).click()
  const diff = page.getByRole('region', { name: 'Changes to Noted' })
  const changedSummary = await diff.locator('ins').first().innerText()
  await diff.getByRole('link', { name: 'View Noted post' }).click()
  await expect(page.getByText(changedSummary, { exact: true })).toBeVisible()
})

test('replays progress and request retry without changing the recorded output', async ({
  page,
}) => {
  await page.goto('/agent')
  const selector = await scenarios(page)
  await selector.selectOption('stage-planning')
  const step = page.getByRole('button', { name: 'Step', exact: true })
  for (let index = 0; index < 4; index++) await step.click()
  await expect(
    page.getByText(preview.messaging.assistant.text, { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Finishing in the background', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Send message' }),
  ).toBeDisabled()

  await selector.selectOption('failure-addressing')
  await page.getByRole('button', { name: 'Retry request resolution' }).click()
  await expect(
    page.getByText(preview.messaging.assistant.text, { exact: true }),
  ).toBeVisible()
  await step.click()
  await expect(page.getByText('Answered', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Retry request resolution' }),
  ).toHaveCount(0)
})

test('resets the labeled developer scenarios', async ({ page }) => {
  await page.goto('/agent')
  const selector = await scenarios(page)
  await expect(
    selector.getByRole('option', { name: /Simulation:/ }).first(),
  ).toBeAttached()
  await selector.selectOption('empty')
  await expect(
    page.getByRole('heading', { name: 'What would you like to work on?' }),
  ).toBeVisible()
  const composer = page.getByRole('textbox', { name: 'Message Amber' })
  await expect(
    page.getByRole('button', { name: 'No pending messages' }),
  ).toBeDisabled()
  await page.getByRole('button', { name: 'Open memory (0 saved)' }).click()
  await expect(page.getByRole('region', { name: 'Memory' })).toContainText(
    'No saved preferences yet.',
  )
  await composer.fill('Local draft.')
  await page.getByRole('button', { name: 'Reset' }).click()
  await expect(composer).toHaveValue('')
})

test('moves through multiple pending messages and keeps panels mutually exclusive', async ({
  page,
}) => {
  await page.addInitScript(() => {
    ;(
      window as typeof window & {
        __amberTestMessages: Array<{
          id: string
          sender: 'amber'
          text: string
          needsReply: boolean
        }>
      }
    ).__amberTestMessages = [
      {
        id: 'e2e-pending-one',
        sender: 'amber',
        text: 'First test-only pending message.',
        needsReply: true,
      },
      {
        id: 'e2e-pending-two',
        sender: 'amber',
        text: 'Second test-only pending message.',
        needsReply: true,
      },
      {
        id: 'e2e-pending-three',
        sender: 'amber',
        text: 'Third test-only pending message.',
        needsReply: true,
      },
    ]
  })
  await page.goto('/agent')
  await selectPreviewAccount(page, 'author')

  const pendingToggle = page.getByRole('button', {
    name: 'Open pending messages (3)',
  })
  await pendingToggle.click()
  const pendingPanel = page.getByRole('region', { name: 'Pending requests' })
  await expect(pendingPanel).toContainText('1 of 3')
  await expect(page.locator('#message-e2e-pending-one')).toBeFocused()
  await expect(
    pendingPanel.getByRole('button', { name: 'Previous pending message' }),
  ).toBeDisabled()

  const next = pendingPanel.getByRole('button', {
    name: 'Next pending message',
  })
  await next.click()
  await expect(pendingPanel).toContainText('2 of 3')
  await expect(page.locator('#message-e2e-pending-two')).toBeFocused()
  await next.click()
  await expect(pendingPanel).toContainText('3 of 3')
  await expect(page.locator('#message-e2e-pending-three')).toBeFocused()
  await expect(next).toBeDisabled()

  await pendingPanel
    .getByRole('button', { name: 'Previous pending message' })
    .click()
  await expect(pendingPanel).toContainText('2 of 3')
  await expect(page.locator('#message-e2e-pending-two')).toBeFocused()

  await page.getByRole('button', { name: 'Open memory (1 saved)' }).click()
  await expect(pendingPanel).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Memory' })).toBeVisible()
})

test('filters and collapses the inline memory panel', async ({ page }) => {
  await page.goto('/agent')
  await selectPreviewAccount(page, 'author')
  const memoryToggle = page.getByRole('button', {
    name: 'Open memory (1 saved)',
  })
  await memoryToggle.click()
  const memory = page.getByRole('region', { name: 'Memory' })
  const search = memory.getByRole('searchbox', { name: 'Search memory' })
  await expect(memory).toContainText(
    'Keep my posts short and factual. No hype.',
  )
  await search.fill('missing preference')
  await expect(memory).toContainText('No preferences match your search.')
  await expect(memory).not.toContainText(
    'Keep my posts short and factual. No hype.',
  )
  await search.fill('short and factual')
  await expect(memory).toContainText(
    'Keep my posts short and factual. No hype.',
  )

  const closeMemory = page.getByRole('button', {
    name: 'Close memory (1 saved)',
  })
  await expect(closeMemory).toHaveAttribute('aria-expanded', 'true')
  await closeMemory.click()
  await expect(page.getByRole('region', { name: 'Memory' })).toHaveCount(0)
  await expect(memoryToggle).toHaveAttribute('aria-expanded', 'false')
})

test('keeps the expanded memory panel above a usable composer on desktop and mobile', async ({
  page,
  isMobile,
}) => {
  await page.goto('/agent')
  await selectPreviewAccount(page, 'author')
  const moreControls = page.locator('.preview-more')
  await moreControls.getByText('More controls', { exact: true }).click()
  await expect(moreControls).not.toHaveAttribute('open', '')
  await page.getByRole('button', { name: 'Open memory (1 saved)' }).click()

  const memory = page.getByRole('region', { name: 'Memory' })
  const composer = page.locator('.reply-composer')
  const tools = page.locator('.composer-tools')
  const guide = guideFor(page)
  await expect(memory).toBeInViewport()
  await expect(composer).toBeInViewport()
  const [memoryBounds, composerBounds, toolsBounds, guideBounds] =
    await Promise.all([
      memory.boundingBox(),
      composer.boundingBox(),
      tools.boundingBox(),
      guide.boundingBox(),
    ])
  expect(
    (memoryBounds?.y ?? 0) + (memoryBounds?.height ?? 0),
  ).toBeLessThanOrEqual(composerBounds?.y ?? 0)
  expect(toolsBounds?.y ?? 0).toBeGreaterThanOrEqual(
    (composerBounds?.y ?? 0) + (composerBounds?.height ?? 0),
  )
  expect(memoryBounds?.height ?? 999).toBeLessThanOrEqual(isMobile ? 250 : 280)
  expect(
    (toolsBounds?.y ?? 0) + (toolsBounds?.height ?? 0),
  ).toBeLessThanOrEqual(guideBounds?.y ?? 0)
  await expect
    .poll(() =>
      page.locator('.conversation-history').evaluate((element) => {
        return getComputedStyle(element).overflowY
      }),
    )
    .toBe('auto')
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: isMobile
      ? '/private/tmp/amber-composer-mobile.png'
      : '/private/tmp/amber-composer-desktop.png',
    fullPage: true,
  })
})

test('keeps the auto-revealed source, guide and composer usable on desktop and mobile', async ({
  page,
  isMobile,
}) => {
  await page.goto('/agent')
  const guide = guideFor(page)
  await guide.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.locator('details.telegram-source')).toHaveAttribute(
    'open',
    '',
  )
  const next = guide.getByRole('button', { name: 'Next', exact: true })
  const composer = page.getByRole('textbox', { name: 'Message Amber' })
  await expect(next).toBeInViewport()
  await expect(composer).toBeInViewport()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  const composerBounds = await page.locator('.reply-composer').boundingBox()
  const guideBounds = await guide.boundingBox()
  expect(
    (composerBounds?.y ?? 0) + (composerBounds?.height ?? 0),
  ).toBeLessThanOrEqual(guideBounds?.y ?? 0)
  await page.screenshot({
    path: isMobile
      ? '/private/tmp/amber-real-preview-mobile.png'
      : '/private/tmp/amber-real-preview-desktop.png',
    fullPage: true,
  })
})
