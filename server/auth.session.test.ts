import { beforeEach, describe, expect, it, vi } from "vitest";
import { decodeJwt } from "jose";
import { COOKIE_NAME } from "../shared/const";

process.env.APP_ID = "forgelab-test";
process.env.SESSION_SECRET = "forgelab-test-secret-com-mais-de-32-caracteres";

const { createAuthSession, isAuthSessionActive, revokeAuthSession } = vi.hoisted(() => ({
  createAuthSession: vi.fn(),
  isAuthSessionActive: vi.fn(),
  revokeAuthSession: vi.fn(),
}));

vi.mock("./db", () => ({
  createAuthSession,
  isAuthSessionActive,
  revokeAuthSession,
}));

describe("sessões server-side revogáveis", () => {
  beforeEach(() => {
    vi.resetModules();
    createAuthSession.mockReset();
    isAuthSessionActive.mockReset();
    revokeAuthSession.mockReset();
    isAuthSessionActive.mockResolvedValue(true);
  });

  it("registra o jti emitido e deixa de aceitar o token após revogação", async () => {
    const { sdk } = await import("./_core/sdk");
    const token = await sdk.createSessionToken("user-1", { name: "Aluno" });
    const jti = decodeJwt(token).jti;

    expect(jti).toEqual(expect.any(String));
    expect(createAuthSession).toHaveBeenCalledWith(expect.objectContaining({ jti, openId: "user-1" }));
    await expect(sdk.verifySession(token)).resolves.toMatchObject({ openId: "user-1", jti });

    isAuthSessionActive.mockResolvedValue(false);
    await expect(sdk.verifySession(token)).resolves.toBeNull();
  });

  it("revoga tanto o cookie quanto o Bearer apresentado no logout", async () => {
    const { sdk } = await import("./_core/sdk");
    const cookieToken = await sdk.createSessionToken("user-cookie", { name: "Cookie" });
    const bearerToken = await sdk.createSessionToken("user-bearer", { name: "Bearer" });

    await sdk.revokeRequestSessions({
      headers: {
        cookie: `${COOKIE_NAME}=${cookieToken}`,
        authorization: `Bearer ${bearerToken}`,
      },
    } as never);

    expect(revokeAuthSession).toHaveBeenCalledTimes(2);
    expect(revokeAuthSession).toHaveBeenCalledWith(decodeJwt(cookieToken).jti);
    expect(revokeAuthSession).toHaveBeenCalledWith(decodeJwt(bearerToken).jti);
  });

  it("rejeita sessão expirada mesmo que o registro ainda exista", async () => {
    const { sdk } = await import("./_core/sdk");
    const token = await sdk.signSession({ openId: "user-1", appId: "forgelab-test", name: "Aluno", jti: "expirada" }, { expiresInMs: -60_000 });
    await expect(sdk.verifySession(token)).resolves.toBeNull();
  });

  it("rejeita token assinado com outro segredo ou de outro aplicativo", async () => {
    const { sdk } = await import("./_core/sdk");
    const foreign = await sdk.signSession({ openId: "user-1", appId: "outro-app", name: "Aluno", jti: "x" });
    await expect(sdk.verifySession(foreign)).resolves.toBeNull();
    await expect(sdk.verifySession("token.invalido.qualquer")).resolves.toBeNull();
    await expect(sdk.verifySession(undefined)).resolves.toBeNull();
  });
});
