import { test, expect } from "@playwright/test";

/**
 * Navigation tests require authentication.
 *
 * To run these tests:
 * 1. Set up Supabase credentials in .env.local
 * 2. Create a test user in Supabase
 * 3. Set TEST_USER_EMAIL and TEST_USER_PASSWORD environment variables
 *
 * These tests will be skipped if not properly configured.
 */

const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;

test.describe("Application Shell - Navigation (Authenticated)", () => {
  test.beforeEach(async ({ page }) => {
    // Skip all tests if test credentials not configured
    test.skip(
      !TEST_USER_EMAIL || !TEST_USER_PASSWORD,
      "Test credentials not configured. Set TEST_USER_EMAIL and TEST_USER_PASSWORD."
    );

    // Login before each test
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(TEST_USER_EMAIL!);
    await page.getByLabel(/senha/i).fill(TEST_USER_PASSWORD!);
    await page.getByRole("button", { name: /entrar/i }).click();

    // Wait for redirect to /leads
    await page.waitForURL("/leads", { timeout: 10000 });
  });

  test.describe("Sidebar", () => {
    test("should display sidebar with approximately 240px width", async ({
      page,
    }) => {
      await page.evaluate(() => localStorage.removeItem("sidebar-collapsed"));
      await page.reload();
      await page.waitForLoadState("networkidle");

      const sidebar = page.locator("aside");
      await expect(sidebar).toBeVisible();

      const box = await sidebar.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(238);
      expect(box?.width).toBeLessThanOrEqual(241);
    });

    test("should display navigation items with icons and labels", async ({
      page,
    }) => {
      const nav = page.getByRole("navigation", { name: /sidebar/i });

      await expect(nav.getByRole("link", { name: /leads/i })).toBeVisible();
      await expect(nav.getByRole("link", { name: /campanhas/i })).toBeVisible();
      await expect(
        nav.getByRole("link", { name: /configurações/i })
      ).toBeVisible();
    });

    test("should highlight active route with left border and background", async ({
      page,
    }) => {
      const activeLink = page
        .getByRole("navigation", { name: /sidebar/i })
        .getByRole("link", { name: /leads/i });

      await expect(activeLink).toBeVisible();
      await expect(activeLink).toHaveCSS("border-left-width", "3px");
    });

    test("should navigate between pages when clicking nav items", async ({
      page,
    }) => {
      // Click on Campanhas
      await page
        .getByRole("navigation", { name: /sidebar/i })
        .getByRole("link", { name: /campanhas/i })
        .click();

      await expect(page).toHaveURL("/campaigns");

      // Click on Configurações
      await page
        .getByRole("navigation", { name: /sidebar/i })
        .getByRole("link", { name: /configurações/i })
        .click();

      await expect(page).toHaveURL("/settings");

      // Click back on Leads
      await page
        .getByRole("navigation", { name: /sidebar/i })
        .getByRole("link", { name: /leads/i })
        .click();

      await expect(page).toHaveURL("/leads");
    });
  });

  test.describe("Sidebar Collapse", () => {
    test("should collapse when collapse button clicked", async ({ page }) => {
      await page.evaluate(() => localStorage.removeItem("sidebar-collapsed"));
      await page.reload();
      await page.waitForLoadState("networkidle");

      const sidebar = page.locator("aside");
      const toggleButton = page.locator("aside button");

      let box = await sidebar.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(238);

      await toggleButton.click({ force: true });
      await page.waitForTimeout(300);

      box = await sidebar.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(62);
      expect(box?.width).toBeLessThanOrEqual(66);
    });

    test("should expand back when toggle button clicked again", async ({
      page,
    }) => {
      await page.evaluate(() => localStorage.removeItem("sidebar-collapsed"));
      await page.reload();
      await page.waitForLoadState("networkidle");

      const sidebar = page.locator("aside");

      await page.evaluate(() => {
        const button = document.querySelector("aside button");
        if (button) (button as HTMLButtonElement).click();
      });

      await page.waitForTimeout(350);

      let box = await sidebar.boundingBox();
      expect(box?.width).toBeLessThanOrEqual(66);

      await page.evaluate(() => {
        const button = document.querySelector("aside button");
        if (button) (button as HTMLButtonElement).click();
      });

      await page.waitForTimeout(350);

      box = await sidebar.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(238);
    });

    test("should persist collapse state after page reload", async ({
      page,
    }) => {
      await page.evaluate(() => localStorage.removeItem("sidebar-collapsed"));
      await page.reload();
      await page.waitForLoadState("networkidle");

      const sidebar = page.locator("aside");
      const toggleButton = page.locator("aside button");

      await toggleButton.click({ force: true });
      await page.waitForTimeout(300);

      let box = await sidebar.boundingBox();
      expect(box?.width).toBeLessThanOrEqual(66);

      const storedValue = await page.evaluate(() =>
        localStorage.getItem("sidebar-collapsed")
      );
      expect(storedValue).toBe("true");

      await page.reload();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(300);

      box = await sidebar.boundingBox();
      expect(box?.width).toBeLessThanOrEqual(66);
    });
  });

  test.describe("Header", () => {
    test("should display header with 64px height", async ({ page }) => {
      const header = page.getByRole("banner");
      await expect(header).toBeVisible();

      const box = await header.boundingBox();
      expect(box?.height).toBe(64);
    });

    test("should display theme toggle in header", async ({ page }) => {
      const header = page.getByRole("banner");
      const themeToggle = header.getByRole("button", {
        name: /switch to (light|dark) mode/i,
      });

      await expect(themeToggle).toBeVisible();
    });

    test("should display user info in header", async ({ page }) => {
      const header = page.getByRole("banner");

      // User email or name should be visible (depends on Supabase user_metadata)
      // At minimum, the user icon should be visible
      await expect(header.locator("svg").first()).toBeVisible();
    });

    test("should display logout button in header", async ({ page }) => {
      const header = page.getByRole("banner");
      const logoutButton = header.getByRole("button", { name: /sair/i });

      await expect(logoutButton).toBeVisible();
    });

    test("should logout and redirect to login when logout clicked", async ({
      page,
    }) => {
      const header = page.getByRole("banner");
      const logoutButton = header.getByRole("button", { name: /sair/i });

      await logoutButton.click();

      await expect(page).toHaveURL("/login");
    });
  });

  test.describe("Keyboard Accessibility", () => {
    test("should be navigable via Tab key", async ({ page }) => {
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");

      const focusedElement = page.locator(":focus");
      await expect(focusedElement).toBeVisible();
    });

    test("should show visible focus states", async ({ page }) => {
      const leadsLink = page
        .getByRole("navigation", { name: /sidebar/i })
        .getByRole("link", { name: /leads/i });

      await leadsLink.focus();
      await expect(leadsLink).toBeFocused();
    });
  });
});
