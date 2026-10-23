import "dotenv/config";
import { databaseLabel, describeConnectionError, runMigrations } from "./lib/database";

runMigrations()
  .then(applied => {
    console.log(`[db:migrate] ${applied} migration(s) aplicada(s) em ${databaseLabel()}.`);
  })
  .catch(error => {
    console.error(`[db:migrate] Falhou: ${describeConnectionError(error)}`);
    process.exit(1);
  });
