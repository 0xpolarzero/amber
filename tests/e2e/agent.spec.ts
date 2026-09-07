import { expect, test } from '@playwright/test'

test('one Agent chat discusses two posts and reuses the same preference', async ({
  page,
}) => {
  await page.goto('/agent')
  await page
    .getByRole('combobox', { name: 'Preview account' })
    .selectOption('author')
  const nav = page.getByRole('navigation', { name: 'Main navigation' })
  await expect(nav.getByRole('link')).toHaveText(['Feed', 'Agent'])
  await expect(page.getByRole('log')).toHaveCount(1)
  await expect(
    page
      .getByRole('log')
      .getByText('And for Tab tidy, is the beta free to try?', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('I’ll remember that for your other posts too.', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    page.getByText(
      'Added that. I used your preference for short, factual descriptions here too.',
      { exact: true },
    ),
  ).toBeVisible()
  for (const project of ['Noted', 'Tab tidy']) {
    const toggle = page
      .locator('.post-update > summary')
      .filter({ hasText: `Updated ${project}` })
    const diff = page.getByRole('region', {
      name: `Changes to ${project} summary`,
    })
    if (!(await diff.isVisible())) await toggle.click()
    const summary = await diff.locator('ins').innerText()
    await expect(diff.locator('del')).not.toHaveText(summary)
    await diff.getByRole('link', { name: `View ${project} post` }).click()
    await expect(page.getByText(summary, { exact: true })).toBeVisible()
    await page.getByRole('link', { name: 'Message Amber', exact: true }).click()
    await expect(page).toHaveURL(/\/agent\?post=/)
    await expect(page.getByRole('log')).toHaveCount(1)
    await expect(
      page.getByText(`About ${project}`, { exact: true }),
    ).toBeVisible()
  }
  await expect(page.getByRole('button', { name: /Review|Accept/ })).toHaveCount(
    0,
  )
})

test('keeps the draft and history when switching post context and supports normal sending', async ({
  page,
}) => {
  await page.goto('/agent?post=voice-notes')
  await page
    .getByRole('combobox', { name: 'Preview account' })
    .selectOption('author')
  const reply = page.getByRole('textbox', { name: 'Message Amber' })
  await reply.fill('Thanks for updating both.')
  await reply.press('Shift+Enter')
  await reply.pressSequentially('I have another detail.')
  const text = 'Thanks for updating both.\nI have another detail.'
  await page
    .getByRole('link', { name: 'Tab tidy', exact: true })
    .first()
    .click()
  await page.getByRole('link', { name: 'Message Amber', exact: true }).click()
  await expect(page.getByText('About Tab tidy', { exact: true })).toBeVisible()
  await expect(reply).toHaveValue(text)
  await reply.press('Enter')
  await expect(
    page.getByRole('log').getByText(text, { exact: true }),
  ).toBeVisible()
  await expect(reply).toHaveValue('')
  await expect(reply).toBeFocused()
  await page.getByRole('button', { name: 'Remove post context' }).click()
  await expect(page).toHaveURL(/\/agent$/)
  await reply.fill('A general question.')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(
    page.getByRole('log').getByText('A general question.', { exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('log').locator('.chat-message')).toHaveCount(10)
})

test('lets the user inspect, edit, forget and add memory', async ({ page }) => {
  await page.goto('/agent')
  await page
    .getByRole('combobox', { name: 'Preview account' })
    .selectOption('author')
  const memory = page.getByRole('button', { name: 'Memory 1', exact: true })
  await memory.click()
  const dialog = page.getByRole('dialog', { name: 'Memory', exact: true })
  await expect(
    dialog.getByText(
      'Keep post descriptions short and factual. Avoid promotional language.',
      { exact: true },
    ),
  ).toBeVisible()
  await dialog.getByRole('button', { name: /^Edit memory:/ }).click()
  await dialog
    .getByRole('textbox', { name: 'Preference' })
    .fill('Use one sentence. Keep the tone plain.')
  await dialog.getByRole('button', { name: 'Save preference' }).click()
  await expect(
    dialog.getByText('Use one sentence. Keep the tone plain.', { exact: true }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(memory).toBeFocused()
  await memory.click()
  await dialog.getByRole('button', { name: /^Forget memory:/ }).click()
  await expect(dialog.getByText('No saved preferences yet.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Add preference' }).click()
  await dialog
    .getByRole('textbox', { name: 'Preference' })
    .fill('Write my posts in French.')
  await dialog.getByRole('button', { name: 'Save preference' }).click()
  await expect(
    dialog.getByText('Write my posts in French.', { exact: true }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('log').locator('.chat-message')).toHaveCount(8)
})

test('keeps chat, drafts and memory separate for each account, including members without posts', async ({
  page,
}) => {
  await page.goto('/agent')
  const account = page.getByRole('combobox', { name: 'Preview account' })
  await expect(
    page.getByRole('heading', { name: 'Your agent, just for you.' }),
  ).toBeVisible()
  await expect(page.getByRole('log')).toHaveCount(0)
  await account.selectOption('author')
  const reply = page.getByRole('textbox', { name: 'Message Amber' })
  await reply.fill('Alex’s draft.')
  await account.selectOption('member')
  await expect(
    page.getByRole('heading', { name: 'What would you like to work on?' }),
  ).toBeVisible()
  await expect(reply).toHaveValue('')
  await page.getByRole('button', { name: 'Memory 0' }).click()
  await expect(page.getByText('No saved preferences yet.')).toBeVisible()
  await page.keyboard.press('Escape')
  await reply.fill('Can you help me find a project?')
  await reply.press('Enter')
  await expect(page.getByRole('log').locator('.chat-message')).toHaveCount(1)
  await account.selectOption('author')
  await expect(reply).toHaveValue('Alex’s draft.')
  await expect(
    page.getByRole('log').getByText('Can you help me find a project?'),
  ).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Memory 1' })).toBeVisible()
})

test('redirects old message links to the same Agent and tolerates removed post context', async ({
  page,
}) => {
  await page.goto('/messages')
  await expect(page).toHaveURL(/\/agent$/)
  await page.goto('/messages/voice-notes')
  await expect(page).toHaveURL(/\/agent\?post=voice-notes$/)
  await page
    .getByRole('combobox', { name: 'Preview account' })
    .selectOption('author')
  await expect(page.getByText('About Noted', { exact: true })).toBeVisible()
  await page.goto('/agent?post=missing')
  await page
    .getByRole('combobox', { name: 'Preview account' })
    .selectOption('author')
  await expect(page.getByText('About an unavailable post')).toBeVisible()
  await expect(page.getByRole('log')).toBeVisible()
  await page.getByRole('button', { name: 'Remove post context' }).click()
  await expect(page).toHaveURL(/\/agent$/)
})

test('fits the Agent, memory dialog and long replies on desktop and mobile', async ({
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
      () => document.documentElement.scrollHeight <= window.innerHeight + 1,
    ),
  ).toBe(true)
  await page.getByRole('button', { name: 'Memory 1' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.keyboard.press('Escape')
  const reply = page.getByRole('textbox', { name: 'Message Amber' })
  if (isMobile)
    expect(
      await reply.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).fontSize),
      ),
    ).toBeGreaterThanOrEqual(16)
  await reply.fill('a'.repeat(1000))
  await page.getByRole('button', { name: 'Send message' }).click()
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

test('unaddressed messages survive reading the chat and sending an unrelated reply', async ({
  page,
}) => {
  await page.goto('/agent')
  await page
    .getByRole('combobox', { name: 'Preview account' })
    .selectOption('author')
  const jump = page.getByRole('button', { name: '1 unaddressed', exact: true })
  await jump.click()
  await expect(page.getByText('Unaddressed', { exact: true })).toBeVisible()
  await expect(page.locator('.chat-message.unaddressed')).toBeFocused()
  await page
    .getByRole('textbox', { name: 'Message Amber' })
    .fill('Thanks for the update.')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(jump).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Feed' })
    .click()
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Agent', exact: true })
    .click()
  await expect(jump).toBeVisible()
})
