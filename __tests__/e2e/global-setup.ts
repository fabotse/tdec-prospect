import { chromium, expect, type FullConfig } from "@playwright/test";

/**
 * Aquece as rotas antes da suíte rodar.
 *
 * O webServer é `next dev`: cada rota só é compilada na primeira visita, e isso
 * leva vários segundos. Com workers em paralelo, o worker azarado que pega a
 * compilação fria estoura os timeouts — e a falha aparece num teste aleatório,
 * dando a impressão de flakiness de seletor ou de foco.
 *
 * Aqui pagamos esse custo UMA vez, em série, com o servidor ocioso. Depois disso
 * todas as rotas estão quentes e os testes ficam determinísticos.
 *
 * Sem credenciais o warmup é pulado — as rotas protegidas redirecionam para
 * /login e não compilariam de qualquer forma.
 */
async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL ?? "http://localhost:3000";
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;

  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });

  try {
    await page.goto("/login", { timeout: 60_000 });

    if (!email || !password) {
      console.warn(
        "[global-setup] TEST_USER_EMAIL/PASSWORD ausentes — warmup das rotas autenticadas pulado."
      );
      return;
    }

    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/senha/i).fill(password);

    // Mesmo retry do beforeEach: clique anterior à hidratação se perde.
    await expect(async () => {
      await page.getByRole("button", { name: /entrar/i }).click();
      await page.waitForURL("/leads", { timeout: 15_000 });
    }).toPass({ timeout: 60_000 });

    // Rotas visitadas pela suíte de navegação.
    for (const route of ["/campaigns", "/settings", "/leads"]) {
      await page.goto(route, { timeout: 60_000 });
    }
  } finally {
    await browser.close();
  }
}

export default globalSetup;
