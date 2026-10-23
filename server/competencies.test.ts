import { describe, expect, it } from "vitest";
import { normalizeBadgeContent } from "@shared/competencies";

describe("badges atribuídas pelo docente", () => {
  it("normaliza o nome e a descrição informados pelo docente", () => {
    expect(normalizeBadgeContent("  Metrologia de precisão  ", "  Reconheceu o uso do micrômetro.  ")).toEqual({
      label: "Metrologia de precisão",
      detail: "Reconheceu o uso do micrômetro.",
    });
  });

  it("não permite atribuir uma badge sem nome", () => {
    expect(() => normalizeBadgeContent("   ", "Descrição opcional")).toThrow("Informe o nome da badge.");
  });

  it("permite uma badge sem descrição e sem vínculo com um módulo", () => {
    expect(normalizeBadgeContent("Segurança no laboratório", "")).toEqual({
      label: "Segurança no laboratório",
      detail: "",
    });
  });
});
