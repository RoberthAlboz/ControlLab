import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, sqliteTable, text, uniqueIndex, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";

/**
 * Banco SQLite (arquivo em data/forgelab.db). Convenções:
 * - datas: INTEGER em milissegundos (`timestamp_ms`), convertidas para Date pelo Drizzle;
 * - booleanos: INTEGER 0/1 (mantido do schema original);
 * - enums: TEXT com valores restritos pelo TypeScript e validados pelo zod na API.
 */
const createdAt = (name: string) => integer(name, { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`);
const updatedAt = (name: string) =>
  integer(name, { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`)
    .$onUpdate(() => new Date());
const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" });

/* ------------------------------------------------------------------------ */
/* Identidade e sessões                                                      */
/* ------------------------------------------------------------------------ */

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Identificador estável usado nas sessões (ex.: `local:docente@forgelab.local`). */
  openId: text("openId").notNull().unique(),
  name: text("name"),
  email: text("email"),
  avatarUrl: text("avatarUrl"),
  loginMethod: text("loginMethod"),
  /** Hash scrypt no formato `scrypt$N$r$p$salt$hash`. Nunca a senha em texto. */
  passwordHash: text("passwordHash"),
  role: text("role", { enum: ["student", "teacher", "admin"] }).default("student").notNull(),
  active: integer("active").default(1).notNull(),
  /** Turma do aluno (null para docentes/admins ou aluno ainda sem turma). */
  classroomId: integer("classroomId").references((): AnySQLiteColumn => classrooms.id, { onDelete: "set null" }),
  createdAt: createdAt("createdAt"),
  updatedAt: updatedAt("updatedAt"),
  lastSignedIn: createdAt("lastSignedIn"),
}, (table) => ({
  emailUnique: uniqueIndex("users_email_unique").on(table.email),
  classroomIdx: index("users_classroom_idx").on(table.classroomId),
}));

/** Turma (sala) com um docente responsável — é quem a administração aciona. */
export const classrooms = sqliteTable("classrooms", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  teacherId: integer("teacherId").references((): AnySQLiteColumn => users.id, { onDelete: "set null" }),
  archivedAt: timestamp("archivedAt"),
  createdAt: createdAt("createdAt"),
  updatedAt: updatedAt("updatedAt"),
}, (table) => ({
  nameUnique: uniqueIndex("classrooms_name_unique").on(table.name),
  teacherIdx: index("classrooms_teacher_idx").on(table.teacherId),
}));

/** Registro server-side das sessões emitidas: permite expirar e revogar JWTs. */
export const authSessions = sqliteTable("auth_sessions", {
  jti: text("jti").primaryKey(),
  openId: text("openId").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  revokedAt: timestamp("revokedAt"),
  createdAt: createdAt("createdAt"),
}, (table) => ({
  openIdIdx: index("auth_sessions_open_id_idx").on(table.openId),
  activeIdx: index("auth_sessions_active_idx").on(table.revokedAt, table.expiresAt),
}));

/* ------------------------------------------------------------------------ */
/* Área educacional                                                          */
/* ------------------------------------------------------------------------ */

export const studentBadges = sqliteTable("student_badges", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  label: text("label").notNull(),
  detail: text("detail").notNull(),
  awardedBy: integer("awardedBy").notNull(),
  awardedAt: createdAt("awardedAt"),
}, (table) => ({
  userIdx: index("student_badges_user_idx").on(table.userId),
  userFk: foreignKey({ name: "student_badges_user_fk", columns: [table.userId], foreignColumns: [users.id] }).onDelete("cascade"),
}));

export const learningModules = sqliteTable("learning_modules", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  title: text("title").notNull(),
  /** Texto livre do docente (exemplos sugeridos: Ferramenta, Montagem, Processo). */
  kind: text("kind").notNull(),
  description: text("description").notNull(),
  objective: text("objective").notNull(),
  cover: text("cover").notNull(),
  coverImage: text("coverImage"),
  progress: integer("progress").default(0).notNull(),
  duration: text("duration").notNull(),
  published: integer("published").default(0).notNull(),
  createdBy: integer("createdBy"),
  /** Módulo excluído pelo docente: some do catálogo, mas o progresso dos alunos é preservado. */
  archivedAt: timestamp("archivedAt"),
  createdAt: createdAt("createdAt"),
  updatedAt: updatedAt("updatedAt"),
}, (table) => ({
  publishedIdx: index("learning_modules_published_idx").on(table.published),
  archivedIdx: index("learning_modules_archived_idx").on(table.archivedAt),
  createdByFk: foreignKey({ name: "learning_modules_created_by_fk", columns: [table.createdBy], foreignColumns: [users.id] }).onDelete("set null"),
}));

