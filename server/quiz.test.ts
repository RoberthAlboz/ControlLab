/**
 * Banco SQLite real: mini-quiz das etapas e regras de tempo da conclusão
 * (mínimo para concluir, teto creditado, quiz opcional e métricas do docente).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { creditedStepSeconds, MIN_STEP_SECONDS, parseDurationMinutes, stepTimeCapSeconds } from "@shared/progress";
import { parseStoredQuiz, quizProblem, serializeQuiz, summarizeQuizAttempts, type StepQuiz } from "@shared/quiz";

const dir = mkdtempSync(path.join(tmpdir(), "controllab-quiz-"));
process.env.DATABASE_FILE = path.join(dir, "teste.db");

const { runMigrations } = await import("../scripts/lib/database");
const db = await import("./db");
const { openSqlite } = await import("./_core/sqlite");

const teacher = { id: 1, role: "teacher" as const };
const STUDENT = 7;
const OTHER_STUDENT = 8;
const quiz: StepQuiz = {
  question: "Qual instrumento confere o alinhamento?",
  options: ["Trena", "Relógio comparador", "Esquadro"],
  correctIndex: 1,
  explanation: "O relógio comparador mostra o batimento.",
};

/** Simula que a sessão da etapa começou há `seconds` segundos. */
async function backdateSession(stepIndex: number, seconds: number) {
  const sqlite = await openSqlite(process.env.DATABASE_FILE);
  sqlite.prepare("update student_step_sessions set startedAt = ? where userId = ? and moduleId = 'q' and stepIndex = ?")
    .run(Date.now() - seconds * 1000, STUDENT, stepIndex);
  // As tentativas do quiz precisam ser posteriores ao início da sessão.
  sqlite.prepare("update student_quiz_attempts set createdAt = ? where userId = ?").run(Date.now(), STUDENT);
  sqlite.close();
}

beforeAll(async () => {
  await runMigrations(process.env.DATABASE_FILE);
  const sqlite = await openSqlite(process.env.DATABASE_FILE);
  sqlite.exec(`
    insert into users (id, openId, email, name, role) values
      (1, 'local:doc', 'doc@x.br', 'Docente', 'teacher'),
      (7, 'local:aluno', 'aluno@x.br', 'Aluno', 'student'),
      (8, 'local:aluno2', 'aluno2@x.br', 'Aluno 2', 'student');
    insert into classrooms (id, name, teacherId) values (1, 'Turma', 1);
    update users set classroomId = 1 where id in (7, 8);
  `);
  sqlite.close();
  await db.saveLearningModule({
    id: "q",
    code: "Q-01",
    title: "Módulo com quiz",
    kind: "Processo",
    description: "Descrição",
    objective: "Objetivo",
    cover: "#fff",
    duration: "20 min",
    published: true,
    steps: [
      { id: "q-s1", title: "Etapa com quiz", description: "", tip: "", quiz },
      { id: "q-s2", title: "Etapa sem quiz", description: "", tip: "" },
    ],
    resources: [],
  }, teacher);
});

afterAll(async () => {
  await db.closeDb();
  rmSync(dir, { recursive: true, force: true });
});

describe("quiz: regras compartilhadas", () => {
  it("valida pergunta, alternativas e gabarito", () => {
    expect(quizProblem(quiz)).toBeNull();
    expect(quizProblem({ ...quiz, question: "  " })).toMatch(/pergunta/);
    expect(quizProblem({ ...quiz, options: ["Só uma"] })).toMatch(/2 a 4/);
    expect(quizProblem({ ...quiz, options: ["A", "a "] })).toMatch(/diferentes/);
    expect(quizProblem({ ...quiz, correctIndex: 3 })).toMatch(/correta/);
  });

  it("JSON inválido ou incompleto no banco vira 'sem quiz'", () => {
    expect(parseStoredQuiz(serializeQuiz(quiz))).toEqual(quiz);
    expect(parseStoredQuiz("{nao é json")).toBeNull();
    expect(parseStoredQuiz(JSON.stringify({ ...quiz, correctIndex: 9 }))).toBeNull();
    expect(parseStoredQuiz(null)).toBeNull();
    // Uma alternativa inválida no meio deslocaria o gabarito: o quiz inteiro é recusado.
    expect(parseStoredQuiz(JSON.stringify({ ...quiz, options: [quiz.options[0], 42, ...quiz.options.slice(1)] }))).toBeNull();
  });

  it("resume acerto de primeira e tentativas até acertar", () => {
    const at = (s: number) => new Date(1_000_000 + s * 1000);
    const { byStep, byStudent } = summarizeQuizAttempts([
      { userId: 1, stepId: "s", correct: false, createdAt: at(1) },
      { userId: 1, stepId: "s", correct: true, createdAt: at(2) },
      { userId: 2, stepId: "s", correct: true, createdAt: at(1) },
    ]);
    expect(byStep.get("s")).toEqual({ answered: 2, firstTry: 1, solved: 2, attemptsUntilSolved: 3 });
    expect(byStudent.get(1)).toEqual({ answered: 1, firstTry: 0 });
  });
});

