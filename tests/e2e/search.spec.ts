import { expect, type Locator, test } from '@playwright/test'

async function bounds(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Expected a visible search control')
  return box
}

test('switches search width instantly without losing the query or filters', async ({
  page,
}) => {
  await page.goto('/')
  const search = page.getByRole('searchbox')
  await expect(search).toBeVisible()
  const toolbar = page.getByRole('group', { name: 'Feed filters', exact: true })
  const group = page.getByRole('combobox', { name: 'Filter by group' })
  await group.fill('builders')
  await page.getByRole('option', { name: 'AI Builders' }).click()
  const chip = page.getByRole('button', {
    name: 'Remove group filter AI Builders',
  })
  const initial = await bounds(search)
  const row = await bounds(toolbar)
  const chipY = (await bounds(chip)).y
  expect(initial.width).toBeLessThan(row.width / 2)
  expect(
    Math.abs(initial.y + initial.height / 2 - row.y - row.height / 2),
  ).toBeLessThan(2)
  await search.focus()
  expect((await bounds(search)).width).toBeCloseTo(row.width, 0)
  expect(Math.abs((await bounds(search)).x - row.x)).toBeLessThan(2)
  expect((await bounds(chip)).y).toBe(chipY)
  await search.fill('voice')
  await expect(page.locator('#feed-list > article')).toHaveCount(1)
  await search.press('Escape')
  await expect(search).not.toBeFocused()
  expect((await bounds(search)).width).toBeCloseTo(initial.width, 0)
  await expect(search).toHaveValue('voice')
  await expect(page).toHaveURL(/q=voice/)
  await expect(chip).toBeVisible()
  await search.focus()
  await search.press('Tab')
  const clear = page.getByRole('button', { name: 'Clear search' })
  await expect(clear).toBeFocused()
  expect((await bounds(search)).width).toBeCloseTo(row.width, 0)
  await clear.press('Enter')
  await expect(search).toBeFocused()
  await expect(search).toHaveValue('')
  await expect(page.locator('#feed-list > article')).toHaveCount(3)
  await page.locator('.post-summary').first().click()
  expect((await bounds(search)).width).toBeCloseTo(initial.width, 0)
  await page.keyboard.press('/')
  await expect(search).toBeFocused()
  await search.press('Shift+Tab')
  await expect(page.getByRole('combobox', { name: 'Sort posts' })).toBeFocused()
})
