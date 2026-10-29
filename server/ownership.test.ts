/**
 * Banco SQLite real: dono do conteúdo, módulos arquivados em vez de apagados,
 * ids de etapa repetidos entre módulos, agenda compartilhada entre docentes e
 * anotações dos alunos no servidor.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "controllab-ownership-"));
process.env.DATABASE_FILE = path.join(dir, "teste.db");

const { runMigrations } = await import("../scripts/lib/database");
const db = await import("./db");
const { openSqlite } = await import("./_core/sqlite");

const teacherA = { id: 1, role: "teacher" as const };
const teacherB = { id: 2, role: "teacher" as const };
const admin = { id: 3, role: "admin" as const };

function moduleInput(id: string, overrides: Partial<db.SaveModuleInput> = {}): db.SaveModuleInput {
  return {
    id,
    code: `COD-${id}`,
    title: `Módulo ${id}`,
    kind: "Processo",
    description: "Descrição",
    objective: "Objetivo",
    cover: "#ffffff",
    progress: 0,
    duration: "20 min",
    published: true,
    steps: [{ id: `${id}-s1`, title: "Etapa 1", description: "", tip: "" }],
    resources: [],
    ...overrides,
  };
}

function activity(id: string, moduleId: string, startsAt: string) {
  const start = new Date(startsAt);
  return { id, moduleId, title: `Atividade ${id}`, subtitle: "", activityType: "aula" as const, color: "#fff", startsAt: start, endsAt: new Date(start.getTime() + 45 * 60_000) };
}

beforeAll(async () => {
  await runMigrations(process.env.DATABASE_FILE);
  const sqlite = await openSqlite(process.env.DATABASE_FILE);
  sqlite.exec(`
    insert into users (id, openId, email, name, role) values
      (1, 'local:a', 'a@x.br', 'Docente A', 'teacher'),
      (2, 'local:b', 'b@x.br', 'Docente B', 'teacher'),
      (3, 'local:adm', 'adm@x.br', 'Admin', 'admin'),
      (7, 'local:aluno', 'aluno@x.br', 'Aluno', 'student');
  `);
  sqlite.close();
});

afterAll(async () => {
  await db.closeDb();
  rmSync(dir, { recursive: true, force: true });
});

describe("módulos: dono e arquivamento", () => {
  it("outro docente não altera nem exclui o módulo; quem criou e a administração podem", async () => {
    await db.saveLearningModule(moduleInput("m-a"), teacherA);
    await expect(db.saveLearningModule(moduleInput("m-a", { title: "Invadido" }), teacherB)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(db.deleteLearningModule("m-a", teacherB)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await db.saveLearningModule(moduleInput("m-a", { title: "Revisado pela administração" }), admin);
    const catalog = await db.getCatalog(undefined, "all", "teacher");
    expect(catalog.modules.find(module => module.id === "m-a")?.title).toBe("Revisado pela administração");
  });

  it("id de etapa já usado em outro módulo é recusado com mensagem clara (não erro 500)", async () => {
    await expect(
      db.saveLearningModule(moduleInput("m-copia", { steps: [{ id: "m-a-s1", title: "Etapa", description: "", tip: "" }] }), teacherB),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("outro módulo") });
  });

  it("excluir arquiva: some do catálogo, mas o progresso continua no banco", async () => {
    await db.saveLearningModule(moduleInput("m-b"), teacherA);
    const sqlite = await openSqlite(process.env.DATABASE_FILE);
    sqlite.exec("insert into student_progress (userId, moduleId, stepIndex, progress) values (7, 'm-b', 1, 100)");
    sqlite.close();

    await db.deleteLearningModule("m-b", teacherA);
    const catalog = await db.getCatalog(undefined, "all", "teacher");
    expect(catalog.modules.map(module => module.id)).not.toContain("m-b");

    const check = await openSqlite(process.env.DATABASE_FILE);
    const progress = check.prepare("select count(*) as total from student_progress where moduleId = 'm-b'").get() as { total: number };
    const archived = check.prepare("select archivedAt from learning_modules where id = 'm-b'").get() as { archivedAt: number | null };
    check.close();
    expect(progress.total).toBe(1);
    expect(archived.archivedAt).toEqual(expect.any(Number));
    await expect(db.saveLearningModule(moduleInput("m-b"), teacherA)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("o último módulo do catálogo não pode ser excluído", async () => {
    // Restam m-a (sem dono restrito para a administração) e nenhum outro ativo além dele.
    await expect(db.deleteLearningModule("m-a", admin)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("agenda compartilhada entre docentes", () => {
  it("salvar a agenda não apaga nem altera as atividades de outro docente", async () => {
    await db.replaceLearningSchedule([activity("a1", "m-a", "2026-11-03T10:45:00Z")], teacherA);
    // B envia a lista que vê (com a atividade de A alterada) e uma atividade nova.
    await db.replaceLearningSchedule(
      [{ ...activity("a1", "m-a", "2026-11-03T10:45:00Z"), title: "Alterada por B" }, activity("b1", "m-a", "2026-11-04T10:45:00Z")],
      teacherB,
    );
    // B salva de novo sem nada: só as atividades dele somem.
    await db.replaceLearningSchedule([], teacherB);
    const { activities } = await db.getCatalog(undefined, "all", "teacher");
    expect(activities.map(entry => [entry.id, entry.title])).toEqual([["a1", "Atividade a1"]]);
  });

  it("não deixa marcar no mesmo horário de uma atividade de outro docente", async () => {
    await expect(db.replaceLearningSchedule([activity("b2", "m-a", "2026-11-03T10:45:00Z")], teacherB)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("anotações no servidor", () => {
  it("guarda e devolve o diário do aluno", async () => {
    expect(await db.getStudentNotes(7)).toBeNull();
    await db.saveStudentNotes(7, JSON.stringify([{ id: "n1", title: "Torno" }]));
    await db.saveStudentNotes(7, JSON.stringify([{ id: "n1", title: "Torno revisado" }]));
    const saved = await db.getStudentNotes(7);
    expect(JSON.parse(saved!.content)).toEqual([{ id: "n1", title: "Torno revisado" }]);
  });
});
