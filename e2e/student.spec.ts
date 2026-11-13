import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("o aluno retoma o módulo pelo Início e conclui uma etapa", async ({ page }) => {
  await login(page, "student");
  const summary = page.locator(".student-stat-card small").first();
  const before = Number((await summary.textContent())?.match(/^(\d+)/)?.[1]);

  const resume = page.locator(".hd-resume");
  await expect(resume).toBeVisible();
  // A ação principal está na primeira tela, sem rolar.
  expect((await resume.boundingBox())!.y).toBeLessThan(900);
  const moduleTitle = (await resume.locator("b").textContent())!.trim();
  await resume.click();

  await expect(page).toHaveURL(/\/leitor/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(moduleTitle);
  await page.getByRole("button", { name: "Iniciar etapa" }).click();
  // Concluir cedo demais é recusado com um aviso: a etapa exige 20 s de leitura.
  await page.getByRole("button", { name: /Concluir (etapa|módulo)/ }).click();
  await expect(page.getByText(/Leia a etapa com atenção/)).toBeVisible();
  await page.waitForTimeout(21_000);
  await page.getByRole("button", { name: /Concluir (etapa|módulo)/ }).click();
  await expect(page.getByRole("button", { name: /Próxima etapa|Etapa concluída|Módulo concluído/ })).toBeVisible();

  await page.getByRole("link", { name: /Início/ }).or(page.getByRole("button", { name: /Início/ })).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Retome sua formação.");
  await expect(summary).toContainText(`${before + 1} de`);
});

test("o link de pular leva o teclado direto ao conteúdo", async ({ page }) => {
  await login(page, "student");
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Pular para o conteúdo" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(page.locator(".clean-main main")).toBeFocused();
});

test("recarregar uma tela interna mantém a pessoa nela", async ({ page }) => {
  await login(page, "student");
  await page.goto("/biblioteca");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Módulos de");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Módulos de");
});
