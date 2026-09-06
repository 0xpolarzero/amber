import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw error
  })
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'From the group' }),
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
  await page.getByRole('button', { name: 'Search posts', exact: true }).click()
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

test('completes a pending save after preview sign-in and can unsave it', async ({
  page,
}) => {
  await page
    .getByRole('button', {
      name: 'Save Voice notes, finally searchable.',
      exact: true,
    })
    .click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Continue with Telegram' }).click()
  await expect(
    page.getByRole('button', {
      name: 'Unsave Voice notes, finally searchable.',
    }),
  ).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('link', { name: 'Saved', exact: true }).click()
  await expect(page.locator('#feed-list > article')).toHaveCount(1)
  await page
    .getByRole('button', { name: 'Unsave Voice notes, finally searchable.' })
    .click()
  await expect(
    page.getByText('Save a project from the feed to come back to it later.'),
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
  await page.getByRole('button', { name: 'Your account' }).click()
  await page.getByRole('button', { name: 'My posts', exact: true }).click()
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
