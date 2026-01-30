import { test, expect } from '@playwright/test'

test.describe('Home Page', () => {
  test('should load successfully', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/TDEC Prospect/)
  })

  test('should display Next.js logo', async ({ page }) => {
    await page.goto('/')
    const logo = page.getByAltText('Next.js logo')
    await expect(logo).toBeVisible()
  })

  test('should display main heading', async ({ page }) => {
    await page.goto('/')
    const heading = page.getByRole('heading', { level: 1 })
    await expect(heading).toContainText('To get started, edit the page.tsx file')
  })

  test('should have Deploy Now button', async ({ page }) => {
    await page.goto('/')
    const deployButton = page.getByRole('link', { name: /Deploy Now/i })
    await expect(deployButton).toBeVisible()
    await expect(deployButton).toHaveAttribute('href', /vercel.com\/new/)
  })

  test('should have Documentation link', async ({ page }) => {
    await page.goto('/')
    const docsLink = page.getByRole('link', { name: /Documentation/i })
    await expect(docsLink).toBeVisible()
    await expect(docsLink).toHaveAttribute('href', /nextjs.org\/docs/)
  })

  test('should have Templates link', async ({ page }) => {
    await page.goto('/')
    const templatesLink = page.getByRole('link', { name: /Templates/i })
    await expect(templatesLink).toBeVisible()
  })

  test('should have Learning link', async ({ page }) => {
    await page.goto('/')
    const learningLink = page.getByRole('link', { name: /Learning/i })
    await expect(learningLink).toBeVisible()
  })
})
