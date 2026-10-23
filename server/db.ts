import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import type { DatabaseSync } from "node:sqlite";
import { ENV } from "./_core/env";
import { createPostgresConnection, describePostgresUrl, type PostgresConnection } from "./_core/postgres";
import { executeProxy, openSqlite, resolveDatabaseFile, runExclusive } from "./_core/sqlite";
import * as schema from "../drizzle/schema";
import {
  authSessions,
  InsertUser,
  instructors,
  inventoryItems,
  learningActivities,
  learningModules,
  learningResources,
  learningSteps,
  studentBadges,
  studentStepSessions,
  studentProgress,
  users,
} from "../drizzle/schema";
import { availableQuantity, isLowStock, stockHealth } from "@shared/inventory";
import { getElapsedStudySeconds, getFirstChangedStepIndex, isStepCompleted, isValidStoredElapsedSeconds, MAX_ELAPSED_SECONDS, normalizeElapsedSeconds, normalizeProgressRowsWithStepCounts, resolveProgressUpdate, sanitizeStoredElapsedSeconds, selectCanonicalProgressRows, summarizeCompletedStudyTime, filterStudySessionsByVisibleModules, hasSequentialStepPositions } from "@shared/progress";
import { normalizeBadgeContent, type AwardStudentBadgeInput } from "@shared/competencies";
import { getStudentModulesByUser, summarizeStudentStudyTime } from "@shared/supervision";

export type Database = SqliteRemoteDatabase<typeof schema>;
let _db: Database | null = null;

export class LearningDomainError extends Error {
  constructor(public readonly code: "BAD_REQUEST" | "NOT_FOUND", message: string) {
    super(message);
    this.name = "LearningDomainError";
  }
}

function getStepStructure(stepRows: Array<{ moduleId: string; position: number }>) {
  const rowsByModule = new Map<string, number[]>();
  for (const row of stepRows) {
    const positions = rowsByModule.get(row.moduleId) ?? [];
    positions.push(row.position);
    rowsByModule.set(row.moduleId, positions);
  }
  const stepCounts = new Map<string, number>();
  const positionsByModule = new Map<string, Set<number>>();
  rowsByModule.forEach((positions, moduleId) => {
    const sorted = positions.slice().sort((a, b) => a - b);
    const sequential = hasSequentialStepPositions(sorted);
    stepCounts.set(moduleId, sequential ? sorted.length : 0);
    positionsByModule.set(moduleId, sequential ? new Set(sorted) : new Set());
  });
  return { stepCounts, positionsByModule };
}

function countDistinctCompletedSteps(rows: Array<{ moduleId: string; stepIndex: number }>) {
  return new Set(rows.map((row) => `${row.moduleId}:${row.stepIndex}`)).size;
}

function calculateCurrentStreak(rows: Array<{ completedAt: Date | null }>) {
  const days = Array.from(new Set(rows
    .filter((row): row is { completedAt: Date } => row.completedAt instanceof Date)
    .map((row) => row.completedAt.toISOString().slice(0, 10))))
    .sort((a, b) => b.localeCompare(a));
  if (!days.length) return 0;
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const yesterdayKey = new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (days[0] !== todayKey && days[0] !== yesterdayKey) return 0;
  let streak = 1;
  const latest = new Date(`${days[0]}T00:00:00.000Z`).getTime();
  for (let index = 1; index < days.length; index += 1) {
    const expected = new Date(latest - index * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (days[index] !== expected) break;
    streak += 1;
  }
  return streak;
}

let _sqlite: DatabaseSync | null = null;
let _postgres: PostgresConnection | null = null;
let _opening: Promise<Database | null> | null = null;

/** Onde está o banco (arquivo SQLite ou servidor Postgres), sem credenciais. */
export function describeDatabaseLocation() {
  return ENV.databaseProvider === "postgres" ? describePostgresUrl(ENV.databaseUrl) : resolveDatabaseFile();
}

/**
 * Banco SQLite em arquivo (DATABASE_FILE, padrão data/forgelab.db) ou, com
 * DATABASE_PROVIDER=postgres, o Postgres de DATABASE_URL (ex.: Supabase).
 * Uma única conexão; transações serializadas por `runExclusive`.
 */
export async function getDb(): Promise<Database | null> {
  if (_db) return _db;
  _opening ??= (async () => {
    try {
      let db: Database;
      if (ENV.databaseProvider === "postgres") {
        const postgres = createPostgresConnection();
        await postgres.connection();
        db = drizzle((sqlText, params, method) => postgres.execute(sqlText, params, method), { schema });
        _postgres = postgres;
      } else {
        const sqlite = await openSqlite();
        db = drizzle((sqlText, params, method) => executeProxy(sqlite, sqlText, params, method), { schema });
        _sqlite = sqlite;
      }
      const transaction = db.transaction.bind(db);
      // Toda transação passa pelo mutex: uma por vez, sem consultas externas no meio.
      db.transaction = ((work, config) => runExclusive(() => transaction(work, config))) as typeof db.transaction;
      _db = db;
      return db;
    } catch (error) {
      console.warn(`[Database] Falha ao abrir o banco (${describeDatabaseLocation()}):`, error instanceof Error ? error.message : error);
      _opening = null;
      return null;
    }
  })();
  return _opening;
}

/** Garante a conexão ou lança um erro com mensagem amigável. */
export async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error(`Não foi possível abrir o banco em ${describeDatabaseLocation()}.`);
  return db;
}

