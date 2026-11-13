import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("o docente cria um módulo e ele aparece na biblioteca", async ({ page }) => {
  const title = `Módulo E2E ${Date.now()}`;
  await login(page, "teacher");
  await page.getByRole("button", { name: "Novo módulo" }).click();
  await expect(page).toHaveURL(/\/editor/);
  await page.getByPlaceholder("Ex.: Ajuste e acabamento").fill(title);
  await page.locator("#module-kind-input").fill("Segurança");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText(/Módulo salvo/)).toBeVisible();

  await page.goto("/biblioteca");
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
});

test("o docente reserva, entrega e recebe de volta uma ferramenta", async ({ page }) => {
  const borrower = `Bancada E2E ${Date.now()}`;
  await login(page, "teacher");
  await page.goto("/estoque");
  await page.getByRole("button", { name: "Emprestar", exact: true }).click();

  const dialog = page.getByRole("dialog");
  const tool = dialog.getByLabel(/Ferramenta/);
  const firstAvailable = await tool.locator("option:not([disabled]):not([value=''])").first().getAttribute("value");
  await tool.selectOption(firstAvailable!);
  await dialog.getByLabel(/Quantidade/).fill("1");
  await dialog.getByText("Turma / outra pessoa").click();
  await dialog.getByLabel(/Nome da turma ou pessoa/).fill(borrower);
  await dialog.getByLabel(/Finalidade/).fill("teste automático do fluxo de empréstimo");
  await dialog.getByRole("button", { name: "Reservar" }).click();
  await expect(dialog).toBeHidden();

  await page.goto("/estoque/emprestimos");
  const row = page.getByRole("row").filter({ hasText: borrower });
  await row.getByRole("button", { name: "Confirmar retirada" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Confirmar|Registrar|Entregar/ }).last().click();
  await expect(row.getByRole("button", { name: "Registrar devolução" })).toBeVisible();

  await row.getByRole("button", { name: "Registrar devolução" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Registrar|Confirmar/ }).last().click();
  await expect(row.getByRole("button", { name: "Registrar devolução" })).toHaveCount(0);
});
