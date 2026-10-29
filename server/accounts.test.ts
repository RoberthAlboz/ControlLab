/**
 * Banco SQLite real: identidade das contas criadas pela administração e
 * erros de domínio das competências (badges).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "controllab-accounts-"));
process.env.DATABASE_FILE = path.join(dir, "teste.db");

const { runMigrations } = await import("../scripts/lib/database");
const db = await import("./db");
const userAdmin = await import("./userAdmin");

const PASSWORD = "senha-segura-1";

beforeAll(async () => {
  await runMigrations(process.env.DATABASE_FILE);
});

afterAll(async () => {
  await db.closeDb();
  rmSync(dir, { recursive: true, force: true });
});

describe("contas criadas pela administração", () => {
  it("o e-mail liberado por uma edição pode ser usado numa conta nova", async () => {
    const first = await userAdmin.createUser({ name: "Primeira Pessoa", email: "troca@escola.br", role: "student", password: PASSWORD });
    await userAdmin.updateUser({ id: first.id, name: "Primeira Pessoa", email: "novo@escola.br", role: "student", active: true }, 999);
    const second = await userAdmin.createUser({ name: "Segunda Pessoa", email: "troca@escola.br", role: "student", password: PASSWORD });
    expect(second.id).not.toBe(first.id);
  });

  it("e-mails longos com o mesmo começo não colidem", async () => {
    const prefix = `${"a".repeat(60)}`;
    await userAdmin.createUser({ name: "Longo Um", email: `${prefix}1@escola.br`, role: "student", password: PASSWORD });
    await expect(userAdmin.createUser({ name: "Longo Dois", email: `${prefix}2@escola.br`, role: "student", password: PASSWORD })).resolves.toMatchObject({ id: expect.any(Number) });
  });

  it("e-mail já usado continua sendo conflito", async () => {
    await expect(userAdmin.createUser({ name: "Repetida", email: "novo@escola.br", role: "student", password: PASSWORD })).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("competências", () => {
  it("atribuir a quem não é aluno e remover o que não existe são NOT_FOUND, não erro interno", async () => {
    const admin = { id: 1, role: "admin" } as const;
    await expect(db.assignStudentBadge({ studentId: 424242, label: "Precisão", detail: "" }, admin)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(db.removeStudentBadge(424242, admin)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("docente só acessa alunos das próprias turmas", () => {
  let owner: { id: number; role: "teacher" };
  let other: { id: number; role: "teacher" };
  let studentId: number;

  beforeAll(async () => {
    const ownerUser = await userAdmin.createUser({ name: "Docente Dono", email: "dono@escola.br", role: "teacher", password: PASSWORD });
    const otherUser = await userAdmin.createUser({ name: "Docente Outro", email: "outro@escola.br", role: "teacher", password: PASSWORD });
    owner = { id: ownerUser.id, role: "teacher" };
    other = { id: otherUser.id, role: "teacher" };
    const classroom = await userAdmin.createClassroom({ name: "Turma Escopo", teacherId: owner.id });
    const student = await userAdmin.createUser({ name: "Aluna Escopo", email: "aluna.escopo@escola.br", role: "student", password: PASSWORD, classroomId: classroom.id });
    studentId = student.id;
  });

  it("o responsável pela turma lê o diário, dá e remove competências", async () => {
    await expect(db.getNotesOfStudent(studentId, owner)).resolves.toMatchObject({ student: { id: studentId } });
    await db.assignStudentBadge({ studentId, label: "Precisão", detail: "" }, owner);
    const data = await db.getTeacherBadgeData(owner);
    expect(data.students.map((row) => row.id)).toContain(studentId);
    const badge = data.badges.find((row) => row.userId === studentId)!;
    await expect(db.removeStudentBadge(badge.id, owner)).resolves.toBeUndefined();
  });

  it("outro docente recebe FORBIDDEN e não vê o aluno na supervisão", async () => {
    await expect(db.getNotesOfStudent(studentId, other)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(db.assignStudentBadge({ studentId, label: "Precisão", detail: "" }, other)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(db.resetStudentModuleProgress(studentId, "qualquer", other)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const data = await db.getTeacherBadgeData(other);
    expect(data.students.map((row) => row.id)).not.toContain(studentId);
  });

  it("a administração continua vendo todos os alunos", async () => {
    const data = await db.getTeacherBadgeData({ id: 1, role: "admin" });
    expect(data.students.map((row) => row.id)).toContain(studentId);
  });

  it("o cartão 'Seu docente' do aluno mostra o responsável pela turma, e só para o aluno", async () => {
    const asStudent = await db.getCatalog(studentId, "all", "student");
    expect(asStudent.instructors[0]).toMatchObject({ name: "Docente Dono", role: "Responsável · Turma Escopo", initials: "DD" });
    const asTeacher = await db.getCatalog(owner.id, "all", "teacher");
    expect(asTeacher.instructors.map((row) => row.name)).not.toContain("Docente Dono");
  });
});