export async function closeDb() {
  _sqlite?.close();
  _sqlite = null;
  await _postgres?.close();
  _postgres = null;
  _db = null;
  _opening = null;
}

/** Usado no health-check e na inicialização do servidor. */
export async function checkDatabaseConnection(): Promise<{ ok: boolean; migrated: boolean; provider: "sqlite" | "postgres"; file: string; error?: string }> {
  const provider = ENV.databaseProvider;
  const file = describeDatabaseLocation();
  try {
    const db = await getDb();
    if (!db) return { ok: false, migrated: false, provider, file, error: "não foi possível conectar" };
    const [row] = provider === "postgres"
      ? await db.all<{ total: number }>(sql`select count(*) as total from information_schema.tables where table_schema = current_schema() and table_name = 'inventory_items'`)
      : await db.all<{ total: number }>(sql`select count(*) as total from sqlite_master where type = 'table' and name = 'inventory_items'`);
    const total = Array.isArray(row) ? row[0] : row?.total;
    return { ok: true, migrated: Number(total ?? 0) > 0, provider, file };
  } catch (error) {
    return { ok: false, migrated: false, provider, file, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await requireDb();
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  for (const field of ["name", "email", "avatarUrl", "loginMethod", "passwordHash"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  values.lastSignedIn = user.lastSignedIn ?? new Date();
  updateSet.lastSignedIn = values.lastSignedIn;
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  }
  if (user.active !== undefined) {
    values.active = user.active;
    updateSet.active = user.active;
  }
  await db.insert(users).values(values).onConflictDoUpdate({ target: users.openId, set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1);
  return result[0];
}

export async function touchUserSignIn(userId: number) {
  const db = await requireDb();
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, userId));
}

/** Lista resumida de alunos ativos (para empréstimos e supervisão docente). */
export async function listActiveStudents() {
  const db = await requireDb();
  return db.select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(eq(users.role, "student"), eq(users.active, 1)))
    .orderBy(asc(users.name));
}

export async function setUserAvatar(userId: number, avatarUrl: string) {
  const db = await requireDb();
  await db.update(users).set({ avatarUrl }).where(eq(users.id, userId));
  return avatarUrl;
}

export async function createAuthSession(input: { jti: string; openId: string; expiresAt: Date }) {
  const db = await requireDb();
  await db.insert(authSessions).values(input);
}

export async function isAuthSessionActive(jti: string) {
  const db = await getDb();
  if (!db) return false;
  const [session] = await db.select({ jti: authSessions.jti })
    .from(authSessions)
    .where(and(eq(authSessions.jti, jti), isNull(authSessions.revokedAt), gt(authSessions.expiresAt, new Date())))
    .limit(1);
  return Boolean(session);
}

export async function revokeAuthSession(jti: string) {
  const db = await requireDb();
  await db.update(authSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(authSessions.jti, jti), isNull(authSessions.revokedAt)));
}

export async function getStudentBadges(userId: number) {
  const db = await requireDb();
  return db.select({
    id: studentBadges.id,
    label: studentBadges.label,
    detail: studentBadges.detail,
    awardedAt: studentBadges.awardedAt,
  }).from(studentBadges).where(eq(studentBadges.userId, userId)).orderBy(desc(studentBadges.awardedAt));
}

