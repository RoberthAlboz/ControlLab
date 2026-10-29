import { describe, expect, it } from "vitest";
import {
  attachmentFolder,
  attachmentKind,
  isAllowedAttachmentName,
  isLinkAttachment,
  parseStoredAttachments,
  sanitizeAttachmentName,
} from "@shared/attachments";

describe("anexos de etapas e recursos", () => {
  it("aceita documentos, CAD, 3D e compactados, mas não páginas ou executáveis", () => {
    for (const name of ["ficha.pdf", "Peça.STEP", "suporte.stl", "modelo.glb", "planilha.xlsx", "projeto.zip", "programa.nc"]) {
      expect(isAllowedAttachmentName(name)).toBe(true);
    }
    for (const name of ["pagina.html", "icone.svg", "script.js", "setup.exe", "sem-extensao"]) {
      expect(isAllowedAttachmentName(name)).toBe(false);
    }
  });

  it("limpa o caminho vindo de uma pasta sem permitir travessia", () => {
    expect(sanitizeAttachmentName("Projeto\\desenhos\\base.dwg")).toBe("Projeto/desenhos/base.dwg");
    expect(sanitizeAttachmentName("../../etc/passwd.pdf")).toBe("etc/passwd.pdf");
    expect(sanitizeAttachmentName("  /a//b/./c.pdf ")).toBe("a/b/c.pdf");
    expect(attachmentFolder("Projeto/desenhos/base.dwg")).toBe("Projeto");
    expect(attachmentFolder("solto.pdf")).toBe("");
  });

  it("distingue arquivos enviados de links externos", () => {
    expect(isLinkAttachment({ url: "/uploads/learning-attachments/1/a.pdf" })).toBe(false);
    expect(attachmentKind({ name: "Pasta da turma", url: "https://drive.google.com/x" })).toBe("link");
    expect(attachmentKind({ name: "base.stp", url: "/uploads/x/base.stp" })).toBe("cad");
  });

  it("lê a coluna JSON descartando valores inválidos", () => {
    expect(parseStoredAttachments(null)).toEqual([]);
    expect(parseStoredAttachments("não é json")).toEqual([]);
    expect(parseStoredAttachments('{"a":1}')).toEqual([]);
    expect(parseStoredAttachments(JSON.stringify([
      { id: "a", name: "ficha.pdf", url: "/uploads/a.pdf", size: 10, mimeType: "application/pdf" },
      { id: 3, name: "inválido" },
    ]))).toEqual([{ id: "a", name: "ficha.pdf", url: "/uploads/a.pdf", size: 10, mimeType: "application/pdf" }]);
  });
});
