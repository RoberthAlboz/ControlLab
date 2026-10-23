/**
 * Utilitários dos scripts de banco (setup, migrate, seed, reset).
 *
 * SQLite (padrão): migrations em ./drizzle. Postgres/Supabase
 * (DATABASE_PROVIDER=postgres): migrations em ./drizzle/postgres.
 *
 * O migrador segue o mesmo formato do Drizzle (tabela `__drizzle_migrations`,
 * hash SHA-256 do arquivo e `created_at` = campo `when` do journal), então é
 * compatível com migrations geradas por `pnpm db:generate`.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { ENV } from "../../server/_core/env";
import { describePostgresUrl, postgresConfig } from "../../server/_core/postgres";
import { openSqlite, resolveDatabaseFile } from "../../server/_core/sqlite";

type JournalEntry = { idx: number; when: number; tag: string; breakpoints: boolean };

/** Tabelas do Control Lab, na ordem em que podem ser apagadas (dependentes primeiro). */
const APP_TABLES = [
  "inventory_audit_log",
  "inventory_movements",
  "inventory_loans",
  "learning_resources",
  "inventory_items",
  "inventory_categories",
  "learning_activities",
  "instructors",
  "student_step_sessions",
  "student_progress",
  "learning_steps",
  "learning_modules",
  "student_badges",
  "auth_sessions",
  "users",
  "__drizzle_migrations",
];

export function usesPostgres() {
  return ENV.databaseProvider === "postgres";
}

export function databaseFile() {
  return resolveDatabaseFile();
}

/** Onde está o banco, para as mensagens dos scripts (sem senha). */
export function databaseLabel() {
  return usesPostgres() ? describePostgresUrl(ENV.databaseUrl) : databaseFile();
}

function readJournal(migrationsFolder: string) {
  return JSON.parse(readFileSync(path.join(migrationsFolder, "meta", "_journal.json"), "utf8")) as { entries: JournalEntry[] };
}

function readStatements(migrationsFolder: string, tag: string) {
  const content = readFileSync(path.join(migrationsFolder, `${tag}.sql`), "utf8");
  const statements = content.split("--> statement-breakpoint").map(part => part.trim()).filter(Boolean);
  return { content, statements };
}

export function describeConnectionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("node:sqlite") || message.includes("ERR_UNKNOWN_BUILTIN_MODULE")) {
    return "Este Node.js não tem o módulo node:sqlite. Instale o Node 22.16 ou mais novo (recomendado: Node 22 LTS atualizado).";
  }
  if (/password authentication failed|autenticação do tipo senha falhou/i.test(message)) {
    return "Usuário ou senha do Postgres incorretos. Confira DATABASE_URL (no Supabase: Project Settings → Database).";
  }
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|timeout/i.test(message) && usesPostgres()) {
    return `Não foi possível alcançar o Postgres em ${databaseLabel()}: ${message}. Confira DATABASE_URL; no Supabase use a connection string do "Session pooler" (a conexão direta exige IPv6).`;
  }
  if (message.includes("SQLITE_BUSY") || message.includes("database is locked")) {
    return "O arquivo do banco está em uso. Pare o `pnpm dev` (ou feche o visualizador do banco) e tente de novo.";
  }
  return message;
}

/**
 * Aplica as migrations pendentes. Retorna quantas foram aplicadas.
 * Com `file` (ou DATABASE_PROVIDER=sqlite) usa o SQLite; senão o Postgres.
 */
export async function runMigrations(file?: string) {
  if (!file && usesPostgres()) return runPostgresMigrations();
  return runSqliteMigrations(file ?? databaseFile());
}

async function runSqliteMigrations(file: string) {
  const migrationsFolder = path.resolve(process.cwd(), "drizzle");
  const journal = readJournal(migrationsFolder);
  const database = await openSqlite(file);
  try {
    database.exec(`CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (id INTEGER PRIMARY KEY AUTOINCREMENT, hash text NOT NULL, created_at numeric)`);
    const last = database.prepare(`SELECT created_at FROM "__drizzle_migrations" ORDER BY created_at DESC LIMIT 1`).get() as { created_at: number } | undefined;
    let applied = 0;
    for (const entry of journal.entries) {
      if (last && Number(last.created_at) >= entry.when) continue;
      const { content, statements } = readStatements(migrationsFolder, entry.tag);
      database.exec("BEGIN");
      try {
        for (const statement of statements) database.exec(statement);
        database.prepare(`INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES (?, ?)`).run(createHash("sha256").update(content).digest("hex"), entry.when);
        database.exec("COMMIT");
        applied += 1;
      } catch (error) {
        database.exec("ROLLBACK");
        throw new Error(`Falha na migration ${entry.tag}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return applied;
  } finally {
    database.close();
  }
}

async function runPostgresMigrations() {
  const migrationsFolder = path.resolve(process.cwd(), "drizzle", "postgres");
  const journal = readJournal(migrationsFolder);
  const client = new pg.Client(postgresConfig());
  await client.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint)`);
    await client.query(`ALTER TABLE "__drizzle_migrations" ENABLE ROW LEVEL SECURITY`);
    const last = await client.query<{ created_at: string }>(`SELECT created_at FROM "__drizzle_migrations" ORDER BY created_at DESC LIMIT 1`);
    const lastWhen = last.rows[0] ? Number(last.rows[0].created_at) : null;
    let applied = 0;
    for (const entry of journal.entries) {
      if (lastWhen !== null && lastWhen >= entry.when) continue;
      const { content, statements } = readStatements(migrationsFolder, entry.tag);
      await client.query("BEGIN");
      try {
        for (const statement of statements) await client.query(statement);
        await client.query(`INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`, [createHash("sha256").update(content).digest("hex"), entry.when]);
        await client.query("COMMIT");
        applied += 1;
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`Falha na migration ${entry.tag}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return applied;
  } finally {
    await client.end();
  }
}

/** Apaga todos os dados: o arquivo SQLite ou, no Postgres, as tabelas do Control Lab. */
export async function resetDatabase() {
  if (!usesPostgres()) {
    deleteDatabaseFile();
    return;
  }
  const client = new pg.Client(postgresConfig());
  await client.connect();
  try {
    await client.query(`DROP TABLE IF EXISTS ${APP_TABLES.map(table => `"${table}"`).join(", ")} CASCADE`);
  } finally {
    await client.end();
  }
}

/** Remove o arquivo do banco e os arquivos auxiliares do modo WAL. */
export function deleteDatabaseFile(file = databaseFile()) {
  for (const suffix of ["", "-wal", "-shm"]) {
    const target = `${file}${suffix}`;
    if (existsSync(target)) rmSync(target);
  }
}

export function isProductionEnvironment() {
  return process.env.NODE_ENV === "production";
}