export async function getTeacherBadgeData() {
  const db = await requireDb();
  const [students, badges, rawProgressRows, stepSessionRows, stepRows] = await Promise.all([
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.role, "student")).orderBy(asc(users.name)),
    db.select({
      id: studentBadges.id,
      userId: studentBadges.userId,
      label: studentBadges.label,
      detail: studentBadges.detail,
      awardedAt: studentBadges.awardedAt,
      studentName: users.name,
    }).from(studentBadges).leftJoin(users, eq(studentBadges.userId, users.id)).orderBy(desc(studentBadges.awardedAt)),
    db.select({
      id: studentProgress.id,
      userId: studentProgress.userId,
      moduleId: studentProgress.moduleId,
      progress: studentProgress.progress,
      stepIndex: studentProgress.stepIndex,
      updatedAt: studentProgress.updatedAt,
      moduleTitle: learningModules.title,
    }).from(studentProgress)
      .innerJoin(users, eq(studentProgress.userId, users.id))
      .innerJoin(learningModules, eq(learningModules.id, studentProgress.moduleId))
      .where(eq(users.role, "student")),
    db.select({
      userId: studentStepSessions.userId,
      moduleId: studentStepSessions.moduleId,
      stepIndex: studentStepSessions.stepIndex,
      elapsedSeconds: studentStepSessions.elapsedSeconds,
      completedAt: studentStepSessions.completedAt,
      stepTitle: learningSteps.title,
    }).from(studentStepSessions)
      .innerJoin(users, eq(studentStepSessions.userId, users.id))
      .innerJoin(learningModules, eq(learningModules.id, studentStepSessions.moduleId))
      .innerJoin(learningSteps, and(eq(learningSteps.moduleId, studentStepSessions.moduleId), eq(learningSteps.position, studentStepSessions.stepIndex)))
      .where(and(eq(users.role, "student"), isNotNull(studentStepSessions.completedAt))),
    db.select({ moduleId: learningSteps.moduleId, position: learningSteps.position }).from(learningSteps),
  ]);
  const { stepCounts, positionsByModule } = getStepStructure(stepRows);
  const progressRows = normalizeProgressRowsWithStepCounts(rawProgressRows, stepCounts);
  const validStepSessionRows = stepSessionRows.filter((row) => positionsByModule.get(row.moduleId)?.has(row.stepIndex));
  const modulesByUser = getStudentModulesByUser(progressRows, validStepSessionRows);
  const supervision = students.map((student) => {
    const rows = progressRows.filter((row) => row.userId === student.id).map((row) => ({
      moduleId: row.moduleId,
      moduleTitle: row.moduleTitle,
      progress: row.progress,
      updatedAt: row.updatedAt,
    }));
    const averageProgress = rows.length ? Math.round(rows.reduce((total, row) => total + row.progress, 0) / rows.length) : 0;
    const modules = modulesByUser.get(student.id) ?? [];
    const { studiedSeconds, studiedMinutes } = summarizeStudentStudyTime(modules);
    const lastActivityAt = rows.reduce<Date | null>((latest, row) => !row.updatedAt ? latest : !latest || row.updatedAt > latest ? row.updatedAt : latest, null);
    return {
      id: student.id,
      name: student.name,
      averageProgress,
      studiedSeconds,
      studiedMinutes,
      modulesStarted: rows.length,
      modulesCompleted: rows.filter((row) => row.progress >= 100).length,
      lastActivityAt,
      modules,
    };
  });
  return { students, badges, supervision };
}

export async function assignStudentBadge(input: AwardStudentBadgeInput, awardedBy: number) {
  const db = await requireDb();
  const [student] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, input.studentId), eq(users.role, "student"))).limit(1);
  if (!student) throw new Error("Aluno não encontrado.");
  const content = normalizeBadgeContent(input.label, input.detail);
  await db.insert(studentBadges).values({
    userId: student.id,
    label: content.label,
    detail: content.detail,
    awardedBy,
  });
}

export async function removeStudentBadge(badgeId: number) {
  const db = await requireDb();
  await db.delete(studentBadges).where(eq(studentBadges.id, badgeId));
}

export type CatalogViewerRole = "student" | "teacher" | "admin" | null;

type ResourceRow = typeof schema.learningResources.$inferSelect;
type InventoryRow = typeof inventoryItems.$inferSelect;

/**
 * Recurso entregue ao cliente. Para alunos, o vínculo com o estoque é omitido
 * por completo (nenhuma quantidade, localização ou alerta interno). Para
 * docentes, inclui a disponibilidade atual — ou o aviso de item arquivado.
 */
export function presentCatalogResource(resource: ResourceRow, inventoryById: Map<number, InventoryRow> | null) {
  const { inventoryItemId, ...publicResource } = resource;
  if (!inventoryById) return { ...publicResource, inventoryItemId: null, inventory: null };
  const item = inventoryItemId != null ? inventoryById.get(inventoryItemId) : undefined;
  if (!item) return { ...publicResource, inventoryItemId: inventoryItemId ?? null, inventory: null };
  const snapshot = {
    physical: item.quantityPhysical,
    reserved: item.quantityReserved,
    minQuantity: item.minQuantity,
    archived: Boolean(item.archivedAt),
    status: item.status,
  };
  return {
    ...publicResource,
    inventoryItemId: item.id,
    inventory: {
      id: item.id,
      code: item.code,
      name: item.name,
      unit: item.unit,
      location: item.location,
      available: availableQuantity(snapshot),
      physical: item.quantityPhysical,
      reserved: item.quantityReserved,
      status: item.status,
      archived: snapshot.archived,
      lowStock: isLowStock(snapshot),
      health: stockHealth(snapshot),
    },
  };
}

