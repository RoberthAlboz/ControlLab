/**
 * Gera supabase/controllab-supabase.sql: um único script para colar no
 * SQL Editor do Supabase, com a estrutura completa (as migrations de
 * drizzle/postgres/) e os dados da seed de demonstração.
 *
 *   pnpm db:export-sql
 *
 * Como os dados são gerados: a seed do projeto roda num banco SQLite
 * temporário (o mesmo código que roda no Postgres) e as linhas viram INSERTs.
 * As senhas das contas da seed são sorteadas a cada exportação (nunca as de
 * desenvolvimento do .env.example, que são públicas) e ficam em
 * supabase/CONTAS-SEED.local.txt, fora do git.
 *
 * O script SQL é idempotente: migrations já aplicadas são puladas e linhas
 * que já existem não são duplicadas. Ele registra as migrations em
 * __drizzle_migrations do mesmo jeito que `pnpm db:migrate`.
 */
import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const OUTPUT_DIR = path.resolve(process.cwd(), "supabase");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "controllab-supabase.sql");
const ACCOUNTS_FILE = path.join(OUTPUT_DIR, "CONTAS-SEED.local.txt");
const ROLES = ["ADMIN", "TEACHER", "STUDENT"] as const;
const ROLE_LABEL = { ADMIN: "Administração", TEACHER: "Docente", STUDENT: "Aluno" } as const;
const DEFAULT_EMAIL = { ADMIN: "admin@forgelab.local", TEACHER: "docente@forgelab.local", STUDENT: "aluno@forgelab.local" } as const;

