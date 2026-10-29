/**
 * Banco SQLite real: o empréstimo entre as contas. Quem pode receber, o que o
 * aluno vê do próprio empréstimo e o bloqueio de desativar quem está com
 * ferramenta.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "controllab-loans-"));
process.env.DATABASE_FILE = path.join(dir, "teste.db");

const { runMigrations } = await import("../scripts/lib/database");
const db = await import("./db");
const inventory = await import("./inventory");
const userAdmin = await import("./userAdmin");
const { openSqlite } = await import("./_core/sqlite");
const { appRouter } = await import("./routers");
const { makeContext, makeUser } = await import("./test-utils");

const ADMIN = 1;
const TEACHER = 2;
const STUDENT = 3;
const OTHER_STUDENT = 4;
let itemId = 0;
let key = 0;
const requestKey = () => `chave-teste-${++key}`;

function loan(borrowerUserId: number | null, extra: Record<string, unknown> = {}) {
  return inventory.createLoan(
    { itemId, quantity: 1, borrowerUserId, borrowerName: "Quem recebe", purpose: "Aula prática", requestKey: requestKey(), ...extra },
    ADMIN
  );
}

beforeAll(async () => {
  await runMigrations(process.env.DATABASE_FILE);
  const sqlite = await openSqlite(process.env.DATABASE_FILE);
  sqlite.exec(`
    insert into users (id, openId, email, name, role) values
      (1, 'local:adm', 'adm@x.br', 'Admin', 'admin'),
      (2, 'local:doc', 'doc@x.br', 'Docente', 'teacher'),
      (3, 'local:aluno', 'aluno@x.br', 'Aluno', 'student'),
      (4, 'local:outro', 'outro@x.br', 'Outro aluno', 'student');
    insert into classrooms (id, name, teacherId) values (1, 'Turma A', 2);
    update users set classroomId = 1 where id in (3, 4);
  `);
  sqlite.close();
  const created = await inventory.createItem(
    {
      code: "PAQ-T",
      sapCode: null,
      name: "Paquímetro de teste",
      description: null,
      itemType: "tool",
      categoryId: null,
      unit: "UN",
      returnable: true,
      minQuantity: 0,
      sector: "Metrologia",
      location: "Armário",
      conservation: "bom",
      status: "disponivel",
      initialQuantity: 10,
      initialReason: "inventario",
      requestKey: requestKey(),
    },
    ADMIN
  );
  itemId = created.id;
});

afterAll(async () => {
  await db.closeDb();
  rmSync(dir, { recursive: true, force: true });
});

describe("empréstimo entre contas", () => {
  it("lista alunos e docentes ativos como quem pode receber, nunca a administração", async () => {
    const people = await inventory.listBorrowers();
    expect(people.map(person => [person.id, person.role])).toEqual([
      [STUDENT, "student"],
      [TEACHER, "teacher"],
      [OTHER_STUDENT, "student"],
    ]);
  });

  it("aceita docente como quem recebe e recusa conta da administração", async () => {
    const { loanId } = await loan(TEACHER);
    const saved = await inventory.listLoans({ status: "all", page: 1, pageSize: 50, itemId });
    expect(saved.loans.find(row => row.id === loanId)?.borrowerName).toBe("Docente");
    await expect(loan(ADMIN)).rejects.toThrow(/aluno ou docente/);
  });

  it("o aluno vê só os próprios empréstimos, com prazo e atraso", async () => {
    const due = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const { loanId } = await loan(STUDENT, { dueAt: due });
    await inventory.deliverLoan(loanId, ADMIN);
    await loan(OTHER_STUDENT);

    const caller = appRouter.createCaller(makeContext(makeUser("student", { id: STUDENT })).ctx);
    const mine = await caller.learning.myLoans();
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ id: loanId, itemName: "Paquímetro de teste", status: "retirado", outstanding: 1, overdue: false });
    // Nada de dados internos do estoque.
    expect(mine[0]).not.toHaveProperty("createdBy");
    expect(mine[0]).not.toHaveProperty("requestKey");

    const sqlite = await openSqlite(process.env.DATABASE_FILE);
    sqlite.prepare("update inventory_loans set dueAt = ? where id = ?").run(Date.now() - 60_000, loanId);
    sqlite.close();
    expect((await caller.learning.myLoans())[0].overdue).toBe(true);
  });

  it("devolvido continua visível ao aluno como histórico recente", async () => {
    const { loanId } = await loan(STUDENT);
    await inventory.deliverLoan(loanId, ADMIN);
    await inventory.returnLoan({ loanId, goodQuantity: 1, damagedQuantity: 0, note: null, requestKey: requestKey() }, ADMIN);
    const mine = await inventory.listBorrowerLoans(STUDENT);
    expect(mine.find(row => row.id === loanId)).toMatchObject({ status: "devolvido", outstanding: 0 });
  });

  it("docente e administração não usam a rota do aluno", async () => {
    const caller = appRouter.createCaller(makeContext(makeUser("teacher", { id: TEACHER })).ctx);
    await expect(caller.learning.myLoans()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("não desativa nem tira o acesso de quem está com ferramenta", async () => {
    const base = { id: STUDENT, name: "Aluno", email: "aluno@x.br", classroomId: 1 };
    await expect(userAdmin.updateUser({ ...base, role: "student", active: false }, ADMIN)).rejects.toThrow(/empréstimo\(s\) em aberto.*desativá-la/);
    await expect(userAdmin.updateUser({ ...base, role: "admin", active: true }, ADMIN)).rejects.toThrow(/mudar o tipo de acesso/);
    // Virar docente mantém a conta apta a receber: permitido.
    await expect(userAdmin.updateUser({ ...base, role: "teacher", active: true, classroomId: null }, ADMIN)).resolves.toEqual({ success: true });
    await userAdmin.updateUser({ ...base, role: "student", active: true }, ADMIN);
  });

  it("sem empréstimo aberto, a conta pode ser desativada", async () => {
    const open = await inventory.listLoans({ status: "active", page: 1, pageSize: 50, itemId });
    for (const row of open.loans.filter(entry => entry.borrowerUserId === OTHER_STUDENT)) {
      await inventory.cancelLoan(row.id, "Teste encerrado", ADMIN);
    }
    await expect(
      userAdmin.updateUser({ id: OTHER_STUDENT, name: "Outro aluno", email: "outro@x.br", role: "student", active: false, classroomId: 1 }, ADMIN)
    ).resolves.toEqual({ success: true });
  });
});
