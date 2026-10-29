import { z } from "zod";
import { ENV } from "./env";
import { publicProcedure, router } from "./trpc";
import { checkDatabaseConnection } from "../db";

const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/**
 * Requisição feita na própria máquina do servidor. Usa o endereço do socket,
 * não `req.ip`: cabeçalhos X-Forwarded-For podem ser forjados.
 */
export function isLoopbackRequest(req: { socket?: { remoteAddress?: string } }) {
  return LOOPBACK_ADDRESSES.has(req.socket?.remoteAddress ?? "");
}

/** O atalho de contas de teste só existe em desenvolvimento e para quem está na própria máquina. */
function devLoginAllowed(req: { socket?: { remoteAddress?: string } }) {
  return ENV.isDevelopment && isLoopbackRequest(req);
}

export const systemRouter = router({
  health: publicProcedure
    .input(z.object({ timestamp: z.number().min(0, "timestamp cannot be negative") }).optional())
    .query(async () => ({ ok: true, database: await checkDatabaseConnection() })),

  /** Informa ao frontend se o selo "DEV" (com as contas de teste) deve aparecer. */
  info: publicProcedure.query(({ ctx }) => ({
    environment: devLoginAllowed(ctx.req) ? "development" : "production",
  })),

  /**
   * Contas de teste da seed (SEED_* do .env) para o atalho de login do selo "DEV".
   * Só responde com NODE_ENV=development explícito e a partir de localhost:
   * um `pnpm dev` acessado pela rede da escola nunca entrega as senhas.
   */
  devAccounts: publicProcedure.query(({ ctx }) => {
    if (!devLoginAllowed(ctx.req)) return [];
    const accounts = [
      { prefix: "ADMIN", role: "admin", fallbackName: "Administração" },
      { prefix: "TEACHER", role: "teacher", fallbackName: "Docente" },
      { prefix: "STUDENT", role: "student", fallbackName: "Aluno" },
    ] as const;
    return accounts.flatMap(({ prefix, role, fallbackName }) => {
      const email = process.env[`SEED_${prefix}_EMAIL`]?.trim().toLowerCase();
      const password = process.env[`SEED_${prefix}_PASSWORD`];
      if (!email || !password) return [];
      return [{ role, name: process.env[`SEED_${prefix}_NAME`] || fallbackName, email, password }];
    });
  }),
});
