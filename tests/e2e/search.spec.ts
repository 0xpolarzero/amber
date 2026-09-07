import { expect, type Locator, test } from '@playwright/test'

async function bounds(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Expected a visible control')
  return box
}

test('keeps search and filters stationary while composing and clearing a query', async ({
  page,
}) => {
  await page.goto('/')
  const search = page.getByRole('searchbox')
  await expect(search).toBeVisible()
  const initial = await bounds(search)
  expect(initial.width).toBeGreaterThanOrEqual(180)
  await search.focus()
  expect(await bounds(search)).toEqual(initial)
  await search.fill('voice')
  await expect(page.locator('#feed-list > article')).toHaveCount(1)
  const group = page.getByRole('button', { name: 'Filter by group' })
  await group.click()
  await page.getByRole('option', { name: 'AI Builders' }).click()
  await page.getByRole('combobox', { name: 'Search groups' }).press('Escape')
  await expect(search).toHaveValue('voice')
  expect(await bounds(search)).toEqual(initial)
  await expect(page.getByRole('button', { name: 'Clear search' })).toBeVisible()
  await page
    .getByRole('combobox', { name: 'Sort posts' })
    .selectOption('comments')
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await expect(page.getByRole('group', { name: 'Active filters' })).toHaveCount(
    0,
  )
  await expect(search).toHaveValue('voice')
  await expect(page.getByRole('combobox', { name: 'Sort posts' })).toHaveValue(
    'comments',
  )
  await search.focus()
  await search.press('Escape')
  await expect(search).not.toBeFocused()
  expect(await bounds(search)).toEqual(initial)
  await expect(search).toHaveValue('voice')
  await page.getByRole('button', { name: 'Clear search' }).click()
  await expect(search).toBeFocused()
  await expect(search).toHaveValue('')
  await expect(page.locator('#feed-list > article')).toHaveCount(6)
  await search.press('Escape')
  await page.keyboard.press('/')
  await expect(search).toBeFocused()
})
