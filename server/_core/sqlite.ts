/**
 * Conexão SQLite usando o módulo nativo do Node (`node:sqlite`, Node 22.16+):
 * nenhuma dependência nativa para compilar e o banco é um arquivo no projeto.
 *
 * O Drizzle conversa com o SQLite pelo driver `sqlite-proxy`. Como existe uma
 * única conexão, as transações são serializadas pelo mutex de `db-lock.ts`.
 */
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { normalizeParam, waitOutsideTransaction, type DriverMethod } from "./db-lock";

export { runExclusive } from "./db-lock";
export type SqliteMethod = DriverMethod;

/** Caminho do arquivo do banco (DATABASE_FILE; padrão data/forgelab.db). */
export function resolveDatabaseFile(value = process.env.DATABASE_FILE) {
  const raw = (value || "data/forgelab.db").trim().replace(/^file:/, "");
  if (raw === ":memory:") return raw;
  return path.resolve(process.cwd(), raw);
}

let warningFilterInstalled = false;
/** O Node marca `node:sqlite` como experimental; o aviso não indica erro. */
function silenceSqliteWarning() {
  if (warningFilterInstalled) return;
  warningFilterInstalled = true;
  const original = process.emitWarning.bind(process);
  process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
    const text = typeof warning === "string" ? warning : warning?.message;
    if (text && text.includes("SQLite is an experimental feature")) return;
    return (original as (...args: unknown[]) => void)(warning, ...rest);
  }) as typeof process.emitWarning;
}

export async function openSqlite(file = resolveDatabaseFile()): Promise<DatabaseSync> {
  silenceSqliteWarning();
  // `require` em vez de `import()`: o Vitest (Vite 5) não reconhece `node:sqlite`
  // como módulo embutido e tentaria resolvê-lo como pacote.
  const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const database = new DatabaseSync(file);
  database.exec("PRAGMA journal_mode = WAL;");
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec("PRAGMA busy_timeout = 5000;");
  database.exec("PRAGMA synchronous = NORMAL;");
  return database;
}

/** Executa um SQL vindo do Drizzle no formato que o `sqlite-proxy` espera. */
export async function executeProxy(database: DatabaseSync, sqlText: string, params: unknown[], method: SqliteMethod) {
  await waitOutsideTransaction();
  const statement = database.prepare(sqlText);
  const values = params.map(normalizeParam) as SQLInputValue[];
  if (method === "run") {
    statement.run(...values);
    return { rows: [] as unknown[] };
  }
  statement.setReturnArrays(true);
  if (method === "get") {
    const row = statement.get(...values);
    return { rows: (row ?? undefined) as unknown as unknown[] };
  }
  return { rows: statement.all(...values) as unknown[] };
}
