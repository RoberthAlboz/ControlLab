/**
 * Autenticação local por e-mail e senha.
 *
 * - Senhas: hash scrypt (server/_core/password.ts).
 * - Sessão: JWT em cookie httpOnly + registro em `auth_sessions` (revogável).
 * - Tentativas: limitador por e-mail + IP contra força bruta.
 * - Mensagem de erro única para e-mail inexistente ou senha incorreta.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import type { User } from "../drizzle/schema";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { getDummyPasswordHash, verifyPassword } from "./_core/password";
import { loginRateLimiter } from "./_core/rate-limit";
import { sdk } from "./_core/sdk";
import { publicProcedure, router } from "./_core/trpc";
import { getUserByEmail, touchUserSignIn } from "./db";

export const INVALID_CREDENTIALS_MESSAGE = "E-mail ou senha incorretos.";

/** Dados do usuário que podem ir ao navegador (sem hash de senha). */
export function toPublicUser(user: User) {
  return {
    id: user.id,
    openId: user.openId,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    role: user.role,
    lastSignedIn: user.lastSignedIn,
  };
}
export type PublicUser = ReturnType<typeof toPublicUser>;

const loginInput = z.object({
  email: z.string().trim().min(3, "Informe o e-mail.").max(320).email("Informe um e-mail válido."),
  password: z.string().min(1, "Informe a senha.").max(200),
});

function clientIp(req: { ip?: string; socket?: { remoteAddress?: string } }) {
  return req.ip || req.socket?.remoteAddress || "desconhecido";
}

export const authRouter = router({
  me: publicProcedure.query(({ ctx }) => (ctx.user ? toPublicUser(ctx.user) : null)),

  login: publicProcedure.input(loginInput).mutation(async ({ ctx, input }) => {
    const email = input.email.toLowerCase();
    const ip = clientIp(ctx.req);
    const retryAfter = loginRateLimiter.retryAfterSeconds(email, ip);
    if (retryAfter > 0) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Muitas tentativas. Aguarde ${Math.ceil(retryAfter / 60)} min e tente novamente.`,
      });
    }

    const user = await getUserByEmail(email);
    // Sempre executa o scrypt para não revelar, pelo tempo de resposta, se o e-mail existe.
    const passwordMatches = await verifyPassword(input.password, user?.passwordHash ?? (await getDummyPasswordHash()));
    if (!user || !user.passwordHash || !passwordMatches || !user.active) {
      loginRateLimiter.registerFailure(email, ip);
      throw new TRPCError({ code: "UNAUTHORIZED", message: INVALID_CREDENTIALS_MESSAGE });
    }

    loginRateLimiter.registerSuccess(email, ip);
    // Uma nova sessão substitui a anterior apresentada por este navegador.
    await sdk.revokeRequestSessions(ctx.req);
    const token = await sdk.createSessionToken(user.openId, { name: user.name ?? email, expiresInMs: ENV.sessionTtlMs });
    ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: ENV.sessionTtlMs });
    await touchUserSignIn(user.id);
    return { user: toPublicUser(user) };
  }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    await sdk.revokeRequestSessions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
    return { success: true } as const;
  }),
});
