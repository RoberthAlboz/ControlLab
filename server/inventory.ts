/**
 * Serviço de estoque (exclusivo de docentes — a autorização é aplicada no
 * router com `inventoryProcedure`).
 *
 * Toda operação que altera quantidade:
 *  1. abre uma transação;
 *  2. lê a linha do item. Não há SELECT ... FOR UPDATE: a exclusividade vem do
 *     mutex de `_core/db-lock.ts`, que executa uma transação por vez sobre a
 *     conexão única. Se um dia houver pool de conexões, troque por um
 *     bloqueio de linha de verdade (FOR UPDATE no Postgres);
 *  3. calcula o novo saldo com as regras puras de `shared/inventory.ts`;
 *  4. grava o item e a movimentação imutável (com snapshot do item);
 *  5. confirma — ou desfaz tudo em caso de erro.
 *
 * Reenvios com a mesma `requestKey` devolvem o resultado já gravado
 * (idempotência contra duplo clique/reenvio de rede).
 */
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, ne, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import {
  classrooms,
  inventoryAuditLog,
  inventoryCategories,
  inventoryItems,
  inventoryLoans,
  inventoryMovements,
  learningModules,
  learningResources,
  users,
  type InventoryItem,
  type InventoryLoan,
} from "../drizzle/schema";
import {
  assertArchiveAllowed,
  assertItemEditAllowed,
  assertLoanTransition,
  assertManualMovementReason,
  availableQuantity,
  InventoryRuleError,
  isLoanOverdue,
  isLowStock,
  normalizeItemCode,
  planLoanReturn,
  planStockChange,
  stockHealth,
  type MovementReason,
  type MovementType,
  type StockSnapshot,
} from "@shared/inventory";
import type {
  ItemCreateInput,
  ItemListInput,
  ItemUpdateInput,
  LoanCreateInput,
  LoanListInput,
  LoanReturnInput,
  MovementCreateInput,
  MovementListInput,
} from "@shared/inventory-schemas";
import { requireDb, type Database } from "./db";
import { BORROWER_ROLES, canBorrowTools } from "@shared/roles";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export class InventoryServiceError extends Error {
  constructor(public readonly code: "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST", message: string) {
    super(message);
    this.name = "InventoryServiceError";
  }
}

/**
 * Violação de índice único: SQLite ("UNIQUE constraint failed: tabela.coluna")
 * ou Postgres (código 23505, "duplicate key value violates unique constraint").
 */
function isDuplicateEntry(error: unknown): boolean {
  const message = duplicatedConstraint(error);
  return message.includes("UNIQUE constraint failed") || message.includes("duplicate key value violates unique constraint");
}

function duplicatedConstraint(error: unknown): string {
  const candidates = [error, (error as { cause?: unknown })?.cause];
  return candidates
    .map(value => (value as { message?: string })?.message ?? "")
    .join(" | ");
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, match => `\\${match}`);
}

/** LIKE com escape explícito (o SQLite não tem caractere de escape padrão). */
function likeEscaped(column: SQL | AnyColumn, pattern: string) {
  return sql`${column} like ${pattern} escape '\\'`;
}

function toSnapshot(item: InventoryItem): StockSnapshot & { minQuantity: number } {
  return {
    physical: item.quantityPhysical,
    reserved: item.quantityReserved,
    status: item.status,
    archived: Boolean(item.archivedAt),
    returnable: Boolean(item.returnable),
    minQuantity: item.minQuantity,
  };
}

/** Item com os campos derivados usados pela interface. */
export function presentItem(item: InventoryItem, extra: { categoryName?: string | null; linkedModules?: number } = {}) {
  const snapshot = toSnapshot(item);
  return {
    ...item,
    returnable: Boolean(item.returnable),
    archived: snapshot.archived,
    available: availableQuantity(snapshot),
    lowStock: isLowStock(snapshot),
    health: stockHealth(snapshot),
    categoryName: extra.categoryName ?? null,
    linkedModules: extra.linkedModules ?? 0,
  };
}

async function lockItem(tx: Tx, itemId: number) {
  const [item] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, itemId)).limit(1);
  if (!item) throw new InventoryServiceError("NOT_FOUND", "Item de estoque não encontrado.");
  return item;
}

async function lockLoan(tx: Tx, loanId: number) {
  const [loan] = await tx.select().from(inventoryLoans).where(eq(inventoryLoans.id, loanId)).limit(1);
  if (!loan) throw new InventoryServiceError("NOT_FOUND", "Empréstimo não encontrado.");
  return loan;
}

async function moduleSnapshot(tx: Tx, moduleId: string | null | undefined) {
  if (!moduleId) return { moduleId: null, moduleTitleSnapshot: null };
  const [module] = await tx.select({ id: learningModules.id, title: learningModules.title }).from(learningModules).where(eq(learningModules.id, moduleId)).limit(1);
  if (!module) throw new InventoryServiceError("BAD_REQUEST", "O módulo informado não existe.");
  return { moduleId: module.id, moduleTitleSnapshot: module.title };
}

/** Turma informada precisa existir e estar ativa. */
async function activeClassroomId(tx: Tx, classroomId: number | null | undefined) {
  if (!classroomId) return null;
  const [classroom] = await tx
    .select({ id: classrooms.id })
    .from(classrooms)
    .where(and(eq(classrooms.id, classroomId), isNull(classrooms.archivedAt)))
    .limit(1);
  if (!classroom) throw new InventoryServiceError("BAD_REQUEST", "A turma informada não existe ou foi arquivada.");
  return classroom.id;
}

