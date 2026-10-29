import { beforeEach, describe, expect, it, vi } from "vitest";
import { COOKIE_NAME } from "../shared/const";

const db = vi.hoisted(() => {
  // Executa antes dos imports: o módulo de ambiente lê estas variáveis ao carregar.
  process.env.APP_ID = "forgelab-test";
  process.env.SESSION_SECRET = "forgelab-test-secret-com-mais-de-32-caracteres";
  return {
  getUserByEmail: vi.fn(),
  touchUserSignIn: vi.fn(),
  createAuthSession: vi.fn(),
  isAuthSessionActive: vi.fn(async () => true),
  revokeAuthSession: vi.fn(),
  };
});

vi.mock("./db", () => db);

import { hashPassword } from "./_core/password";
import { appRouter } from "./routers";
import { INVALID_CREDENTIALS_MESSAGE } from "./auth";
import { loginRateLimiter } from "./_core/rate-limit";
import { DatabaseUnavailableError } from "./_core/db-errors";
import { makeContext, makeUser } from "./test-utils";

let teacherHash = "";

describe("auth.login", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    teacherHash ||= await hashPassword("senha-correta-123");
    loginRateLimiter.registerSuccess("docente@forgelab.test", "127.0.0.1");
    loginRateLimiter.registerSuccess("bloqueio@forgelab.test", "127.0.0.1");
  });

  it("autentica com credenciais válidas, grava cookie httpOnly e não expõe o hash", async () => {
    db.getUserByEmail.mockResolvedValue(makeUser("teacher", { email: "docente@forgelab.test", passwordHash: teacherHash }));
    const { ctx, setCookies } = makeContext(null);
    const result = await appRouter.createCaller(ctx).auth.login({ email: "Docente@ForgeLab.test", password: "senha-correta-123" });

    expect(db.getUserByEmail).toHaveBeenCalledWith("docente@forgelab.test");
    expect(result.user.role).toBe("teacher");
    expect(result.user).not.toHaveProperty("passwordHash");
    expect(setCookies).toHaveLength(1);
    expect(setCookies[0]?.name).toBe(COOKIE_NAME);
    expect(setCookies[0]?.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect(db.createAuthSession).toHaveBeenCalledTimes(1);
    expect(db.touchUserSignIn).toHaveBeenCalledWith(2);
  });

  it("recusa senha incorreta com mensagem genérica", async () => {
    db.getUserByEmail.mockResolvedValue(makeUser("teacher", { email: "docente@forgelab.test", passwordHash: teacherHash }));
    const { ctx, setCookies } = makeContext(null);
    await expect(appRouter.createCaller(ctx).auth.login({ email: "docente@forgelab.test", password: "errada-123" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: INVALID_CREDENTIALS_MESSAGE,
    });
    expect(setCookies).toHaveLength(0);
    expect(db.createAuthSession).not.toHaveBeenCalled();
  });

  it("e-mail inexistente recebe a mesma mensagem (não revela contas)", async () => {
    db.getUserByEmail.mockResolvedValue(undefined);
    const { ctx } = makeContext(null);
    await expect(appRouter.createCaller(ctx).auth.login({ email: "ninguem@forgelab.test", password: "qualquer-123" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: INVALID_CREDENTIALS_MESSAGE,
    });
  });

  it("conta desativada não entra", async () => {
    db.getUserByEmail.mockResolvedValue(makeUser("teacher", { email: "docente@forgelab.test", passwordHash: teacherHash, active: 0 }));
    const { ctx } = makeContext(null);
    await expect(appRouter.createCaller(ctx).auth.login({ email: "docente@forgelab.test", password: "senha-correta-123" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("valida o formato do e-mail no backend", async () => {
    const { ctx } = makeContext(null);
    await expect(appRouter.createCaller(ctx).auth.login({ email: "sem-arroba", password: "x" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("bloqueia temporariamente após tentativas repetidas", async () => {
    db.getUserByEmail.mockResolvedValue(undefined);
    const caller = appRouter.createCaller(makeContext(null).ctx);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(caller.auth.login({ email: "bloqueio@forgelab.test", password: "errada-123" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }
    await expect(caller.auth.login({ email: "bloqueio@forgelab.test", password: "errada-123" })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("banco fora do ar responde 503, não 'senha incorreta', e não conta como tentativa", async () => {
    db.getUserByEmail.mockRejectedValue(new DatabaseUnavailableError());
    const caller = appRouter.createCaller(makeContext(null).ctx);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await expect(caller.auth.login({ email: "docente@forgelab.test", password: "senha-correta-123" })).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    }
    expect(loginRateLimiter.retryAfterSeconds("docente@forgelab.test", "127.0.0.1")).toBe(0);
  });

  it("auth.me devolve null sem sessão e dados públicos com sessão", async () => {
    await expect(appRouter.createCaller(makeContext(null).ctx).auth.me()).resolves.toBeNull();
    const me = await appRouter.createCaller(makeContext(makeUser("student", { passwordHash: "scrypt$segredo" })).ctx).auth.me();
    expect(me).toMatchObject({ role: "student" });
    expect(me).not.toHaveProperty("passwordHash");
  });
});
