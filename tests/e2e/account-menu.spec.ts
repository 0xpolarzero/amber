import { expect, test } from '@playwright/test'
import { openMoreControls, selectPreviewAccount } from './preview-controls'

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw error
  })
  await page.goto('/')
  await selectPreviewAccount(page, 'author')
})

test('account dropdown contains working profile and sign-out actions', async ({
  page,
}) => {
  const trigger = page.getByRole('button', { name: 'Your account' })
  const menu = page.getByRole('menu', { name: 'Your account' })
  await trigger.click()
  await expect(menu).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(menu.getByRole('menuitem')).toHaveText([
    'Your profile',
    'Sign out',
  ])
  const triggerBounds = await trigger.boundingBox()
  const bounds = await menu.boundingBox()
  expect(bounds?.y).toBeGreaterThanOrEqual(
    (triggerBounds?.y ?? 0) + (triggerBounds?.height ?? 0),
  )
  expect(bounds?.x).toBeGreaterThanOrEqual(0)
  expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(
    page.viewportSize()?.width ?? 0,
  )
  await trigger.click()
  await expect(menu).toBeHidden()
  await trigger.click()
  await page
    .getByRole('heading', {
      name: 'Voice notes, finally searchable.',
      exact: true,
    })
    .click()
  await expect(menu).toBeHidden()
  await trigger.click()
  await menu.getByRole('menuitem', { name: 'Your profile' }).click()
  await expect(page).toHaveURL(/\/people\/alex$/)
  await expect(page.getByRole('heading', { name: 'Alex Chen' })).toBeVisible()
  await expect(menu).toBeHidden()
  await trigger.click()
  await openMoreControls(page)
  await selectPreviewAccount(page, 'member')
  await expect(menu).toBeHidden()
  await trigger.click()
  await expect(
    menu.getByRole('menuitem', { name: 'Your profile' }),
  ).toHaveAttribute('href', '/people/you')
  await menu.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(menu).toBeHidden()
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true }),
  ).toBeVisible()
  await expect(trigger).toHaveCount(0)
})

test('account dropdown supports keyboard navigation without trapping focus', async ({
  page,
}) => {
  const trigger = page.getByRole('button', { name: 'Your account' })
  const menu = page.getByRole('menu', { name: 'Your account' })
  await trigger.focus()
  await trigger.press('Enter')
  await expect(
    menu.getByRole('menuitem', { name: 'Your profile' }),
  ).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(menu.getByRole('menuitem', { name: 'Sign out' })).toBeFocused()
  await page.keyboard.press('Home')
  await expect(
    menu.getByRole('menuitem', { name: 'Your profile' }),
  ).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(trigger).toBeFocused()
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await trigger.press('ArrowUp')
  await expect(menu.getByRole('menuitem', { name: 'Sign out' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(menu).toBeHidden()
  await expect(page.getByRole('searchbox')).toBeFocused()
  await trigger.focus()
  await trigger.press('Space')
  await page.keyboard.press('Shift+Tab')
  await expect(menu).toBeHidden()
  await expect(
    page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: /Agent/ }),
  ).toBeFocused()
})
