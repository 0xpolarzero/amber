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
  await expect(guide).toContainText('Workflow behind the question')
  await expect(
    page.locator(`#message-${preview.telegram.questions[0].id}`),
  ).toBeFocused()
  const trace = page.locator('details.extraction-workflow-trace')
  await expect(trace).toHaveAttribute('open', '')
  await expect(trace.getByText('From Telegram', { exact: true })).toBeVisible()
  await expect(page.getByText('Reply workflow', { exact: true })).toHaveCount(0)
  const iconPosition = () =>
    trace.evaluate((element) => {
      const traceBounds = element.getBoundingClientRect()
      return [...element.querySelectorAll(':scope > summary svg')].map(
        (icon) => {
          const bounds = icon.getBoundingClientRect()
          return { x: bounds.x - traceBounds.x, y: bounds.y - traceBounds.y }
        },
      )
    })
  const expandedPositions = await iconPosition()
  await trace.locator(':scope > summary').click()
  expect(await iconPosition()).toEqual(expandedPositions)
  await trace.locator(':scope > summary').click()
  expect(await iconPosition()).toEqual(expandedPositions)
  await expect(trace).toContainText('Shared Telegram work selected')
  await expect(trace).toContainText('Relevant context considered')
  await expect(trace).toContainText('Accurate post published')
  await expect(trace).toContainText('Unanswered fact asked')
  await expect(trace).toContainText('Carl · #105 · reply to #102')
  await expect(trace).toContainText('Does Noted understand Mandarin?')
  await expect(trace).toContainText('#101')
  const steps = trace.locator('details.workflow-trace-step')
  await expect(steps.nth(0)).not.toHaveAttribute('open', '')
  await steps.nth(0).locator(':scope > summary').click()
  await expect(steps.nth(0)).toHaveAttribute('open', '')
  await expect(steps.nth(1)).not.toHaveAttribute('open', '')
  await steps.nth(1).locator(':scope > summary').click()
  await expect(steps.nth(1)).toHaveAttribute('open', '')
  await expect(steps.nth(0)).toHaveAttribute('open', '')
  await expect(steps.nth(1)).toContainText(
    'Keep my posts short and factual. No hype.',
  )
  await expect(steps.nth(1)).toContainText('amber/searchMessages')
  await expect(steps.nth(1)).toContainText(
    'no fetch or search result is claimed here',
  )
  await steps.nth(2).locator(':scope > summary').click()
  await expect(steps.nth(2)).toContainText(
    preview.telegram.posts.find(
      ({ id }) => id === preview.telegram.questions[0].postId,
    )?.detail ?? '',
  )
  await steps.nth(3).locator(':scope > summary').click()
  await expect(steps.nth(3)).toContainText(preview.telegram.questions[0].text)
  const related = trace.locator('details.trace-related')
  await related.locator(':scope > summary').click()
  await expect(related).toContainText('Same batch: Tab tidy')
  await expect(related).toContainText('Bea · #103')
  const recording = trace.locator('.trace-recording')
  await expect(recording).toBeVisible()
  await expect(recording).toHaveText(
    `${preview.telegram.groupId} · ${preview.trace.recording.model}`,
  )
  await expect(page.locator('.request-intent')).toHaveCount(0)

  const next = guide.getByRole('button', { name: 'Next', exact: true })
  await next.click()
  await expect(guide).toContainText('2 of 6 · Recorded Gemini run')
  await expect(
    page
      .locator(`#message-${preview.telegram.questions[0].id}`)
      .locator('.chat-bubble'),
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
  await expect(page.locator('.reply-slot > .chat-bubble')).toHaveText(
    preview.messaging.assistant.text,
  )
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
  await expect(page.locator('.reply-slot > .chat-bubble')).toHaveText(
    preview.messaging.assistant.text,
  )
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
  await expect(page.locator('.reply-slot > .chat-bubble')).toBeInViewport({
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
  isMobile,
}) => {
  await page.goto('/agent')
  const selector = await scenarios(page)
  await selector.selectOption('stage-planning')
  const history = page.getByRole('log', { name: 'Conversation history' })
  const slot = history.getByRole('article', { name: 'Amber reply' })
  const trace = slot.locator('details.reply-workflow-trace')
  const traceToggle = trace.locator(':scope > summary')
  await traceToggle.click({ force: true })
  await expect(trace).toHaveAttribute('open', '')
  await traceToggle.focus()
  await page.keyboard.press('Enter')
  await expect(trace).toHaveAttribute('open', '')
  await expect(slot).toHaveCount(1)
  await expect(slot).not.toHaveClass(/unaddressed/)
  await expect(slot.getByText('Unanswered', { exact: true })).toHaveCount(0)
  await expect(trace.getByText('Reply workflow', { exact: true })).toBeVisible()
  await expect(
    page.locator('.conversation-footer .agent-progress'),
  ).toHaveCount(0)
  await expect
    .poll(() =>
      history.evaluate((element, inputId) => {
        const input = element.querySelector(`#${CSS.escape(inputId)}`)
        return input?.nextElementSibling?.getAttribute('aria-label')
      }, `message-${preview.messaging.input.turnId}:user`),
    )
    .toBe('Amber reply')
  await expect(slot.getByText('No additional queries')).toHaveCount(0)
  await expect(slot.getByText(preview.messaging.assistant.text)).toHaveCount(0)
  await expect(slot.getByRole('region', { name: /Changes to/ })).toHaveCount(0)
  await expect(slot.getByText('Existing preference retained')).toHaveCount(0)
  await expect(
    slot.getByText('The user directly confirmed that Noted supports Mandarin.'),
  ).toHaveCount(0)
  await page.screenshot({
    path: isMobile
      ? '/private/tmp/amber-reply-trace-planning-mobile.png'
      : '/private/tmp/amber-reply-trace-planning-desktop.png',
    fullPage: true,
  })

  const step = page.getByRole('button', { name: 'Step', exact: true })
  await step.click()
  const stages = trace.locator('details.workflow-trace-step')
  await stages.nth(0).locator(':scope > summary').click()
  await expect(stages.nth(0)).toContainText('No additional queries')
  await expect(stages.nth(0)).toContainText(
    'linked request already identified the relevant post',
  )
  await expect(slot.getByText('Linked post context')).toHaveCount(0)

  await step.click()
  await stages.nth(1).locator(':scope > summary').click()
  await expect(stages.nth(1)).toContainText('Linked post context')
  await expect(stages.nth(1)).toContainText(
    preview.messaging.diffs[0].before.title,
  )
  await expect(stages.nth(1)).toContainText(
    'Keep my posts short and factual. No hype.',
  )
  await expect(stages.nth(1)).toContainText(preview.telegram.questions[0].text)
  await expect(slot.getByText(preview.messaging.assistant.text)).toHaveCount(0)
  await page.screenshot({
    path: isMobile
      ? '/private/tmp/amber-reply-trace-retrieved-mobile.png'
      : '/private/tmp/amber-reply-trace-retrieved-desktop.png',
    fullPage: true,
  })

  await step.click()
  await stages.nth(2).locator(':scope > summary').click()
  await expect(stages.nth(2)).toContainText('Generated answer')
  await expect(stages.nth(2)).toContainText(preview.messaging.assistant.text)
  await expect(slot.locator(':scope > .chat-bubble')).toHaveCount(0)

  await step.click()
  await expect(slot.locator(':scope > .chat-bubble')).toBeVisible()
  await expect(traceToggle).not.toHaveAttribute('aria-disabled', 'true')
  await traceToggle.click()
  await expect(trace).not.toHaveAttribute('open', '')
  await traceToggle.click()
  await expect(slot.locator(':scope > .chat-bubble')).toHaveText(
    preview.messaging.assistant.text,
  )
  const applied = slot.getByRole('region', { name: 'Applied post changes' })
  await expect(applied).toBeVisible()
  await applied.getByText('Updated Noted', { exact: true }).click()
  await expect(
    slot.getByRole('region', { name: 'Changes to Noted' }),
  ).toBeVisible()
  await expect(
    history.getByRole('article', { name: 'Amber reply' }),
  ).toHaveCount(1)
  await expect(history.locator('details.reply-workflow-trace')).toHaveCount(1)
  await expect(
    page.getByText('Finishing after publication', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Send message' }),
  ).toBeDisabled()
  await expect(page.getByRole('button', { name: 'New message ↓' })).toHaveCount(
    0,
  )
  await expect(page.locator('.conversation-history')).toHaveCSS(
    'overflow-y',
    'auto',
  )
  await expect(
    page.getByRole('textbox', { name: 'Message Amber' }),
  ).toBeInViewport()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  for (let index = 0; index < 3; index++) {
    if ((await stages.nth(index).getAttribute('open')) !== null)
      await stages.nth(index).locator(':scope > summary').click()
  }
  await applied.getByText('Updated Noted', { exact: true }).click()
  await slot.evaluate((element) => element.scrollIntoView({ block: 'start' }))
  await page.screenshot({
    path: isMobile
      ? '/private/tmp/amber-reply-trace-mobile.png'
      : '/private/tmp/amber-reply-trace-desktop.png',
    fullPage: true,
  })

  await expect(slot.getByText('Existing preference retained')).toHaveCount(0)
  await step.click()
  await stages.nth(4).locator(':scope > summary').click()
  await expect(stages.nth(4)).toContainText(
    'Existing preference retained; no duplicate memory.',
  )
  await expect(stages.nth(4)).toContainText('No new memory saved')
  await expect(stages.nth(4)).toContainText(
    'Keep my posts short and factual. No hype.',
  )
  await expect(
    slot.getByText('The user directly confirmed that Noted supports Mandarin.'),
  ).toHaveCount(0)
  await expect(page.getByText('Answered', { exact: true })).toHaveCount(0)

  await step.click()
  await trace.locator(':scope > summary').click()
  await stages.nth(5).locator(':scope > summary').click()
  await expect(stages.nth(5)).toContainText(
    'The user directly confirmed that Noted supports Mandarin.',
  )
  await expect(page.getByText('Answered', { exact: true })).toBeVisible()
  await expect(slot.locator(':scope > .chat-bubble')).toHaveCount(1)
  await expect(
    slot.getByRole('region', { name: 'Applied post changes' }),
  ).toHaveCount(1)
  await expect(
    page.getByText('You can keep drafting. Sending unlocks'),
  ).toHaveCount(0)
  await expect(
    page.getByText('Recorded model output. Progress and failure states'),
  ).toHaveCount(0)

  await selector.selectOption('failure-before-publication')
  const foregroundFailure = page.getByRole('article', { name: 'Amber reply' })
  await expect(foregroundFailure).toContainText(
    'Simulated failure. Nothing was published.',
  )
  await expect(foregroundFailure.locator(':scope > .chat-bubble')).toHaveCount(
    0,
  )
  await expect(
    foregroundFailure.getByRole('region', { name: /Changes to/ }),
  ).toHaveCount(0)

  await selector.selectOption('failure-addressing')
  const failedSlot = page.getByRole('article', { name: 'Amber reply' })
  await expect(failedSlot.locator(':scope > .chat-bubble')).toHaveCount(1)
  await page.getByRole('button', { name: 'Retry request resolution' }).click()
  await expect(failedSlot.locator(':scope > .chat-bubble')).toHaveText(
    preview.messaging.assistant.text,
  )
  await step.click()
  await expect(page.getByText('Answered', { exact: true })).toBeVisible()
  await expect(page.getByRole('article', { name: 'Amber reply' })).toHaveCount(
    1,
  )
  await expect(failedSlot.locator(':scope > .chat-bubble')).toHaveCount(1)
  await expect(
    page.getByRole('button', { name: 'Retry request resolution' }),
  ).toHaveCount(0)
})

test('renders nonempty query entries and results from explicit test-only trace data', async ({
  page,
}) => {
  const testTrace = {
    ...preview.messaging.trace,
    planner: {
      ...preview.messaging.trace.planner,
      queries: [
        { resource: 'posts', terms: ['TEST ONLY', 'Noted'], limit: 2 },
        {
          resource: 'user_messages',
          terms: ['TEST ONLY', 'Mandarin'],
          limit: 3,
        },
        {
          resource: 'assistant_messages',
          terms: ['TEST ONLY', 'question'],
          limit: 4,
        },
      ],
    },
    context: {
      ...preview.messaging.trace.context,
      posts: [
        ...preview.messaging.trace.context.posts,
        {
          ...preview.messaging.trace.context.posts[0],
          id: 'test-only-post-result',
          title: 'TEST ONLY post result',
        },
      ],
      userMessages: [
        {
          id: 'test-only-user-result',
          text: 'TEST ONLY user message result',
          linkedPostId: null,
        },
      ],
      assistantMessages: [
        {
          id: 'test-only-amber-result',
          text: 'TEST ONLY Amber message result',
          linkedPostId: null,
        },
      ],
    },
  }
  await page.addInitScript((trace) => {
    ;(
      window as typeof window & { __amberTestReplyTrace?: unknown }
    ).__amberTestReplyTrace = trace
  }, testTrace)
  await page.goto('/agent')
  const selector = await scenarios(page)
  await selector.selectOption('stage-planning')
  const step = page.getByRole('button', { name: 'Step', exact: true })
  await step.click()
  const trace = page.locator('details.reply-workflow-trace')
  const stages = trace.locator('details.workflow-trace-step')
  await stages.nth(0).locator(':scope > summary').click()
  await expect(stages.nth(0)).toContainText('Database: Posts')
  await expect(stages.nth(0)).toContainText('Terms: TEST ONLY, Noted')
  await expect(stages.nth(0)).toContainText('Return up to 2 results')
  await expect(stages.nth(0)).toContainText('Database: Your messages')
  await expect(stages.nth(0)).toContainText('Database: Amber messages')

  await step.click()
  await stages.nth(1).locator(':scope > summary').click()
  await expect(stages.nth(1)).toContainText('TEST ONLY post result')
  await expect(stages.nth(1)).toContainText('TEST ONLY user message result')
  await expect(stages.nth(1)).toContainText('TEST ONLY Amber message result')
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
  const selected = page.locator('.chat-message[aria-current="true"]')
  await expect(selected).toHaveCount(1)
  await expect(selected).toHaveAttribute('id', 'message-e2e-pending-one')
  await page
    .getByRole('textbox', { name: 'Message Amber', exact: true })
    .focus()
  await expect(selected).toHaveCSS('border-left-color', 'rgb(138, 98, 28)')
  await expect(selected).toHaveCSS('outline-style', 'none')
  await expect(
    pendingPanel.getByRole('button', { name: 'Previous pending message' }),
  ).toBeDisabled()

  const next = pendingPanel.getByRole('button', {
    name: 'Next pending message',
  })
  await next.click()
  await expect(pendingPanel).toContainText('2 of 3')
  await expect(page.locator('#message-e2e-pending-two')).toBeFocused()
  await expect(selected).toHaveCount(1)
  await expect(selected).toHaveAttribute('id', 'message-e2e-pending-two')
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
  await expect(selected).toHaveCount(0)
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

test('keeps the auto-revealed trace, guide and composer usable on desktop and mobile', async ({
  page,
  isMobile,
}) => {
  await page.goto('/agent')
  const guide = guideFor(page)
  await guide.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.locator('details.workflow-trace')).toHaveAttribute(
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
      ? '/private/tmp/amber-question-trace-mobile.png'
      : '/private/tmp/amber-question-trace-desktop.png',
    fullPage: true,
  })
})

test('confirms memory deletion inline and dismisses it without deleting', async ({
  page,
}) => {
  await page.goto('/agent')
  await selectPreviewAccount(page, 'author')
  await page.getByRole('button', { name: 'Open memory (1 saved)' }).click()
  const memory = page.getByRole('region', { name: 'Memory' })
  const remove = memory.getByRole('button', { name: /^Delete memory:/ })
  const approve = memory.getByRole('button', {
    name: /^Confirm delete memory:/,
  })
  const edit = memory.getByRole('button', { name: /^Edit memory:/ })
  await remove.click()
  await expect(edit).toHaveCount(0)
  await expect(approve).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(approve).toHaveCount(0)
  await expect(remove).toBeFocused()
  await remove.click()
  await memory.getByRole('searchbox', { name: 'Search memory' }).click()
  await expect(approve).toHaveCount(0)
  await remove.click()
  await memory.getByRole('button', { name: 'Cancel deletion' }).click()
  await expect(edit).toBeVisible()
  await remove.click()
  await approve.click()
  await expect(memory).toContainText('No saved preferences yet.')
  await expect(remove).toHaveCount(0)
})
