import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, like, lt, sql } from "drizzle-orm";
import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import type { DatabaseSync } from "node:sqlite";
import { DatabaseUnavailableError } from "./_core/db-errors";
import { ENV } from "./_core/env";
import { createPostgresConnection, describePostgresUrl, type PostgresConnection } from "./_core/postgres";
import { executeProxy, openSqlite, resolveDatabaseFile, runExclusive } from "./_core/sqlite";
import * as schema from "../drizzle/schema";
import {
  authSessions,
  classrooms,
  InsertUser,
  instructors,
  inventoryItems,
  learningActivities,
  learningModules,
  learningResources,
  learningSteps,
  studentBadges,
  studentNotes,
  studentQuizAttempts,
  studentStepSessions,
  studentProgress,
  users,
} from "../drizzle/schema";
import { availableQuantity, isLowStock, stockHealth } from "@shared/inventory";
import { isLinkAttachment, parseStoredAttachments, type ContentAttachment } from "@shared/attachments";
import { creditedStepSeconds, getElapsedStudySeconds, getFirstChangedStepIndex, MIN_STEP_SECONDS, stepTimeCapSeconds, isStepCompleted, isValidStoredElapsedSeconds, MAX_ELAPSED_SECONDS, normalizeElapsedSeconds, normalizeProgressRowsWithStepCounts, resolveProgressUpdate, sanitizeStoredElapsedSeconds, selectCanonicalProgressRows, summarizeCompletedStudyTime, filterStudySessionsByVisibleModules, hasSequentialStepPositions } from "@shared/progress";
import { parseStoredQuiz, QUIZ_FIRST_TRY_XP, serializeQuiz, summarizeQuizAttempts, toPublicQuiz, type StepQuiz } from "@shared/quiz";
import { normalizeBadgeContent, type AwardStudentBadgeInput } from "@shared/competencies";
import { getStudentModulesByUser, summarizeStudentStudyTime } from "@shared/supervision";
import { periodStartInZone, studyStreakDays } from "@shared/time-zone";

export type Database = SqliteRemoteDatabase<typeof schema>;
let _db: Database | null = null;

