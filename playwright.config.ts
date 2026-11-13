/**
 * Testes de navegador (pnpm test:e2e). Sobem um servidor próprio na porta 3920,
 * com banco e uploads em e2e/.tmp, recriados a cada execução: o banco de
 * desenvolvimento (data/) nunca é tocado.
 */
import { defineConfig } from "@playwright/test";
import { E2E_ENV, E2E_PORT } from "./e2e/env";

const ci = Boolean(process.env.CI);

export default defineConfig({
  testDir: "e2e",
  // Os testes compartilham um banco: em série, cada um vê o estado deixado pelo anterior.
  workers: 1,
  fullyParallel: false,
  retries: ci ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: ci ? [["github"], ["html", { open: "never" }]] : [["list"]],
  outputDir: "e2e/.tmp/results",
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    // Localmente usa o Chrome instalado; no CI, o Chromium baixado pelo Playwright.
    channel: ci ? undefined : "chrome",
    viewport: { width: 1440, height: 900 },
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm exec tsx e2e/prepare.ts && node --import tsx server/_core/index.ts",
    url: `http://localhost:${E2E_PORT}/login`,
    env: E2E_ENV,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