export async function getCatalog(userId?: number, period: "all" | "today" | "week" | "month" = "all", viewerRole: CatalogViewerRole = null) {
  const db = await requireDb();
  // Docentes e administração veem rascunhos e a disponibilidade do estoque;
  // alunos e visitantes recebem apenas conteúdo publicado, sem dados internos.
  const includeUnpublished = viewerRole === "teacher" || viewerRole === "admin";
  const activeSessionCutoff = new Date(Date.now() - MAX_ELAPSED_SECONDS * 1000);
  const [moduleRows, stepRows, resourceRows, instructorRows, activityRows, progressRows, sessionRows, activeSessionRows] = await Promise.all([
    db.select().from(learningModules),
    db.select().from(learningSteps).orderBy(asc(learningSteps.position)),
    db.select().from(learningResources),
    db.select().from(instructors).where(eq(instructors.active, 1)),
    db.select().from(learningActivities).orderBy(asc(learningActivities.startsAt)),
    userId ? db.select().from(studentProgress).where(eq(studentProgress.userId, userId)) : Promise.resolve([]),
    userId ? db.select({ moduleId: studentStepSessions.moduleId, stepIndex: studentStepSessions.stepIndex, startedAt: studentStepSessions.startedAt, elapsedSeconds: studentStepSessions.elapsedSeconds, completedAt: studentStepSessions.completedAt }).from(studentStepSessions).where(and(eq(studentStepSessions.userId, userId), isNotNull(studentStepSessions.completedAt))) : Promise.resolve([]),
    // A mesma consulta de catálogo permite retomar somente uma sessão recente do usuário autenticado.
    userId ? db.select({ moduleId: studentStepSessions.moduleId, stepIndex: studentStepSessions.stepIndex, startedAt: studentStepSessions.startedAt, elapsedSeconds: studentStepSessions.elapsedSeconds, completedAt: studentStepSessions.completedAt }).from(studentStepSessions).where(and(eq(studentStepSessions.userId, userId), isNull(studentStepSessions.completedAt), gte(studentStepSessions.startedAt, activeSessionCutoff))) : Promise.resolve([]),
  ]);
  const visibleModules = includeUnpublished ? moduleRows : moduleRows.filter((module) => Boolean(module.published));
  const linkedItemIds = Array.from(new Set(resourceRows.map((resource) => resource.inventoryItemId).filter((id): id is number => typeof id === "number")));
  const inventoryById = includeUnpublished && linkedItemIds.length
    ? new Map<number, InventoryRow>((await db.select().from(inventoryItems).where(inArray(inventoryItems.id, linkedItemIds))).map((item) => [item.id, item] as const))
    : new Map<number, typeof inventoryItems.$inferSelect>();
  const visibleModuleIds = new Set(visibleModules.map((module) => module.id));
  const existingModuleIds = new Set(moduleRows.map((module) => module.id));
  const stepStructure = getStepStructure(stepRows);
  const normalizedProgressRows = normalizeProgressRowsWithStepCounts(
    progressRows.filter((row) => existingModuleIds.has(row.moduleId)),
    stepStructure.stepCounts,
  );
  const visibleProgressRows = normalizedProgressRows.filter((row) => visibleModuleIds.has(row.moduleId));
  const progressMap = new Map(visibleProgressRows.map((row) => [row.moduleId, row]));
  const allProgressMap = new Map(normalizedProgressRows.map((row) => [row.moduleId, row]));
  const completedSessionRows = filterStudySessionsByVisibleModules(sessionRows, visibleModuleIds).filter((row) => {
    const progress = allProgressMap.get(row.moduleId);
    return existingModuleIds.has(row.moduleId)
      && stepStructure.positionsByModule.get(row.moduleId)?.has(row.stepIndex) === true
      && Boolean(progress)
      && row.stepIndex < progress!.stepIndex
      && isValidStoredElapsedSeconds(row.elapsedSeconds);
  });
  const periodStart = new Date();
  if (period === "today") periodStart.setHours(0, 0, 0, 0);
  if (period === "week") { periodStart.setHours(0, 0, 0, 0); periodStart.setDate(periodStart.getDate() - 6); }
  if (period === "month") { periodStart.setHours(0, 0, 0, 0); periodStart.setDate(1); }
  const periodSessionRows = period === "all"
    ? completedSessionRows
    : completedSessionRows.filter((row) => row.completedAt instanceof Date && row.completedAt >= periodStart);
  const completedSteps = countDistinctCompletedSteps(periodSessionRows);
  const lifetimeCompletedSteps = countDistinctCompletedSteps(completedSessionRows);
  const { elapsedSeconds: studiedSeconds, studiedMinutes } = summarizeCompletedStudyTime(
    completedSessionRows,
    period === "all" ? undefined : periodStart,
  );
  const lifetimeStudy = summarizeCompletedStudyTime(completedSessionRows);
  const gamification = calculateGamification(lifetimeStudy.studiedMinutes, lifetimeCompletedSteps);
  const usesCatalogBaseline = !userId && includeUnpublished;
  const currentProgress = visibleModules.map((module) => usesCatalogBaseline
    ? module.progress
    : (progressMap.get(module.id)?.progress ?? 0));
  return {
    viewerId: userId ?? null,
    viewerRole: userId == null ? null : viewerRole,
    modules: visibleModules.map((module) => {
      const progress = progressMap.get(module.id);
      const currentStepIndex = progress?.stepIndex ?? 0;
      const validStepPositions = stepStructure.positionsByModule.get(module.id);
      return {
        ...module,
        published: Boolean(module.published),
        // O progresso do aluno nunca herda o valor editorial do catálogo.
        progress: usesCatalogBaseline ? module.progress : (progress?.progress ?? 0),
        steps: stepRows.filter((step) => step.moduleId === module.id).map((step) => ({ ...step, image: step.imageUrl ?? undefined })),
        resources: resourceRows
          .filter((resource) => resource.moduleId === module.id)
          .map((resource) => presentCatalogResource(resource, includeUnpublished ? inventoryById : null)),
        currentStepIndex,
        stepSessions: [
          ...completedSessionRows.filter((row) => row.moduleId === module.id),
          ...activeSessionRows.filter((row) => row.moduleId === module.id
            && validStepPositions?.has(row.stepIndex) === true
            && row.stepIndex < (stepStructure.stepCounts.get(module.id) ?? 0)
            && row.stepIndex === currentStepIndex
            && isValidStoredElapsedSeconds(row.elapsedSeconds)),
        ].map((row) => ({
          stepIndex: row.stepIndex,
          startedAt: row.startedAt,
          elapsedSeconds: sanitizeStoredElapsedSeconds(row.elapsedSeconds),
          completedAt: row.completedAt,
        })),
      };
    }),
    instructors: instructorRows,
    activities: activityRows.filter((activity) => visibleModuleIds.has(activity.moduleId)),
    stats: {
      averageProgress: currentProgress.length ? Math.round(currentProgress.reduce((sum, progress) => sum + progress, 0) / currentProgress.length) : 0,
      studiedMinutes,
      studiedSeconds,
      streakDays: calculateCurrentStreak(completedSessionRows),
      completedSteps,
      ...gamification,
    },
  };
}