export class LearningDomainError extends Error {
  constructor(public readonly code: "BAD_REQUEST" | "NOT_FOUND" | "FORBIDDEN", message: string) {
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

/** Quem altera conteúdo: o id e o papel vêm da sessão validada (ctx.user). */
export type ContentActor = { id: number; role: "student" | "teacher" | "admin" };

/**
 * Docente edita o que criou; administração edita tudo. Conteúdo sem autor
 * (seed ou anterior a este controle) continua editável por qualquer docente.
 */
export function canManageContent(createdBy: number | null | undefined, actor: ContentActor) {
  return actor.role === "admin" || createdBy == null || createdBy === actor.id;
}

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Alunos que `actor` acompanha: `null` = todos (administração); para o docente,
 * os alunos das turmas ativas em que ele é o responsável.
 */
async function studentIdsInScope(db: Database | Tx, actor: ContentActor): Promise<Set<number> | null> {
  if (actor.role === "admin") return null;
  const rows = await db.select({ id: users.id })
    .from(users)
    .innerJoin(classrooms, eq(classrooms.id, users.classroomId))
    .where(and(eq(users.role, "student"), eq(classrooms.teacherId, actor.id), isNull(classrooms.archivedAt)));
  return new Set(rows.map((row) => row.id));
}

const OUT_OF_SCOPE_MESSAGE = "Este aluno não está em uma turma sob sua responsabilidade.";

async function assertStudentInScope(db: Database | Tx, actor: ContentActor, studentId: number) {
  const scope = await studentIdsInScope(db, actor);
  if (scope && !scope.has(studentId)) throw new LearningDomainError("FORBIDDEN", OUT_OF_SCOPE_MESSAGE);
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

/** Garante a conexão ou lança DatabaseUnavailableError (a API responde 503). */
export async function requireDb() {
  const db = await getDb();
  if (!db) throw new DatabaseUnavailableError(`Não foi possível abrir o banco em ${describeDatabaseLocation()}.`);
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
  const db = await requireDb();
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

/** Banco fora do ar lança erro (nunca "usuário inexistente", que viraria "senha incorreta"). */
export async function getUserByEmail(email: string) {
  const db = await requireDb();
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

/** Troca a foto de perfil e devolve a anterior (para apagar o arquivo antigo). */
export async function setUserAvatar(userId: number, avatarUrl: string) {
  const db = await requireDb();
  const [current] = await db.select({ avatarUrl: users.avatarUrl }).from(users).where(eq(users.id, userId)).limit(1);
  await db.update(users).set({ avatarUrl }).where(eq(users.id, userId));
  return { avatarUrl, previousAvatarUrl: current?.avatarUrl ?? null };
}

/** Diário de aula do usuário (JSON validado pela API); `null` quando nunca foi salvo. */
export async function getStudentNotes(userId: number): Promise<{ content: string; updatedAt: Date } | null> {
  const db = await requireDb();
  const [row] = await db.select({ content: studentNotes.content, updatedAt: studentNotes.updatedAt }).from(studentNotes).where(eq(studentNotes.userId, userId)).limit(1);
  return row ?? null;
}

/** Diário de um aluno para consulta do docente; `null` quando o id não é de um aluno. */
export async function getNotesOfStudent(studentId: number, actor: ContentActor) {
  const db = await requireDb();
  const [student] = await db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.id, studentId), eq(users.role, "student"))).limit(1);
  if (!student) return null;
  await assertStudentInScope(db, actor, student.id);
  return { student, saved: await getStudentNotes(student.id) };
}

export async function saveStudentNotes(userId: number, content: string) {
  const db = await requireDb();
  const updatedAt = new Date();
  await db.insert(studentNotes).values({ userId, content, updatedAt }).onConflictDoUpdate({ target: studentNotes.userId, set: { content, updatedAt } });
  return { updatedAt };
}

export async function createAuthSession(input: { jti: string; openId: string; expiresAt: Date }) {
  const db = await requireDb();
  await db.insert(authSessions).values(input);
}

export async function isAuthSessionActive(jti: string) {
  const db = await requireDb();
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

/** Encerra todas as sessões abertas de uma conta (desativação, troca de papel ou de senha). */
export async function revokeUserSessions(openId: string) {
  const db = await requireDb();
  await db.update(authSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(authSessions.openId, openId), isNull(authSessions.revokedAt)));
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

export async function getTeacherBadgeData(actor: ContentActor) {
  const db = await requireDb();
  const scope = await studentIdsInScope(db, actor);
  const inScope = (userId: number) => !scope || scope.has(userId);
  const [allStudents, allBadges, allProgressRows, allStepSessionRows, stepRows, quizStepRows, allQuizAttempts] = await Promise.all([
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
      .where(and(eq(users.role, "student"), isNull(learningModules.archivedAt))),
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
      .where(and(eq(users.role, "student"), isNotNull(studentStepSessions.completedAt), isNull(learningModules.archivedAt))),
    db.select({ moduleId: learningSteps.moduleId, position: learningSteps.position }).from(learningSteps),
    db.select({ stepId: learningSteps.id, moduleId: learningSteps.moduleId, position: learningSteps.position, stepTitle: learningSteps.title, quiz: learningSteps.quiz, moduleTitle: learningModules.title })
      .from(learningSteps)
      .innerJoin(learningModules, eq(learningModules.id, learningSteps.moduleId))
      .where(and(isNotNull(learningSteps.quiz), isNull(learningModules.archivedAt)))
      .orderBy(asc(learningModules.title), asc(learningSteps.position)),
    db.select({ userId: studentQuizAttempts.userId, stepId: studentQuizAttempts.stepId, correct: studentQuizAttempts.correct, createdAt: studentQuizAttempts.createdAt })
      .from(studentQuizAttempts),
  ]);
  // Docente só vê os alunos das próprias turmas; a administração vê todos.
  const students = allStudents.filter((row) => inScope(row.id));
  const badges = allBadges.filter((row) => inScope(row.userId));
  const rawProgressRows = allProgressRows.filter((row) => inScope(row.userId));
  const stepSessionRows = allStepSessionRows.filter((row) => inScope(row.userId));
  const { stepCounts, positionsByModule } = getStepStructure(stepRows);
  const progressRows = normalizeProgressRowsWithStepCounts(rawProgressRows, stepCounts);
  const validStepSessionRows = stepSessionRows.filter((row) => positionsByModule.get(row.moduleId)?.has(row.stepIndex));
  const modulesByUser = getStudentModulesByUser(progressRows, validStepSessionRows);
  const quizSummary = summarizeQuizAttempts(
    allQuizAttempts.filter((row) => inScope(row.userId)).map((row) => ({ ...row, correct: Boolean(row.correct) })),
  );
  // Etapas com verificação: onde a turma acerta de primeira e onde ela trava.
  const quizSteps = quizStepRows.flatMap((row) => {
    const quiz = parseStoredQuiz(row.quiz);
    if (!quiz) return [];
    const stats = quizSummary.byStep.get(row.stepId) ?? { answered: 0, firstTry: 0, solved: 0, attemptsUntilSolved: 0 };
    return [{
      stepId: row.stepId,
      moduleId: row.moduleId,
      moduleTitle: row.moduleTitle,
      stepNumber: row.position + 1,
      stepTitle: row.stepTitle,
      question: quiz.question,
      answered: stats.answered,
      firstTry: stats.firstTry,
      averageAttempts: stats.solved ? Math.round((stats.attemptsUntilSolved / stats.solved) * 10) / 10 : null,
    }];
  });
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
      quiz: quizSummary.byStudent.get(student.id) ?? { answered: 0, firstTry: 0 },
    };
  });
  return { students, badges, supervision, quizSteps };
}

