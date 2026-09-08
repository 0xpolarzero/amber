import { expect, type Page } from '@playwright/test'

export async function openMoreControls(page: Page) {
  const details = page.locator('.preview-more')
  if ((await details.getAttribute('open')) === null)
    await details.getByText('More controls', { exact: true }).click()
  await expect(details).toHaveAttribute('open', '')
}

export async function selectPreviewAccount(
  page: Page,
  account: 'visitor' | 'member' | 'author',
) {
  await openMoreControls(page)
  await page
    .getByRole('combobox', { name: 'Preview account' })
    .selectOption(account)
}
