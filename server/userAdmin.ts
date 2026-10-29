/**
 * Gestão de contas e turmas pela administração. Só é chamado por
 * `admin.*` (adminProcedure).
 *
 * - Senhas viram hash scrypt aqui; nunca voltam para o navegador.
 * - Desativar, trocar o papel ou redefinir a senha encerra as sessões abertas
 *   da conta: a mudança vale no próximo clique, não depois de 12 h.
 * - A administração não pode rebaixar nem desativar a própria conta, o que
 *   garante que sempre reste ao menos um admin ativo.
 * - Turma é coisa de aluno: docentes e admins ficam sempre sem turma; o
 *   vínculo docente ↔ turma é o "docente responsável" da própria turma.
 */
import { randomUUID } from "node:crypto";
import { and, asc, count, eq, isNull } from "drizzle-orm";
import { classrooms, users, type User } from "../drizzle/schema";
import type { ClassroomInput, UserCreateInput, UserUpdateInput } from "@shared/user-admin";
import { isStaffRole } from "@shared/roles";
import { hashPassword } from "./_core/password";
import { requireDb, revokeUserSessions } from "./db";

export class UserAdminError extends Error {
  constructor(public readonly code: "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST", message: string) {
    super(message);
    this.name = "UserAdminError";
  }
}

const EMAIL_IN_USE = "Já existe uma conta com este e-mail.";

/** openId de conta local: aleatório, nunca derivado do e-mail. */
export function localOpenId() {
  return `local:${randomUUID()}`;
}

/** Violação de índice único no SQLite ou no Postgres (código 23505). */
function isUniqueViolation(error: unknown) {
  const messages = [error, (error as { cause?: unknown })?.cause].map(value => (value as { message?: string })?.message ?? "").join(" | ");
  return messages.includes("UNIQUE constraint failed") || messages.includes("duplicate key value violates unique constraint");
}
const CLASSROOM_NAME_IN_USE = "Já existe uma turma com este nome.";

/* ------------------------------------------------------------------ */
/* Contas                                                              */
/* ------------------------------------------------------------------ */

export async function listUsers() {
  const db = await requireDb();
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      active: users.active,
      classroomId: users.classroomId,
      classroomName: classrooms.name,
      createdAt: users.createdAt,
      lastSignedIn: users.lastSignedIn,
    })
    .from(users)
    .leftJoin(classrooms, eq(classrooms.id, users.classroomId))
    .orderBy(asc(users.name));
  return rows.map(row => ({ ...row, active: Boolean(row.active) }));
}

async function findByEmail(email: string) {
  const db = await requireDb();
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  return row;
}

/** Turma só vale para aluno, e precisa existir e estar ativa. */
async function resolveStudentClassroom(role: User["role"], classroomId: number | null | undefined) {
  if (role !== "student" || !classroomId) return null;
  const db = await requireDb();
  const [classroom] = await db
    .select({ id: classrooms.id })
    .from(classrooms)
    .where(and(eq(classrooms.id, classroomId), isNull(classrooms.archivedAt)))
    .limit(1);
  if (!classroom) throw new UserAdminError("BAD_REQUEST", "A turma escolhida não existe ou foi arquivada.");
  return classroom.id;
}

export async function createUser(input: UserCreateInput) {
  if (await findByEmail(input.email)) throw new UserAdminError("CONFLICT", EMAIL_IN_USE);
  const db = await requireDb();
  const classroomId = await resolveStudentClassroom(input.role, input.classroomId);
  const passwordHash = await hashPassword(input.password);
  try {
    await db.insert(users).values({
      // Identidade estável e independente do e-mail: o e-mail pode ser editado
      // depois e voltar a ficar livre; um openId derivado dele colidiria.
      openId: localOpenId(),
      email: input.email,
      name: input.name,
      role: input.role,
      classroomId,
      passwordHash,
      loginMethod: "password",
      active: 1,
    });
  } catch (error) {
    // Dois cadastros simultâneos com o mesmo e-mail: o índice único decide.
    if (isUniqueViolation(error)) throw new UserAdminError("CONFLICT", EMAIL_IN_USE);
    throw error;
  }
  const created = await findByEmail(input.email);
  return { id: created?.id ?? 0 };
}