export async function assignStudentBadge(input: AwardStudentBadgeInput, actor: ContentActor) {
  const db = await requireDb();
  const [student] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, input.studentId), eq(users.role, "student"))).limit(1);
  if (!student) throw new LearningDomainError("NOT_FOUND", "Aluno não encontrado.");
  await assertStudentInScope(db, actor, student.id);
  const content = normalizeBadgeContent(input.label, input.detail);
  await db.insert(studentBadges).values({
    userId: student.id,
    label: content.label,
    detail: content.detail,
    awardedBy: actor.id,
  });
}

export async function removeStudentBadge(badgeId: number, actor: ContentActor) {
  const db = await requireDb();
  const [badge] = await db.select({ id: studentBadges.id, userId: studentBadges.userId }).from(studentBadges).where(eq(studentBadges.id, badgeId)).limit(1);
  if (!badge) throw new LearningDomainError("NOT_FOUND", "Competência não encontrada. Atualize a lista.");
  await assertStudentInScope(db, actor, badge.userId);
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
  const { inventoryItemId, attachments, ...resourceFields } = resource;
  const publicResource = { ...resourceFields, attachments: parseStoredAttachments(attachments) };
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

type InstructorCard = Pick<typeof instructors.$inferSelect, "id" | "name" | "role" | "badge" | "initials" | "avatarUrl">;

/** Docente responsável pela turma do aluno, no formato do cartão "Seu docente" (null sem turma ou sem responsável ativo). */
async function getClassroomTeacherCard(db: Awaited<ReturnType<typeof requireDb>>, studentId: number): Promise<InstructorCard | null> {
  const [student] = await db.select({ classroomId: users.classroomId }).from(users).where(eq(users.id, studentId)).limit(1);
  if (!student?.classroomId) return null;
  const [classroom] = await db.select({ name: classrooms.name, teacherId: classrooms.teacherId, archivedAt: classrooms.archivedAt })
    .from(classrooms).where(eq(classrooms.id, student.classroomId)).limit(1);
  if (!classroom?.teacherId || classroom.archivedAt) return null;
  const [teacher] = await db.select({ id: users.id, name: users.name, email: users.email, avatarUrl: users.avatarUrl, active: users.active })
    .from(users).where(eq(users.id, classroom.teacherId)).limit(1);
  if (!teacher || !teacher.active) return null;
  const name = teacher.name?.trim() || teacher.email || "Docente";
  const parts = name.split(/\s+/).filter(Boolean);
  const initials = `${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts[parts.length - 1][0] : ""}`.toUpperCase() || "DO";
  // id negativo: o cartão vem de `users`, não da tabela `instructors`, e não pode colidir com ela.
  return { id: -teacher.id, name, role: `Responsável · ${classroom.name}`, badge: "Docente", initials, avatarUrl: teacher.avatarUrl };
}

export async function getCatalog(userId?: number, period: "all" | "today" | "week" | "month" = "all", viewerRole: CatalogViewerRole = null) {
  const db = await requireDb();
  const classroomTeacher = userId && viewerRole === "student" ? await getClassroomTeacherCard(db, userId) : null;
  // Docentes e administração veem rascunhos e a disponibilidade do estoque;
  // alunos e visitantes recebem apenas conteúdo publicado, sem dados internos.
  const includeUnpublished = viewerRole === "teacher" || viewerRole === "admin";
  const activeSessionCutoff = new Date(Date.now() - MAX_ELAPSED_SECONDS * 1000);
  const [moduleRows, stepRows, resourceRows, instructorRows, activityRows, progressRows, sessionRows, activeSessionRows, quizAttemptRows] = await Promise.all([
    // Módulos arquivados ("excluídos") somem do catálogo; o progresso fica guardado no banco.
    db.select().from(learningModules).where(isNull(learningModules.archivedAt)),
    db.select().from(learningSteps).orderBy(asc(learningSteps.position)),
    db.select().from(learningResources),
    db.select().from(instructors).where(eq(instructors.active, 1)),
    db.select().from(learningActivities).orderBy(asc(learningActivities.startsAt)),
    userId ? db.select().from(studentProgress).where(eq(studentProgress.userId, userId)) : Promise.resolve([]),
    userId ? db.select({ moduleId: studentStepSessions.moduleId, stepIndex: studentStepSessions.stepIndex, startedAt: studentStepSessions.startedAt, elapsedSeconds: studentStepSessions.elapsedSeconds, completedAt: studentStepSessions.completedAt }).from(studentStepSessions).where(and(eq(studentStepSessions.userId, userId), isNotNull(studentStepSessions.completedAt))) : Promise.resolve([]),
    // A mesma consulta de catálogo permite retomar somente uma sessão recente do usuário autenticado.
    userId ? db.select({ moduleId: studentStepSessions.moduleId, stepIndex: studentStepSessions.stepIndex, startedAt: studentStepSessions.startedAt, elapsedSeconds: studentStepSessions.elapsedSeconds, completedAt: studentStepSessions.completedAt }).from(studentStepSessions).where(and(eq(studentStepSessions.userId, userId), isNull(studentStepSessions.completedAt), gte(studentStepSessions.startedAt, activeSessionCutoff))) : Promise.resolve([]),
    userId && viewerRole === "student"
      ? db.select({ userId: studentQuizAttempts.userId, stepId: studentQuizAttempts.stepId, correct: studentQuizAttempts.correct, createdAt: studentQuizAttempts.createdAt }).from(studentQuizAttempts).where(eq(studentQuizAttempts.userId, userId))
      : Promise.resolve([]),
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
  const now = new Date();
  // "Hoje", "semana" e "mês" seguem o fuso da escola, não o do servidor.
  const periodStart = period === "all" ? now : periodStartInZone(period, now, ENV.timeZone);
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
  const quizAttempts = quizAttemptRows.map((row) => ({ ...row, correct: Boolean(row.correct) }));
  const quizFirstTry = summarizeQuizAttempts(quizAttempts).byStudent.get(userId ?? 0)?.firstTry ?? 0;
  const gamification = calculateGamification(lifetimeStudy.studiedMinutes, lifetimeCompletedSteps, quizFirstTry);
  const currentProgress = visibleModules.map((module) => progressMap.get(module.id)?.progress ?? 0);
  // Uma etapa só conta o quiz como respondido se o acerto veio depois de a sessão atual começar.
  const activeStartByStep = new Map(activeSessionRows.map((row) => [`${row.moduleId}:${row.stepIndex}`, row.startedAt] as const));
  const quizPassedFor = (step: { id: string; moduleId: string; position: number }) => {
    const startedAt = activeStartByStep.get(`${step.moduleId}:${step.position}`);
    return quizAttempts.some((attempt) => attempt.stepId === step.id && attempt.correct && (!startedAt || attempt.createdAt >= startedAt));
  };
  const presentStep = ({ quiz: storedQuiz, imageUrl, attachments, ...step }: typeof stepRows[number]) => {
    const quiz = parseStoredQuiz(storedQuiz);
    return {
      ...step,
      imageUrl,
      image: imageUrl ?? undefined,
      attachments: parseStoredAttachments(attachments),
      // Docentes recebem o gabarito para editar; o aluno, só pergunta e alternativas.
      quiz: includeUnpublished ? quiz : toPublicQuiz(quiz),
      quizPassed: viewerRole === "student" && quiz ? quizPassedFor(step) : false,
    };
  };
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
        // O progresso exibido é sempre o do usuário, nunca o valor editorial gravado no módulo.
        progress: progress?.progress ?? 0,
        steps: stepRows.filter((step) => step.moduleId === module.id).map(presentStep),
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
    // O aluno vê primeiro quem responde pela turma dele; os instrutores do catálogo ficam como alternativa.
    instructors: classroomTeacher ? [classroomTeacher, ...instructorRows] : instructorRows,
    activities: activityRows.filter((activity) => visibleModuleIds.has(activity.moduleId)),
    stats: {
      averageProgress: currentProgress.length ? Math.round(currentProgress.reduce((sum, progress) => sum + progress, 0) / currentProgress.length) : 0,
      studiedMinutes,
      studiedSeconds,
      streakDays: studyStreakDays(completedSessionRows.map((row) => row.completedAt), now, ENV.timeZone),
      completedSteps,
      ...gamification,
    },
  };
}

export function calculateGamification(studiedMinutes: number, completedSteps: number, quizFirstTry = 0) {
  const xp = Math.max(0, studiedMinutes) + Math.max(0, completedSteps) * 30 + Math.max(0, quizFirstTry) * QUIZ_FIRST_TRY_XP;
  const level = Math.floor(xp / 120) + 1;
  const levelProgress = Math.floor(((xp % 120) / 120) * 100);
  return { level, levelProgress, xp };
}

export type SaveModuleInput = {
  id: string; code: string; title: string; kind: string; description: string; objective: string; cover: string; coverImage?: string | null; duration: string; published: boolean;
  steps: Array<{ id: string; title: string; description: string; tip: string; image?: string | null; attachments?: ContentAttachment[]; quiz?: StepQuiz | null }>;
  confirmStepStructureReset?: boolean;
  resources: Array<{ id: string; category: "materials" | "machines" | "tools" | "parts"; label: string; title: string; detail: string; status: string; progress: number; modelUrl: string; color: string; inventoryItemId?: number | null; attachments?: ContentAttachment[] }>;
};

/** URLs de arquivos enviados (não links externos) usados nos anexos. */
function uploadedAttachmentUrls(lists: Array<ContentAttachment[] | string | null | undefined>) {
  return lists.flatMap((list) => (typeof list === "string" || list == null ? parseStoredAttachments(list) : list))
    .filter((attachment) => !isLinkAttachment(attachment))
    .map((attachment) => attachment.url);
}

/** Ids de etapa/recurso são chave da tabela inteira: não podem repetir os de outro módulo. */
async function assertIdsFreeForModule(tx: Parameters<Parameters<Database["transaction"]>[0]>[0], input: SaveModuleInput) {
  const stepIds = input.steps.map((step) => step.id);
  if (stepIds.length) {
    const [taken] = await tx.select({ id: learningSteps.id }).from(learningSteps)
      .where(and(inArray(learningSteps.id, stepIds), sql`${learningSteps.moduleId} <> ${input.id}`)).limit(1);
    if (taken) throw new LearningDomainError("BAD_REQUEST", `O identificador de etapa "${taken.id}" já pertence a outro módulo. Recarregue o editor e tente de novo.`);
  }
  const resourceIds = input.resources.map((resource) => resource.id);
  if (resourceIds.length) {
    const [taken] = await tx.select({ id: learningResources.id }).from(learningResources)
      .where(and(inArray(learningResources.id, resourceIds), sql`${learningResources.moduleId} <> ${input.id}`)).limit(1);
    if (taken) throw new LearningDomainError("BAD_REQUEST", `O identificador de recurso "${taken.id}" já pertence a outro módulo. Recarregue o editor e tente de novo.`);
  }
}

/**
 * Cria ou atualiza um módulo. Devolve as imagens que deixaram de ser usadas,
 * para que o chamador apague os arquivos depois do commit.
 */
export async function saveLearningModule(input: SaveModuleInput, actor: ContentActor): Promise<{ removedImages: string[] }> {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const [existingModule] = await tx.select({ id: learningModules.id, createdBy: learningModules.createdBy, archivedAt: learningModules.archivedAt, coverImage: learningModules.coverImage })
      .from(learningModules).where(eq(learningModules.id, input.id)).limit(1);
    if (existingModule?.archivedAt) throw new LearningDomainError("NOT_FOUND", "Este módulo foi excluído. Recarregue a página.");
    if (existingModule && !canManageContent(existingModule.createdBy, actor)) {
      throw new LearningDomainError("FORBIDDEN", "Somente quem criou este módulo (ou a administração) pode alterá-lo.");
    }
    await assertIdsFreeForModule(tx, input);
    const existingSteps = existingModule
      ? await tx.select({ id: learningSteps.id, imageUrl: learningSteps.imageUrl, attachments: learningSteps.attachments }).from(learningSteps).where(eq(learningSteps.moduleId, input.id)).orderBy(asc(learningSteps.position))
      : [];
    const existingResourceAttachments = existingModule
      ? (await tx.select({ attachments: learningResources.attachments }).from(learningResources).where(eq(learningResources.moduleId, input.id))).map((row) => row.attachments)
      : [];
    const previousImages = [
      existingModule?.coverImage,
      ...existingSteps.map((step) => step.imageUrl),
      ...uploadedAttachmentUrls([...existingSteps.map((step) => step.attachments), ...existingResourceAttachments]),
    ].filter((url): url is string => Boolean(url));
    const nextImages = new Set([
      input.coverImage,
      ...input.steps.map((step) => step.image),
      ...uploadedAttachmentUrls([...input.steps.map((step) => step.attachments), ...input.resources.map((resource) => resource.attachments)]),
    ].filter((url): url is string => Boolean(url)));
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
    await tx.insert(learningModules).values({ id: input.id, code: input.code, title: input.title, kind: input.kind, description: input.description, objective: input.objective, cover: input.cover, coverImage: input.coverImage ?? null, duration: input.duration, published: input.published ? 1 : 0, createdBy: actor.id }).onConflictDoUpdate({ target: learningModules.id, set: { code: input.code, title: input.title, kind: input.kind, description: input.description, objective: input.objective, cover: input.cover, coverImage: input.coverImage ?? null, duration: input.duration, published: input.published ? 1 : 0 } });
    await tx.delete(learningSteps).where(eq(learningSteps.moduleId, input.id));
    await tx.delete(learningResources).where(eq(learningResources.moduleId, input.id));
    if (input.steps.length) await tx.insert(learningSteps).values(input.steps.map((step, position) => ({ id: step.id, moduleId: input.id, position, title: step.title, description: step.description, tip: step.tip, imageUrl: step.image ?? null, attachments: JSON.stringify(step.attachments ?? []), quiz: serializeQuiz(step.quiz) })));
    if (input.resources.length) await tx.insert(learningResources).values(input.resources.map((resource) => ({ id: resource.id, moduleId: input.id, category: resource.category, label: resource.label, title: resource.title, detail: resource.detail, status: resource.status, progress: resource.progress, modelUrl: resource.modelUrl, attachments: JSON.stringify(resource.attachments ?? []), color: resource.color, inventoryItemId: resource.inventoryItemId ?? null })));
    return { removedImages: previousImages.filter((url) => !nextImages.has(url)) };
  });
}