export function calculateGamification(studiedMinutes: number, completedSteps: number) {
  const xp = Math.max(0, studiedMinutes) + Math.max(0, completedSteps) * 30;
  const level = Math.floor(xp / 120) + 1;
  const levelProgress = Math.floor(((xp % 120) / 120) * 100);
  return { level, levelProgress, xp };
}

export type SaveModuleInput = {
  id: string; code: string; title: string; kind: "Ferramenta" | "Montagem" | "Processo"; description: string; objective: string; cover: string; coverImage?: string | null; progress: number; duration: string; published: boolean;
  steps: Array<{ id: string; title: string; description: string; tip: string; image?: string | null }>;
  confirmStepStructureReset?: boolean;
  resources: Array<{ id: string; category: "materials" | "machines" | "tools" | "parts"; label: string; title: string; detail: string; status: string; progress: number; modelUrl: string; color: string; inventoryItemId?: number | null }>;
};

export async function saveLearningModule(input: SaveModuleInput, createdBy?: number) {
  const db = await requireDb();
  await db.transaction(async (tx) => {
    const [existingModule] = await tx.select({ id: learningModules.id }).from(learningModules).where(eq(learningModules.id, input.id)).limit(1);
    const existingSteps = existingModule
      ? await tx.select({ id: learningSteps.id }).from(learningSteps).where(eq(learningSteps.moduleId, input.id)).orderBy(asc(learningSteps.position))
      : [];
    const resetFromStepIndex = existingModule
      ? getFirstChangedStepIndex(existingSteps.map((step) => step.id), input.steps.map((step) => step.id))
      : null;
    if (resetFromStepIndex !== null && !input.confirmStepStructureReset) {
      throw new LearningDomainError("BAD_REQUEST", "A estrutura das etapas mudou. Confirme a redefinição de progresso e tempos a partir da primeira etapa alterada.");
    }
    if (resetFromStepIndex !== null) {
      const progressRows = await tx.select().from(studentProgress).where(eq(studentProgress.moduleId, input.id));
      const canonicalProgressRows = selectCanonicalProgressRows(progressRows);
      const canonicalIds = new Set(canonicalProgressRows.map((row) => row.id));
      const duplicateIds = progressRows.filter((row) => !canonicalIds.has(row.id)).map((row) => row.id);
      if (duplicateIds.length) await tx.delete(studentProgress).where(inArray(studentProgress.id, duplicateIds));

      await tx.delete(studentStepSessions).where(and(eq(studentStepSessions.moduleId, input.id), lt(studentStepSessions.stepIndex, 0)));
      await tx.delete(studentStepSessions).where(and(eq(studentStepSessions.moduleId, input.id), gte(studentStepSessions.stepIndex, resetFromStepIndex)));
      const earlierSessions = await tx.select({
        userId: studentStepSessions.userId,
        stepIndex: studentStepSessions.stepIndex,
        elapsedSeconds: studentStepSessions.elapsedSeconds,
        completedAt: studentStepSessions.completedAt,
      }).from(studentStepSessions)
        .where(and(eq(studentStepSessions.moduleId, input.id), lt(studentStepSessions.stepIndex, resetFromStepIndex), isNotNull(studentStepSessions.completedAt)));
      for (const progress of canonicalProgressRows) {
        const stepIndex = Math.min(progress.stepIndex!, resetFromStepIndex, input.steps.length);
        const { studiedMinutes } = summarizeCompletedStudyTime(earlierSessions.filter((session) =>
          session.userId === progress.userId
          && session.stepIndex >= 0
          && session.stepIndex < stepIndex
          && isValidStoredElapsedSeconds(session.elapsedSeconds),
        ));
        await tx.update(studentProgress).set({
          stepIndex,
          progress: input.steps.length ? Math.round((stepIndex / input.steps.length) * 100) : 0,
          studiedMinutes,
        }).where(eq(studentProgress.id, progress.id));
      }
    }

    // Vínculos com o estoque: o item precisa existir. Um vínculo já existente
    // com item arquivado é preservado; novos vínculos exigem item ativo.
    const requestedItemIds = Array.from(new Set(input.resources.map((resource) => resource.inventoryItemId).filter((id): id is number => typeof id === "number")));
    if (requestedItemIds.length) {
      const items = await tx.select({ id: inventoryItems.id, archivedAt: inventoryItems.archivedAt }).from(inventoryItems).where(inArray(inventoryItems.id, requestedItemIds));
      const found = new Map<number, (typeof items)[number]>(items.map((item) => [item.id, item] as const));
      const previousLinks = new Set((await tx.select({ inventoryItemId: schema.learningResources.inventoryItemId }).from(schema.learningResources).where(eq(schema.learningResources.moduleId, input.id))).map((row) => row.inventoryItemId));
      for (const id of requestedItemIds) {
        const item = found.get(id);
        if (!item) throw new LearningDomainError("BAD_REQUEST", "Um recurso aponta para um item de estoque inexistente.");
        if (item.archivedAt && !previousLinks.has(id)) throw new LearningDomainError("BAD_REQUEST", "Não é possível vincular um item de estoque arquivado.");
      }
    }
    await tx.insert(learningModules).values({ id: input.id, code: input.code, title: input.title, kind: input.kind, description: input.description, objective: input.objective, cover: input.cover, coverImage: input.coverImage ?? null, progress: input.progress, duration: input.duration, published: input.published ? 1 : 0, createdBy }).onConflictDoUpdate({ target: learningModules.id, set: { code: input.code, title: input.title, kind: input.kind, description: input.description, objective: input.objective, cover: input.cover, coverImage: input.coverImage ?? null, progress: input.progress, duration: input.duration, published: input.published ? 1 : 0 } });
    await tx.delete(learningSteps).where(eq(learningSteps.moduleId, input.id));
    await tx.delete(learningResources).where(eq(learningResources.moduleId, input.id));
    if (input.steps.length) await tx.insert(learningSteps).values(input.steps.map((step, position) => ({ id: step.id, moduleId: input.id, position, title: step.title, description: step.description, tip: step.tip, imageUrl: step.image ?? null })));
    if (input.resources.length) await tx.insert(learningResources).values(input.resources.map((resource) => ({ id: resource.id, moduleId: input.id, category: resource.category, label: resource.label, title: resource.title, detail: resource.detail, status: resource.status, progress: resource.progress, modelUrl: resource.modelUrl, color: resource.color, inventoryItemId: resource.inventoryItemId ?? null })));
  });
}

