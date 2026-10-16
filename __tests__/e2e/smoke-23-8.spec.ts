import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Smoke da story 23.8 (ESG fora do motor + badge "Possível abertura automática").
 *
 * O `.env.local` aponta para PRODUÇÃO: a trava bloqueia toda requisição que não
 * seja GET/HEAD/OPTIONS (exceto o login do Supabase). O teste só abre a Central
 * e lê a API — nunca clica num card (o clique faz PATCH new→viewed).
 *
 * Uso: com um servidor de pé, rode
 *   SMOKE_BASE_URL=http://localhost:3100 SMOKE_OUT=/tmp/x npx playwright test smoke-23-8
 */

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const OUT = process.env.SMOKE_OUT;
const EMAIL = process.env.TEST_USER_EMAIL;
const PASSWORD = process.env.TEST_USER_PASSWORD;

test.use({ baseURL: BASE_URL });

interface OpportunityDto {
  id: string;
  source: "reply" | "engagement";
  possibleAutoOpen: boolean;
  securityGateway: string | null;
}

test.describe("Smoke 23.8 — Central de Oportunidades (somente leitura)", () => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_EMAIL/PASSWORD ausentes");

  test("marcação só em engajamento com ESG, sem gravar nada", async ({ page }) => {
    if (OUT) fs.mkdirSync(OUT, { recursive: true });
    const blockedWrites: string[] = [];
    const pageErrors: string[] = [];
    await page.route("**/*", (route) => {
      const req = route.request();
      const isRead = ["GET", "HEAD", "OPTIONS"].includes(req.method());
      if (isRead || /\/auth\/v1\/(token|user|logout)/.test(req.url())) return route.continue();
      blockedWrites.push(`${req.method()} ${req.url().replace(BASE_URL, "")}`);
      return route.abort("blockedbyclient");
    });
    page.on("pageerror", (err) => pageErrors.push(err.message.slice(0, 300)));

    await page.goto("/login");
    await page.getByLabel(/email/i).fill(EMAIL!);
    await page.getByLabel(/senha/i).fill(PASSWORD!);
    await expect(async () => {
      await page.getByRole("button", { name: /entrar/i }).click();
      await page.waitForURL("**/leads", { timeout: 15_000 });
    }).toPass({ timeout: 60_000 });

    // API: todas as oportunidades (até 100 por página).
    const all: OpportunityDto[] = [];
    for (let p = 1; p <= 10; p++) {
      const res = await page.request.get(`/api/opportunities?per_page=100&page=${p}`);
      expect(res.status()).toBe(200);
      const json = (await res.json()) as { data: OpportunityDto[]; meta: { totalPages: number } };
      all.push(...json.data);
      if (p >= json.meta.totalPages) break;
    }
    const flagged = all.filter((o) => o.possibleAutoOpen);
    expect(all.filter((o) => o.source === "reply" && o.possibleAutoOpen)).toEqual([]);
    expect(flagged.every((o) => o.source === "engagement" && !!o.securityGateway)).toBe(true);

    // Tela com a lista reescrita para per_page=100: o número de badges bate com
    // os `possibleAutoOpen` da MESMA resposta que a tela renderizou.
    await page.route("**/api/opportunities?*", (route) => {
      const url = new URL(route.request().url());
      url.searchParams.set("per_page", "100");
      return route.continue({ url: url.toString() });
    });
    const rerouted = page.waitForResponse(
      (r) =>
        r.request().method() === "GET" &&
        r.url().includes("/api/opportunities?") &&
        new URL(r.url()).searchParams.get("per_page") === "100"
    );
    await page.goto("/opportunities");
    const screenJson = (await (await rerouted).json()) as { data: OpportunityDto[] };
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.getByTestId("opportunity-card").first().waitFor({ state: "visible" });
    const expectedOnScreen = screenJson.data.filter((o) => o.possibleAutoOpen).length;
    const badges = page.getByTestId("opportunity-auto-open-badge");
    await expect(badges).toHaveCount(expectedOnScreen);
    if (OUT && expectedOnScreen > 0) {
      const card = page.getByTestId("opportunity-card").filter({ has: badges.first() });
      await card.scrollIntoViewIfNeeded();
      await card.screenshot({ path: path.join(OUT, "auto-open-card.png") });
      fs.writeFileSync(
        path.join(OUT, "auto-open-title.txt"),
        (await badges.first().getAttribute("title")) ?? ""
      );
    }

    const summary = {
      total: all.length,
      engagement: all.filter((o) => o.source === "engagement").length,
      flagged: flagged.map((o) => ({ id: o.id, gateway: o.securityGateway })),
      flaggedOnScreen: expectedOnScreen,
      blockedWrites,
      pageErrors,
    };
    console.log("[smoke-23-8]", JSON.stringify(summary));
    if (OUT) {
      await page.screenshot({ path: path.join(OUT, "opportunities.png"), fullPage: true });
      fs.writeFileSync(path.join(OUT, "opportunities.json"), JSON.stringify(summary, null, 2));
    }
    expect(blockedWrites).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
