import { test, expect, type Page, type Request } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Smoke da story 23.2 (next 16.1.6 → 16.4.1, xlsx → read-excel-file).
 *
 * O `.env.local` aponta para PRODUÇÃO. Por isso a trava `guardWrites` bloqueia
 * toda requisição que não seja GET/HEAD/OPTIONS (exceto o login do Supabase) e
 * registra o que bloqueou: abrir uma tela nunca grava nada.
 *
 * Uso: com um servidor já de pé (`next start`), rode
 *   SMOKE_BASE_URL=http://localhost:3000 SMOKE_OUT=/tmp/x npx playwright test smoke-23-2
 * SMOKE_OUT recebe um JSON por tela + screenshots, para comparar duas versões.
 */

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const OUT = process.env.SMOKE_OUT;
const EMAIL = process.env.TEST_USER_EMAIL;
const PASSWORD = process.env.TEST_USER_PASSWORD;

test.use({ baseURL: BASE_URL });

type Report = {
  page: string;
  url: string;
  errorBoundary: boolean;
  consoleErrors: string[];
  pageErrors: string[];
  badResponses: string[];
  blockedWrites: string[];
};

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Server Actions chegam como POST na URL da página. As de leitura (get*/is*)
// são liberadas pelo ID, que muda a cada build: SMOKE_READ_ACTIONS traz os IDs
// lidos de `.next/server/server-reference-manifest.json` do build testado.
const READ_ACTIONS = new Set(
  (process.env.SMOKE_READ_ACTIONS ?? "").split(",").filter(Boolean)
);

function isAllowedWrite(req: Request, allow: RegExp[]): boolean {
  const url = req.url();
  if (/\/auth\/v1\/(token|user|logout)/.test(url)) return true;
  const actionId = req.headers()["next-action"];
  if (actionId && READ_ACTIONS.has(actionId)) return true;
  return allow.some((re) => re.test(url));
}

async function guardWrites(page: Page, report: Report, allow: RegExp[] = []) {
  await page.route("**/*", (route) => {
    const req = route.request();
    if (READ_METHODS.has(req.method()) || isAllowedWrite(req, allow)) {
      return route.continue();
    }
    const action = req.headers()["next-action"];
    report.blockedWrites.push(
      `${req.method()} ${req.url().replace(BASE_URL, "")}${action ? ` [action ${action.slice(0, 12)}]` : ""}`
    );
    return route.abort("blockedbyclient");
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") report.consoleErrors.push(msg.text().slice(0, 300));
  });
  page.on("pageerror", (err) => report.pageErrors.push(err.message.slice(0, 300)));
  page.on("response", (res) => {
    if (res.status() >= 400) {
      report.badResponses.push(
        `${res.status()} ${res.request().method()} ${res.url().replace(BASE_URL, "")}`
      );
    }
  });
}

function newReport(name: string): Report {
  return {
    page: name,
    url: "",
    errorBoundary: false,
    consoleErrors: [],
    pageErrors: [],
    badResponses: [],
    blockedWrites: [],
  };
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(EMAIL!);
  await page.getByLabel(/senha/i).fill(PASSWORD!);
  await expect(async () => {
    await page.getByRole("button", { name: /entrar/i }).click();
    await page.waitForURL("**/leads", { timeout: 15_000 });
  }).toPass({ timeout: 60_000 });
}

async function save(page: Page, report: Report) {
  report.url = page.url().replace(BASE_URL, "");
  report.errorBoundary = await page
    .getByText(/something went wrong|algo deu errado/i)
    .isVisible()
    .catch(() => false);
  if (!OUT) return;
  fs.mkdirSync(OUT, { recursive: true });
  const slug = report.page.replace(/[^a-z0-9]+/gi, "-");
  await page.screenshot({ path: path.join(OUT, `${slug}.png`), fullPage: true });
  fs.writeFileSync(path.join(OUT, `${slug}.json`), JSON.stringify(report, null, 2));
}

const PAGES: Array<[string, string]> = [
  ["leads", "/leads"],
  ["my-leads", "/leads/my-leads"],
  ["campaigns", "/campaigns"],
  ["agent", "/agent"],
  ["opportunities", "/opportunities"],
  ["insights", "/insights"],
  ["technographic", "/technographic"],
  ["settings", "/settings"],
  ["settings-integrations", "/settings/integrations"],
  ["settings-knowledge-base", "/settings/knowledge-base"],
  ["settings-products", "/settings/products"],
  ["settings-team", "/settings/team"],
  ["settings-usage", "/settings/usage"],
  ["settings-monitoring", "/settings/monitoring"],
  ["settings-notifications", "/settings/notifications"],
];