/** Uma imagem enviada ainda é usada por algum módulo, etapa ou foto de perfil? */
export async function isUploadReferenced(url: string) {
  const db = await requireDb();
  // A URL aparece entre aspas dentro do JSON dos anexos (ela nunca contém aspas).
  const quotedUrl = `%${JSON.stringify(url)}%`;
  const [[cover], [step], [avatar], [stepAttachment], [resourceAttachment]] = await Promise.all([
    db.select({ id: learningModules.id }).from(learningModules).where(eq(learningModules.coverImage, url)).limit(1),
    db.select({ id: learningSteps.id }).from(learningSteps).where(eq(learningSteps.imageUrl, url)).limit(1),
    db.select({ id: users.id }).from(users).where(eq(users.avatarUrl, url)).limit(1),
    db.select({ id: learningSteps.id }).from(learningSteps).where(like(learningSteps.attachments, quotedUrl)).limit(1),
    db.select({ id: learningResources.id }).from(learningResources).where(like(learningResources.attachments, quotedUrl)).limit(1),
  ]);
  return Boolean(cover || step || avatar || stepAttachment || resourceAttachment);
}

/**
 * "Excluir" arquiva: o módulo sai do catálogo e da agenda, mas etapas, recursos,
 * progresso e tempos dos alunos continuam no banco (basta limpar `archivedAt`
 * para trazê-lo de volta; ainda não há tela para isso).
 */
