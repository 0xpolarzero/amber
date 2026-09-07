import { expect, test } from '@playwright/test'

test('keeps a draft through navigation, reviews it, and retains the accepted conversation', async ({
  page,
}) => {
  await page.goto('/messages')
  await page
    .getByRole('combobox', { name: 'Preview account' })
    .selectOption('author')
  await page.getByRole('link', { name: /Amber About Noted/ }).click()
  await expect(page).toHaveURL(/\/messages\/voice-notes$/)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const reply = page.getByRole('textbox', { name: 'Your answer' })
  await expect(
    page.getByRole('button', { name: 'Review update' }),
  ).toBeDisabled()
  await reply.fill('The demo is ready.')
  await reply.press('Enter')
  await reply.pressSequentially('The group can try it.')
  const answer = 'The demo is ready.\nThe group can try it.'
  await expect(reply).toHaveValue(answer)
  await expect(
    page.getByRole('heading', { name: 'Review post update' }),
  ).toHaveCount(0)

  await page
    .getByRole('link', { name: /Noted Voice notes, finally searchable/ })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Voice notes, finally searchable.' }),
  ).toBeVisible()
  await expect(page.getByText(answer, { exact: true })).toHaveCount(0)
  await page.goBack()
  await expect(reply).toHaveValue(answer)
  await page.getByRole('link', { name: 'Back to messages' }).click()
  await expect(page.getByText('Draft', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: /Amber About Noted/ }).click()
  await expect(reply).toHaveValue(answer)
  await reply.press('Control+Enter')
  await expect(
    page.getByRole('heading', { name: 'Review post update' }),
  ).toBeFocused()
  await page.getByRole('button', { name: 'Edit reply' }).click()
  await expect(reply).toBeFocused()
  await expect(reply).toHaveValue(answer)
  await page.getByRole('button', { name: 'Review update' }).click()
  await page.getByText('Current post', { exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Accept update' }),
  ).toBeEnabled()
  await page.getByRole('button', { name: 'Accept update' }).click()
  await expect(reply).toHaveCount(0)
  await expect(
    page.getByRole('log').getByText(answer, { exact: true }),
  ).toBeVisible()
  await expect(page.getByText('Post updated', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Back to messages' }).click()
  await expect(page.getByText('Post updated', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: /Amber About Noted/ }).click()
  await expect(
    page.getByRole('log').getByText(answer, { exact: true }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'View post', exact: true }).click()
  await expect(page.getByText(answer, { exact: true })).toBeVisible()
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
  const reply = page.getByRole('textbox', { name: 'Your answer' })
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

test('fits long replies and keeps the composer usable in the viewport', async ({
  page,
  isMobile,
}) => {
  await page.goto('/messages/voice-notes')
  await page
    .getByRole('combobox', { name: 'Preview account' })
    .selectOption('author')
  const reply = page.getByRole('textbox', { name: 'Your answer' })
  const review = page.getByRole('button', { name: 'Review update' })
  await expect(review).toBeInViewport()
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
  await review.click()
  await expect(
    page.getByRole('region', { name: 'Review post update' }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.getByRole('button', { name: 'Accept update' }).click()
  await expect(
    page.getByRole('log').getByText('a'.repeat(1000), { exact: true }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
})
