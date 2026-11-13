import { expect, test } from "@playwright/test";
import { ACCOUNTS } from "./env";
import { login } from "./helpers";

test("senha errada mostra o erro e mantém a pessoa no login", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(ACCOUNTS.student.email);
  await page.getByLabel("Senha", { exact: true }).fill("senha-errada-123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("sem sessão, uma tela interna leva ao login", async ({ page }) => {
  await page.goto("/estoque");
  await expect(page).toHaveURL(/\/login/);
});

test("cada papel abre o próprio Início e sai da conta", async ({ page }) => {
  for (const [role, heading] of [
    ["student", "Retome sua formação."],
    ["teacher", "Olá, Docente."],
    ["admin", "Olá, Administração."],
  ] as const) {
    await login(page, role);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    await page.getByRole("button", { name: "Sair da conta" }).click();
    await expect(page).toHaveURL(/\/login/);
  }
});

test("aluno não abre o estoque", async ({ page }) => {
  await login(page, "student");
  await page.goto("/estoque");
  await expect(page.getByText(/sem acesso|não tem acesso|acesso restrito/i).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Novo item" })).toHaveCount(0);
});