export const learningSteps = sqliteTable("learning_steps", {
  id: text("id").primaryKey(),
  moduleId: text("moduleId").notNull(),
  position: integer("position").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  tip: text("tip").notNull(),
  imageUrl: text("imageUrl"),
  /** JSON de `ContentAttachment[]` (shared/attachments.ts): arquivos e links de apoio. */
  attachments: text("attachments").default("[]").notNull(),
}, (table) => ({
  moduleIdx: index("learning_steps_module_idx").on(table.moduleId),
  moduleFk: foreignKey({ name: "learning_steps_module_fk", columns: [table.moduleId], foreignColumns: [learningModules.id] }).onDelete("cascade").onUpdate("cascade"),
}));

export const learningResources = sqliteTable("learning_resources", {
  id: text("id").primaryKey(),
  moduleId: text("moduleId").notNull(),
  category: text("category", { enum: ["materials", "machines", "tools", "parts"] }).notNull(),
  label: text("label").notNull(),
  title: text("title").notNull(),
  detail: text("detail").notNull(),
  status: text("status").notNull(),
  progress: integer("progress").default(0).notNull(),
  modelUrl: text("modelUrl").notNull(),
  /** JSON de `ContentAttachment[]` (shared/attachments.ts): fichas, desenhos, CAD, 3D… */
  attachments: text("attachments").default("[]").notNull(),
  color: text("color").notNull(),
  /**
   * Vínculo opcional com um item do estoque. O título/descrição do recurso
   * funcionam como snapshot: se o item for arquivado, o módulo continua
   * exibindo a referência original.
   */
  inventoryItemId: integer("inventoryItemId"),
}, (table) => ({
  moduleIdx: index("learning_resources_module_idx").on(table.moduleId),
  moduleFk: foreignKey({ name: "learning_resources_module_fk", columns: [table.moduleId], foreignColumns: [learningModules.id] }).onDelete("cascade").onUpdate("cascade"),
  inventoryIdx: index("learning_resources_inventory_idx").on(table.inventoryItemId),
  inventoryFk: foreignKey({
    name: "learning_resources_inventory_fk",
    columns: [table.inventoryItemId],
    foreignColumns: [inventoryItems.id],
  }).onDelete("set null").onUpdate("cascade"),
}));

export const studentProgress = sqliteTable("student_progress", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  moduleId: text("moduleId").notNull(),
  stepIndex: integer("stepIndex").default(0).notNull(),
  progress: integer("progress").default(0).notNull(),
  studiedMinutes: integer("studiedMinutes").default(0).notNull(),
  streakDays: integer("streakDays").default(0).notNull(),
  updatedAt: updatedAt("updatedAt"),
}, (table) => ({
  userModuleUnique: uniqueIndex("student_progress_user_module_unique").on(table.userId, table.moduleId),
  userFk: foreignKey({ name: "student_progress_user_fk", columns: [table.userId], foreignColumns: [users.id] }).onDelete("cascade"),
  moduleFk: foreignKey({ name: "student_progress_module_fk", columns: [table.moduleId], foreignColumns: [learningModules.id] }).onDelete("cascade").onUpdate("cascade"),
}));

export const studentStepSessions = sqliteTable("student_step_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  moduleId: text("moduleId").notNull(),
  stepIndex: integer("stepIndex").notNull(),
  startedAt: createdAt("startedAt"),
  completedAt: timestamp("completedAt"),
  elapsedSeconds: integer("elapsedSeconds").default(0).notNull(),
}, (table) => ({
  userStepIdx: uniqueIndex("student_step_sessions_user_step_idx").on(table.userId, table.moduleId, table.stepIndex),
  moduleIdx: index("student_step_sessions_module_idx").on(table.userId, table.moduleId),
  userFk: foreignKey({ name: "student_step_sessions_user_fk", columns: [table.userId], foreignColumns: [users.id] }).onDelete("cascade"),
  moduleFk: foreignKey({ name: "student_step_sessions_module_fk", columns: [table.moduleId], foreignColumns: [learningModules.id] }).onDelete("cascade").onUpdate("cascade"),
}));

export const instructors = sqliteTable("instructors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  role: text("role").notNull(),
  badge: text("badge").notNull(),
  initials: text("initials").notNull(),
  avatarUrl: text("avatarUrl"),
  active: integer("active").default(1).notNull(),
  createdAt: createdAt("createdAt"),
});