type ApplyMovementInput = {
  item: InventoryItem;
  type: MovementType;
  quantity: number;
  reason: MovementReason;
  userId: number;
  reference?: string | null;
  note?: string | null;
  loanId?: number | null;
  classroomId?: number | null;
  moduleId?: string | null;
  moduleTitleSnapshot?: string | null;
  requestKey?: string | null;
};

/** Aplica um movimento a um item já bloqueado e grava a movimentação. */
async function applyMovement(tx: Tx, input: ApplyMovementInput) {
  const plan = planStockChange(toSnapshot(input.item), input.type, input.quantity);
  if (plan.physicalAfter !== plan.physicalBefore || plan.reservedAfter !== plan.reservedBefore) {
    await tx
      .update(inventoryItems)
      .set({ quantityPhysical: plan.physicalAfter, quantityReserved: plan.reservedAfter, updatedBy: input.userId })
      .where(eq(inventoryItems.id, input.item.id));
  }
  const [{ id }] = await tx
    .insert(inventoryMovements)
    .values({
      itemId: input.item.id,
      movementType: input.type,
      quantity: input.quantity,
      ...plan,
      reason: input.reason,
      reference: input.reference ?? null,
      note: input.note ?? null,
      loanId: input.loanId ?? null,
      classroomId: input.classroomId ?? null,
      moduleId: input.moduleId ?? null,
      moduleTitleSnapshot: input.moduleTitleSnapshot ?? null,
      itemCodeSnapshot: input.item.code,
      itemNameSnapshot: input.item.name,
      unitSnapshot: input.item.unit,
      requestKey: input.requestKey ?? null,
      userId: input.userId,
    })
    .returning({ id: inventoryMovements.id });
  // Mantém o objeto em memória coerente para movimentos encadeados na mesma transação.
  input.item.quantityPhysical = plan.physicalAfter;
  input.item.quantityReserved = plan.reservedAfter;
  return { movementId: id, ...plan };
}

async function writeAudit(tx: Tx, entry: { entityType: "item" | "category"; entityId: number; action: "create" | "update" | "archive" | "restore"; changes: unknown; userId: number }) {
  await tx.insert(inventoryAuditLog).values({
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    changes: JSON.stringify(entry.changes ?? {}),
    userId: entry.userId,
  });
}

/* ------------------------------------------------------------------ */
/* Categorias                                                          */
/* ------------------------------------------------------------------ */

export async function listCategories(options: { includeArchived?: boolean } = {}) {
  const db = await requireDb();
  const rows = await db
    .select({
      id: inventoryCategories.id,
      name: inventoryCategories.name,
      description: inventoryCategories.description,
      archivedAt: inventoryCategories.archivedAt,
      itemCount: sql<number>`(select count(*) from ${inventoryItems} where ${inventoryItems.categoryId} = ${inventoryCategories.id} and ${inventoryItems.archivedAt} is null)`,
    })
    .from(inventoryCategories)
    .where(options.includeArchived ? undefined : isNull(inventoryCategories.archivedAt))
    .orderBy(asc(inventoryCategories.name));
  return rows.map(row => ({ ...row, itemCount: Number(row.itemCount ?? 0), archived: Boolean(row.archivedAt) }));
}

/** Nomes de categoria são únicos sem diferenciar maiúsculas/minúsculas. */
async function assertCategoryNameFree(tx: Tx, name: string, ignoreId?: number) {
  const [existing] = await tx
    .select({ id: inventoryCategories.id })
    .from(inventoryCategories)
    .where(sql`lower(${inventoryCategories.name}) = lower(${name})`)
    .limit(1);
  if (existing && existing.id !== ignoreId) throw new InventoryServiceError("CONFLICT", "Já existe uma categoria com esse nome.");
}

export async function createCategory(input: { name: string; description: string | null }, userId: number) {
  const db = await requireDb();
  try {
    return await db.transaction(async tx => {
      await assertCategoryNameFree(tx, input.name);
      const [{ id }] = await tx.insert(inventoryCategories).values({ name: input.name, description: input.description, createdBy: userId }).returning({ id: inventoryCategories.id });
      await writeAudit(tx, { entityType: "category", entityId: id, action: "create", changes: input, userId });
      return { id };
    });
  } catch (error) {
    if (isDuplicateEntry(error)) throw new InventoryServiceError("CONFLICT", "Já existe uma categoria com esse nome.");
    throw error;
  }
}

export async function updateCategory(input: { id: number; name: string; description: string | null }, userId: number) {
  const db = await requireDb();
  try {
    await db.transaction(async tx => {
      const [current] = await tx.select().from(inventoryCategories).where(eq(inventoryCategories.id, input.id)).limit(1);
      if (!current) throw new InventoryServiceError("NOT_FOUND", "Categoria não encontrada.");
      await assertCategoryNameFree(tx, input.name, input.id);
      await tx.update(inventoryCategories).set({ name: input.name, description: input.description }).where(eq(inventoryCategories.id, input.id));
      await writeAudit(tx, {
        entityType: "category",
        entityId: input.id,
        action: "update",
        changes: { before: { name: current.name, description: current.description }, after: { name: input.name, description: input.description } },
        userId,
      });
    });
    return { success: true } as const;
  } catch (error) {
    if (isDuplicateEntry(error)) throw new InventoryServiceError("CONFLICT", "Já existe uma categoria com esse nome.");
    throw error;
  }
}

