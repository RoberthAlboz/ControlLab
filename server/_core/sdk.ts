/**
 * Sessões do ForgeLab: JWT assinado (HS256) em cookie httpOnly + registro
 * server-side (`auth_sessions`) que permite expirar e revogar cada sessão.
 *
 * O papel do usuário NUNCA vem do token nem do frontend: a cada requisição o
 * usuário é recarregado do banco a partir do `openId` da sessão.
 */
import { COOKIE_NAME } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

export type SessionPayload = {
  openId: string;
  appId: string;
  name: string;
  jti?: string;
};

type VerifiedSession = Omit<SessionPayload, "jti"> & { jti?: string };

class SessionService {
  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) return new Map<string, string>();
    return new Map(Object.entries(parseCookieHeader(cookieHeader)));
  }

  private getSessionSecret() {
    if (!ENV.cookieSecret) throw new Error("SESSION_SECRET não configurado.");
    return new TextEncoder().encode(ENV.cookieSecret);
  }

  /** Emite um token e registra seu `jti` para permitir revogação no logout. */
  async createSessionToken(openId: string, options: { expiresInMs?: number; name?: string } = {}): Promise<string> {
    const jti = crypto.randomUUID();
    const expiresInMs = options.expiresInMs ?? ENV.sessionTtlMs;
    const token = await this.signSession(
      { openId, appId: ENV.appId, name: options.name?.trim() || openId, jti },
      { expiresInMs },
    );
    await db.createAuthSession({ jti, openId, expiresAt: new Date(Date.now() + expiresInMs) });
    return token;
  }

  async signSession(payload: SessionPayload, options: { expiresInMs?: number } = {}): Promise<string> {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ENV.sessionTtlMs;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name,
      ...(payload.jti ? { jti: payload.jti } : {}),
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt(Math.floor(issuedAt / 1000))
      .setExpirationTime(expirationSeconds)
      .sign(this.getSessionSecret());
  }

  /**
   * Valida assinatura, expiração e registro server-side (não revogada).
   * Token inválido → null. Banco fora do ar → o erro sobe: não é "sessão inválida".
   */
  async verifySession(cookieValue: string | undefined | null): Promise<VerifiedSession | null> {
    if (!cookieValue) return null;
    let session: VerifiedSession;
    try {
      session = await this.verifySignedSession(cookieValue);
    } catch (error) {
      if (!ENV.isTest) console.warn("[Auth] Sessão rejeitada:", String(error));
      return null;
    }
    if (!session.jti || !(await db.isAuthSessionActive(session.jti))) return null;
    return session;
  }

  /** Só a assinatura e a validade do token, sem consultar o banco (usado antes de aceitar corpos grandes). */
  async hasValidSignature(req: Pick<Request, "headers">) {
    const token = this.getSessionTokens(req)[0];
    if (!token) return false;
    try {
      await this.verifySignedSession(token);
      return true;
    } catch {
      return false;
    }
  }

  private async verifySignedSession(cookieValue: string): Promise<VerifiedSession> {
    const { payload } = await jwtVerify(cookieValue, this.getSessionSecret(), { algorithms: ["HS256"] });
    const { openId, appId, name, jti } = payload as Record<string, unknown>;
    if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || appId !== ENV.appId || !isNonEmptyString(name)) {
      throw new Error("Sessão com identidade inválida");
    }
    if (jti !== undefined && !isNonEmptyString(jti)) throw new Error("Sessão com jti inválido");
    return { openId, appId, name, ...(jti ? { jti } : {}) };
  }

  /** Tokens apresentados: cookie httpOnly (navegador) e Bearer (testes/automação). */
  getSessionTokens(req: Pick<Request, "headers">): string[] {
    const cookieToken = this.parseCookies(req.headers.cookie).get(COOKIE_NAME);
    const authHeader = req.headers.authorization;
    const bearerToken = typeof authHeader === "string" && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
    return Array.from(new Set([cookieToken, bearerToken].filter((value): value is string => Boolean(value))));
  }

  /** Revoga todas as sessões apresentadas na requisição. Idempotente. */
  async revokeRequestSessions(req: Pick<Request, "headers">) {
    for (const token of this.getSessionTokens(req)) {
      try {
        const session = await this.verifySignedSession(token);
        if (session.jti) await db.revokeAuthSession(session.jti);
      } catch (error) {
        if (!ENV.isTest) console.warn("[Auth] Não foi possível revogar uma das sessões apresentadas", String(error));
      }
    }
  }

  async authenticateRequest(req: Pick<Request, "headers">): Promise<User> {
    const sessionToken = this.getSessionTokens(req)[0];
    const session = await this.verifySession(sessionToken);
    if (!session) throw ForbiddenError("Sessão inválida ou expirada");
    const user = await db.getUserByOpenId(session.openId);
    if (!user || !user.active) throw ForbiddenError("Usuário inexistente ou desativado");
    return user;
  }
}

export const sdk = new SessionService();