export const learningActivities = sqliteTable("learning_activities", {
  id: text("id").primaryKey(),
  moduleId: text("moduleId").notNull(),
  title: text("title").notNull(),
  subtitle: text("subtitle").notNull(),
  activityType: text("activityType", { enum: ["aula", "laboratorio", "avaliacao"] }).notNull(),
  startsAt: timestamp("startsAt").notNull(),
  endsAt: timestamp("endsAt").notNull(),
  color: text("color").notNull(),
  /** Docente que agendou; null = atividade antiga, editável por qualquer docente. */
  createdBy: integer("createdBy"),
}, (table) => ({
  createdByIdx: index("learning_activities_created_by_idx").on(table.createdBy),
  moduleFk: foreignKey({ name: "learning_activities_module_fk", columns: [table.moduleId], foreignColumns: [learningModules.id] }).onDelete("cascade").onUpdate("cascade"),
  createdByFk: foreignKey({ name: "learning_activities_created_by_fk", columns: [table.createdBy], foreignColumns: [users.id] }).onDelete("set null"),
}));

/** Diário de aula do aluno (antes ficava só no navegador). Um documento JSON por aluno. */
export const studentNotes = sqliteTable("student_notes", {
  userId: integer("userId").primaryKey(),
  content: text("content").default("[]").notNull(),
  updatedAt: updatedAt("updatedAt"),
}, (table) => ({
  userFk: foreignKey({ name: "student_notes_user_fk", columns: [table.userId], foreignColumns: [users.id] }).onDelete("cascade"),
}));

/* ------------------------------------------------------------------------ */
/* Estoque (exclusivo do papel docente)                                      */
/* ------------------------------------------------------------------------ */

export const inventoryCategories = sqliteTable("inventory_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  archivedAt: timestamp("archivedAt"),
  createdBy: integer("createdBy"),
  createdAt: createdAt("createdAt"),
  updatedAt: updatedAt("updatedAt"),
}, (table) => ({
  nameUnique: uniqueIndex("inventory_categories_name_unique").on(table.name),
  createdByFk: foreignKey({
    name: "inventory_categories_created_by_fk",
    columns: [table.createdBy],
    foreignColumns: [users.id],
  }).onDelete("set null"),
}));

export const inventoryItems = sqliteTable("inventory_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Código patrimonial/interno. Único: diferencia itens com o mesmo SAP. */
  code: text("code").notNull(),
  /** Código SAP é texto e pode se repetir entre descrições diferentes. */
  sapCode: text("sapCode"),
  name: text("name").notNull(),
  description: text("description"),
  itemType: text("itemType", { enum: ["tool", "machine", "material", "part"] }).notNull(),
  categoryId: integer("categoryId"),
  unit: text("unit", { enum: ["UN", "JG", "PC", "CX", "PAR"] }).default("UN").notNull(),
  /** 1 = ferramenta devolvível (empréstimo); 0 = consumível (saída). */
  returnable: integer("returnable").default(1).notNull(),
  quantityPhysical: integer("quantityPhysical").default(0).notNull(),
  quantityReserved: integer("quantityReserved").default(0).notNull(),
  minQuantity: integer("minQuantity").default(0).notNull(),
  sector: text("sector").notNull(),
  location: text("location").notNull(),
  conservation: text("conservation", { enum: ["novo", "bom", "regular", "ruim"] }).default("bom").notNull(),
  status: text("status", { enum: ["disponivel", "manutencao", "indisponivel"] }).default("disponivel").notNull(),
  /** Figura escolhida no cadastro (ITEM_ICONS); null = automática. */
  icon: text("icon"),
  /** Controle otimista de concorrência para edições de cadastro. */
  version: integer("version").default(0).notNull(),
  archivedAt: timestamp("archivedAt"),
  archivedBy: integer("archivedBy"),
  archiveReason: text("archiveReason"),
  createdBy: integer("createdBy"),
  updatedBy: integer("updatedBy"),
  createdAt: createdAt("createdAt"),
  updatedAt: updatedAt("updatedAt"),
}, (table) => ({
  codeUnique: uniqueIndex("inventory_items_code_unique").on(table.code),
  sapIdx: index("inventory_items_sap_idx").on(table.sapCode),
  typeIdx: index("inventory_items_type_idx").on(table.itemType),
  categoryIdx: index("inventory_items_category_idx").on(table.categoryId),
  archivedIdx: index("inventory_items_archived_idx").on(table.archivedAt),
  categoryFk: foreignKey({
    name: "inventory_items_category_fk",
    columns: [table.categoryId],
    foreignColumns: [inventoryCategories.id],
  }).onDelete("set null"),
  createdByFk: foreignKey({ name: "inventory_items_created_by_fk", columns: [table.createdBy], foreignColumns: [users.id] }).onDelete("set null"),
  updatedByFk: foreignKey({ name: "inventory_items_updated_by_fk", columns: [table.updatedBy], foreignColumns: [users.id] }).onDelete("set null"),
  archivedByFk: foreignKey({ name: "inventory_items_archived_by_fk", columns: [table.archivedBy], foreignColumns: [users.id] }).onDelete("set null"),
  physicalCheck: check("inventory_items_physical_check", sql.raw("`quantityPhysical` >= 0")),
  reservedCheck: check("inventory_items_reserved_check", sql.raw("`quantityReserved` >= 0 AND `quantityReserved` <= `quantityPhysical`")),
  minCheck: check("inventory_items_min_check", sql.raw("`minQuantity` >= 0")),
}));

