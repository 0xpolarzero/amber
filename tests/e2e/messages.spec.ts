import { expect, test } from '@playwright/test'

test('shows the applied AI update and its diff, with a normal message composer', async ({
  page,
}) => {
  await page.goto('/messages')
  await page
    .getByRole('combobox', { name: 'Preview account' })
    .selectOption('author')
  await page.getByRole('link', { name: /Amber About Noted/ }).click()
  await expect(page).toHaveURL(/\/messages\/voice-notes$/)
  const history = page.getByRole('log', { name: 'Conversation history' })
  await expect(
    history.getByText(
      'Yes! There’s a free Mac demo for the group. It works with English and Mandarin.',
      { exact: true },
    ),
  ).toBeVisible()
  await expect(
    history.getByText(
      'I’ve added the demo availability and supported languages to your post.',
      { exact: true },
    ),
  ).toBeVisible()
  const diff = page.getByRole('region', { name: 'Changes to summary' })
  await expect(diff.locator('del')).toContainText('A small app')
  await expect(diff.locator('ins')).toContainText('free demo for the group')
  const updatedSummary = await diff.locator('ins').innerText()
  await expect(page.getByRole('button', { name: /Review|Accept/ })).toHaveCount(
    0,
  )
  await expect(page.getByText('Review before updating your post.')).toHaveCount(
    0,
  )
  await diff.getByRole('link', { name: 'View post' }).click()
  await expect(page.getByText(updatedSummary, { exact: true })).toBeVisible()
  await page.goBack()
  await expect(diff).toBeVisible()
  await expect(
    page.getByRole('textbox', { name: 'Message Amber' }),
  ).toBeEnabled()
})

test('retains drafts and sends repeat messages without a review step', async ({
  page,
}) => {
  await page.goto('/messages/voice-notes')
  await page
    .getByRole('combobox', { name: 'Preview account' })
    .selectOption('author')
  const reply = page.getByRole('textbox', { name: 'Message Amber' })
  const send = page.getByRole('button', { name: 'Send message' })
  await expect(send).toBeDisabled()
  await reply.fill('Thanks for updating it.')
  await reply.press('Shift+Enter')
  await reply.pressSequentially('I’ll share more soon.')
  const message = 'Thanks for updating it.\nI’ll share more soon.'
  await expect(reply).toHaveValue(message)
  await page.getByRole('link', { name: 'Back to messages' }).click()
  await expect(page.getByText('Draft', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: /Amber About Noted/ }).click()
  await expect(reply).toHaveValue(message)
  await reply.press('Enter')
  await expect(
    page.getByRole('log').getByText(message, { exact: true }),
  ).toBeVisible()
  await expect(reply).toHaveValue('')
  await expect(reply).toBeFocused()
  await expect(send).toBeDisabled()
  await reply.fill('One more thing: a Windows version is next.')
  await send.click()
  await expect(
    page
      .getByRole('log')
      .getByText('One more thing: a Windows version is next.', { exact: true }),
  ).toBeVisible()
  await expect(reply).toHaveValue('')
  await expect(page.getByRole('log').locator('.chat-message')).toHaveCount(5)
  await page.getByRole('link', { name: 'Back to messages' }).click()
  await expect(page.getByText('Draft', { exact: true })).toHaveCount(0)
  await page.getByRole('link', { name: /Amber About Noted/ }).click()
  await expect(
    page.getByRole('log').getByText(message, { exact: true }),
  ).toBeVisible()
})

test('guards direct conversation links and restores only the owner’s draft', async ({
  page,
}) => {
  await page.goto('/messages/voice-notes')
  const account = page.getByRole('combobox', { name: 'Preview account' })
  const question = page.getByText(
    'Can someone try it, or is it still a personal tool?',
    { exact: true },
  )
  await expect(
    page.getByRole('heading', { name: 'Your messages stay with you.' }),
  ).toBeVisible()
  await expect(question).toHaveCount(0)
  await account.selectOption('member')
  await expect(
    page.getByRole('heading', { name: 'Conversation unavailable.' }),
  ).toBeVisible()
  await expect(question).toHaveCount(0)
  await account.selectOption('author')
  await expect(question).toBeVisible()
  const reply = page.getByRole('textbox', { name: 'Message Amber' })
  await reply.fill('A private unfinished reply.')
  await account.selectOption('member')
  await expect(reply).toHaveCount(0)
  await expect(page.getByText('A private unfinished reply.')).toHaveCount(0)
  await account.selectOption('author')
  await expect(reply).toHaveValue('A private unfinished reply.')

  await page.goto('/messages/missing')
  await account.selectOption('author')
  await expect(
    page.getByRole('heading', { name: 'Conversation unavailable.' }),
  ).toBeVisible()
  await expect(page.getByRole('log')).toHaveCount(0)
  await page.getByRole('link', { name: 'Back to messages' }).click()
  await expect(
    page.getByRole('link', { name: /Amber About Noted/ }),
  ).toBeVisible()
})

test('fits the diff and long messages on mobile and desktop', async ({
  page,
  isMobile,
}) => {
  await page.goto('/messages/voice-notes')
  await page
    .getByRole('combobox', { name: 'Preview account' })
    .selectOption('author')
  await expect(
    page.getByRole('region', { name: 'Changes to summary' }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  const reply = page.getByRole('textbox', { name: 'Message Amber' })
  const send = page.getByRole('button', { name: 'Send message' })
  await page
    .locator('.reply-composer')
    .evaluate((element) =>
      element.scrollIntoView({ block: 'center', behavior: 'instant' }),
    )
  await expect(send).toBeInViewport()
  const composerBounds = await page.locator('.reply-composer').boundingBox()
  const controlsBounds = await page.locator('.preview-controls').boundingBox()
  if (!composerBounds || !controlsBounds)
    throw new Error('Missing composer or preview controls')
  expect(composerBounds.y + composerBounds.height).toBeLessThan(
    controlsBounds.y,
  )
  if (isMobile)
    expect(
      await reply.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).fontSize),
      ),
    ).toBeGreaterThanOrEqual(16)
  await reply.fill('a'.repeat(1000))
  await send.click()
  await expect(
    page.getByRole('log').getByText('a'.repeat(1000), { exact: true }),
  ).toBeVisible()
  await expect(reply).toHaveValue('')
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
})