export async function deleteLearningModule(moduleId: string) {
  const db = await requireDb();
  await db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: learningModules.id }).from(learningModules).where(eq(learningModules.id, moduleId)).limit(1);
    if (!existing) throw new LearningDomainError("NOT_FOUND", "Módulo não encontrado.");
    await tx.delete(learningActivities).where(eq(learningActivities.moduleId, moduleId));
    await tx.delete(learningSteps).where(eq(learningSteps.moduleId, moduleId));
    await tx.delete(learningResources).where(eq(learningResources.moduleId, moduleId));
    await tx.delete(studentProgress).where(eq(studentProgress.moduleId, moduleId));
    await tx.delete(studentStepSessions).where(eq(studentStepSessions.moduleId, moduleId));
    await tx.delete(learningModules).where(eq(learningModules.id, moduleId));
  });
}

export type LearningScheduleEntry = {
  id: string;
  moduleId: string;
  title: string;
  subtitle: string;
  activityType: "aula" | "laboratorio" | "avaliacao";
  startsAt: Date;
  endsAt: Date;
  color: string;
};

export async function replaceLearningSchedule(entries: LearningScheduleEntry[]) {
  const db = await requireDb();
  const moduleIds = Array.from(new Set(entries.map((entry) => entry.moduleId)));
  if (entries.some((entry) => !entry.moduleId || !entry.id || entry.endsAt <= entry.startsAt)) {
    throw new LearningDomainError("BAD_REQUEST", "Cada atividade precisa de módulo e intervalo de horário válidos.");
  }
  await db.transaction(async (tx) => {
    const existingModules = moduleIds.length
      ? await tx.select({ id: learningModules.id }).from(learningModules).where(inArray(learningModules.id, moduleIds))
      : [];
    if (existingModules.length !== moduleIds.length) {
      throw new LearningDomainError("BAD_REQUEST", "A agenda contém referência para um módulo inexistente.");
    }
    await tx.delete(learningActivities);
    if (entries.length) await tx.insert(learningActivities).values(entries);
  });
}

