/** Utilitários de teste: contexto tRPC com usuário vindo da "sessão". */
import type { User } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

export function makeUser(role: User["role"], overrides: Partial<User> = {}): User {
  const now = new Date();
  return {
    id: role === "student" ? 7 : role === "teacher" ? 2 : 1,
    openId: `local:${role}@forgelab.test`,
    name: role === "student" ? "Aluno Teste" : role === "teacher" ? "Docente Teste" : "Admin Teste",
    email: `${role}@forgelab.test`,
    avatarUrl: null,
    loginMethod: "password",
    passwordHash: null,
    role,
    active: 1,
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    ...overrides,
  };
}

export type CookieCall = { name: string; value?: string; options: Record<string, unknown> };

export function makeContext(user: TrpcContext["user"], headers: Record<string, string> = {}) {
  const setCookies: CookieCall[] = [];
  const clearedCookies: CookieCall[] = [];
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers, ip: "127.0.0.1" } as unknown as TrpcContext["req"],
    res: {
      cookie: (name: string, value: string, options: Record<string, unknown>) => {
        setCookies.push({ name, value, options });
      },
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as unknown as TrpcContext["res"],
  };
  return { ctx, setCookies, clearedCookies };
}