export const inventoryLoans = sqliteTable("inventory_loans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  itemId: integer("itemId").notNull(),
  borrowerUserId: integer("borrowerUserId"),
  /** Nome de quem recebe (aluno, turma ou docente) — snapshot para o histórico. */
  borrowerName: text("borrowerName").notNull(),
  /** Turma no momento do empréstimo (snapshot: trocar o aluno de turma não muda o histórico). */
  classroomId: integer("classroomId").references((): AnySQLiteColumn => classrooms.id, { onDelete: "set null" }),
  quantity: integer("quantity").notNull(),
  returnedQuantity: integer("returnedQuantity").default(0).notNull(),
  damagedQuantity: integer("damagedQuantity").default(0).notNull(),
  status: text("status", { enum: ["reservado", "retirado", "devolvido", "cancelado"] }).default("reservado").notNull(),
  purpose: text("purpose").notNull(),
  moduleId: text("moduleId"),
  dueAt: timestamp("dueAt"),
  cancelReason: text("cancelReason"),
  requestKey: text("requestKey"),
  createdBy: integer("createdBy").notNull(),
  deliveredBy: integer("deliveredBy"),
  closedBy: integer("closedBy"),
  createdAt: createdAt("createdAt"),
  deliveredAt: timestamp("deliveredAt"),
  closedAt: timestamp("closedAt"),
  updatedAt: updatedAt("updatedAt"),
}, (table) => ({
  requestKeyUnique: uniqueIndex("inventory_loans_request_key_unique").on(table.requestKey),
  itemIdx: index("inventory_loans_item_idx").on(table.itemId),
  statusIdx: index("inventory_loans_status_idx").on(table.status),
  itemFk: foreignKey({ name: "inventory_loans_item_fk", columns: [table.itemId], foreignColumns: [inventoryItems.id] }),
  borrowerFk: foreignKey({ name: "inventory_loans_borrower_fk", columns: [table.borrowerUserId], foreignColumns: [users.id] }).onDelete("set null"),
  moduleFk: foreignKey({ name: "inventory_loans_module_fk", columns: [table.moduleId], foreignColumns: [learningModules.id] }).onDelete("set null").onUpdate("cascade"),
  createdByFk: foreignKey({ name: "inventory_loans_created_by_fk", columns: [table.createdBy], foreignColumns: [users.id] }),
  deliveredByFk: foreignKey({ name: "inventory_loans_delivered_by_fk", columns: [table.deliveredBy], foreignColumns: [users.id] }).onDelete("set null"),
  closedByFk: foreignKey({ name: "inventory_loans_closed_by_fk", columns: [table.closedBy], foreignColumns: [users.id] }).onDelete("set null"),
  quantityCheck: check("inventory_loans_quantity_check", sql.raw("`quantity` > 0")),
  returnCheck: check("inventory_loans_return_check", sql.raw("`returnedQuantity` >= 0 AND `damagedQuantity` >= 0 AND `returnedQuantity` + `damagedQuantity` <= `quantity`")),
}));