export async function setCategoryArchived(id: number, archived: boolean, userId: number) {
  const db = await requireDb();
  await db.transaction(async tx => {
    const [current] = await tx.select().from(inventoryCategories).where(eq(inventoryCategories.id, id)).limit(1);
    if (!current) throw new InventoryServiceError("NOT_FOUND", "Categoria não encontrada.");
    if (Boolean(current.archivedAt) === archived) return;
    await tx.update(inventoryCategories).set({ archivedAt: archived ? new Date() : null }).where(eq(inventoryCategories.id, id));
    await writeAudit(tx, { entityType: "category", entityId: id, action: archived ? "archive" : "restore", changes: { name: current.name }, userId });
  });
  return { success: true } as const;
}

/* ------------------------------------------------------------------ */
/* Itens                                                               */
/* ------------------------------------------------------------------ */

function itemFilters(input: ItemListInput): SQL | undefined {
  const conditions: SQL[] = [];
  const available = sql`(${inventoryItems.quantityPhysical} - ${inventoryItems.quantityReserved})`;
  if (input.filter === "archived") conditions.push(isNotNull(inventoryItems.archivedAt));
  else conditions.push(isNull(inventoryItems.archivedAt));
  if (input.filter === "low") {
    conditions.push(sql`${inventoryItems.minQuantity} > 0 and ${available} <= ${inventoryItems.minQuantity}`);
  }
  if (input.filter === "unavailable") {
    conditions.push(or(ne(inventoryItems.status, "disponivel"), sql`${available} = 0`)!);
  }
  if (input.itemType) conditions.push(eq(inventoryItems.itemType, input.itemType));
  if (input.categoryId) conditions.push(eq(inventoryItems.categoryId, input.categoryId));
  const search = input.search?.trim();
  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    conditions.push(
      or(
        likeEscaped(inventoryItems.code, pattern),
        likeEscaped(inventoryItems.sapCode, pattern),
        likeEscaped(inventoryItems.name, pattern),
        likeEscaped(inventoryItems.location, pattern),
        likeEscaped(inventoryItems.sector, pattern),
      )!,
    );
  }
  return conditions.length ? and(...conditions) : undefined;
}

async function linkedModuleCounts(db: Database, itemIds: number[]) {
  if (!itemIds.length) return new Map<number, number>();
  const rows = await db
    .select({ itemId: learningResources.inventoryItemId, total: sql<number>`count(distinct ${learningResources.moduleId})` })
    .from(learningResources)
    .where(inArray(learningResources.inventoryItemId, itemIds))
    .groupBy(learningResources.inventoryItemId);
  return new Map<number, number>(rows.filter(row => row.itemId != null).map(row => [row.itemId as number, Number(row.total)] as const));
}

export async function listItems(input: ItemListInput) {
  const db = await requireDb();
  const where = itemFilters(input);
  const [{ total }] = await db.select({ total: count() }).from(inventoryItems).where(where);
  const rows = await db
    .select({ item: inventoryItems, categoryName: inventoryCategories.name })
    .from(inventoryItems)
    .leftJoin(inventoryCategories, eq(inventoryItems.categoryId, inventoryCategories.id))
    .where(where)
    .orderBy(asc(inventoryItems.name), asc(inventoryItems.id))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);
  const counts = await linkedModuleCounts(db, rows.map(row => row.item.id));
  return {
    items: rows.map(row => presentItem(row.item, { categoryName: row.categoryName, linkedModules: counts.get(row.item.id) ?? 0 })),
    total: Number(total),
    page: input.page,
    pageSize: input.pageSize,
    pageCount: Math.max(1, Math.ceil(Number(total) / input.pageSize)),
  };
}

/** Itens ativos para vincular a recursos de módulos no editor docente. */
export async function listLinkableItems() {
  const db = await requireDb();
  const rows = await db.select().from(inventoryItems).where(isNull(inventoryItems.archivedAt)).orderBy(asc(inventoryItems.name));
  return rows.map(item => {
    const presented = presentItem(item);
    return {
      id: item.id,
      code: item.code,
      name: item.name,
      itemType: item.itemType,
      unit: item.unit,
      returnable: Boolean(item.returnable),
      status: item.status,
      physical: item.quantityPhysical,
      reserved: item.quantityReserved,
      minQuantity: item.minQuantity,
      available: presented.available,
      health: presented.health,
    };
  });
}

