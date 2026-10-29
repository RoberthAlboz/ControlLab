import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./_core/password";
import { LoginRateLimiter } from "./_core/rate-limit";
import { canAccessInventory, isStaffOnlyPath, isStaffRole, safeRedirectPath } from "@shared/roles";

describe("senhas", () => {
  it("gera hash scrypt com sal e verifica em tempo constante", async () => {
    const hash = await hashPassword("forgelab-segura");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(hash.includes("forgelab-segura")).toBe(false);
    await expect(verifyPassword("forgelab-segura", hash)).resolves.toBe(true);
    await expect(verifyPassword("forgelab-errada", hash)).resolves.toBe(false);
  });

  it("dois hashes da mesma senha são diferentes (sal aleatório)", async () => {
    const [a, b] = await Promise.all([hashPassword("mesma-senha-1"), hashPassword("mesma-senha-1")]);
    expect(a === b).toBe(false);
  });

  it("recusa senhas curtas e hashes malformados", async () => {
    await expect(hashPassword("curta")).rejects.toThrow("pelo menos");
    await expect(verifyPassword("qualquer", "texto-sem-formato")).resolves.toBe(false);
    await expect(verifyPassword("qualquer", null)).resolves.toBe(false);
  });
});

describe("limitador de tentativas de login", () => {
  it("bloqueia após o limite e libera depois da janela", () => {
    let now = 0;
    const limiter = new LoginRateLimiter(3, 1000, 5000, () => now);
    for (let index = 0; index < 3; index += 1) limiter.registerFailure("a@b.c", "ip");
    expect(limiter.retryAfterSeconds("a@b.c", "ip")).toBe(5);
    expect(limiter.retryAfterSeconds("a@b.c", "outro-ip")).toBe(0);
    now = 6000;
    expect(limiter.retryAfterSeconds("a@b.c", "ip")).toBe(0);
  });

  it("sucesso zera o contador", () => {
    const limiter = new LoginRateLimiter(2, 1000, 5000, () => 0);
    limiter.registerFailure("a@b.c", "ip");
    limiter.registerSuccess("a@b.c", "ip");
    limiter.registerFailure("a@b.c", "ip");
    expect(limiter.retryAfterSeconds("a@b.c", "ip")).toBe(0);
  });
});

describe("papéis e rotas", () => {
  it("somente docente e administração acessam o estoque", () => {
    expect(canAccessInventory("teacher")).toBe(true);
    expect(canAccessInventory("admin")).toBe(true);
    expect(canAccessInventory("student")).toBe(false);
    expect(canAccessInventory(undefined)).toBe(false);
    expect(isStaffRole("user")).toBe(false);
  });

  it("identifica rotas exclusivas do docente", () => {
    expect(isStaffOnlyPath("/estoque")).toBe(true);
    expect(isStaffOnlyPath("/estoque/emprestimos?x=1")).toBe(true);
    expect(isStaffOnlyPath("/estoques")).toBe(false);
    expect(isStaffOnlyPath("/biblioteca")).toBe(false);
  });

  it("após o login, o aluno nunca é redirecionado para o estoque", () => {
    expect(safeRedirectPath("/estoque", "student")).toBe("/");
    expect(safeRedirectPath("/estoque", "teacher")).toBe("/estoque");
    expect(safeRedirectPath("/biblioteca", "student")).toBe("/biblioteca");
  });

  it("admin não volta para rotas de módulos, mas mantém estoque e administração", () => {
    expect(safeRedirectPath("/biblioteca", "admin")).toBe("/");
    expect(safeRedirectPath("/leitor", "admin")).toBe("/");
    expect(safeRedirectPath("/editor", "admin")).toBe("/");
    expect(safeRedirectPath("/estoque", "admin")).toBe("/estoque");
    expect(safeRedirectPath("/admin/usuarios", "admin")).toBe("/admin/usuarios");
    expect(safeRedirectPath("/editor", "teacher")).toBe("/editor");
  });

  it("não aceita redirecionamentos externos ou de volta ao login", () => {
    expect(safeRedirectPath("https://malicioso.example", "teacher")).toBe("/");
    expect(safeRedirectPath("//malicioso.example", "teacher")).toBe("/");
    expect(safeRedirectPath("/login?next=/x", "teacher")).toBe("/");
    expect(safeRedirectPath(null, "student")).toBe("/");
  });
});
