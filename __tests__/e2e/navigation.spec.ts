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

/**
 * Espera o AppShell/Sidebar chegarem ao estado final. São DOIS re-renders
 * assíncronos, e pular qualquer um deles deixa os testes de foco intermitentes:
 *
 * 1. Hidratação — a `transition` do <aside> é "none" até `isHydrated` virar
 *    true, quando passa a 200ms (Sidebar.tsx:443). `networkidle` não serve como
 *    sinal: o websocket de HMR do dev server mantém tráfego e o evento dispara
 *    antes do React hidratar.
 * 2. Perfil do usuário — `visibleNavItems` depende de
 *    `isAdmin && !isLoading && !isProfileLoading` (Sidebar.tsx:108), vindo de uma
 *    query. Os itens adminOnly só entram depois que o perfil carrega, e essa
 *    remontagem da lista rouba o foco. Sob workers em paralelo o fetch demora
 *    mais — por isso a falha só aparecia em paralelo.
 */
async function waitForShellHydrated(page: import("@playwright/test").Page) {
  await page.locator("aside").waitFor({ state: "visible" });
  await expect
    .poll(
      async () =>
        page
          .locator("aside")
          .evaluate((el) => getComputedStyle(el).transitionDuration),
      { timeout: 15_000 }
    )
    .not.toBe("0s");

  // Item adminOnly visível = perfil resolvido = lista do nav final.
  // (O usuário de teste é admin — ver docs/client/credentials.md.)
  await expect(
    page
      .getByRole("navigation", { name: /sidebar/i })
      .getByRole("link", { name: /configurações/i })
  ).toBeVisible();
}

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

    // O clique é retentado até a navegação acontecer.
    //
    // Motivo: o fill/click atuam no DOM, que existe antes do React hidratar. Se
    // o clique chega antes do onSubmit ser ligado, ele simplesmente se perde —
    // sem erro, sem spinner, o form fica preenchido e parado. Sob carga a
    // hidratação de /login atrasa e era exatamente isso que acontecia; aumentar
    // o timeout não resolve, porque não há navegação pendente para esperar.
    await expect(async () => {
      await page.getByRole("button", { name: /entrar/i }).click();
      await page.waitForURL("/leads", { timeout: 15_000 });
    }).toPass({ timeout: 60_000 });

    await waitForShellHydrated(page);
  });

  test.describe("Sidebar", () => {
    test("should display sidebar with approximately 240px width", async ({
      page,
    }) => {
      await page.evaluate(() => localStorage.removeItem("sidebar-collapsed"));
      await page.reload();
      await waitForShellHydrated(page);

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

      // "Leads" é um grupo expansível (button aria-haspopup), não um link.
      await expect(
        nav.getByRole("button", { name: "Leads", exact: true })
      ).toBeVisible();
      await expect(nav.getByRole("link", { name: /campanhas/i })).toBeVisible();
      await expect(
        nav.getByRole("link", { name: /configurações/i })
      ).toBeVisible();
    });

    test("should highlight active route with left border and background", async ({
      page,
    }) => {
      // Em /leads o item ativo é o grupo "Leads" (button), que recebe a borda.
      const activeItem = page
        .getByRole("navigation", { name: /sidebar/i })
        .getByRole("button", { name: "Leads", exact: true });

      await expect(activeItem).toBeVisible();
      await expect(activeItem).toHaveCSS("border-left-width", "3px");
    });

    test("should navigate between pages when clicking nav items", async ({
      page,
    }) => {
      const nav = page.getByRole("navigation", { name: /sidebar/i });

      // Click on Campanhas
      await nav.getByRole("link", { name: /campanhas/i }).click();

      await expect(page).toHaveURL("/campaigns");

      // Click on Configurações
      await nav.getByRole("link", { name: /configurações/i }).click();

      await expect(page).toHaveURL("/settings");

      // Voltar para Leads: o grupo só expande; quem navega é o subitem "Buscar"
      // (role=menuitem, href=/leads).
      const leadsGroup = nav.getByRole("button", { name: "Leads", exact: true });
      if ((await leadsGroup.getAttribute("aria-expanded")) !== "true") {
        await leadsGroup.click();
      }
      await nav.getByRole("menuitem", { name: /buscar/i }).click();

      await expect(page).toHaveURL("/leads");
    });
  });

  test.describe("Sidebar Collapse", () => {
    // O <aside> tem mais de um button (grupos expansíveis do menu + este).
    // Ancorar no aria-label próprio, que cobre os dois estados.
    const collapseToggle = (page: import("@playwright/test").Page) =>
      page.getByRole("button", { name: /(recolher|expandir) sidebar/i });

    test("should collapse when collapse button clicked", async ({ page }) => {
      await page.evaluate(() => localStorage.removeItem("sidebar-collapsed"));
      await page.reload();
      await waitForShellHydrated(page);

      const sidebar = page.locator("aside");
      const toggleButton = collapseToggle(page);

      let box = await sidebar.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(238);

      await toggleButton.click({ force: true });

      // Wait for animation to complete by checking sidebar width
      await expect.poll(async () => {
        const b = await sidebar.boundingBox();
        return b?.width ?? 0;
      }, { timeout: 2000 }).toBeLessThanOrEqual(66);

      box = await sidebar.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(62);
      expect(box?.width).toBeLessThanOrEqual(66);
    });

    test("should expand back when toggle button clicked again", async ({
      page,
    }) => {
      await page.evaluate(() => localStorage.removeItem("sidebar-collapsed"));
      await page.reload();
      await waitForShellHydrated(page);

      const sidebar = page.locator("aside");

      await collapseToggle(page).click({ force: true });

      // Wait for collapse animation
      await expect.poll(async () => {
        const b = await sidebar.boundingBox();
        return b?.width ?? 999;
      }, { timeout: 2000 }).toBeLessThanOrEqual(66);

      let box = await sidebar.boundingBox();
      expect(box?.width).toBeLessThanOrEqual(66);

      // Com a sidebar recolhida (64px) o badge do Next.js devtools fica sobre o
      // botão; um click por coordenada acerta o overlay. dispatchEvent vai no
      // elemento real, sem hit-testing.
      await collapseToggle(page).dispatchEvent("click");

      // Wait for expand animation
      await expect.poll(async () => {
        const b = await sidebar.boundingBox();
        return b?.width ?? 0;
      }, { timeout: 2000 }).toBeGreaterThanOrEqual(238);

      box = await sidebar.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(238);
    });

    test("should persist collapse state after page reload", async ({
      page,
    }) => {
      await page.evaluate(() => localStorage.removeItem("sidebar-collapsed"));
      await page.reload();
      await waitForShellHydrated(page);

      const sidebar = page.locator("aside");
      const toggleButton = collapseToggle(page);

      await toggleButton.click({ force: true });

      // Wait for collapse animation
      await expect.poll(async () => {
        const b = await sidebar.boundingBox();
        return b?.width ?? 999;
      }, { timeout: 2000 }).toBeLessThanOrEqual(66);

      let box = await sidebar.boundingBox();
      expect(box?.width).toBeLessThanOrEqual(66);

      const storedValue = await page.evaluate(() =>
        localStorage.getItem("sidebar-collapsed")
      );
      expect(storedValue).toBe("true");

      await page.reload();
      await waitForShellHydrated(page);

      // Wait for sidebar to render in collapsed state
      await expect.poll(async () => {
        const b = await sidebar.boundingBox();
        return b?.width ?? 999;
      }, { timeout: 2000 }).toBeLessThanOrEqual(66);

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
      const leadsItem = page
        .getByRole("navigation", { name: /sidebar/i })
        .getByRole("button", { name: "Leads", exact: true });

      await expect(leadsItem).toBeVisible();
      await leadsItem.focus();
      await expect(leadsItem).toBeFocused();
    });
  });
});
