import { z } from "zod";
import { ENV } from "./env";
import { publicProcedure, router } from "./trpc";
import { checkDatabaseConnection } from "../db";

export const systemRouter = router({
  health: publicProcedure
    .input(z.object({ timestamp: z.number().min(0, "timestamp cannot be negative") }).optional())
    .query(async () => ({ ok: true, database: await checkDatabaseConnection() })),

  /** Informa ao frontend se o ambiente é de desenvolvimento (selo "DEV"). */
  info: publicProcedure.query(() => ({
    environment: ENV.isProduction ? "production" : "development",
  })),

  /**
   * Contas de teste da seed (SEED_* do .env) para o atalho de login do selo "DEV".
   * Em produção nunca devolve nada: as senhas só saem do servidor em desenvolvimento.
   */
  devAccounts: publicProcedure.query(() => {
    if (ENV.isProduction) return [];
    return (["TEACHER", "STUDENT"] as const).flatMap(prefix => {
      const email = process.env[`SEED_${prefix}_EMAIL`]?.trim().toLowerCase();
      const password = process.env[`SEED_${prefix}_PASSWORD`];
      if (!email || !password) return [];
      return [
        {
          role: prefix === "TEACHER" ? ("teacher" as const) : ("student" as const),
          name: process.env[`SEED_${prefix}_NAME`] || (prefix === "TEACHER" ? "Docente" : "Aluno"),
          email,
          password,
        },
      ];
    });
  }),
});
