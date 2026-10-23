/**
 * Schemas de validação do estoque, compartilhados por frontend e backend.
 * O frontend usa os mesmos limites para validar antes de enviar; o backend
 * revalida tudo e aplica as regras de saldo de `shared/inventory.ts`.
 */
import { z } from "zod";
import {
  ITEM_CONSERVATION,
  ITEM_STATUSES,
  ITEM_TYPES,
  ITEM_UNITS,
  LOAN_STATUSES,
  MANUAL_MOVEMENT_TYPES,
  MAX_MOVEMENT_QUANTITY,
  MOVEMENT_REASONS,
  MOVEMENT_TYPES,
} from "./inventory";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres.`)
    .optional()
    .nullable()
    .transform(value => (value ? value : null));

/** Chave gerada pelo cliente para tornar o envio idempotente (evita duplo clique/reenvio). */
export const requestKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Chave de requisição inválida.");

export const quantitySchema = z
  .number({ message: "Informe a quantidade." })
  .int("Use números inteiros.")
  .min(1, "A quantidade deve ser maior que zero.")
  .max(MAX_MOVEMENT_QUANTITY, "Quantidade acima do limite permitido.");

export const itemCodeSchema = z
  .string()
  .trim()
  .min(1, "Informe o código patrimonial ou interno.")
  .max(40, "Use no máximo 40 caracteres.")
  .regex(/^[A-Za-z0-9._\-/ ]+$/, "Use apenas letras, números, espaço, ponto, hífen, barra ou sublinhado.");

export const categoryInputSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da categoria.").max(80, "Use no máximo 80 caracteres."),
  description: optionalText(255),
});

export const categoryUpdateSchema = categoryInputSchema.extend({
  id: z.number().int().positive(),
});

const itemEditableFields = {
  sapCode: optionalText(40),
  name: z.string().trim().min(2, "Informe a descrição do item.").max(180, "Use no máximo 180 caracteres."),
  description: optionalText(2000),
  itemType: z.enum(ITEM_TYPES),
  categoryId: z.number().int().positive().nullable(),
  unit: z.enum(ITEM_UNITS),
  returnable: z.boolean(),
  minQuantity: z.number({ message: "Informe um número." }).int("Use números inteiros.").min(0, "O mínimo não pode ser negativo.").max(MAX_MOVEMENT_QUANTITY),
  sector: z.string().trim().min(2, "Informe o setor.").max(80),
  location: z.string().trim().min(2, "Informe a localização física.").max(160),
  conservation: z.enum(ITEM_CONSERVATION),
  status: z.enum(ITEM_STATUSES),
};

export const itemCreateSchema = z.object({
  code: itemCodeSchema,
  ...itemEditableFields,
  initialQuantity: z.number({ message: "Informe um número." }).int("Use números inteiros.").min(0, "A quantidade inicial não pode ser negativa.").max(MAX_MOVEMENT_QUANTITY),
  initialReason: z.enum(["compra", "doacao", "inventario"]).default("inventario"),
  requestKey: requestKeySchema,
});

export const itemUpdateSchema = z.object({
  id: z.number().int().positive(),
  expectedVersion: z.number().int().min(0),
  code: itemCodeSchema,
  ...itemEditableFields,
});

export const itemArchiveSchema = z.object({
  id: z.number().int().positive(),
  reason: z.string().trim().min(5, "Explique o motivo do arquivamento (mín. 5 caracteres).").max(255),
});

export const itemIdSchema = z.object({ id: z.number().int().positive() });

export const STOCK_FILTERS = ["all", "low", "unavailable", "archived"] as const;

export const itemListSchema = z.object({
  search: z.string().trim().max(100).optional().default(""),
  itemType: z.enum(ITEM_TYPES).optional(),
  categoryId: z.number().int().positive().optional(),
  filter: z.enum(STOCK_FILTERS).optional().default("all"),
  page: z.number().int().min(1).optional().default(1),
  pageSize: z.number().int().min(5).max(100).optional().default(20),
});

export const movementCreateSchema = z.object({
  itemId: z.number().int().positive(),
  type: z.enum(MANUAL_MOVEMENT_TYPES),
  quantity: quantitySchema,
  reason: z.enum(MOVEMENT_REASONS),
  reference: optionalText(120),
  note: optionalText(1000),
  moduleId: z.string().trim().min(1).max(64).nullable().optional(),
  requestKey: requestKeySchema,
});

export const movementListSchema = z.object({
  itemId: z.number().int().positive().optional(),
  type: z.enum(MOVEMENT_TYPES).optional(),
  userId: z.number().int().positive().optional(),
  search: z.string().trim().max(100).optional().default(""),
  page: z.number().int().min(1).optional().default(1),
  pageSize: z.number().int().min(5).max(100).optional().default(25),
});

export const loanCreateSchema = z
  .object({
    itemId: z.number().int().positive(),
    quantity: quantitySchema,
    borrowerUserId: z.number().int().positive().nullable().optional(),
    borrowerName: z.string().trim().min(2, "Informe quem recebe o item (aluno, turma ou docente).").max(160),
    purpose: z.string().trim().min(3, "Informe a finalidade do empréstimo.").max(255),
    moduleId: z.string().trim().min(1).max(64).nullable().optional(),
    dueAt: z.date().nullable().optional(),
    requestKey: requestKeySchema,
  });

export const loanIdSchema = z.object({ loanId: z.number().int().positive() });

export const loanCancelSchema = z.object({
  loanId: z.number().int().positive(),
  reason: z.string().trim().min(3, "Informe o motivo do cancelamento.").max(255),
});

export const loanReturnSchema = z.object({
  loanId: z.number().int().positive(),
  goodQuantity: z.number({ message: "Informe um número." }).int("Use números inteiros.").min(0, "Não use valores negativos."),
  damagedQuantity: z.number({ message: "Informe um número." }).int("Use números inteiros.").min(0, "Não use valores negativos."),
  note: optionalText(1000),
  requestKey: requestKeySchema,
});

export const loanListSchema = z.object({
  status: z.union([z.literal("active"), z.literal("all"), z.enum(LOAN_STATUSES)]).optional().default("active"),
  itemId: z.number().int().positive().optional(),
  page: z.number().int().min(1).optional().default(1),
  pageSize: z.number().int().min(5).max(100).optional().default(25),
});

export type ItemCreateInput = z.infer<typeof itemCreateSchema>;
export type ItemUpdateInput = z.infer<typeof itemUpdateSchema>;
export type MovementCreateInput = z.infer<typeof movementCreateSchema>;
export type LoanCreateInput = z.infer<typeof loanCreateSchema>;
export type LoanReturnInput = z.infer<typeof loanReturnSchema>;
export type ItemListInput = z.infer<typeof itemListSchema>;
export type MovementListInput = z.infer<typeof movementListSchema>;
export type LoanListInput = z.infer<typeof loanListSchema>;

/** Gera uma chave de idempotência no navegador ou no servidor. */
export function createRequestKey() {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return random.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 48);
}
