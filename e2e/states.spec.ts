import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, login, trpcMutation } from "./helpers";

const STUDENTS = 30;
const ITEMS = 200;

test("telas aguentam uma turma cheia e um estoque grande", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page, "admin");
  const classrooms = await page.request.get("/api/trpc/admin.classrooms.list").then(r => r.json());
  const classroomId = classrooms.result.data.json[0]?.id ?? null;
  for (let i = 1; i <= STUDENTS; i++) {
    await trpcMutation(page.request, "admin.users.create", {
      name: `Aluna Volume ${String(i).padStart(2, "0")} com um nome bem comprido para testar quebras`,
      email: `volume.${i}@forgelab.local`,
      role: "student",
      password: "volume-e2e-123",
      classroomId,
    });
  }
  for (let i = 1; i <= ITEMS; i++) {
    await trpcMutation(page.request, "inventory.items.create", {
      code: `VOL-${String(i).padStart(3, "0")}`,
      name: `Item de volume ${i} — micrômetro externo 0-25 mm com descrição longa`,
      itemType: i % 4 === 0 ? "material" : "tool",
      categoryId: null,
      unit: "UN",
      returnable: i % 4 !== 0,
      minQuantity: 2,
      sector: "Ferramentaria",
      location: `Armário ${Math.ceil(i / 20)} · gaveta ${i % 20}`,
      conservation: "bom",
      status: "disponivel",
      initialQuantity: i % 7,
      initialReason: "inventario",
      requestKey: `volume-item-${i}-${Date.now()}`,
    });
  }

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
    for (const path of ["/admin/usuarios", "/admin/turmas", "/admin/estoque"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoHorizontalScroll(page);
    }
    await expect(page.getByText(/Aluna Volume/).first()).toHaveCount(0); // supervisão não lista contas
    await page.goto("/admin/usuarios");
    await expect(page.getByText("volume.30@forgelab.local")).toBeVisible();
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Sair da conta" }).click();
  await login(page, "teacher");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
    for (const path of ["/", "/estoque", "/estoque/painel"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoHorizontalScroll(page);
    }
  }
  // A fileira de indicadores termina na mesma linha do painel de prioridades, qualquer que seja o texto.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const summary = await page.locator(".td-summary").boundingBox();
  const priorities = await page.locator(".td-todo").boundingBox();
  expect(Math.round(summary!.x + summary!.width)).toBe(Math.round(priorities!.x + priorities!.width));

  await page.goto("/estoque");
  await page.getByPlaceholder("Buscar por código, SAP, nome ou local").fill("VOL-150");
  await expect(page.getByText("Item de volume 150", { exact: false })).toBeVisible();
});

test("uma conta nova de aluno vê estados vazios que explicam o próximo passo", async ({ page }) => {
  await login(page, "admin");
  const email = `vazio.${Date.now()}@forgelab.local`;
  await trpcMutation(page.request, "admin.users.create", { name: "Aluno Sem Turma", email, role: "student", password: "vazio-e2e-123", classroomId: null });
  await page.getByRole("button", { name: "Sair da conta" }).click();

  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill("vazio-e2e-123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Retome sua formação.");
  await expect(page.locator(".hd-resume")).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("falha do servidor vira mensagem com saída, não tela quebrada", async ({ page }) => {
  await login(page, "student");
  // As consultas saem em lote (/api/trpc/a,b?batch=1): o filtro olha a URL inteira.
  const failCatalog = (url: URL) => url.pathname.includes("learning.catalog");
  await page.route(failCatalog, route => route.fulfill({ status: 500, body: "{}" }));
  await page.reload();
  await expect(page.getByRole("button", { name: /Tentar novamente|Recarregar/ })).toBeVisible({ timeout: 30_000 });
  await page.unroute(failCatalog);
  await page.getByRole("button", { name: /Tentar novamente|Recarregar/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Retome sua formação.");
});

test("estoque mostra erro e permite tentar de novo", async ({ page }) => {
  await login(page, "teacher");
  await page.route(url => url.pathname.includes("inventory.items.list"), route => route.fulfill({ status: 500, body: "{}" }));
  await page.goto("/estoque");
  await expect(page.getByRole("button", { name: /Tentar novamente|Recarregar/ }).first()).toBeVisible({ timeout: 20_000 });
});