export async function getItemDetail(id: number) {
  const db = await requireDb();
  const [row] = await db
    .select({ item: inventoryItems, categoryName: inventoryCategories.name })
    .from(inventoryItems)
    .leftJoin(inventoryCategories, eq(inventoryItems.categoryId, inventoryCategories.id))
    .where(eq(inventoryItems.id, id))
    .limit(1);
  if (!row) throw new InventoryServiceError("NOT_FOUND", "Item de estoque não encontrado.");
  const [movements, loans, usedIn, audit] = await Promise.all([
    db
      .select({ movement: inventoryMovements, userName: users.name })
      .from(inventoryMovements)
      .leftJoin(users, eq(inventoryMovements.userId, users.id))
      .where(eq(inventoryMovements.itemId, id))
      .orderBy(desc(inventoryMovements.createdAt), desc(inventoryMovements.id))
      .limit(50),
    db.select().from(inventoryLoans).where(and(eq(inventoryLoans.itemId, id), inArray(inventoryLoans.status, ["reservado", "retirado"]))).orderBy(desc(inventoryLoans.createdAt)),
    db
      .select({
        moduleId: learningModules.id,
        moduleTitle: learningModules.title,
        moduleCode: learningModules.code,
        published: learningModules.published,
        resourceTitle: learningResources.title,
      })
      .from(learningResources)
      .innerJoin(learningModules, eq(learningModules.id, learningResources.moduleId))
      .where(eq(learningResources.inventoryItemId, id))
      .orderBy(asc(learningModules.title)),
    db
      .select({ entry: inventoryAuditLog, userName: users.name })
      .from(inventoryAuditLog)
      .leftJoin(users, eq(inventoryAuditLog.userId, users.id))
      .where(and(eq(inventoryAuditLog.entityType, "item"), eq(inventoryAuditLog.entityId, id)))
      .orderBy(desc(inventoryAuditLog.createdAt), desc(inventoryAuditLog.id))
      .limit(30),
  ]);
  return {
    item: presentItem(row.item, { categoryName: row.categoryName, linkedModules: new Set(usedIn.map(use => use.moduleId)).size }),
    movements: movements.map(entry => ({ ...entry.movement, userName: entry.userName })),
    activeLoans: loans,
    usedIn: usedIn.map(use => ({ ...use, published: Boolean(use.published) })),
    audit: audit.map(entry => ({ ...entry.entry, userName: entry.userName, changes: safeParse(entry.entry.changes) })),
  };
}

function safeParse(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return {};
  }
}

async function assertCategoryUsable(tx: Tx, categoryId: number | null, previousCategoryId?: number | null) {
  if (categoryId == null) return;
  const [category] = await tx.select({ id: inventoryCategories.id, archivedAt: inventoryCategories.archivedAt }).from(inventoryCategories).where(eq(inventoryCategories.id, categoryId)).limit(1);
  if (!category) throw new InventoryServiceError("BAD_REQUEST", "Categoria inexistente.");
  if (category.archivedAt && categoryId !== previousCategoryId) throw new InventoryServiceError("BAD_REQUEST", "Esta categoria está arquivada.");
}

export async function createItem(input: ItemCreateInput, userId: number) {
  const db = await requireDb();
  const code = normalizeItemCode(input.code);
  try {
    return await db.transaction(async tx => {
      await assertCategoryUsable(tx, input.categoryId);
      const [{ id }] = await tx
        .insert(inventoryItems)
        .values({
          code,
          sapCode: input.sapCode,
          name: input.name,
          description: input.description,
          itemType: input.itemType,
          categoryId: input.categoryId,
          unit: input.unit,
          returnable: input.returnable ? 1 : 0,
          quantityPhysical: 0,
          quantityReserved: 0,
          minQuantity: input.minQuantity,
          sector: input.sector,
          location: input.location,
          conservation: input.conservation,
          status: input.status,
          icon: input.icon,
          createdBy: userId,
          updatedBy: userId,
        })
        .returning({ id: inventoryItems.id });
      const { initialQuantity, initialReason, requestKey, ...auditFields } = input;
      await writeAudit(tx, { entityType: "item", entityId: id, action: "create", changes: { ...auditFields, code, initialQuantity }, userId });
      if (initialQuantity > 0) {
        const item = await lockItem(tx, id);
        await applyMovement(tx, {
          item,
          type: "entrada",
          quantity: initialQuantity,
          reason: initialReason,
          userId,
          reference: "Cadastro inicial",
          requestKey,
        });
      }
      return { id };
    });
  } catch (error) {
    if (isDuplicateEntry(error)) {
      const detail = duplicatedConstraint(error);
      if (detail.includes("requestKey")) throw new InventoryServiceError("CONFLICT", "Este cadastro já foi enviado. Atualize a lista.");
      throw new InventoryServiceError("CONFLICT", `Já existe um item com o código ${code}.`);
    }
    throw error;
  }
}

const AUDITED_ITEM_FIELDS = [
  "code",
  "sapCode",
  "name",
  "description",
  "itemType",
  "categoryId",
  "unit",
  "returnable",
  "minQuantity",
  "sector",
  "location",
  "conservation",
  "status",
  "icon",
] as const;

export async function updateItem(input: ItemUpdateInput, userId: number) {
  const db = await requireDb();
  const code = normalizeItemCode(input.code);
  try {
    return await db.transaction(async tx => {
      const current = await lockItem(tx, input.id);
      if (current.version !== input.expectedVersion) {
        throw new InventoryServiceError("CONFLICT", "Este item foi alterado por outra pessoa. Recarregue os dados antes de salvar.");
      }
      if (current.archivedAt) throw new InventoryServiceError("BAD_REQUEST", "Restaure o item antes de editá-lo.");
      await assertCategoryUsable(tx, input.categoryId, current.categoryId);
      const [[movementCount], [loanCount]] = await Promise.all([
        tx.select({ total: count() }).from(inventoryMovements).where(eq(inventoryMovements.itemId, input.id)),
        tx.select({ total: count() }).from(inventoryLoans).where(and(eq(inventoryLoans.itemId, input.id), inArray(inventoryLoans.status, ["reservado", "retirado"]))),
      ]);
      assertItemEditAllowed(
        {
          physical: current.quantityPhysical,
          reserved: current.quantityReserved,
          unit: current.unit,
          returnable: Boolean(current.returnable),
          status: current.status,
          hasMovements: Number(movementCount.total) > 0,
          activeLoans: Number(loanCount.total),
        },
        { unit: input.unit, returnable: input.returnable, status: input.status },
      );
      const next = {
        code,
        sapCode: input.sapCode,
        name: input.name,
        description: input.description,
        itemType: input.itemType,
        categoryId: input.categoryId,
        unit: input.unit,
        returnable: input.returnable ? 1 : 0,
        minQuantity: input.minQuantity,
        sector: input.sector,
        location: input.location,
        conservation: input.conservation,
        status: input.status,
        icon: input.icon,
      };
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      for (const field of AUDITED_ITEM_FIELDS) {
        if (current[field] !== next[field]) {
          before[field] = current[field];
          after[field] = next[field];
        }
      }
      if (!Object.keys(after).length) return { id: input.id, version: current.version, changed: false };
      await tx
        .update(inventoryItems)
        .set({ ...next, version: current.version + 1, updatedBy: userId })
        .where(and(eq(inventoryItems.id, input.id), eq(inventoryItems.version, current.version)));
      await writeAudit(tx, { entityType: "item", entityId: input.id, action: "update", changes: { before, after }, userId });
      return { id: input.id, version: current.version + 1, changed: true };
    });
  } catch (error) {
    if (isDuplicateEntry(error)) throw new InventoryServiceError("CONFLICT", `Já existe um item com o código ${code}.`);
    throw error;
  }
}