export async function startStudentStep(userId: number, moduleId: string, stepIndex: number) {
  const db = await requireDb();
  if (!Number.isInteger(stepIndex) || stepIndex < 0) {
    throw new LearningDomainError("BAD_REQUEST", "A etapa informada não pertence a este módulo.");
  }
  const sessionState = await db.transaction(async (tx) => {
    const [module] = await tx.select({ id: learningModules.id, published: learningModules.published })
      .from(learningModules)
      .where(eq(learningModules.id, moduleId))
      .limit(1);
    if (!module || !module.published) throw new LearningDomainError("NOT_FOUND", "Módulo não encontrado ou ainda não publicado.");
    const moduleSteps = await tx.select({ position: learningSteps.position }).from(learningSteps).where(eq(learningSteps.moduleId, moduleId));
    if (!hasSequentialStepPositions(moduleSteps.map(({ position }) => position)) || stepIndex >= moduleSteps.length || !moduleSteps.some(({ position }) => position === stepIndex)) {
      throw new LearningDomainError("BAD_REQUEST", "A etapa informada não pertence a uma sequência válida deste módulo.");
    }
    const progressRows = await tx.select().from(studentProgress)
      .where(and(eq(studentProgress.userId, userId), eq(studentProgress.moduleId, moduleId)));
    const [progress] = selectCanonicalProgressRows(progressRows);
    const completedStepCount = Math.min(progress?.stepIndex ?? 0, moduleSteps.length);
    if (isStepCompleted(stepIndex, completedStepCount)) {
      throw new LearningDomainError("BAD_REQUEST", "Esta etapa já foi concluída. Somente o docente pode resetar o progresso.");
    }
    if (stepIndex > completedStepCount) throw new LearningDomainError("BAD_REQUEST", "Conclua as etapas em sequência.");

    // An abandoned session older than the retention window must not hold the
    // unique slot forever or inflate the next visit's duration.
    const staleBefore = new Date(Date.now() - MAX_ELAPSED_SECONDS * 1000);
    await tx.delete(studentStepSessions).where(and(
      eq(studentStepSessions.userId, userId),
      eq(studentStepSessions.moduleId, moduleId),
      eq(studentStepSessions.stepIndex, stepIndex),
      isNull(studentStepSessions.completedAt),
      lt(studentStepSessions.startedAt, staleBefore),
    ));
    const [existing] = await tx.select({ id: studentStepSessions.id })
      .from(studentStepSessions)
      .where(and(eq(studentStepSessions.userId, userId), eq(studentStepSessions.moduleId, moduleId), eq(studentStepSessions.stepIndex, stepIndex)))
      .limit(1);
    if (!existing) {
      const startedAt = new Date();
      await tx.insert(studentStepSessions).values({ userId, moduleId, stepIndex, startedAt, elapsedSeconds: 0 });
      return { startedAt, elapsedSeconds: 0, completedAt: null as Date | null };
    }
    const [session] = await tx.select({ startedAt: studentStepSessions.startedAt, elapsedSeconds: studentStepSessions.elapsedSeconds, completedAt: studentStepSessions.completedAt })
      .from(studentStepSessions)
      .where(eq(studentStepSessions.id, existing.id))
      .limit(1);
    if (!session) throw new LearningDomainError("NOT_FOUND", "A sessão de estudo não foi encontrada.");
    // A completion absent from confirmed progress is an orphaned legacy row;
    // replace it only after the student explicitly starts this current step.
    if (session.completedAt) {
      await tx.delete(studentStepSessions).where(eq(studentStepSessions.id, existing.id));
      const startedAt = new Date();
      await tx.insert(studentStepSessions).values({ userId, moduleId, stepIndex, startedAt, elapsedSeconds: 0 });
      return { startedAt, elapsedSeconds: 0, completedAt: null as Date | null };
    }
    return { ...session, elapsedSeconds: sanitizeStoredElapsedSeconds(session.elapsedSeconds) };
  });
  return { success: true, session: sessionState } as const;
}

