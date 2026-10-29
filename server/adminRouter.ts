import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { OVERSIGHT_PERIODS } from "@shared/inventory-oversight";
import { classroomInputSchema, classroomUpdateSchema, userCreateSchema, userPasswordSchema, userUpdateSchema } from "@shared/user-admin";
import { adminProcedure, router } from "./_core/trpc";
import { getInventoryOversight } from "./inventoryOversight";
import {
  createClassroom,
  createUser,
  listClassrooms,
  listUsers,
  resetUserPassword,
  setClassroomArchived,
  updateClassroom,
  updateUser,
  UserAdminError,
} from "./userAdmin";

/** Converte erros da gestão de contas em respostas tRPC legíveis. */
async function runUserAdmin<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof UserAdminError) throw new TRPCError({ code: error.code, message: error.message, cause: error });
    throw error;
  }
}

const periodInput = z.object({
  days: z.literal(OVERSIGHT_PERIODS).default(30),
});

/** Área exclusiva da administração: contas, turmas e supervisão do estoque. */
export const adminRouter = router({
  users: router({
    list: adminProcedure.query(() => listUsers()),
    create: adminProcedure.input(userCreateSchema).mutation(({ input }) => runUserAdmin(() => createUser(input))),
    update: adminProcedure.input(userUpdateSchema).mutation(({ ctx, input }) => runUserAdmin(() => updateUser(input, ctx.user.id))),
    resetPassword: adminProcedure.input(userPasswordSchema).mutation(({ input }) => runUserAdmin(() => resetUserPassword(input.id, input.password))),
  }),
  classrooms: router({
    list: adminProcedure.query(() => listClassrooms()),
    create: adminProcedure.input(classroomInputSchema).mutation(({ input }) => runUserAdmin(() => createClassroom(input))),
    update: adminProcedure.input(classroomUpdateSchema).mutation(({ input }) => runUserAdmin(() => updateClassroom(input))),
    setArchived: adminProcedure
      .input(z.object({ id: z.number().int().positive(), archived: z.boolean() }))
      .mutation(({ input }) => runUserAdmin(() => setClassroomArchived(input.id, input.archived))),
  }),
  /** Visão completa do estoque por turma e por docente, para acionar quem for preciso. */
  inventory: router({
    oversight: adminProcedure.input(periodInput).query(({ input }) => getInventoryOversight(input.days)),
  }),
});
