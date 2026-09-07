import { expect, type Locator, type Page, test } from '@playwright/test'

async function box(locator: Locator) {
  const bounds = await locator.boundingBox()
  if (!bounds) throw new Error('Expected a visible control')
  return bounds
}

async function openFilter(page: Page, label: 'group' | 'author') {
  await page.getByRole('button', { name: `Filter by ${label}` }).click()
  const input = page.getByRole('combobox', { name: `Search ${label}s` })
  await expect(input).toBeFocused()
  return input
}

async function choose(page: Page, label: 'group' | 'author', name: string) {
  const input = await openFilter(page, label)
  await page.getByRole('option', { name, exact: true }).click()
  await input.press('Escape')
}

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw error
  })
  await page.goto('/')
  await expect(
    page.getByRole('button', { name: 'Filter by group' }),
  ).toBeVisible()
})

test('group filters narrow authors and survive a post visit and reload', async ({
  page,
}) => {
  const input = await openFilter(page, 'group')
  await input.fill('builders')
  await input.press('ArrowDown')
  await input.press('Enter')
  await expect(
    page.getByRole('option', { name: 'AI Builders' }),
  ).toHaveAttribute('aria-selected', 'true')
  await input.press('Escape')
  const posts = page.locator('#feed-list > article')
  await expect(posts).toHaveCount(3)
  const author = await openFilter(page, 'author')
  await expect(page.getByRole('listbox').getByRole('option')).toHaveText([
    /Alex Chen/,
    /Julien Moreau/,
    /Sam Rivera/,
  ])
  await page.getByRole('option', { name: 'Alex Chen' }).click()
  await author.press('Escape')
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
  await openFilter(page, 'author')
  await expect(page.getByRole('option', { name: 'Maya Laurent' })).toBeVisible()
})

test('author filters narrow groups, including Me, and removing them restores options', async ({
  page,
}) => {
  await choose(page, 'author', 'Maya Laurent')
  const group = await openFilter(page, 'group')
  await expect(page.getByRole('listbox').getByRole('option')).toHaveText([
    'Creative AI',
  ])
  await page.getByRole('option', { name: 'Creative AI' }).click()
  await group.press('Escape')
  const author = await openFilter(page, 'author')
  await expect(page.getByRole('listbox').getByRole('option')).toHaveText([
    /Maya Laurent/,
    /Nina Park/,
  ])
  await expect(
    page.getByRole('option', { name: 'Maya Laurent' }),
  ).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('option', { name: 'Maya Laurent' }).click()
  await expect(
    page.getByRole('option', { name: 'Maya Laurent' }),
  ).toHaveAttribute('aria-selected', 'false')
  await author.press('Escape')
  await page
    .getByRole('button', { name: 'Remove group filter Creative AI' })
    .click()
  await openFilter(page, 'group')
  await expect(page.getByRole('listbox').getByRole('option')).toHaveText([
    'AI Builders',
    'Creative AI',
  ])
  await group.press('Escape')
  await page
    .getByRole('combobox', { name: 'Preview account' })
    .selectOption('author')
  await choose(page, 'author', 'Me Alex Chen')
  await openFilter(page, 'group')
  await expect(page.getByRole('listbox').getByRole('option')).toHaveText([
    'AI Builders',
  ])
  await group.press('Escape')
  await page.getByRole('button', { name: 'Remove author filter Me' }).click()
  await choose(page, 'group', 'Creative AI')
  await openFilter(page, 'author')
  await expect(page.getByRole('option', { name: /Me / })).toHaveCount(0)
})

test('keeps desktop controls on one row and gives mobile search its own row', async ({
  page,
}) => {
  await expect(
    page.getByRole('heading', { name: 'Feed', exact: true }),
  ).toHaveCount(0)
  const group = page.getByRole('button', { name: 'Filter by group' })
  const author = page.getByRole('button', { name: 'Filter by author' })
  const bookmarks = page.getByRole('button', { name: 'Bookmarks', exact: true })
  const sort = page.getByRole('combobox', { name: 'Sort posts' })
  const search = page.getByRole('searchbox')
  const width = page.viewportSize()?.width ?? 0
  for (const value of ['latest', 'comments', 'bookmarks']) {
    await sort.selectOption(value)
    const bounds = await Promise.all([group, author, bookmarks, sort].map(box))
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
    const field = await box(search)
    if (width <= 640) {
      expect(field.y + field.height).toBeLessThan(bounds[0].y)
      expect(field.width).toBeCloseTo(
        (await box(page.locator('.feed-toolbar'))).width,
        0,
      )
      for (const bound of bounds)
        expect(bound.height).toBeGreaterThanOrEqual(44)
    } else {
      expect(field.x).toBeGreaterThanOrEqual(bounds[3].x + bounds[3].width)
      expect(Math.abs(field.y + field.height / 2 - center)).toBeLessThan(2)
    }
    expect(field.x + field.width).toBeLessThanOrEqual(width)
  }
  for (const label of ['group', 'author'] as const) {
    const input = await openFilter(page, label)
    const popup = await box(
      page.getByRole('dialog', {
        name: `${label === 'group' ? 'Group' : 'Author'} filters`,
      }),
    )
    expect(popup.x).toBeGreaterThanOrEqual(0)
    expect(popup.x + popup.width).toBeLessThanOrEqual(width)
    await input.press('Escape')
  }
  await choose(page, 'group', 'AI Builders')
  await choose(page, 'author', 'Alex Chen')
  await bookmarks.click()
  const toolbar = await box(
    page.getByRole('group', { name: 'Feed filters', exact: true }),
  )
  const chips = page.getByRole('group', { name: 'Active filters' })
  await expect(chips.getByRole('button')).toHaveCount(4)
  expect((await box(chips)).y).toBeGreaterThan(toolbar.y + toolbar.height)
  await page.getByRole('button', { name: 'Remove Bookmarked filter' }).click()
  await expect(bookmarks).toHaveAttribute('aria-pressed', 'false')
})

test('supports several selections in one dropdown and clears the active filters together', async ({
  page,
}) => {
  const group = await openFilter(page, 'group')
  await page.getByRole('option', { name: 'AI Builders' }).click()
  await page.getByRole('option', { name: 'Creative AI' }).click()
  await expect(
    page.getByRole('listbox').getByRole('option', { selected: true }),
  ).toHaveCount(2)
  await expect(page.locator('#feed-list > article')).toHaveCount(5)
  await group.press('Escape')
  const author = await openFilter(page, 'author')
  await author.fill('Maya')
  await author.press('ArrowDown')
  await author.press('Enter')
  await expect(author).toHaveValue('')
  await author.fill('Alex')
  await author.press('ArrowDown')
  await author.press('Enter')
  await expect(
    page.getByRole('listbox').getByRole('option', { selected: true }),
  ).toHaveCount(2)
  await author.press('Escape')
  await expect(page.locator('#feed-list > article')).toHaveCount(2)
  await page.getByRole('button', { name: 'Bookmarks', exact: true }).click()
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await expect(page.getByRole('group', { name: 'Active filters' })).toHaveCount(
    0,
  )
  await expect(
    page.getByRole('button', { name: 'Bookmarks', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false')
  await expect(
    page.getByRole('button', { name: 'Filter by group' }),
  ).toBeFocused()
  await expect(page.locator('#feed-list > article')).toHaveCount(5)
})
