import { TRPCError } from "@trpc/server";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { HttpError } from "@shared/_core/errors";
import type { User } from "../../drizzle/schema";
import { DATABASE_UNAVAILABLE_MESSAGE, DatabaseUnavailableError } from "./db-errors";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  /** Usuário recarregado do banco a partir da sessão; null quando anônimo. */
  user: User | null;
};

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  let user: User | null = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Sessão ausente/inválida: procedimentos públicos (login, me) seguem como anônimos.
    if (error instanceof HttpError) {
      user = null;
    } else if (error instanceof DatabaseUnavailableError) {
      throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: DATABASE_UNAVAILABLE_MESSAGE, cause: error });
    } else {
      throw error;
    }
  }
  return { req: opts.req, res: opts.res, user };
}