export async function updateProgress(userId: number, moduleId: string, stepIndex: number, elapsedSeconds = 0) {
  const db = await requireDb();
  try {
    normalizeElapsedSeconds(elapsedSeconds);
  } catch (error) {
    throw new LearningDomainError("BAD_REQUEST", error instanceof Error ? error.message : "Tempo de estudo inválido.");
  }
  const savedElapsedSeconds = await db.transaction(async (tx) => {
    const [module] = await tx.select({ id: learningModules.id, published: learningModules.published })
      .from(learningModules)
      .where(eq(learningModules.id, moduleId))
      .limit(1);
    if (!module || !module.published) {
      throw new LearningDomainError("NOT_FOUND", "Módulo não encontrado ou ainda não publicado.");
    }
    const moduleSteps = await tx.select({ position: learningSteps.position }).from(learningSteps).where(eq(learningSteps.moduleId, moduleId));
    if (!hasSequentialStepPositions(moduleSteps.map(({ position }) => position))
      || !Number.isInteger(stepIndex) || stepIndex < 1 || stepIndex > moduleSteps.length
      || !moduleSteps.some(({ position }) => position === stepIndex - 1)) {
      throw new LearningDomainError("BAD_REQUEST", "A etapa concluída não pertence a uma sequência válida deste módulo.");
    }
    const progressCandidates = await tx.select().from(studentProgress)
      .where(and(eq(studentProgress.userId, userId), eq(studentProgress.moduleId, moduleId)));
    const [existing] = selectCanonicalProgressRows(progressCandidates);
    const canonicalIds = new Set(existing ? [existing.id] : []);
    const duplicateIds = progressCandidates.filter((row) => !canonicalIds.has(row.id)).map((row) => row.id);
    if (duplicateIds.length) await tx.delete(studentProgress).where(inArray(studentProgress.id, duplicateIds));
    const completedStepCount = Math.min(existing?.stepIndex ?? 0, moduleSteps.length);
    const [session] = await tx.select().from(studentStepSessions)
      .where(and(eq(studentStepSessions.userId, userId), eq(studentStepSessions.moduleId, moduleId), eq(studentStepSessions.stepIndex, stepIndex - 1)))
      .limit(1);

    // Retries of an already persisted completion are idempotent. A student
    // cannot reopen a completed step or submit client-reported time for it.
    if (stepIndex <= completedStepCount) {
      if (session?.completedAt) return sanitizeStoredElapsedSeconds(session.elapsedSeconds);
      throw new LearningDomainError("BAD_REQUEST", "Esta etapa já foi concluída. Somente o docente pode resetar o progresso.");
    }
    if (stepIndex > completedStepCount + 1) throw new LearningDomainError("BAD_REQUEST", "Conclua as etapas em sequência.");
    if (!session || session.completedAt) throw new LearningDomainError("BAD_REQUEST", "Inicie a etapa antes de concluí-la.");

    const serverElapsedSeconds = getElapsedStudySeconds(session.startedAt.getTime(), Date.now());
    await tx.update(studentStepSessions).set({ completedAt: new Date(), elapsedSeconds: serverElapsedSeconds }).where(eq(studentStepSessions.id, session.id));
    const resolved = resolveProgressUpdate(moduleSteps.length, completedStepCount, stepIndex);
    const moduleSessions = await tx.select({ elapsedSeconds: studentStepSessions.elapsedSeconds, completedAt: studentStepSessions.completedAt })
      .from(studentStepSessions)
      .where(and(eq(studentStepSessions.userId, userId), eq(studentStepSessions.moduleId, moduleId), isNotNull(studentStepSessions.completedAt)));
    const { studiedMinutes: moduleStudiedMinutes } = summarizeCompletedStudyTime(moduleSessions);
    if (existing) {
      await tx.update(studentProgress).set({ stepIndex: resolved.stepIndex, progress: resolved.progress, studiedMinutes: moduleStudiedMinutes, streakDays: Math.max(existing.streakDays, 1) }).where(eq(studentProgress.id, existing.id));
    } else {
      await tx.insert(studentProgress).values({ userId, moduleId, stepIndex: resolved.stepIndex, progress: resolved.progress, studiedMinutes: moduleStudiedMinutes, streakDays: 1 });
    }
    return serverElapsedSeconds;
  });
  return { success: true, elapsedSeconds: savedElapsedSeconds } as const;
}

export async function resetStudentModuleProgress(studentId: number, moduleId: string) {
  const db = await requireDb();
  await db.transaction(async (tx) => {
    const [student] = await tx.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, studentId)).limit(1);
    if (!student || student.role !== "student") throw new LearningDomainError("NOT_FOUND", "Aluno não encontrado.");
    const [module] = await tx.select({ id: learningModules.id }).from(learningModules).where(eq(learningModules.id, moduleId)).limit(1);
    if (!module) throw new LearningDomainError("NOT_FOUND", "Módulo não encontrado.");
    await tx.delete(studentStepSessions).where(and(eq(studentStepSessions.userId, studentId), eq(studentStepSessions.moduleId, moduleId)));
    await tx.delete(studentProgress).where(and(eq(studentProgress.userId, studentId), eq(studentProgress.moduleId, moduleId)));
  });
  return { success: true } as const;
}
