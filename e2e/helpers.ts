import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { ACCOUNTS, type Role } from "./env";

/** Entra pela tela de login, como uma pessoa faria, e espera o Início carregar. */
export async function login(page: Page, role: Role) {
  const account = ACCOUNTS[role];
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(account.email);
  await page.getByLabel("Senha", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Chama uma mutation do tRPC com a sessão da página (cookies compartilhados). */
export async function trpcMutation<T = unknown>(request: APIRequestContext, path: string, input: unknown): Promise<T> {
  const response = await request.post(`/api/trpc/${path}`, { data: { json: input } });
  const body = await response.json();
  if (!response.ok()) throw new Error(`${path}: ${response.status()} ${JSON.stringify(body).slice(0, 300)}`);
  return body.result?.data?.json as T;
}

/** Nada pode empurrar a página para os lados. */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "a página rola na horizontal").toBeLessThanOrEqual(0);
}