export async function deleteLearningModule(moduleId: string, actor: ContentActor) {
  const db = await requireDb();
  await db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: learningModules.id, createdBy: learningModules.createdBy }).from(learningModules)
      .where(and(eq(learningModules.id, moduleId), isNull(learningModules.archivedAt))).limit(1);
    if (!existing) throw new LearningDomainError("NOT_FOUND", "Módulo não encontrado.");
    if (!canManageContent(existing.createdBy, actor)) {
      throw new LearningDomainError("FORBIDDEN", "Somente quem criou este módulo (ou a administração) pode excluí-lo.");
    }
    const [{ total }] = await tx.select({ total: sql<number>`count(*)` }).from(learningModules).where(isNull(learningModules.archivedAt));
    if (Number(total) <= 1) throw new LearningDomainError("BAD_REQUEST", "Mantenha pelo menos um módulo no catálogo.");
    await tx.delete(learningActivities).where(eq(learningActivities.moduleId, moduleId));
    await tx.update(learningModules).set({ archivedAt: new Date(), published: 0 }).where(eq(learningModules.id, moduleId));
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

/**
 * Grava a agenda enviada pelo docente sem tocar no que é de outros docentes.
 *
 * O cliente envia a agenda inteira (é o que ele exibe). Atividades de outro
 * docente presentes na lista são ignoradas — continuam como estão no banco —,
 * e as ausentes não são apagadas. Só as atividades editáveis por `actor`
 * (dele, sem autor, ou qualquer uma para a administração) são substituídas.
 */
