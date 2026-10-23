import { NOT_ADMIN_ERR_MSG, NOT_TEACHER_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
import { isStaffRole } from "@shared/roles";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

/** Exige sessão válida. O papel vem do banco (ctx.user), nunca do cliente. */
const requireUser = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const protectedProcedure = t.procedure.use(requireUser);

/** Somente alunos registram progresso e tempo de estudo. */
export const studentProcedure = protectedProcedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (ctx.user?.role !== "student") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Somente contas de aluno podem registrar progresso." });
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
