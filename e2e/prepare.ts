/** Recria o banco dos testes de navegador: apaga e2e/.tmp, aplica as migrations e roda a seed. */
import { mkdirSync, rmSync } from "node:fs";
import { E2E_ENV, E2E_TMP } from "./env";

rmSync(E2E_TMP, { recursive: true, force: true });
mkdirSync(`${E2E_ENV.UPLOAD_DIR}`, { recursive: true });
Object.assign(process.env, E2E_ENV);

async function main() {
  // Importados depois do ambiente: o módulo do banco lê DATABASE_FILE ao carregar.
  const { runMigrations } = await import("../scripts/lib/database");
  const { runSeed } = await import("../server/seed");
  const { closeDb } = await import("../server/db");
  await runMigrations();
  await runSeed();
  await closeDb();
  console.log("[e2e] banco de teste pronto");
}

main().catch(error => {
  console.error("[e2e] não foi possível preparar o banco de teste:", error);
  process.exit(1);
});