export async function archiveItem(input: { id: number; reason: string }, userId: number) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const current = await lockItem(tx, input.id);
    if (current.archivedAt) return { success: true, alreadyArchived: true } as const;
    const [loanCount] = await tx
      .select({ total: count() })
      .from(inventoryLoans)
      .where(and(eq(inventoryLoans.itemId, input.id), inArray(inventoryLoans.status, ["reservado", "retirado"])));
    assertArchiveAllowed({ reserved: current.quantityReserved, activeLoans: Number(loanCount.total) });
    await tx
      .update(inventoryItems)
      .set({ archivedAt: new Date(), archivedBy: userId, archiveReason: input.reason, version: current.version + 1, updatedBy: userId })
      .where(eq(inventoryItems.id, input.id));
    await writeAudit(tx, { entityType: "item", entityId: input.id, action: "archive", changes: { reason: input.reason, physical: current.quantityPhysical }, userId });
    return { success: true, alreadyArchived: false } as const;
  });
}

export async function restoreItem(id: number, userId: number) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const current = await lockItem(tx, id);
    if (!current.archivedAt) return { success: true } as const;
    await tx
      .update(inventoryItems)
      .set({ archivedAt: null, archivedBy: null, archiveReason: null, version: current.version + 1, updatedBy: userId })
      .where(eq(inventoryItems.id, id));
    await writeAudit(tx, { entityType: "item", entityId: id, action: "restore", changes: { previousReason: current.archiveReason }, userId });
    return { success: true } as const;
  });
}

/* ------------------------------------------------------------------ */
/* Movimentações manuais                                               */
/* ------------------------------------------------------------------ */

async function findMovementByRequestKey(db: Database, requestKey: string) {
  const [existing] = await db.select().from(inventoryMovements).where(eq(inventoryMovements.requestKey, requestKey)).limit(1);
  return existing;
}

/** Mesma `requestKey` com outro conteúdo é um erro do cliente, não um reenvio. */
function assertSameRequest(matches: boolean) {
  if (!matches) {
    throw new InventoryServiceError("CONFLICT", "Esta solicitação já foi usada para outra operação. Recarregue a página e tente de novo.");
  }
}

function sameMovement(saved: { itemId: number; movementType: string; quantity: number }, input: MovementCreateInput) {
  return saved.itemId === input.itemId && saved.movementType === input.type && saved.quantity === input.quantity;
}

export async function registerMovement(input: MovementCreateInput, userId: number) {
  const db = await requireDb();
  const existing = await findMovementByRequestKey(db, input.requestKey);
  if (existing) {
    assertSameRequest(sameMovement(existing, input));
    return { movementId: existing.id, duplicated: true, physicalAfter: existing.physicalAfter, reservedAfter: existing.reservedAfter };
  }
  assertManualMovementReason(input.type, input.reason, input.note);
  try {
    return await db.transaction(async tx => {
      const item = await lockItem(tx, input.itemId);
      if (input.type === "saida" && input.reason === "aula" && item.status !== "disponivel") {
        throw new InventoryRuleError("UNAVAILABLE", "Item em manutenção ou indisponível não pode sair para uso em aula.");
      }
      const module = await moduleSnapshot(tx, input.moduleId);
      const result = await applyMovement(tx, {
        item,
        type: input.type,
        quantity: input.quantity,
        reason: input.reason,
        userId,
        reference: input.reference,
        note: input.note,
        classroomId: await activeClassroomId(tx, input.classroomId),
        ...module,
        requestKey: input.requestKey,
      });
      return { ...result, duplicated: false };
    });
  } catch (error) {
    if (isDuplicateEntry(error)) {
      const saved = await findMovementByRequestKey(db, input.requestKey);
      if (saved) {
        assertSameRequest(sameMovement(saved, input));
        return { movementId: saved.id, duplicated: true, physicalAfter: saved.physicalAfter, reservedAfter: saved.reservedAfter };
      }
    }
    throw error;
  }
}