/** Movimentações são imutáveis: correções são novos movimentos de ajuste. */
export const inventoryMovements = sqliteTable("inventory_movements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  itemId: integer("itemId").notNull(),
  movementType: text("movementType", { enum: [
    "entrada",
    "saida",
    "ajuste_entrada",
    "ajuste_saida",
    "reserva",
    "cancelamento_reserva",
    "retirada",
    "devolucao",
    "devolucao_avaria",
  ] }).notNull(),
  quantity: integer("quantity").notNull(),
  physicalBefore: integer("physicalBefore").notNull(),
  physicalAfter: integer("physicalAfter").notNull(),
  reservedBefore: integer("reservedBefore").notNull(),
  reservedAfter: integer("reservedAfter").notNull(),
  reason: text("reason", { enum: [
    "compra",
    "doacao",
    "inventario",
    "aula",
    "manutencao",
    "emprestimo",
    "perda",
    "avaria",
    "correcao",
    "devolucao",
    "outro",
  ] }).notNull(),
  reference: text("reference"),
  note: text("note"),
  loanId: integer("loanId"),
  /** Turma atendida (saída para aula ou movimento de um empréstimo da turma). */
  classroomId: integer("classroomId").references((): AnySQLiteColumn => classrooms.id, { onDelete: "set null" }),
  moduleId: text("moduleId"),
  moduleTitleSnapshot: text("moduleTitleSnapshot"),
  itemCodeSnapshot: text("itemCodeSnapshot").notNull(),
  itemNameSnapshot: text("itemNameSnapshot").notNull(),
  unitSnapshot: text("unitSnapshot").notNull(),
  requestKey: text("requestKey"),
  userId: integer("userId").notNull(),
  createdAt: createdAt("createdAt"),
}, (table) => ({
  requestKeyUnique: uniqueIndex("inventory_movements_request_key_unique").on(table.requestKey),
  itemIdx: index("inventory_movements_item_idx").on(table.itemId, table.createdAt),
  typeIdx: index("inventory_movements_type_idx").on(table.movementType),
  userIdx: index("inventory_movements_user_idx").on(table.userId),
  loanIdx: index("inventory_movements_loan_idx").on(table.loanId),
  itemFk: foreignKey({ name: "inventory_movements_item_fk", columns: [table.itemId], foreignColumns: [inventoryItems.id] }),
  loanFk: foreignKey({ name: "inventory_movements_loan_fk", columns: [table.loanId], foreignColumns: [inventoryLoans.id] }),
  moduleFk: foreignKey({ name: "inventory_movements_module_fk", columns: [table.moduleId], foreignColumns: [learningModules.id] }).onDelete("set null").onUpdate("cascade"),
  userFk: foreignKey({ name: "inventory_movements_user_fk", columns: [table.userId], foreignColumns: [users.id] }),
  quantityCheck: check("inventory_movements_quantity_check", sql.raw("`quantity` > 0")),
  balanceCheck: check("inventory_movements_balance_check", sql.raw("`physicalAfter` >= 0 AND `reservedAfter` >= 0 AND `reservedAfter` <= `physicalAfter`")),
}));

/** Histórico de alterações de cadastro (itens e categorias). */
export const inventoryAuditLog = sqliteTable("inventory_audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  entityType: text("entityType", { enum: ["item", "category"] }).notNull(),
  entityId: integer("entityId").notNull(),
  action: text("action", { enum: ["create", "update", "archive", "restore"] }).notNull(),
  changes: text("changes").notNull(),
  userId: integer("userId").notNull(),
  createdAt: createdAt("createdAt"),
}, (table) => ({
  entityIdx: index("inventory_audit_entity_idx").on(table.entityType, table.entityId),
  userFk: foreignKey({ name: "inventory_audit_user_fk", columns: [table.userId], foreignColumns: [users.id] }),
}));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type AuthSession = typeof authSessions.$inferSelect;
export type Classroom = typeof classrooms.$inferSelect;
export type StudentBadge = typeof studentBadges.$inferSelect;
export type LearningModule = typeof learningModules.$inferSelect;
export type LearningStep = typeof learningSteps.$inferSelect;
export type LearningResource = typeof learningResources.$inferSelect;
export type StudentProgress = typeof studentProgress.$inferSelect;
export type StudentStepSession = typeof studentStepSessions.$inferSelect;
export type Instructor = typeof instructors.$inferSelect;
export type LearningActivity = typeof learningActivities.$inferSelect;
export type InventoryCategory = typeof inventoryCategories.$inferSelect;
export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InventoryLoan = typeof inventoryLoans.$inferSelect;
export type InventoryMovement = typeof inventoryMovements.$inferSelect;
export type InventoryAuditEntry = typeof inventoryAuditLog.$inferSelect;
