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
  await expect(
    page.getByText('Memory used and saved', { exact: true }),
  ).toBeVisible()
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
  await composer.fill('Local draft.')
  await page.getByRole('button', { name: 'Reset' }).click()
  await expect(composer).toHaveValue('')
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
