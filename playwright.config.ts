import { defineConfig, devices } from '@playwright/test'
import { loadEnvConfig } from '@next/env'

// Carrega .env.local no process do Playwright. Sem isto, TEST_USER_EMAIL/PASSWORD
// ficam undefined e os testes autenticados são SKIPPED em silêncio — o relatório
// fica verde sobre testes que nunca rodaram. Usamos o loader do próprio Next
// (mesma precedência de .env* que a app enxerga) em vez de dotenv.
loadEnvConfig(process.cwd())

export default defineConfig({
  testDir: './__tests__/e2e',
  globalSetup: './__tests__/e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  // Teto por teste. O padrão (30s) não cabe login + navegação quando o dev
  // server está sob carga: o beforeEach sozinho já consumia os 30s e o teste
  // morria em `waitForURL` — sempre num teste diferente, parecendo flakiness.
  timeout: 60_000,
  // O webServer é `next dev`: cada rota compila sob demanda na primeira visita.
  // Com workers em paralelo, várias compilações concorrem e os 5s padrão do
  // expect estouram — falhas intermitentes que não têm a ver com a app.
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
})