describe("tempo creditado por etapa", () => {
  it("lê durações em texto livre", () => {
    expect(parseDurationMinutes("45 min")).toBe(45);
    expect(parseDurationMinutes("1h 30min")).toBe(90);
    expect(parseDurationMinutes("2 h")).toBe(120);
    expect(parseDurationMinutes("")).toBeNull();
  });

  it("teto = 3× o tempo previsto por etapa, entre 10 min e 2 h", () => {
    expect(stepTimeCapSeconds("45 min", 3)).toBe(45 * 60);
    expect(stepTimeCapSeconds("5 min", 5)).toBe(10 * 60);
    expect(stepTimeCapSeconds("10 h", 1)).toBe(2 * 60 * 60);
    expect(stepTimeCapSeconds("", 4)).toBe(30 * 60);
    expect(creditedStepSeconds(10 * 3600, 1800)).toBe(1800);
    expect(creditedStepSeconds(95, 1800)).toBe(95);
  });
});

describe("quiz: fluxo do aluno no banco", () => {
  it("o aluno recebe pergunta e alternativas, nunca o gabarito", async () => {
    const catalog = await db.getCatalog(STUDENT, "all", "student");
    const step = catalog.modules[0].steps[0];
    expect(step.quiz).toEqual({ question: quiz.question, options: quiz.options });
    expect(JSON.stringify(catalog)).not.toContain("correctIndex");
    expect(JSON.stringify(catalog)).not.toContain(quiz.explanation);
    expect(step.quizPassed).toBe(false);
    const teacherCatalog = await db.getCatalog(teacher.id, "all", "teacher");
    expect(teacherCatalog.modules[0].steps[0].quiz).toEqual(quiz);
  });

  it("não deixa concluir antes do tempo mínimo", async () => {
    // Responder antes de iniciar a etapa não vale.
    await expect(db.answerStepQuiz(STUDENT, "q", 0, 1)).rejects.toThrow(/Inicie a etapa/);
    await db.startStudentStep(STUDENT, "q", 0);
    await expect(db.answerStepQuiz(STUDENT, "q", 1, 0)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(db.updateProgress(STUDENT, "q", 1)).rejects.toThrow(new RegExp(`${MIN_STEP_SECONDS} segundos`));
  });

  it("o quiz é opcional: conclui a etapa sem responder", async () => {
    await db.startStudentStep(OTHER_STUDENT, "q", 0);
    const sqlite = await openSqlite(process.env.DATABASE_FILE);
    sqlite.prepare("update student_step_sessions set startedAt = ? where userId = ? and moduleId = 'q' and stepIndex = 0")
      .run(Date.now() - 60 * 1000, OTHER_STUDENT);
    sqlite.close();
    const done = await db.updateProgress(OTHER_STUDENT, "q", 1);
    expect(done.elapsedSeconds).toBeGreaterThanOrEqual(59);
  });

  it("erro não revela o gabarito; acerto mostra a explicação", async () => {
    expect(await db.answerStepQuiz(STUDENT, "q", 0, 0)).toEqual({ correct: false, explanation: "" });
    expect(await db.answerStepQuiz(STUDENT, "q", 0, 1)).toEqual({ correct: true, explanation: quiz.explanation });
    await backdateSession(0, 60);
    expect((await db.getCatalog(STUDENT, "all", "student")).modules[0].steps[0].quizPassed).toBe(true);
    const done = await db.updateProgress(STUDENT, "q", 1);
    expect(done.elapsedSeconds).toBeGreaterThanOrEqual(59);
    await expect(db.answerStepQuiz(STUDENT, "q", 0, 1)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("uma aba esquecida aberta credita no máximo o teto da etapa", async () => {
    await db.startStudentStep(STUDENT, "q", 1);
    await backdateSession(1, 10 * 3600);
    const done = await db.updateProgress(STUDENT, "q", 2);
    expect(done.elapsedSeconds).toBe(stepTimeCapSeconds("20 min", 2));
  });

  it("o docente vê acerto de primeira por etapa e por aluno", async () => {
    const data = await db.getTeacherBadgeData(teacher);
    expect(data.quizSteps).toEqual([
      expect.objectContaining({ stepId: "q-s1", stepNumber: 1, answered: 1, firstTry: 0, averageAttempts: 2 }),
    ]);
    expect(data.supervision.find(student => student.id === STUDENT)?.quiz).toEqual({ answered: 1, firstTry: 0 });
  });

  it("acerto de primeira rende XP extra", () => {
    expect(db.calculateGamification(0, 0, 2)).toEqual({ level: 1, levelProgress: 16, xp: 20 });
  });
});