test.describe("Smoke 23.2 — telas logadas (somente leitura)", () => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_EMAIL/PASSWORD ausentes");

  for (const [name, route] of PAGES) {
    test(`tela ${name}`, async ({ page }) => {
      await login(page);
      const report = newReport(name);
      await guardWrites(page, report);
      await page.goto(route);
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.locator("main").first().waitFor({ state: "visible" });
      await save(page, report);
      expect(report.errorBoundary, "tela de erro").toBe(false);
      expect(report.pageErrors, "exceções não tratadas").toEqual([]);
    });
  }

  test("campanha: editor, analytics e diálogo de export (sem exportar)", async ({ page }) => {
    await login(page);
    const report = newReport("campaign-detail");
    await guardWrites(page, report);
    await page.goto("/campaigns");
    await page.waitForLoadState("networkidle").catch(() => {});

    // O card navega via router.push; o primeiro card leva ao editor.
    const card = page.locator("main [role='button']").filter({ has: page.locator("h3") }).first();
    await card.locator("h3").click();
    await page.waitForURL(/\/campaigns\/[0-9a-f-]{36}\/edit/, { timeout: 30_000 });
    const campaignId = page.url().match(/campaigns\/([0-9a-f-]{36})/)![1];
    // Editor carregado = header do builder com o botão de export.
    const exportBtn = page.getByRole("button", { name: "Exportar campanha" });
    const editorReady = await exportBtn
      .waitFor({ state: "visible", timeout: 45_000 })
      .then(() => true, () => false);
    await page.waitForLoadState("networkidle").catch(() => {});
    await save(page, { ...report, page: "campaign-edit" });

    // Diálogo de export: abre e fecha, nunca confirma.
    if (editorReady) {
      await exportBtn.click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor({ state: "visible" });
      await page.waitForLoadState("networkidle").catch(() => {});
      await save(page, { ...report, page: "campaign-export-dialog" });
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
    } else {
      report.consoleErrors.push("[smoke] botão Exportar não encontrado no editor");
    }

    await page.goto(`/campaigns/${campaignId}/analytics`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await save(page, report);
    report.page = "campaign-analytics";
    await save(page, report);
    expect(editorReady, "editor da campanha carregou").toBe(true);
    expect(report.errorBoundary, "tela de erro").toBe(false);
    expect(report.pageErrors, "exceções não tratadas").toEqual([]);
  });
});

test.describe("Smoke 23.2 — import de .xlsx até o mapeamento (sem importar)", () => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_EMAIL/PASSWORD ausentes");

  // SMOKE_XLSX aponta para a planilha a testar; o padrão é a fixture do repo.
  const XLSX_FILE =
    process.env.SMOKE_XLSX ?? path.join(__dirname, "../fixtures/import-leads.xlsx");

  test("upload, mapeamento automático e preview", async ({ page }) => {
    await login(page);
    const report = newReport("import-xlsx-mapping");
    await guardWrites(page, report);
    await page.goto("/leads/my-leads");
    await page.getByRole("button", { name: /importar csv/i }).click();

    const dialog = page.getByRole("dialog", { name: /importar leads/i });
    await dialog.getByTestId("file-input").setInputFiles(XLSX_FILE);
    await expect(dialog.getByText("Mapeamento de colunas")).toBeVisible();
    await save(page, report);

    // O preview mostra o que vai virar lead: guardamos o texto para o relatório.
    const preview = (await dialog.innerText()).split("\n").filter(Boolean);
    if (OUT) {
      fs.writeFileSync(path.join(OUT, "import-xlsx-preview.txt"), preview.join("\n"));
    }

    // Nunca avança para "segment"/"import": fecha o diálogo aqui.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    expect(report.pageErrors, "exceções não tratadas").toEqual([]);
    expect(report.blockedWrites, "nenhuma escrita tentada").toEqual([]);
  });
});

test.describe("Smoke 23.2 — busca de leads no Apollo (1 busca)", () => {
  // Faz UMA chamada real ao Apollo (/v1/mixed_people/api_search). Só roda com
  // SMOKE_APOLLO=1, para não consumir a API sem querer em execuções comuns.
  test.skip(!EMAIL || !PASSWORD || process.env.SMOKE_APOLLO !== "1", "SMOKE_APOLLO=1 ausente");

  test("busca por cargo + local retorna resultados", async ({ page }) => {
    await login(page);
    const report = newReport("apollo-search");
    await guardWrites(page, report, [/\/api\/integrations\/apollo$/]);
    await page.goto("/leads");

    const panel = page.getByTestId("filter-panel");
    if (!(await panel.isVisible().catch(() => false))) {
      await page.getByTestId("filter-toggle-button").click();
    }
    await page.getByTestId("title-input").fill("CEO");
    await page.getByTestId("location-input").fill("São Paulo, Brasil");
    // Os inputs sincronizam com o store após DEBOUNCE_DELAY_MS (300ms); clicar
    // antes disso dispara a busca sem filtros (e o Apollo devolve a base inteira).
    await page.waitForTimeout(600);

    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().endsWith("/api/integrations/apollo") && r.request().method() === "POST",
        { timeout: 60_000 }
      ),
      page.getByTestId("search-button").click(),
    ]);
    const body = await response.json();
    const sent = response.request().postDataJSON() ?? {};
    expect(JSON.stringify(sent), "filtros enviados ao Apollo").toContain("CEO");
    report.consoleErrors.push(
      `[smoke] apollo status=${response.status()} leads=${body?.data?.length ?? "?"} total=${body?.meta?.total ?? "?"}`
    );
    await page.waitForLoadState("networkidle").catch(() => {});
    await save(page, report);

    expect(response.status()).toBe(200);
    expect(body?.data?.length ?? 0).toBeGreaterThan(0);
    expect(report.pageErrors, "exceções não tratadas").toEqual([]);
  });
});
