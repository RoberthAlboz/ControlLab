import "dotenv/config";
import { defineConfig } from "drizzle-kit";

/**
 * Usado por `pnpm db:generate` para criar novas migrations a partir do schema.
 * (A aplicação das migrations é feita por `pnpm db:migrate`, sem dependências extras.)
 */
export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: `file:${process.env.DATABASE_FILE || "data/forgelab.db"}`,
  },
  strict: true,
  verbose: true,
});
