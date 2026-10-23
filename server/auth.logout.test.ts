import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import { makeContext, makeUser } from "./test-utils";

describe("auth.logout", () => {
  it("revoga a sessão, limpa o cookie httpOnly e informa sucesso", async () => {
    const { ctx, clearedCookies } = makeContext(makeUser("student"));
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({
      maxAge: -1,
      secure: true,
      sameSite: "lax",
      httpOnly: true,
      path: "/",
    });
  });

  it("é idempotente mesmo sem sessão", async () => {
    const { ctx } = makeContext(null);
    await expect(appRouter.createCaller(ctx).auth.logout()).resolves.toEqual({ success: true });
  });
});