export async function replaceLearningSchedule(entries: LearningScheduleEntry[], actor: ContentActor) {
  const db = await requireDb();
  if (entries.some((entry) => !entry.moduleId || !entry.id || entry.endsAt <= entry.startsAt)) {
    throw new LearningDomainError("BAD_REQUEST", "Cada atividade precisa de módulo e intervalo de horário válidos.");
  }
  await db.transaction(async (tx) => {
    const existing = await tx.select({ id: learningActivities.id, createdBy: learningActivities.createdBy, startsAt: learningActivities.startsAt }).from(learningActivities);
    const foreign = existing.filter((row) => !canManageContent(row.createdBy, actor));
    const foreignIds = new Set(foreign.map((row) => row.id));
    const writable = entries.filter((entry) => !foreignIds.has(entry.id));

    const moduleIds = Array.from(new Set(writable.map((entry) => entry.moduleId)));
    const existingModules = moduleIds.length
      ? await tx.select({ id: learningModules.id }).from(learningModules).where(and(inArray(learningModules.id, moduleIds), isNull(learningModules.archivedAt)))
      : [];
    if (existingModules.length !== moduleIds.length) {
      throw new LearningDomainError("BAD_REQUEST", "A agenda contém referência para um módulo inexistente.");
    }
    const foreignSlots = new Set(foreign.map((row) => row.startsAt.getTime()));
    if (writable.some((entry) => foreignSlots.has(entry.startsAt.getTime()))) {
      throw new LearningDomainError("BAD_REQUEST", "Outro docente já agendou uma atividade neste dia e horário.");
    }

    const ownIds = existing.filter((row) => !foreignIds.has(row.id)).map((row) => row.id);
    if (ownIds.length) await tx.delete(learningActivities).where(inArray(learningActivities.id, ownIds));
    if (writable.length) {
      const authorById = new Map(existing.map((row) => [row.id, row.createdBy] as const));
      // Atividade já existente mantém o autor (inclusive "sem autor"); nova fica com quem salvou.
      await tx.insert(learningActivities).values(writable.map((entry) => ({ ...entry, createdBy: authorById.has(entry.id) ? authorById.get(entry.id) ?? null : actor.id })));
    }
  });
}

