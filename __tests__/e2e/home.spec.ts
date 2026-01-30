import { test, expect } from "@playwright/test";

test.describe("Home Page Redirect (Unauthenticated)", () => {
  test("should redirect from root to /login when unauthenticated", async ({
    page,
  }) => {
    await page.goto("/");
    // With auth middleware, unauthenticated users are redirected to /login
    await expect(page).toHaveURL("/login");
  });

  test("should load login page with correct title", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveTitle(/TDEC Prospect/);
  });
});

test.describe("Theme System on Login Page", () => {
  test("should have dark background by default", async ({ page }) => {
    await page.goto("/login");
    await page.evaluate(() => localStorage.removeItem("theme"));
    await page.reload();
    await page.waitForLoadState("networkidle");

    // The html element should have dark class by default
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("should persist theme preference after reload", async ({ page }) => {
    await page.goto("/login");
    await page.evaluate(() => localStorage.setItem("theme", "light"));
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Theme should be light after reload
    await expect(page.locator("html")).toHaveClass(/light/);
  });
});
