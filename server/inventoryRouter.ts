/**
 * Endpoints do estoque. TODOS usam `inventoryProcedure`, que exige sessão
 * válida e papel `teacher` ou `admin` lido do banco. Um aluno recebe FORBIDDEN
 * em qualquer chamada, mesmo montando a requisição manualmente.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { InventoryRuleError } from "@shared/inventory";
import {
  categoryInputSchema,
  categoryUpdateSchema,
  itemArchiveSchema,
  itemCreateSchema,
  itemIdSchema,
  itemListSchema,
  itemUpdateSchema,
  loanCancelSchema,
  loanCreateSchema,
  loanIdSchema,
  loanListSchema,
  loanReturnSchema,
  movementCreateSchema,
  movementListSchema,
} from "@shared/inventory-schemas";
import { inventoryProcedure, router } from "./_core/trpc";
import * as inventory from "./inventory";

/** Converte erros de domínio em respostas tRPC com mensagem legível. */
async function run<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof InventoryRuleError) {
      throw new TRPCError({ code: error.code === "INSUFFICIENT_STOCK" ? "CONFLICT" : "BAD_REQUEST", message: error.message, cause: error });
    }
    if (error instanceof inventory.InventoryServiceError) {
      throw new TRPCError({ code: error.code, message: error.message, cause: error });
    }
    throw error;
  }
}

export const inventoryRouter = router({
  summary: inventoryProcedure.query(() => run(() => inventory.getInventorySummary())),

  options: inventoryProcedure.query(() =>
    run(async () => {
      const [categories, borrowers, modules] = await Promise.all([
        inventory.listCategories(),
        inventory.listBorrowers(),
        inventory.listModuleOptions(),
      ]);
      return { categories, borrowers, modules };
    }),
  ),

  categories: router({
    list: inventoryProcedure
      .input(z.object({ includeArchived: z.boolean().optional() }).optional())
      .query(({ input }) => run(() => inventory.listCategories({ includeArchived: input?.includeArchived }))),
    create: inventoryProcedure.input(categoryInputSchema).mutation(({ ctx, input }) => run(() => inventory.createCategory(input, ctx.user.id))),
    update: inventoryProcedure.input(categoryUpdateSchema).mutation(({ ctx, input }) => run(() => inventory.updateCategory(input, ctx.user.id))),
    setArchived: inventoryProcedure
      .input(z.object({ id: z.number().int().positive(), archived: z.boolean() }))
      .mutation(({ ctx, input }) => run(() => inventory.setCategoryArchived(input.id, input.archived, ctx.user.id))),
  }),

  items: router({
    list: inventoryProcedure.input(itemListSchema).query(({ input }) => run(() => inventory.listItems(input))),
    linkable: inventoryProcedure.query(() => run(() => inventory.listLinkableItems())),
    detail: inventoryProcedure.input(itemIdSchema).query(({ input }) => run(() => inventory.getItemDetail(input.id))),
    create: inventoryProcedure.input(itemCreateSchema).mutation(({ ctx, input }) => run(() => inventory.createItem(input, ctx.user.id))),
    update: inventoryProcedure.input(itemUpdateSchema).mutation(({ ctx, input }) => run(() => inventory.updateItem(input, ctx.user.id))),
    archive: inventoryProcedure.input(itemArchiveSchema).mutation(({ ctx, input }) => run(() => inventory.archiveItem(input, ctx.user.id))),
    restore: inventoryProcedure.input(itemIdSchema).mutation(({ ctx, input }) => run(() => inventory.restoreItem(input.id, ctx.user.id))),
  }),

  movements: router({
    list: inventoryProcedure.input(movementListSchema).query(({ input }) => run(() => inventory.listMovements(input))),
    create: inventoryProcedure.input(movementCreateSchema).mutation(({ ctx, input }) => run(() => inventory.registerMovement(input, ctx.user.id))),
  }),

  loans: router({
    list: inventoryProcedure.input(loanListSchema).query(({ input }) => run(() => inventory.listLoans(input))),
    create: inventoryProcedure.input(loanCreateSchema).mutation(({ ctx, input }) => run(() => inventory.createLoan(input, ctx.user.id))),
    deliver: inventoryProcedure.input(loanIdSchema).mutation(({ ctx, input }) => run(() => inventory.deliverLoan(input.loanId, ctx.user.id))),
    cancel: inventoryProcedure.input(loanCancelSchema).mutation(({ ctx, input }) => run(() => inventory.cancelLoan(input.loanId, input.reason, ctx.user.id))),
    return: inventoryProcedure.input(loanReturnSchema).mutation(({ ctx, input }) => run(() => inventory.returnLoan(input, ctx.user.id))),
  }),
});
