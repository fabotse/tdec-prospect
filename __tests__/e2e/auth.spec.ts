import { test, expect } from "@playwright/test";

test.describe("Authentication Redirect", () => {
  test("should redirect unauthenticated user from /leads to /login", async ({
    page,
  }) => {
    await page.goto("/leads");
    await expect(page).toHaveURL("/login");
  });

  test("should redirect unauthenticated user from /campaigns to /login", async ({
    page,
  }) => {
    await page.goto("/campaigns");
    await expect(page).toHaveURL("/login");
  });

  test("should redirect unauthenticated user from /settings to /login", async ({
    page,
  }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL("/login");
  });

  test("should allow access to /login without authentication", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(page).toHaveURL("/login");
  });
});

test.describe("Login Page", () => {
  test("should display login form with email and password fields", async ({
    page,
  }) => {
    await page.goto("/login");

    await expect(
      page.getByRole("heading", { name: /TDEC Prospect/i })
    ).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/senha/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /entrar/i })).toBeVisible();
  });

  test("should show validation errors for empty form submission", async ({
    page,
  }) => {
    await page.goto("/login");

    await page.getByRole("button", { name: /entrar/i }).click();

    // Form should show validation errors (zod validation)
    await expect(page.getByText(/email inválido/i)).toBeVisible();
  });

  test("should have email input with type email for browser validation", async ({
    page,
  }) => {
    await page.goto("/login");

    // The email input uses type="email" for native browser validation
    const emailInput = page.getByLabel(/email/i);
    await expect(emailInput).toHaveAttribute("type", "email");

    // Browser will show native validation tooltip for invalid format
    // This is handled by HTML5 validation, not zod
  });

  test("should show validation error for short password", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel(/email/i).fill("test@example.com");
    await page.getByLabel(/senha/i).fill("12345");
    await page.getByRole("button", { name: /entrar/i }).click();

    await expect(
      page.getByText(/senha deve ter no mínimo 6 caracteres/i)
    ).toBeVisible();
  });

  test("should show loading state during form submission", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel(/email/i).fill("test@example.com");
    await page.getByLabel(/senha/i).fill("password123");

    // Click submit and check for loading state
    const submitButton = page.getByRole("button", { name: /entrar/i });
    await submitButton.click();

    // Button should show "Entrando..." text during submission
    await expect(page.getByRole("button", { name: /entrando/i })).toBeVisible();
  });

  test("should show error message for invalid credentials", async ({
    page,
  }) => {
    await page.goto("/login");

    await page.getByLabel(/email/i).fill("invalid@example.com");
    await page.getByLabel(/senha/i).fill("wrongpassword");
    await page.getByRole("button", { name: /entrar/i }).click();

    // Wait for error message (Supabase will return error)
    await expect(
      page
        .getByRole("alert")
        .getByText(/email ou senha incorretos|erro de conexão/i)
    ).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Login Form Accessibility", () => {
  test("should have proper form labels and aria attributes", async ({
    page,
  }) => {
    await page.goto("/login");

    const emailInput = page.getByLabel(/email/i);
    const passwordInput = page.getByLabel(/senha/i);

    await expect(emailInput).toHaveAttribute("type", "email");
    await expect(passwordInput).toHaveAttribute("type", "password");
    await expect(emailInput).toHaveAttribute("autocomplete", "email");
    await expect(passwordInput).toHaveAttribute(
      "autocomplete",
      "current-password"
    );
  });
});
