/**
 * Apaga e recria o banco de DESENVOLVIMENTO (SQLite ou Postgres; migrations + seed).
 * Pede confirmação; use `pnpm db:reset -- --yes` para pular a pergunta.
 * Pare o `pnpm dev` antes: o banco não pode estar em uso.
 */
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { databaseLabel, describeConnectionError, isProductionEnvironment, resetDatabase, runMigrations } from "./lib/database";
import { closeDb } from "../server/db";
import { runSeed } from "../server/seed";

async function confirm(file: string) {
  if (process.argv.includes("--yes")) return true;
  const rl = createInterface({ input, output });
  const answer = await rl.question(`Isto apagará TODOS os dados de ${file}. Digite "apagar" para confirmar: `);
  rl.close();
  return answer.trim().toLowerCase() === "apagar";
}

async function main() {
  if (isProductionEnvironment()) throw new Error("db:reset é bloqueado quando NODE_ENV=production.");
  const file = databaseLabel();
  if (!(await confirm(file))) {
    console.log("[db:reset] Cancelado.");
    return;
  }
  await resetDatabase();
  await runMigrations();
  await runSeed();
  console.log(`[db:reset] Banco ${file} recriado com dados de desenvolvimento.`);
}

main()
  .catch(error => {
    console.error(`[db:reset] Falhou: ${describeConnectionError(error)}`);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
