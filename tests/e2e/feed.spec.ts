import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw error
  })
  await page.goto('/')
  await expect(
    page.getByRole('combobox', { name: 'Filter by group' }),
  ).toBeVisible()
})

test('serves real HTML, valid routes and the review plan', async ({
  request,
}) => {
  const response = await request.get('/')
  expect(response.status()).toBe(200)
  expect(await response.text()).toContain('Voice notes, finally searchable.')
  expect((await request.get('/posts/missing')).status()).toBe(404)
  expect((await request.get('/people/missing')).status()).toBe(404)
  const plan = await request.get('/plan')
  expect(plan.status()).toBe(200)
  expect(await plan.text()).toContain('Implementation plan')
})

test('sorts and searches the feed, retaining filters when returning from a post', async ({
  page,
}) => {
  const posts = page.locator('#feed-list > article')
  await expect(posts).toHaveCount(5)
  await page
    .getByRole('combobox', { name: 'Sort posts' })
    .selectOption('bookmarks')
  await expect(posts.first()).toHaveAccessibleName(
    'Colour palettes from a sentence.',
  )
  await page
    .getByRole('combobox', { name: 'Sort posts' })
    .selectOption('comments')
  await expect(posts.first()).toHaveAccessibleName(
    'Voice notes, finally searchable.',
  )
  await page.getByRole('searchbox').fill('Maya')
  await expect(posts).toHaveCount(1)
  await expect(page).toHaveURL(/q=Maya/)
  await posts
    .first()
    .getByRole('link', {
      name: 'An assistant that stays in the margin.',
      exact: true,
    })
    .click()
  await expect(
    page.getByRole('heading', {
      name: 'An assistant that stays in the margin.',
    }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Go back' }).click()
  await expect(page.getByRole('searchbox')).toHaveValue('Maya')
  await expect(page.getByRole('combobox', { name: 'Sort posts' })).toHaveValue(
    'comments',
  )
  await expect(posts).toHaveCount(1)
})

test('completes a pending bookmark after preview sign-in and can remove it', async ({
  page,
}) => {
  await page
    .getByRole('button', {
      name: 'Bookmark Voice notes, finally searchable.',
      exact: true,
    })
    .click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Continue with Telegram' }).click()
  await expect(
    page.getByRole('button', {
      name: 'Remove bookmark from Voice notes, finally searchable.',
    }),
  ).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Bookmarks', exact: true }).click()
  await expect(page.locator('#feed-list > article')).toHaveCount(1)
  await page
    .getByRole('button', {
      name: 'Remove bookmark from Voice notes, finally searchable.',
    })
    .click()
  await expect(
    page.getByText(
      'Bookmark a project from the feed to come back to it later.',
    ),
  ).toBeVisible()
})

test('adds and deletes your comment without editing someone else’s post', async ({
  page,
}) => {
  await page
    .getByRole('combobox', { name: 'Preview account' })
    .selectOption('member')
  await page
    .getByRole('link', {
      name: 'Voice notes, finally searchable.',
      exact: true,
    })
    .click()
  await page
    .getByRole('textbox', { name: 'Your comment' })
    .fill('Is there a demo?')
  await page.getByRole('button', { name: 'Post comment', exact: true }).click()
  await expect(
    page.getByText('Is there a demo?', { exact: true }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Delete your comment: Is there a demo?' })
    .click()
  await expect(page.getByText('Is there a demo?', { exact: true })).toHaveCount(
    0,
  )
  await page
    .getByRole('button', {
      name: 'Options for Voice notes, finally searchable.',
    })
    .click()
  await expect(
    page.getByRole('button', { name: 'Edit post', exact: true }),
  ).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('lets the author edit and review an answer before adding it to the post', async ({
  page,
}) => {
  await page
    .getByRole('combobox', { name: 'Preview account' })
    .selectOption('author')
  await page.getByRole('combobox', { name: 'Filter by author' }).click()
  await page.getByRole('option', { name: /Me Alex Chen/ }).click()
  await page.getByRole('button', { name: 'Edit post', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Title', exact: true })
    .fill('Search your voice notes.')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(
    page.getByRole('link', { name: 'Search your voice notes.', exact: true }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'One detail would help. Add an answer.' })
    .click()
  await page
    .getByRole('textbox', { name: 'Your answer' })
    .fill('The first demo is available to the group.')
  await page.getByRole('button', { name: 'Review update' }).click()
  await expect(
    page
      .getByRole('dialog')
      .getByText('The first demo is available to the group.', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Accept update' }).click()
  await expect(
    page.getByRole('button', { name: 'One detail would help. Add an answer.' }),
  ).toHaveCount(0)
  await page
    .getByRole('link', { name: 'Search your voice notes.', exact: true })
    .click()
  await expect(
    page.getByText('The first demo is available to the group.', {
      exact: true,
    }),
  ).toBeVisible()
})

test('fits the viewport and returns keyboard focus after a dialog closes', async ({
  page,
}) => {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  const trigger = page.getByRole('button', { name: 'Sign in', exact: true })
  await trigger.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
})

test('combines removable author chips with bookmarks and preserves filters on return', async ({
  page,
}) => {
  await page
    .getByRole('combobox', { name: 'Preview account' })
    .selectOption('member')
  await page
    .getByRole('button', {
      name: 'Bookmark An assistant that stays in the margin.',
      exact: true,
    })
    .click()
  const author = page.getByRole('combobox', { name: 'Filter by author' })
  await author.fill('Maya')
  await author.press('ArrowDown')
  await author.press('Enter')
  await expect(
    page.getByRole('button', { name: 'Remove author filter Maya Laurent' }),
  ).toBeVisible()
  await author.click()
  await expect(page.getByRole('option', { name: 'Maya Laurent' })).toHaveCount(
    0,
  )
  await author.fill('Alex')
  await page.getByRole('option', { name: 'Alex Chen' }).click()
  const posts = page.locator('#feed-list > article')
  await expect(posts).toHaveCount(2)
  await page.getByRole('button', { name: 'Bookmarks', exact: true }).click()
  await expect(posts).toHaveCount(1)
  await expect(posts.first()).toHaveAccessibleName(
    'An assistant that stays in the margin.',
  )
  await expect(page).toHaveURL(/bookmarked=true/)
  await expect(
    page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link'),
  ).toHaveText(['Feed', 'Messages'])
  await posts
    .first()
    .getByRole('link', {
      name: 'An assistant that stays in the margin.',
      exact: true,
    })
    .click()
  await page.getByRole('button', { name: 'Go back' }).click()
  await expect(
    page.getByRole('button', { name: 'Remove Bookmarked filter' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Remove author filter Alex Chen' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Remove Bookmarked filter' }).click()
  await expect(posts).toHaveCount(2)
  await page
    .getByRole('button', { name: 'Remove author filter Alex Chen' })
    .click()
  await expect(posts).toHaveCount(1)
  await author.fill('no such person')
  await expect(page.getByText('No matching authors.')).toBeVisible()
  await author.press('Escape')
  await expect(author).toBeFocused()
  await expect(author).toHaveAttribute('aria-expanded', 'false')
  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Remove author filter Maya Laurent' }),
  ).toBeVisible()
  await expect(posts).toHaveCount(1)
})

test('resolves Me for the current account and handles signed-out filters', async ({
  page,
}) => {
  const author = page.getByRole('combobox', { name: 'Filter by author' })
  await author.click()
  await page.getByRole('option', { name: /^Me / }).click()
  await expect(
    page.getByText('Sign in to filter by your bookmarks or your own posts.'),
  ).toBeVisible()
  await page
    .getByRole('combobox', { name: 'Preview account' })
    .selectOption('author')
  await expect(page.locator('#feed-list > article')).toHaveCount(1)
  await expect(
    page.getByRole('button', { name: 'Edit post', exact: true }),
  ).toBeVisible()
  await page
    .getByRole('combobox', { name: 'Preview account' })
    .selectOption('member')
  await expect(
    page.getByRole('heading', { name: 'No projects match.' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Remove author filter Me' }).click()
  await expect(page.locator('#feed-list > article')).toHaveCount(5)
  await author.press('Escape')
  await page.getByRole('button', { name: 'Bookmarks', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'No bookmarks yet.' }),
  ).toBeVisible()
})

test('shows private questions and an unread count only for their recipient', async ({
  page,
}) => {
  const nav = page.getByRole('navigation', { name: 'Main navigation' })
  await nav.getByRole('link', { name: 'Messages', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Your messages stay with you.' }),
  ).toBeVisible()
  await page
    .getByRole('combobox', { name: 'Preview account' })
    .selectOption('member')
  await expect(
    page.getByRole('heading', { name: 'All quiet here.' }),
  ).toBeVisible()
  await expect(
    page.getByText('Can someone try it, or is it still a personal tool?'),
  ).toHaveCount(0)
  await page
    .getByRole('combobox', { name: 'Preview account' })
    .selectOption('author')
  await expect(
    nav.getByRole('link', { name: 'Messages 1 unread' }),
  ).toBeVisible()
  await page.getByRole('button', { name: /Amber About Noted/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(
    nav.getByRole('link', { name: 'Messages', exact: true }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await page
    .getByRole('combobox', { name: 'Preview account' })
    .selectOption('member')
  await expect(
    page.getByRole('heading', { name: 'All quiet here.' }),
  ).toBeVisible()
  await page
    .getByRole('combobox', { name: 'Preview account' })
    .selectOption('author')
  await expect(
    nav.getByRole('link', { name: 'Messages', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: /Amber About Noted/ }).click()
  await page
    .getByRole('textbox', { name: 'Your answer' })
    .fill('The group can try a demo now.')
  await page.getByRole('button', { name: 'Review update' }).click()
  await page.getByRole('button', { name: 'Accept update' }).click()
  await expect(
    page.getByRole('heading', { name: 'All quiet here.' }),
  ).toBeVisible()
})

test('keeps the author popup within the viewport and supports keyboard dismissal', async ({
  page,
}) => {
  const author = page.getByRole('combobox', { name: 'Filter by author' })
  await author.click()
  await expect(page.getByRole('listbox', { name: 'Authors' })).toBeVisible()
  const bounds = await page
    .getByRole('listbox', { name: 'Authors' })
    .boundingBox()
  expect(bounds).not.toBeNull()
  expect(bounds?.x).toBeGreaterThanOrEqual(0)
  expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(
    page.viewportSize()?.width ?? 0,
  )
  await author.press('ArrowDown')
  await author.press('Escape')
  await expect(author).toBeFocused()
  await expect(page.getByRole('listbox', { name: 'Authors' })).toBeHidden()
  await author.press('ArrowDown')
  await author.press('Tab')
  await expect(author).toHaveAttribute('aria-expanded', 'false')
})
