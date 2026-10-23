import { describe, expect, it } from "vitest";
import { nextThemePreference, resolveThemePreference } from "@shared/theme";

describe("preferência de tema", () => {
  it("aceita apenas temas válidos e usa fallback para valores inválidos", () => {
    expect(resolveThemePreference("dark")).toBe("dark");
    expect(resolveThemePreference("light")).toBe("light");
    expect(resolveThemePreference("sepia")).toBe("light");
    expect(resolveThemePreference(null, "dark")).toBe("dark");
  });

  it("alterna entre claro e escuro", () => {
    expect(nextThemePreference("light")).toBe("dark");
    expect(nextThemePreference("dark")).toBe("light");
  });
});
