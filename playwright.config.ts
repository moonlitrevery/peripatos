import { defineConfig, devices } from "@playwright/test";

// Testes de ponta a ponta contra o Supabase LOCAL (`supabase start`).
// O global-setup recria o banco (migrations + seed) antes de cada execução,
// então os testes sempre partem das mesmas oito contas do seed.
//
// Um worker só e arquivos em ordem: os testes dividem o mesmo banco e alguns
// mudam o estado que outros leem (seguir, bloquear).

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    // O service worker só serve a página offline; fora do caminho, as rotas
    // interceptadas nos testes (Giphy) ficam previsíveis.
    serviceWorkers: "block",
  },
  // O app é mobile-first: os fluxos críticos rodam num celular.
  projects: [{ name: "celular", use: { ...devices["Pixel 7"] } }],
  webServer: {
    // Build de produção: é o que vai para o ar, e não recompila no meio do teste.
    command: "next build && next start --port 3000",
    url: `${baseURL}/entrar`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