export async function listMovements(input: MovementListInput) {
  const db = await requireDb();
  const conditions: SQL[] = [];
  if (input.itemId) conditions.push(eq(inventoryMovements.itemId, input.itemId));
  if (input.type) conditions.push(eq(inventoryMovements.movementType, input.type));
  if (input.userId) conditions.push(eq(inventoryMovements.userId, input.userId));
  const search = input.search?.trim();
  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    conditions.push(
      or(
        likeEscaped(inventoryMovements.itemCodeSnapshot, pattern),
        likeEscaped(inventoryMovements.itemNameSnapshot, pattern),
        likeEscaped(inventoryMovements.reference, pattern),
        likeEscaped(inventoryMovements.moduleTitleSnapshot, pattern),
      )!,
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const [{ total }] = await db.select({ total: count() }).from(inventoryMovements).where(where);
  const rows = await db
    .select({ movement: inventoryMovements, userName: users.name })
    .from(inventoryMovements)
    .leftJoin(users, eq(inventoryMovements.userId, users.id))
    .where(where)
    .orderBy(desc(inventoryMovements.createdAt), desc(inventoryMovements.id))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);
  const responsible = await db
    .selectDistinct({ id: users.id, name: users.name })
    .from(inventoryMovements)
    .innerJoin(users, eq(inventoryMovements.userId, users.id))
    .orderBy(asc(users.name));
  return {
    movements: rows.map(row => ({ ...row.movement, userName: row.userName })),
    total: Number(total),
    page: input.page,
    pageSize: input.pageSize,
    pageCount: Math.max(1, Math.ceil(Number(total) / input.pageSize)),
    responsible,
  };
}

/* ------------------------------------------------------------------ */
/* Empréstimos (reserva → retirada → devolução)                        */
/* ------------------------------------------------------------------ */

async function findLoanByRequestKey(db: Database, requestKey: string) {
  const [existing] = await db.select().from(inventoryLoans).where(eq(inventoryLoans.requestKey, requestKey)).limit(1);
  return existing;
}

export async function createLoan(input: LoanCreateInput, userId: number) {
  const db = await requireDb();
  const existing = await findLoanByRequestKey(db, input.requestKey);
  if (existing) {
    assertSameRequest(existing.itemId === input.itemId && existing.quantity === input.quantity);
    return { loanId: existing.id, duplicated: true };
  }
  try {
    return await db.transaction(async tx => {
      const item = await lockItem(tx, input.itemId);
      let borrowerName = input.borrowerName;
      // Aluno cadastrado: vale a turma do cadastro. Sem aluno (turma/bancada), a turma escolhida.
      let classroomId = await activeClassroomId(tx, input.classroomId);
      if (input.borrowerUserId) {
        const [borrower] = await tx.select({ id: users.id, name: users.name, role: users.role, active: users.active, classroomId: users.classroomId }).from(users).where(eq(users.id, input.borrowerUserId)).limit(1);
        if (!borrower || !borrower.active) throw new InventoryServiceError("BAD_REQUEST", "A pessoa selecionada não existe ou está desativada.");
        if (!canBorrowTools(borrower.role)) {
          throw new InventoryServiceError("BAD_REQUEST", "Somente contas de aluno ou docente recebem empréstimo vinculado. Para outra pessoa, use \"Turma / outra pessoa\".");
        }
        borrowerName = borrower.name || borrowerName;
        classroomId = borrower.classroomId ?? classroomId;
      }
      const module = await moduleSnapshot(tx, input.moduleId);
      if (input.dueAt && input.dueAt.getTime() < Date.now() - 60_000) {
        throw new InventoryServiceError("BAD_REQUEST", "A data de devolução prevista não pode estar no passado.");
      }
      // Valida saldo antes de criar o registro do empréstimo.
      planStockChange(toSnapshot(item), "reserva", input.quantity);
      const [{ id: loanId }] = await tx
        .insert(inventoryLoans)
        .values({
          itemId: item.id,
          borrowerUserId: input.borrowerUserId ?? null,
          borrowerName,
          classroomId,
          quantity: input.quantity,
          purpose: input.purpose,
          moduleId: module.moduleId,
          dueAt: input.dueAt ?? null,
          requestKey: input.requestKey,
          createdBy: userId,
        })
        .returning({ id: inventoryLoans.id });
      await applyMovement(tx, {
        item,
        type: "reserva",
        quantity: input.quantity,
        reason: "emprestimo",
        userId,
        reference: `Empréstimo #${loanId}`,
        note: input.purpose,
        loanId,
        classroomId,
        ...module,
      });
      return { loanId, duplicated: false };
    });
  } catch (error) {
    if (isDuplicateEntry(error)) {
      const saved = await findLoanByRequestKey(db, input.requestKey);
      if (saved) {
        assertSameRequest(saved.itemId === input.itemId && saved.quantity === input.quantity);
        return { loanId: saved.id, duplicated: true };
      }
    }
    throw error;
  }
}

/** Confirma a retirada: desconta o físico e a reserva uma única vez. */
export async function deliverLoan(loanId: number, userId: number) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const loan = await lockLoan(tx, loanId);
    if (loan.status === "retirado") return { success: true, alreadyDone: true } as const;
    assertLoanTransition(loan, "deliver");
    const item = await lockItem(tx, loan.itemId);
    await applyMovement(tx, {
      item,
      type: "retirada",
      quantity: loan.quantity,
      reason: "emprestimo",
      userId,
      reference: `Empréstimo #${loan.id}`,
      note: `Entregue para ${loan.borrowerName}`,
      loanId: loan.id,
      classroomId: loan.classroomId,
      ...(await moduleSnapshot(tx, loan.moduleId)),
    });
    await tx.update(inventoryLoans).set({ status: "retirado", deliveredBy: userId, deliveredAt: new Date() }).where(eq(inventoryLoans.id, loan.id));
    return { success: true, alreadyDone: false } as const;
  });
}