export async function startStudentStep(userId: number, moduleId: string, stepIndex: number) {
  const db = await requireDb();
  if (!Number.isInteger(stepIndex) || stepIndex < 0) {
    throw new LearningDomainError("BAD_REQUEST", "A etapa informada não pertence a este módulo.");
  }
  const sessionState = await db.transaction(async (tx) => {
    const [module] = await tx.select({ id: learningModules.id, published: learningModules.published, archivedAt: learningModules.archivedAt })
      .from(learningModules)
      .where(eq(learningModules.id, moduleId))
      .limit(1);
    if (!module || !module.published || module.archivedAt) throw new LearningDomainError("NOT_FOUND", "Módulo não encontrado ou ainda não publicado.");
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
    const [module] = await tx.select({ id: learningModules.id, published: learningModules.published, archivedAt: learningModules.archivedAt, duration: learningModules.duration })
      .from(learningModules)
      .where(eq(learningModules.id, moduleId))
      .limit(1);
    if (!module || !module.published || module.archivedAt) {
      throw new LearningDomainError("NOT_FOUND", "Módulo não encontrado ou ainda não publicado.");
    }
    const moduleSteps = await tx.select({ id: learningSteps.id, position: learningSteps.position }).from(learningSteps).where(eq(learningSteps.moduleId, moduleId));
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

    const measuredSeconds = getElapsedStudySeconds(session.startedAt.getTime(), Date.now());
    if (measuredSeconds < MIN_STEP_SECONDS) {
      throw new LearningDomainError("BAD_REQUEST", `Leia a etapa com atenção: é possível concluí-la depois de ${MIN_STEP_SECONDS} segundos.`);
    }
    // O quiz da etapa é opcional: não bloqueia a conclusão.
    // Só o tempo plausível conta: uma aba esquecida aberta não vira horas de estudo nem XP.
    const serverElapsedSeconds = creditedStepSeconds(measuredSeconds, stepTimeCapSeconds(module.duration, moduleSteps.length));
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

/**
 * Registra a resposta do aluno ao quiz da etapa em andamento. Todas as
 * tentativas ficam guardadas (métricas do docente); a explicação só é
 * devolvida no acerto, e o gabarito nunca vai para o aluno.
 */
export async function answerStepQuiz(userId: number, moduleId: string, stepIndex: number, selectedIndex: number) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const [module] = await tx.select({ published: learningModules.published, archivedAt: learningModules.archivedAt })
      .from(learningModules).where(eq(learningModules.id, moduleId)).limit(1);
    if (!module || !module.published || module.archivedAt) throw new LearningDomainError("NOT_FOUND", "Módulo não encontrado ou ainda não publicado.");
    const [step] = await tx.select({ id: learningSteps.id, quiz: learningSteps.quiz }).from(learningSteps)
      .where(and(eq(learningSteps.moduleId, moduleId), eq(learningSteps.position, stepIndex))).limit(1);
    const quiz = parseStoredQuiz(step?.quiz);
    if (!step || !quiz) throw new LearningDomainError("NOT_FOUND", "Esta etapa não tem verificação.");
    if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= quiz.options.length) {
      throw new LearningDomainError("BAD_REQUEST", "Escolha uma das alternativas.");
    }
    const [session] = await tx.select({ completedAt: studentStepSessions.completedAt }).from(studentStepSessions)
      .where(and(eq(studentStepSessions.userId, userId), eq(studentStepSessions.moduleId, moduleId), eq(studentStepSessions.stepIndex, stepIndex)))
      .limit(1);
    if (!session) throw new LearningDomainError("BAD_REQUEST", "Inicie a etapa antes de responder à verificação.");
    if (session.completedAt) throw new LearningDomainError("BAD_REQUEST", "Esta etapa já foi concluída.");
    const correct = selectedIndex === quiz.correctIndex;
    await tx.insert(studentQuizAttempts).values({ userId, moduleId, stepId: step.id, selectedIndex, correct: correct ? 1 : 0 });
    return correct
      ? { correct: true as const, explanation: quiz.explanation }
      : { correct: false as const, explanation: "" };
  });
}

export async function resetStudentModuleProgress(studentId: number, moduleId: string, actor: ContentActor) {
  const db = await requireDb();
  await db.transaction(async (tx) => {
    const [student] = await tx.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, studentId)).limit(1);
    if (!student || student.role !== "student") throw new LearningDomainError("NOT_FOUND", "Aluno não encontrado.");
    await assertStudentInScope(tx, actor, student.id);
    const [module] = await tx.select({ id: learningModules.id }).from(learningModules).where(eq(learningModules.id, moduleId)).limit(1);
    if (!module) throw new LearningDomainError("NOT_FOUND", "Módulo não encontrado.");
    await tx.delete(studentStepSessions).where(and(eq(studentStepSessions.userId, studentId), eq(studentStepSessions.moduleId, moduleId)));
    await tx.delete(studentProgress).where(and(eq(studentProgress.userId, studentId), eq(studentProgress.moduleId, moduleId)));
  });
  return { success: true } as const;
}
