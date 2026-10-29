import { NOT_ADMIN_ERR_MSG, NOT_TEACHER_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
import { isStaffRole } from "@shared/roles";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { DATABASE_UNAVAILABLE_MESSAGE, DatabaseUnavailableError } from "./db-errors";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;

/** Banco fora do ar vira 503 com mensagem clara, nunca "senha incorreta" ou 500 genérico. */
const mapDatabaseErrors = t.middleware(async ({ next }) => {
  const result = await next();
  if (!result.ok && result.error.cause instanceof DatabaseUnavailableError) {
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: DATABASE_UNAVAILABLE_MESSAGE, cause: result.error.cause });
  }
  return result;
});

export const publicProcedure = t.procedure.use(mapDatabaseErrors);

/** Exige sessão válida. O papel vem do banco (ctx.user), nunca do cliente. */
const requireUser = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const protectedProcedure = publicProcedure.use(requireUser);

/** Área do aluno: progresso, tempo de estudo, quiz, diário e pontos fortes próprios. */
export const studentProcedure = protectedProcedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (ctx.user?.role !== "student") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Recurso disponível somente para contas de aluno." });
    }
    return next();
  }),
);

/** Docente ou administração: área docente, editor e estoque. */
export const teacherProcedure = protectedProcedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!isStaffRole(ctx.user?.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_TEACHER_ERR_MSG });
    }
    return next();
  }),
);

/** Criar, editar e excluir módulos: somente docentes (a administração só acompanha a visão geral). */
export const moduleEditorProcedure = protectedProcedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (ctx.user?.role !== "teacher") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Somente docentes criam ou editam módulos." });
    }
    return next();
  }),
);

/** Estoque: mesma regra do docente, nomeada para deixar a intenção explícita. */
export const inventoryProcedure = teacherProcedure;

/** Somente administração do sistema. */
export const adminProcedure = protectedProcedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (ctx.user?.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next();
  }),
);
