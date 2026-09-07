import { expect, type Locator, test } from '@playwright/test'

async function box(locator: Locator) {
  const bounds = await locator.boundingBox()
  if (!bounds) throw new Error('Expected a visible control')
  return bounds
}

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw error
  })
  await page.goto('/')
  await expect(
    page.getByRole('combobox', { name: 'Filter by group' }),
  ).toBeVisible()
})

test('group filters narrow authors and survive a post visit and reload', async ({
  page,
}) => {
  const group = page.getByRole('combobox', { name: 'Filter by group' })
  const author = page.getByRole('combobox', { name: 'Filter by author' })
  const posts = page.locator('#feed-list > article')
  await group.fill('builders')
  await group.press('ArrowDown')
  await group.press('Enter')
  await expect(posts).toHaveCount(3)
  await author.click()
  await expect(page.getByRole('listbox').getByRole('option')).toHaveText([
    /Alex Chen/,
    /Julien Moreau/,
    /Sam Rivera/,
  ])
  await page.getByRole('option', { name: 'Alex Chen' }).click()
  await expect(posts).toHaveCount(1)
  await posts
    .first()
    .getByRole('link', {
      name: 'Voice notes, finally searchable.',
      exact: true,
    })
    .click()
  await page.getByRole('button', { name: 'Go back' }).click()
  await expect(
    page.getByRole('button', { name: 'Remove group filter AI Builders' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Remove author filter Alex Chen' }),
  ).toBeVisible()
  await page.reload()
  await expect(posts).toHaveCount(1)
  await page
    .getByRole('button', { name: 'Remove author filter Alex Chen' })
    .click()
  await expect(posts).toHaveCount(3)
  await page
    .getByRole('button', { name: 'Remove group filter AI Builders' })
    .click()
  await expect(posts).toHaveCount(5)
  await author.click()
  await expect(page.getByRole('option', { name: 'Maya Laurent' })).toBeVisible()
})

test('author filters narrow groups, including Me, and removing them restores options', async ({
  page,
}) => {
  const group = page.getByRole('combobox', { name: 'Filter by group' })
  const author = page.getByRole('combobox', { name: 'Filter by author' })
  await author.fill('maya')
  await page.getByRole('option', { name: 'Maya Laurent' }).click()
  await group.click()
  await expect(page.getByRole('listbox').getByRole('option')).toHaveText([
    'Creative AI',
  ])
  await page.getByRole('option', { name: 'Creative AI' }).click()
  await author.click()
  await expect(page.getByRole('listbox').getByRole('option')).toHaveText([
    /Nina Park/,
  ])
  await author.press('Escape')
  await page
    .getByRole('button', { name: 'Remove author filter Maya Laurent' })
    .click()
  await expect(page.getByRole('listbox').getByRole('option')).toHaveText([
    /Maya Laurent/,
    /Nina Park/,
  ])
  await author.press('Escape')
  await page
    .getByRole('button', { name: 'Remove group filter Creative AI' })
    .click()
  await expect(page.getByRole('listbox').getByRole('option')).toHaveText([
    'AI Builders',
    'Creative AI',
  ])
  await group.press('Escape')
  await page
    .getByRole('combobox', { name: 'Preview account' })
    .selectOption('author')
  await author.fill('Me')
  await page.getByRole('option', { name: 'Me Alex Chen' }).click()
  await group.click()
  await expect(page.getByRole('listbox').getByRole('option')).toHaveText([
    'AI Builders',
  ])
  await group.press('Escape')
  await page.getByRole('button', { name: 'Remove author filter Me' }).click()
  await author.press('Escape')
  await group.click()
  await page.getByRole('option', { name: 'Creative AI' }).click()
  await author.click()
  await expect(page.getByRole('option', { name: /Me / })).toHaveCount(0)
})

test('keeps controls on one line and places all active filters below it', async ({
  page,
}) => {
  await expect(
    page.getByRole('heading', { name: 'Feed', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByText('Small projects, shared by the people making them.', {
      exact: true,
    }),
  ).toHaveCount(0)
  const group = page.getByRole('combobox', { name: 'Filter by group' })
  const author = page.getByRole('combobox', { name: 'Filter by author' })
  const bookmarks = page.getByRole('button', { name: 'Bookmarks', exact: true })
  const sort = page.getByRole('combobox', { name: 'Sort posts' })
  const search = page.getByRole('searchbox')
  for (const value of ['latest', 'comments', 'bookmarks']) {
    await sort.selectOption(value)
    const bounds = await Promise.all(
      [group, author, bookmarks, sort, search].map(box),
    )
    const center = bounds[0].y + bounds[0].height / 2
    for (let i = 0; i < bounds.length; i++) {
      expect(
        Math.abs(bounds[i].y + bounds[i].height / 2 - center),
      ).toBeLessThan(2)
      if (i > 0)
        expect(bounds[i].x).toBeGreaterThanOrEqual(
          bounds[i - 1].x + bounds[i - 1].width,
        )
    }
    expect(bounds[4].x + bounds[4].width).toBeLessThanOrEqual(
      page.viewportSize()?.width ?? 0,
    )
  }
  await group.click()
  let popup = await box(page.getByRole('listbox', { name: 'Groups' }))
  expect(popup.x).toBeGreaterThanOrEqual(0)
  expect(popup.x + popup.width).toBeLessThanOrEqual(
    page.viewportSize()?.width ?? 0,
  )
  await page.getByRole('option', { name: 'AI Builders' }).click()
  await author.click()
  popup = await box(page.getByRole('listbox', { name: 'Authors' }))
  expect(popup.x).toBeGreaterThanOrEqual(0)
  expect(popup.x + popup.width).toBeLessThanOrEqual(
    page.viewportSize()?.width ?? 0,
  )
  await page.getByRole('option', { name: 'Alex Chen' }).click()
  await bookmarks.click()
  const toolbar = await box(
    page.getByRole('group', { name: 'Feed filters', exact: true }),
  )
  const chips = page.getByRole('group', { name: 'Active filters' })
  await expect(chips.getByRole('button')).toHaveCount(3)
  const chipBounds = await box(chips)
  expect(chipBounds.y).toBeGreaterThan(toolbar.y + toolbar.height)
  await page.getByRole('button', { name: 'Remove Bookmarked filter' }).click()
  await expect(bookmarks).toHaveAttribute('aria-pressed', 'false')
})