export async function updateUser(input: UserUpdateInput, actorId: number) {
  const db = await requireDb();
  const [current] = await db.select().from(users).where(eq(users.id, input.id)).limit(1);
  if (!current) throw new UserAdminError("NOT_FOUND", "Conta não encontrada.");
  if (input.id === actorId && (input.role !== current.role || !input.active)) {
    throw new UserAdminError("BAD_REQUEST", "Você não pode alterar o tipo de acesso nem desativar a sua própria conta.");
  }
  if (input.email !== current.email) {
    const other = await findByEmail(input.email);
    if (other && other.id !== input.id) throw new UserAdminError("CONFLICT", EMAIL_IN_USE);
  }
  const classroomId = await resolveStudentClassroom(input.role, input.classroomId);
  await db
    .update(users)
    .set({ name: input.name, email: input.email, role: input.role, active: input.active ? 1 : 0, classroomId })
    .where(eq(users.id, input.id));
  // Quem deixa de ser docente/admin não fica como responsável por turma.
  if (isStaffRole(current.role) && !isStaffRole(input.role)) {
    await db.update(classrooms).set({ teacherId: null }).where(eq(classrooms.teacherId, input.id));
  }
  if (input.role !== current.role || (Boolean(current.active) && !input.active)) {
    await revokeUserSessions(current.openId);
  }
  return { success: true } as const;
}

export async function resetUserPassword(id: number, password: string) {
  const db = await requireDb();
  const [current] = await db.select({ openId: users.openId }).from(users).where(eq(users.id, id)).limit(1);
  if (!current) throw new UserAdminError("NOT_FOUND", "Conta não encontrada.");
  await db.update(users).set({ passwordHash: await hashPassword(password), loginMethod: "password" }).where(eq(users.id, id));
  await revokeUserSessions(current.openId);
  return { success: true } as const;
}

/* ------------------------------------------------------------------ */
/* Turmas                                                              */
/* ------------------------------------------------------------------ */

export async function listClassrooms() {
  const db = await requireDb();
  const [rows, studentCounts] = await Promise.all([
    db
      .select({ classroom: classrooms, teacherName: users.name, teacherEmail: users.email })
      .from(classrooms)
      .leftJoin(users, eq(users.id, classrooms.teacherId))
      .orderBy(asc(classrooms.name)),
    db
      .select({ classroomId: users.classroomId, total: count() })
      .from(users)
      .where(and(eq(users.role, "student"), eq(users.active, 1)))
      .groupBy(users.classroomId),
  ]);
  const students = new Map(studentCounts.map(row => [row.classroomId, Number(row.total)] as const));
  return rows.map(row => ({
    id: row.classroom.id,
    name: row.classroom.name,
    teacherId: row.classroom.teacherId,
    teacherName: row.teacherName,
    teacherEmail: row.teacherEmail,
    archived: Boolean(row.classroom.archivedAt),
    students: students.get(row.classroom.id) ?? 0,
  }));
}

/** Responsável precisa ser docente (ou admin) ativo. */
async function assertTeacher(teacherId: number | null) {
  if (!teacherId) return;
  const db = await requireDb();
  const [teacher] = await db.select({ role: users.role, active: users.active }).from(users).where(eq(users.id, teacherId)).limit(1);
  if (!teacher || !teacher.active || !isStaffRole(teacher.role)) {
    throw new UserAdminError("BAD_REQUEST", "O responsável precisa ser uma conta de docente ativa.");
  }
}

async function findClassroomByName(name: string) {
  const db = await requireDb();
  const [row] = await db.select({ id: classrooms.id }).from(classrooms).where(eq(classrooms.name, name)).limit(1);
  return row;
}

export async function createClassroom(input: ClassroomInput) {
  if (await findClassroomByName(input.name)) throw new UserAdminError("CONFLICT", CLASSROOM_NAME_IN_USE);
  await assertTeacher(input.teacherId);
  const db = await requireDb();
  await db.insert(classrooms).values({ name: input.name, teacherId: input.teacherId });
  const created = await findClassroomByName(input.name);
  return { id: created?.id ?? 0 };
}

export async function updateClassroom(input: ClassroomInput & { id: number }) {
  const db = await requireDb();
  const [current] = await db.select({ id: classrooms.id }).from(classrooms).where(eq(classrooms.id, input.id)).limit(1);
  if (!current) throw new UserAdminError("NOT_FOUND", "Turma não encontrada.");
  const other = await findClassroomByName(input.name);
  if (other && other.id !== input.id) throw new UserAdminError("CONFLICT", CLASSROOM_NAME_IN_USE);
  await assertTeacher(input.teacherId);
  await db.update(classrooms).set({ name: input.name, teacherId: input.teacherId }).where(eq(classrooms.id, input.id));
  return { success: true } as const;
}

/** Arquivar mantém o histórico do estoque ligado à turma; os alunos continuam vinculados. */
export async function setClassroomArchived(id: number, archived: boolean) {
  const db = await requireDb();
  const [current] = await db.select({ id: classrooms.id }).from(classrooms).where(eq(classrooms.id, id)).limit(1);
  if (!current) throw new UserAdminError("NOT_FOUND", "Turma não encontrada.");
  await db.update(classrooms).set({ archivedAt: archived ? new Date() : null }).where(eq(classrooms.id, id));
  return { success: true } as const;
}
