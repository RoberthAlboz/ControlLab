/**
 * Prepara o banco (SQLite ou Postgres) do zero ou atualiza um existente:
 *   1. SQLite: cria o arquivo (DATABASE_FILE, padrão data/forgelab.db) se não existir;
 *      Postgres: conecta em DATABASE_URL (DATABASE_PROVIDER=postgres);
 *   2. aplica as migrations;
 *   3. roda a seed idempotente (exceto com --no-seed ou em produção).
 */
import "dotenv/config";
import { databaseLabel, describeConnectionError, isProductionEnvironment, runMigrations } from "./lib/database";
import { closeDb } from "../server/db";
import { runSeed } from "../server/seed";

async function main() {
  const applied = await runMigrations();
  console.log(`[db:setup] Banco ${databaseLabel()} pronto (${applied} migration(s) aplicada(s)).`);
  if (process.argv.includes("--no-seed") || isProductionEnvironment()) {
    console.log("[db:setup] Seed ignorada.");
    return;
  }
  await runSeed();
  console.log("[db:setup] Seed concluída. Rode `pnpm dev` e acesse http://localhost:3000.");
}

main()
  .catch(error => {
    console.error(`[db:setup] Falhou: ${describeConnectionError(error)}`);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
