import "dotenv/config";
import { describeConnectionError, isProductionEnvironment } from "./lib/database";
import { closeDb } from "../server/db";
import { runSeed } from "../server/seed";

async function main() {
  if (isProductionEnvironment() && !process.argv.includes("--allow-production")) {
    throw new Error("A seed cria contas e dados de demonstração e não roda em produção (use --allow-production conscientemente).");
  }
  await runSeed();
  console.log("[db:seed] Concluída. Pode ser executada novamente sem duplicar dados.");
}

main()
  .catch(error => {
    console.error(`[db:seed] Falhou: ${describeConnectionError(error)}`);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
