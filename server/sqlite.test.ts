/**
 * Banco SQLite real (arquivo temporário): migration base, restrições de
 * integridade do estoque e serialização das transações.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { executeProxy, openSqlite, runExclusive } from "./_core/sqlite";
import { runMigrations } from "../scripts/lib/database";

let dir = "";
let file = "";

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "forgelab-sqlite-"));
  file = path.join(dir, "teste.db");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function errorOf(action: () => unknown) {
  try {
    action();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "";
}

describe("SQLite · migrations", () => {
  it("aplica as migrations uma única vez (idempotente)", async () => {
    expect(await runMigrations(file)).toBe(7);
    expect(await runMigrations(file)).toBe(0);
    const db = await openSqlite(file);
    const tables = (db.prepare("select name from sqlite_master where type = 'table' order by name").all() as Array<{ name: string }>).map(row => row.name);
    const columnsOf = (table: string) => (db.prepare(`pragma table_info(${table})`).all() as Array<{ name: string }>).map(row => row.name);
    const moduleColumns = columnsOf("learning_modules");
    const activityColumns = columnsOf("learning_activities");
    const classroomColumns = ["users", "inventory_loans", "inventory_movements"].map(columnsOf);
    const attachmentColumns = ["learning_steps", "learning_resources"].map(columnsOf);
    const itemColumns = columnsOf("inventory_items");
    db.close();
    for (const table of ["users", "auth_sessions", "learning_modules", "learning_resources", "inventory_items", "inventory_movements", "inventory_loans", "inventory_categories", "inventory_audit_log", "student_notes", "classrooms"]) {
      expect(tables).toContain(table);
    }
    expect(moduleColumns).toContain("archivedAt");
    expect(activityColumns).toContain("createdBy");
    for (const columns of classroomColumns) expect(columns).toContain("classroomId");
    for (const columns of attachmentColumns) expect(columns).toContain("attachments");
    expect(itemColumns).toContain("icon");
  });

  it("área educacional amarrada por FKs: módulo inexistente é recusado e apagar o módulo leva as etapas", async () => {
    await runMigrations(file);
    const db = await openSqlite(file);
    try {
      expect(errorOf(() => db.prepare("insert into learning_steps (id, moduleId, position, title, description, tip) values ('s1', 'nao-existe', 0, 't', '', '')").run())).toMatch(/FOREIGN KEY/);
      db.prepare("insert into learning_modules (id, code, title, kind, description, objective, cover, duration) values ('m1', 'M1', 'Módulo', 'Processo', '', '', '', '1h')").run();
      db.prepare("insert into learning_steps (id, moduleId, position, title, description, tip) values ('s1', 'm1', 0, 't', '', '')").run();
      db.prepare("delete from learning_modules where id = 'm1'").run();
      expect((db.prepare("select count(*) as n from learning_steps").get() as { n: number }).n).toBe(0);
    } finally {
      db.close();
    }
  });
});

describe("SQLite · integridade do estoque", () => {
  async function seeded() {
    await runMigrations(file);
    const db = await openSqlite(file);
    db.exec("insert into users (openId, email, name, role) values ('local:d', 'd@x', 'Docente', 'teacher')");
    db.exec("insert into inventory_items (code, name, itemType, sector, location, quantityPhysical) values ('BRC-1', 'Broca', 'tool', 'Ferramentaria', 'A1', 5)");
    return db;
  }

  it("CHECK impede saldo negativo e reserva maior que o físico", async () => {
    const db = await seeded();
    expect(errorOf(() => db.exec("update inventory_items set quantityPhysical = -1 where code = 'BRC-1'"))).toContain("CHECK constraint failed");
    expect(errorOf(() => db.exec("update inventory_items set quantityReserved = 6 where code = 'BRC-1'"))).toContain("CHECK constraint failed");
    db.close();
  });

  it("código patrimonial é único", async () => {
    const db = await seeded();
    expect(errorOf(() => db.exec("insert into inventory_items (code, name, itemType, sector, location) values ('BRC-1', 'Outra', 'tool', 'X', 'Y')"))).toContain("UNIQUE constraint failed");
    db.close();
  });

  it("chaves estrangeiras são verificadas (movimentação exige item e responsável)", async () => {
    const db = await seeded();
    const message = errorOf(() =>
      db.exec(
        "insert into inventory_movements (itemId, movementType, quantity, physicalBefore, physicalAfter, reservedBefore, reservedAfter, reason, itemCodeSnapshot, itemNameSnapshot, unitSnapshot, userId) values (999, 'entrada', 1, 0, 1, 0, 0, 'compra', 'X', 'X', 'UN', 1)",
      ),
    );
    expect(message).toContain("FOREIGN KEY constraint failed");
    db.close();
  });

  it("movimentação não aceita quantidade zero", async () => {
    const db = await seeded();
    const message = errorOf(() =>
      db.exec(
        "insert into inventory_movements (itemId, movementType, quantity, physicalBefore, physicalAfter, reservedBefore, reservedAfter, reason, itemCodeSnapshot, itemNameSnapshot, unitSnapshot, userId) values (1, 'entrada', 0, 5, 5, 0, 0, 'compra', 'BRC-1', 'Broca', 'UN', 1)",
      ),
    );
    expect(message).toContain("CHECK constraint failed");
    db.close();
  });

  it("datas padrão são gravadas em milissegundos", async () => {
    const db = await seeded();
    const row = db.prepare("select createdAt from users limit 1").get() as { createdAt: number };
    expect(Math.abs(row.createdAt - Date.now()) < 60_000).toBe(true);
    db.close();
  });
});

describe("SQLite · proxy e transações", () => {
  it("devolve linhas como arrays (colunas com o mesmo nome não se perdem)", async () => {
    const db = await openSqlite(file);
    const result = await executeProxy(db, "select 1 as id, 2 as id", [], "all");
    expect(result.rows).toEqual([[1, 2]]);
    const single = await executeProxy(db, "select ? as a", [true], "get");
    expect(single.rows).toEqual([1]);
    db.close();
  });

  it("serializa transações: leitura-e-escrita concorrente não perde atualização", async () => {
    const db = await openSqlite(file);
    db.exec("create table saldo (v integer not null); insert into saldo values (0)");
    const tick = () => new Promise(resolve => setTimeout(resolve, 5));
    const incrementa = () =>
      runExclusive(async () => {
        await executeProxy(db, "begin", [], "run");
        const { rows } = await executeProxy(db, "select v from saldo", [], "get");
        await tick();
        await executeProxy(db, "update saldo set v = ?", [Number((rows as unknown as number[])[0]) + 1], "run");
        await executeProxy(db, "commit", [], "run");
      });
    await Promise.all([incrementa(), incrementa(), incrementa()]);
    expect((db.prepare("select v from saldo").get() as { v: number }).v).toBe(3);
    db.close();
  });

  it("consulta fora da transação não entra no meio dela (não é desfeita pelo rollback)", async () => {
    const db = await openSqlite(file);
    db.exec("create table t (origem text)");
    const tick = () => new Promise(resolve => setTimeout(resolve, 5));
    const falha = runExclusive(async () => {
      await executeProxy(db, "begin", [], "run");
      await executeProxy(db, "insert into t values ('transacao')", [], "run");
      await tick();
      await tick();
      await executeProxy(db, "rollback", [], "run");
    });
    const fora = (async () => {
      await tick();
      await executeProxy(db, "insert into t values ('fora')", [], "run");
    })();
    await Promise.all([falha, fora]);
    const rows = (db.prepare("select origem from t").all() as Array<{ origem: string }>).map(row => row.origem);
    expect(rows).toEqual(["fora"]);
    db.close();
  });
});
