import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Role } from "./env";
import { expectNoHorizontalScroll, login } from "./helpers";

/** Telas de cada papel; o leitor e o editor dependem de um módulo aberto e ficam nos testes de fluxo. */
const SCREENS: Record<Role, string[]> = {
  student: ["/", "/biblioteca", "/anotacoes"],
  teacher: ["/", "/biblioteca", "/estoque", "/estoque/emprestimos", "/estoque/painel"],
  admin: ["/", "/admin/usuarios", "/admin/turmas", "/admin/estoque"],
};

for (const theme of ["light", "dark"] as const) {
  for (const role of Object.keys(SCREENS) as Role[]) {
    test(`acessibilidade: ${role}, tema ${theme === "light" ? "claro" : "escuro"}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await login(page, role);
      const problems: string[] = [];
      for (const path of SCREENS[role]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await page.waitForLoadState("networkidle");
        const { violations } = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();
        for (const v of violations.filter(v => v.impact === "serious" || v.impact === "critical")) {
          // O alvo e a mensagem do axe (no contraste, ela traz as cores e a razão medida).
          const nodes = v.nodes.slice(0, 3).map(n => `${n.target.join(" ")} (${n.any[0]?.message ?? n.failureSummary ?? ""})`);
          problems.push(`${path} ${v.id}: ${nodes.join(" | ")}`);
        }
      }
      expect(problems, problems.join("\n")).toEqual([]);
    });
  }
}

test.describe("celular", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  for (const role of Object.keys(SCREENS) as Role[]) {
    test(`nada rola para os lados: ${role}`, async ({ page }) => {
      await login(page, role);
      for (const path of SCREENS[role]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expectNoHorizontalScroll(page);
      }
    });
  }
});
