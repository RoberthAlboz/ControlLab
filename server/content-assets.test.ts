import { describe, expect, it, vi } from "vitest";
import { isSupportedModelUrl } from "@shared/model-url";
import { parseInlineImage, persistImageReference } from "./content-assets";

describe("URLs de modelos 3D", () => {
  it("aceita apenas URLs HTTPS de arquivos glTF/GLB sem credenciais embutidas", () => {
    expect(isSupportedModelUrl("https://assets.example.com/tool.glb")).toBe(true);
    expect(isSupportedModelUrl("https://assets.example.com/models/tool.gltf?token=abc")).toBe(true);
    expect(isSupportedModelUrl("http://assets.example.com/tool.glb")).toBe(false);
    expect(isSupportedModelUrl("javascript:alert(1)")).toBe(false);
    expect(isSupportedModelUrl("https://user:pass@assets.example.com/tool.glb")).toBe(false);
    expect(isSupportedModelUrl("https://assets.example.com/tool.zip")).toBe(false);
  });
});

describe("persistência de imagens de conteúdo", () => {
  it("aceita somente bytes cuja assinatura corresponde ao MIME declarado", () => {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB", "base64");
    expect(parseInlineImage(`data:image/png;base64,${png.toString("base64")}`, "image/png").bytes).toEqual(png);
    expect(() => parseInlineImage(`data:image/png;base64,${png.toString("base64")}`, "image/jpeg"))
      .toThrow("tipo declarado");
  });

  it("mantém referências HTTPS existentes sem chamar o storage", async () => {
    const uploader = vi.fn();
    const imageUrl = "https://cdn.example.com/cover.jpg";
    await expect(persistImageReference(imageUrl, "modules/cover", uploader as never)).resolves.toBe(imageUrl);
    expect(uploader).not.toHaveBeenCalled();
  });

  it("faz upload da imagem PNG e retorna somente a URL", async () => {
    const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB", "base64");
    const dataUrl = `data:image/png;base64,${bytes.toString("base64")}`;
    const uploader = vi.fn(async () => ({ key: "modules/cover.png", url: "/uploads/modules/cover.png" }));

    await expect(persistImageReference(dataUrl, "modules/cover", uploader as never)).resolves.toBe("/uploads/modules/cover.png");
    expect(uploader).toHaveBeenCalledWith("modules/cover.png", bytes, "image/png");
  });

  it("rejeita data URLs que não contenham uma imagem válida", async () => {
    await expect(persistImageReference("data:image/png;base64,ZmFrZQ==", "modules/cover", vi.fn() as never))
      .rejects.toThrow("conteúdo não corresponde");
  });

  it("não tenta armazenar uma referência inline com protocolo que não seja imagem", async () => {
    await expect(persistImageReference("data:text/html;base64,PGh0bWw+", "modules/cover", vi.fn() as never))
      .rejects.toThrow("Formato de imagem inválido");
  });
});