type Row = Record<string, unknown>;

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Número inválido na seed: ${value}`);
    return String(value);
  }
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Uint8Array) return `'\\x${Buffer.from(value).toString("hex")}'::bytea`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

function quoteIdent(name: string) {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Tabelas em ordem de dependência: quem é referenciado vem antes. Só as chaves
 * obrigatórias (NOT NULL) contam; as opcionais podem formar ciclos (ex.: turma
 * → docente e aluno → turma) e são preenchidas depois, com UPDATE.
 */
function sortByForeignKeys(tables: string[], dependsOn: Map<string, Set<string>>) {
  const sorted: string[] = [];
  const state = new Map<string, "visiting" | "done">();
  const visit = (table: string) => {
    if (state.get(table) === "done") return;
    if (state.get(table) === "visiting") throw new Error(`Ciclo de chaves estrangeiras envolvendo ${table}.`);
    state.set(table, "visiting");
    for (const parent of Array.from(dependsOn.get(table) ?? [])) if (parent !== table && tables.includes(parent)) visit(parent);
    state.set(table, "done");
    sorted.push(table);
  };
  for (const table of [...tables].sort()) visit(table);
  return sorted;
}

async function main() {
  // A seed roda num SQLite temporário: estas variáveis valem antes de carregar o servidor.
  const workDir = mkdtempSync(path.join(os.tmpdir(), "controllab-export-"));
  const seedFile = path.join(workDir, "seed.db");
  process.env.DATABASE_PROVIDER = "sqlite";
  process.env.DATABASE_FILE = seedFile;
  process.env.STORAGE_DRIVER = "disk";
  process.env.UPLOAD_DIR = path.join(workDir, "uploads");
  process.env.SEED_RESET_PASSWORDS = "false";

  const accounts = ROLES.map(role => {
    const password = randomBytes(12).toString("base64url");
    process.env[`SEED_${role}_PASSWORD`] = password;
    const email = (process.env[`SEED_${role}_EMAIL`] || DEFAULT_EMAIL[role]).trim().toLowerCase();
    return { role, email, password };
  });

  const { readJournal, readStatements, runMigrations } = await import("./lib/database");
  const { runSeed } = await import("../server/seed");
  const { closeDb } = await import("../server/db");
  const { openSqlite } = await import("../server/_core/sqlite");

  try {
    await runMigrations(seedFile);
    await runSeed(() => undefined);
    await closeDb();

    const sqlite = await openSqlite(seedFile);
    const tables = (sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '__drizzle_migrations'`).all() as Array<{ name: string }>).map(row => row.name);
    type Column = { name: string; pk: number; type: string; notnull: number };
    const columnsOf = new Map<string, Column[]>();
    const foreignKeysOf = new Map<string, Array<{ table: string; from: string }>>();
    const dependsOn = new Map<string, Set<string>>();
    for (const table of tables) {
      const columns = sqlite.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all() as Column[];
      const foreignKeys = sqlite.prepare(`PRAGMA foreign_key_list(${quoteIdent(table)})`).all() as Array<{ table: string; from: string }>;
      columnsOf.set(table, columns);
      foreignKeysOf.set(table, foreignKeys);
      const required = foreignKeys.filter(fk => columns.find(column => column.name === fk.from)?.notnull);
      dependsOn.set(table, new Set(required.map(fk => fk.table)));
    }
    const ordered = sortByForeignKeys(tables, dependsOn);
    // Chaves opcionais que apontam para uma tabela ainda não inserida (ou para a própria): entram como NULL.
    const deferredOf = new Map<string, Set<string>>();
    for (const table of ordered) {
      const position = ordered.indexOf(table);
      const columns = columnsOf.get(table)!;
      deferredOf.set(table, new Set(
        foreignKeysOf.get(table)!
          .filter(fk => !columns.find(column => column.name === fk.from)?.notnull && ordered.indexOf(fk.table) >= position)
          .map(fk => fk.from),
      ));
    }
    const deferredLines: string[] = [];

    const dataLines: string[] = [];
    const sequenceLines: string[] = [];
    let totalRows = 0;
    for (const table of ordered) {
      const columns = columnsOf.get(table)!;
      const deferred = deferredOf.get(table)!;
      const keyColumns = columns.filter(column => column.pk > 0);
      const hasSerialId = columns.some(column => column.name === "id" && column.pk === 1 && /int/i.test(column.type));
      const orderBy = columns.some(column => column.pk > 0) ? ` ORDER BY ${columns.filter(c => c.pk > 0).map(c => quoteIdent(c.name)).join(", ")}` : "";
      const rows = sqlite.prepare(`SELECT * FROM ${quoteIdent(table)}${orderBy}`).all() as Row[];
      if (hasSerialId) {
        const t = quoteIdent(table);
        sequenceLines.push(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), GREATEST((SELECT COALESCE(MAX("id"), 0) FROM ${t}), 1), (SELECT COUNT(*) > 0 FROM ${t}));`);
      }
      if (!rows.length) continue;
      totalRows += rows.length;
      const names = columns.map(column => quoteIdent(column.name)).join(", ");
      dataLines.push(`-- ${table} (${rows.length})`);
      for (const row of rows) {
        const values = columns.map(column => (deferred.has(column.name) ? "NULL" : sqlLiteral(row[column.name]))).join(", ");
        dataLines.push(`INSERT INTO ${quoteIdent(table)} (${names}) VALUES (${values}) ON CONFLICT DO NOTHING;`);
        for (const column of Array.from(deferred)) {
          if (row[column] === null || row[column] === undefined) continue;
          const where = keyColumns.map(key => `${quoteIdent(key.name)} = ${sqlLiteral(row[key.name])}`).join(" AND ");
          // "IS NULL": rodar o script de novo não desfaz uma mudança feita no sistema.
          deferredLines.push(`UPDATE ${quoteIdent(table)} SET ${quoteIdent(column)} = ${sqlLiteral(row[column])} WHERE ${where} AND ${quoteIdent(column)} IS NULL;`);
        }
      }
      dataLines.push("");
    }
    sqlite.close();

    const migrationsFolder = path.resolve(process.cwd(), "drizzle", "postgres");
    const journal = readJournal(migrationsFolder);
    const migrationBlocks: string[] = [];
    for (const entry of journal.entries) {
      const { content, statements } = readStatements(migrationsFolder, entry.tag);
      const hash = createHash("sha256").update(content).digest("hex");
      const tag = `$m${entry.idx}$`;
      for (const statement of statements) {
        if (statement.includes(tag)) throw new Error(`A migration ${entry.tag} contém o marcador ${tag}.`);
      }
      migrationBlocks.push(
        `-- ${entry.tag}`,
        `DO $do$`,
        `BEGIN`,
        `  IF NOT EXISTS (SELECT 1 FROM "__drizzle_migrations" WHERE created_at >= ${entry.when}) THEN`,
        ...statements.map(statement => `    EXECUTE ${tag}${statement}${tag};`),
        `    INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ('${hash}', ${entry.when});`,
        `  END IF;`,
        `END`,
        `$do$;`,
        "",
      );
    }

    const generatedAt = new Date().toISOString();
    const script = [
      "-- ===========================================================================",
      "-- Control Lab — banco completo para o Supabase (estrutura + seed de demonstração)",
      "--",
      `-- Gerado por \`pnpm db:export-sql\` em ${generatedAt}. Não edite à mão: altere`,
      "-- drizzle/postgres/ ou server/seed.ts e gere de novo.",
      "--",
      "-- Como usar: Supabase → SQL Editor → New query → colar este arquivo → Run.",
      "-- Pode ser executado mais de uma vez: migrations já aplicadas são puladas e",
      "-- linhas que já existem não são duplicadas.",
      "--",
      "-- Contas criadas (senhas em supabase/CONTAS-SEED.local.txt, fora do git):",
      ...accounts.map(account => `--   ${ROLE_LABEL[account.role]}: ${account.email}`),
      "--",
      "-- Segurança: todas as tabelas ficam com RLS ligado e sem políticas, então a",
      "-- API pública do Supabase (chave anon) não lê nada. O sistema conecta como",
      "-- `postgres` pela DATABASE_URL e não depende da API do Supabase.",
      "-- ===========================================================================",
      "",
      "BEGIN;",
      "",
      "-- Controle de migrations (o mesmo de `pnpm db:migrate`).",
      `CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint);`,
      `ALTER TABLE "__drizzle_migrations" ENABLE ROW LEVEL SECURITY;`,
      "",
      "-- ---------------------------------------------------------------------------",
      "-- 1. Estrutura (drizzle/postgres/)",
      "-- ---------------------------------------------------------------------------",
      "",
      ...migrationBlocks,
      "-- ---------------------------------------------------------------------------",
      `-- 2. Seed de demonstração (${totalRows} linhas)`,
      "-- ---------------------------------------------------------------------------",
      "",
      ...dataLines,
      ...(deferredLines.length ? ["-- Vínculos opcionais que apontam para linhas inseridas depois.", ...deferredLines, ""] : []),
      "-- Os próximos ids continuam depois dos inseridos acima.",
      ...sequenceLines,
      "",
      "COMMIT;",
      "",
    ].join("\n");

    mkdirSync(OUTPUT_DIR, { recursive: true });
    writeFileSync(OUTPUT_FILE, script);
    writeFileSync(
      ACCOUNTS_FILE,
      [
        `Contas da seed de ${OUTPUT_FILE.replace(process.cwd() + path.sep, "")} (gerado em ${generatedAt}).`,
        "Este arquivo NÃO vai para o git. Troque as senhas depois do primeiro acesso.",
        "",
        ...accounts.map(account => `${ROLE_LABEL[account.role].padEnd(14)} ${account.email.padEnd(28)} ${account.password}`),
        "",
      ].join("\n"),
    );
    console.log(`[db:export-sql] ${path.relative(process.cwd(), OUTPUT_FILE)}: ${journal.entries.length} migrations e ${totalRows} linhas de seed.`);
    console.log(`[db:export-sql] Senhas das contas em ${path.relative(process.cwd(), ACCOUNTS_FILE)} (fora do git).`);
  } finally {
    // No Windows o arquivo do SQLite pode demorar a ser liberado; a pasta temporária fica para o sistema limpar.
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      /* ignorado */
    }
  }
}

main().catch(error => {
  console.error(`[db:export-sql] Falhou: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