export async function cancelLoan(loanId: number, reason: string, userId: number) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const loan = await lockLoan(tx, loanId);
    if (loan.status === "cancelado") return { success: true, alreadyDone: true } as const;
    assertLoanTransition(loan, "cancel");
    const item = await lockItem(tx, loan.itemId);
    await applyMovement(tx, {
      item,
      type: "cancelamento_reserva",
      quantity: loan.quantity,
      reason: "emprestimo",
      userId,
      reference: `Empréstimo #${loan.id}`,
      note: reason,
      loanId: loan.id,
      classroomId: loan.classroomId,
    });
    await tx
      .update(inventoryLoans)
      .set({ status: "cancelado", cancelReason: reason, closedBy: userId, closedAt: new Date() })
      .where(eq(inventoryLoans.id, loan.id));
    return { success: true, alreadyDone: false } as const;
  });
}

/**
 * Registra devolução parcial ou total. Unidades em bom estado voltam ao saldo;
 * unidades avariadas ficam registradas e não retornam ao disponível.
 */
export async function returnLoan(input: LoanReturnInput, userId: number) {
  const db = await requireDb();
  const existing = await findMovementByRequestKey(db, input.requestKey);
  if (existing) {
    assertSameRequest(existing.loanId === input.loanId);
    return { success: true, duplicated: true } as const;
  }
  try {
    return await db.transaction(async tx => {
      const loan = await lockLoan(tx, input.loanId);
      const plan = planLoanReturn(loan, input.goodQuantity, input.damagedQuantity);
      const item = await lockItem(tx, loan.itemId);
      let keyUsed = false;
      if (input.goodQuantity > 0) {
        await applyMovement(tx, {
          item,
          type: "devolucao",
          quantity: input.goodQuantity,
          reason: "devolucao",
          userId,
          reference: `Empréstimo #${loan.id}`,
          note: input.note,
          loanId: loan.id,
          classroomId: loan.classroomId,
          requestKey: input.requestKey,
        });
        keyUsed = true;
      }
      if (input.damagedQuantity > 0) {
        await applyMovement(tx, {
          item,
          type: "devolucao_avaria",
          quantity: input.damagedQuantity,
          reason: "avaria",
          userId,
          reference: `Empréstimo #${loan.id}`,
          note: input.note,
          loanId: loan.id,
          classroomId: loan.classroomId,
          requestKey: keyUsed ? null : input.requestKey,
        });
      }
      await tx
        .update(inventoryLoans)
        .set({
          returnedQuantity: plan.returnedQuantity,
          damagedQuantity: plan.damagedQuantity,
          status: plan.status,
          ...(plan.closed ? { closedBy: userId, closedAt: new Date() } : {}),
        })
        .where(eq(inventoryLoans.id, loan.id));
      return { success: true, duplicated: false, closed: plan.closed, outstanding: plan.outstandingAfter } as const;
    });
  } catch (error) {
    if (isDuplicateEntry(error)) {
      const saved = await findMovementByRequestKey(db, input.requestKey);
      if (saved) {
        assertSameRequest(saved.loanId === input.loanId);
        return { success: true, duplicated: true } as const;
      }
    }
    throw error;
  }
}

export async function listLoans(input: LoanListInput) {
  const db = await requireDb();
  const conditions: SQL[] = [];
  if (input.status === "active") conditions.push(inArray(inventoryLoans.status, ["reservado", "retirado"]));
  else if (input.status !== "all") conditions.push(eq(inventoryLoans.status, input.status));
  if (input.itemId) conditions.push(eq(inventoryLoans.itemId, input.itemId));
  const where = conditions.length ? and(...conditions) : undefined;
  const [{ total }] = await db.select({ total: count() }).from(inventoryLoans).where(where);
  const rows = await db
    .select({
      loan: inventoryLoans,
      itemCode: inventoryItems.code,
      itemName: inventoryItems.name,
      itemUnit: inventoryItems.unit,
      moduleTitle: learningModules.title,
      createdByName: users.name,
    })
    .from(inventoryLoans)
    .innerJoin(inventoryItems, eq(inventoryItems.id, inventoryLoans.itemId))
    .leftJoin(learningModules, eq(learningModules.id, inventoryLoans.moduleId))
    .leftJoin(users, eq(users.id, inventoryLoans.createdBy))
    .where(where)
    .orderBy(desc(inventoryLoans.createdAt), desc(inventoryLoans.id))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);
  const now = Date.now();
  return {
    loans: rows.map(row => ({
      ...row.loan,
      itemCode: row.itemCode,
      itemName: row.itemName,
      itemUnit: row.itemUnit,
      moduleTitle: row.moduleTitle,
      createdByName: row.createdByName,
      outstanding: Math.max(0, row.loan.quantity - row.loan.returnedQuantity - row.loan.damagedQuantity),
      overdue: isLoanOverdue(row.loan, now),
    })),
    total: Number(total),
    page: input.page,
    pageSize: input.pageSize,
    pageCount: Math.max(1, Math.ceil(Number(total) / input.pageSize)),
  };
}

/* ------------------------------------------------------------------ */
/* Resumo / alertas                                                    */
/* ------------------------------------------------------------------ */

