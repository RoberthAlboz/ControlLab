/**
 * Conexão PostgreSQL (ex.: Supabase), usada quando DATABASE_PROVIDER=postgres.
 *
 * O SQLite continua sendo o banco principal: o schema e as consultas do Drizzle
 * são os do SQLite (`sqlite-proxy`). Este módulo recebe o SQL gerado para o
 * SQLite e o adapta ao Postgres, que entende quase tudo igual:
 *  - parâmetros `?` viram `$1, $2, …`;
 *  - `like` vira `ilike` (o LIKE do SQLite ignora maiúsculas/minúsculas);
 *  - `begin immediate` vira `begin`.
 * A estrutura das tabelas fica em drizzle/postgres/ (datas em BIGINT ms,
 * booleanos 0/1, gatilho que preenche ids nulos e a função `unixepoch()`).
 *
 * Assim como no SQLite, existe uma única conexão e as transações passam pelo
 * mutex de `db-lock.ts`.
 */
import { readFileSync } from "node:fs";
import pg from "pg";
import { isInsideTransaction, normalizeParam, pendingTransaction, type DriverMethod } from "./db-lock";

const INT8_OID = 20;
const NUMERIC_OID = 1700;

/** Troca os `?` por `$n` e adapta palavras do SQLite, sem mexer em textos entre aspas. */
export function translateSql(sqlText: string): string {
  let output = "";
  let segment = "";
  let index = 0;
  let paramIndex = 0;
  const flush = () => {
    output += segment.replace(/(?<![\w.])like(?!\w)/gi, "ilike");
    segment = "";
  };
  while (index < sqlText.length) {
    const char = sqlText[index];
    const next = sqlText[index + 1];
    if (char === "'" || char === '"') {
      flush();
      let end = index + 1;
      while (end < sqlText.length) {
        if (sqlText[end] === char) {
          if (sqlText[end + 1] === char) {
            end += 2;
            continue;
          }
          break;
        }
        end += 1;
      }
      output += sqlText.slice(index, end + 1);
      index = end + 1;
      continue;
    }
    if (char === "-" && next === "-") {
      flush();
      const end = sqlText.indexOf("\n", index);
      const stop = end === -1 ? sqlText.length : end;
      output += sqlText.slice(index, stop);
      index = stop;
      continue;
    }
    if (char === "/" && next === "*") {
      flush();
      const end = sqlText.indexOf("*/", index + 2);
      const stop = end === -1 ? sqlText.length : end + 2;
      output += sqlText.slice(index, stop);
      index = stop;
      continue;
    }
    if (char === "?") {
      paramIndex += 1;
      segment += `$${paramIndex}`;
      index += 1;
      continue;
    }
    segment += char;
    index += 1;
  }
  flush();
  return output.replace(/^\s*begin\s+(deferred|immediate|exclusive)\b/i, "begin");
}

/** Endereço do banco sem usuário e senha, para mensagens e logs. */
export function describePostgresUrl(url: string) {
  try {
    const parsed = new URL(url);
    return `postgres://${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}${parsed.pathname}`;
  } catch {
    return "postgres (DATABASE_URL inválida)";
  }
}

/**
 * Opções de conexão. SSL (DATABASE_SSL):
 *  - `require` (padrão): conexão criptografada, como o Supabase exige;
 *  - `verify`: também valida o certificado (use DATABASE_SSL_CA com o certificado do Supabase);
 *  - `disable`: sem SSL (Postgres local).
 */
export function postgresConfig(url = process.env.DATABASE_URL ?? "", sslMode = process.env.DATABASE_SSL ?? "require"): pg.ClientConfig {
  if (!url) throw new Error("DATABASE_URL não definida (connection string do Postgres/Supabase).");
  // O `sslmode` da URL sobrescreveria a configuração abaixo; quem decide é DATABASE_SSL.
  const parsed = new URL(url);
  parsed.searchParams.delete("sslmode");
  const mode = sslMode.trim().toLowerCase();
  let ssl: pg.ClientConfig["ssl"];
  if (mode === "disable" || mode === "false") ssl = false;
  else if (mode === "verify") ssl = { rejectUnauthorized: true, ca: process.env.DATABASE_SSL_CA ? readFileSync(process.env.DATABASE_SSL_CA, "utf8") : undefined };
  else ssl = { rejectUnauthorized: false };
  return {
    connectionString: parsed.toString(),
    ssl,
    connectionTimeoutMillis: 15_000,
    keepAlive: true,
    application_name: "controllab",
    types: {
      // COUNT(*), SUM() e colunas BIGINT (datas em ms) chegam como número, igual ao SQLite.
      getTypeParser: ((oid: number, format?: "text" | "binary") => {
        if (oid === INT8_OID || oid === NUMERIC_OID) return (value: string) => Number(value);
        return pg.types.getTypeParser(oid, format);
      }) as typeof pg.types.getTypeParser,
    },
  };
}

/**
 * Conexão única, reaberta automaticamente se cair (ex.: reinício do pooler do
 * Supabase). Se cair no meio de uma transação, a transação falha em vez de
 * continuar numa conexão nova sem BEGIN.
 */
export function createPostgresConnection(config: pg.ClientConfig = postgresConfig()) {
  let client: pg.Client | null = null;
  let connecting: Promise<pg.Client> | null = null;
  let generation = 0;
  let transactionGeneration: number | null = null;
  // Fila própria: o pg não aceita mais de uma consulta simultânea no mesmo cliente.
  let queue: Promise<unknown> = Promise.resolve();

  async function connection() {
    if (client) return client;
    connecting ??= (async () => {
      const candidate = new pg.Client(config);
      const drop = () => {
        if (client === candidate) client = null;
      };
      candidate.on("error", error => {
        console.warn("[Database] Conexão com o Postgres perdida:", error.message);
        drop();
      });
      candidate.on("end", drop);
      await candidate.connect();
      generation += 1;
      client = candidate;
      return candidate;
    })().finally(() => {
      connecting = null;
    });
    return connecting;
  }

  async function execute(sqlText: string, params: unknown[], method: DriverMethod) {
    let pending: Promise<void> | null;
    while ((pending = pendingTransaction())) await pending;
    // Entra na fila na mesma volta do event loop da última checagem: uma
    // transação aberta depois disso fica atrás desta consulta, nunca em volta dela.
    const run = queue.then(() => executeNow(sqlText, params, method));
    queue = run.catch(() => undefined);
    return run;
  }

  async function executeNow(sqlText: string, params: unknown[], method: DriverMethod) {
    const text = translateSql(sqlText);
    const command = text.trim().toLowerCase();
    const active = await connection();
    if (command.startsWith("begin")) transactionGeneration = generation;
    else if (isInsideTransaction() && transactionGeneration !== null && transactionGeneration !== generation) {
      throw new Error("A conexão com o Postgres caiu durante a transação; nada foi gravado. Tente novamente.");
    }
    const result = await active.query({ text, values: params.map(normalizeParam), rowMode: "array" });
    if (command === "commit" || command === "rollback") transactionGeneration = null;
    if (method === "run") return { rows: [] as unknown[] };
    if (method === "get") return { rows: result.rows[0] as unknown[] };
    return { rows: result.rows as unknown[] };
  }

  async function close() {
    const current = client;
    client = null;
    await current?.end().catch(() => undefined);
  }

  return { execute, connection, close };
}

export type PostgresConnection = ReturnType<typeof createPostgresConnection>;