export async function getInventorySummary() {
  const db = await requireDb();
  const [items, loans, recent] = await Promise.all([
    db
      .select({ item: inventoryItems, categoryName: inventoryCategories.name })
      .from(inventoryItems)
      .leftJoin(inventoryCategories, eq(inventoryItems.categoryId, inventoryCategories.id))
      .where(isNull(inventoryItems.archivedAt)),
    db
      .select({ status: inventoryLoans.status, dueAt: inventoryLoans.dueAt })
      .from(inventoryLoans)
      .where(inArray(inventoryLoans.status, ["reservado", "retirado"])),
    db
      .select({ movement: inventoryMovements, userName: users.name })
      .from(inventoryMovements)
      .leftJoin(users, eq(users.id, inventoryMovements.userId))
      .orderBy(desc(inventoryMovements.createdAt), desc(inventoryMovements.id))
      .limit(6),
  ]);
  const [archived] = await db.select({ total: count() }).from(inventoryItems).where(isNotNull(inventoryItems.archivedAt));
  const presented = items.map(row => presentItem(row.item, { categoryName: row.categoryName }));
  const now = Date.now();
  const lowStock = presented.filter(item => item.lowStock || item.health === "sem_saldo");
  return {
    totals: {
      items: presented.length,
      available: presented.filter(item => item.health === "ok" || item.health === "baixo").length,
      maintenance: presented.filter(item => item.health === "manutencao").length,
      unavailable: presented.filter(item => item.health === "indisponivel" || item.health === "sem_saldo").length,
      lowStock: presented.filter(item => item.lowStock).length,
      archived: Number(archived.total),
      activeLoans: loans.length,
      reservedLoans: loans.filter(loan => loan.status === "reservado").length,
      overdueLoans: loans.filter(loan => isLoanOverdue(loan, now)).length,
    },
    alerts: lowStock
      .sort((a, b) => a.available - a.minQuantity - (b.available - b.minQuantity))
      .slice(0, 8)
      .map(item => ({ id: item.id, code: item.code, name: item.name, available: item.available, minQuantity: item.minQuantity, unit: item.unit, health: item.health })),
    recentMovements: recent.map(row => ({ ...row.movement, userName: row.userName })),
  };
}

/** Pessoas que podem receber empréstimos vinculados à conta (alunos e docentes ativos). */
export async function listBorrowers() {
  const db = await requireDb();
  return db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, classroomId: users.classroomId, classroomName: classrooms.name })
    .from(users)
    .leftJoin(classrooms, eq(classrooms.id, users.classroomId))
    .where(and(inArray(users.role, [...BORROWER_ROLES]), eq(users.active, 1)))
    .orderBy(asc(users.name));
}

/** Empréstimos abertos (reservados ou retirados) em nome de uma conta. */
export async function countOpenLoansOf(userId: number) {
  const db = await requireDb();
  const [{ total }] = await db
    .select({ total: count() })
    .from(inventoryLoans)
    .where(and(eq(inventoryLoans.borrowerUserId, userId), inArray(inventoryLoans.status, ["reservado", "retirado"])));
  return Number(total);
}

/** Quanto tempo um empréstimo encerrado continua visível para quem o recebeu. */
const CLOSED_LOAN_VISIBLE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * O que a própria conta vê dos seus empréstimos: abertos e os encerrados nos
 * últimos 30 dias. Sem dados internos do estoque (quem registrou, chaves, saldo).
 */
export async function listBorrowerLoans(userId: number) {
  const db = await requireDb();
  const rows = await db
    .select({
      loan: inventoryLoans,
      itemCode: inventoryItems.code,
      itemName: inventoryItems.name,
      itemUnit: inventoryItems.unit,
      moduleTitle: learningModules.title,
    })
    .from(inventoryLoans)
    .innerJoin(inventoryItems, eq(inventoryItems.id, inventoryLoans.itemId))
    .leftJoin(learningModules, eq(learningModules.id, inventoryLoans.moduleId))
    .where(eq(inventoryLoans.borrowerUserId, userId))
    .orderBy(desc(inventoryLoans.createdAt), desc(inventoryLoans.id))
    .limit(50);
  const now = Date.now();
  return rows
    .filter(({ loan }) => loan.status === "reservado" || loan.status === "retirado" || (loan.closedAt != null && now - new Date(loan.closedAt).getTime() <= CLOSED_LOAN_VISIBLE_MS))
    .map(({ loan, ...item }) => ({
      id: loan.id,
      itemCode: item.itemCode,
      itemName: item.itemName,
      itemUnit: item.itemUnit,
      moduleTitle: item.moduleTitle,
      quantity: loan.quantity,
      returnedQuantity: loan.returnedQuantity,
      damagedQuantity: loan.damagedQuantity,
      outstanding: Math.max(0, loan.quantity - loan.returnedQuantity - loan.damagedQuantity),
      status: loan.status,
      purpose: loan.purpose,
      dueAt: loan.dueAt,
      overdue: isLoanOverdue(loan, now),
      createdAt: loan.createdAt,
      deliveredAt: loan.deliveredAt,
      closedAt: loan.closedAt,
    }));
}

/** Turmas ativas para associar a saídas e empréstimos. */
export async function listClassroomOptions() {
  const db = await requireDb();
  return db
    .select({ id: classrooms.id, name: classrooms.name })
    .from(classrooms)
    .where(isNull(classrooms.archivedAt))
    .orderBy(asc(classrooms.name));
}

/** Módulos para associar a movimentações e empréstimos. */
export async function listModuleOptions() {
  const db = await requireDb();
  return db
    .select({ id: learningModules.id, code: learningModules.code, title: learningModules.title })
    .from(learningModules)
    .where(isNull(learningModules.archivedAt))
    .orderBy(asc(learningModules.code));
}

export type { InventoryLoan };
