import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
    },
  },
  test: {
    environment: "node",
    // Os testes usam bancos SQLite temporários (o Postgres/Supabase é o banco do sistema).
    env: { DATABASE_PROVIDER: "sqlite", STORAGE_DRIVER: "disk" },
    // Testes do cliente cobrem a lógica pura das telas (sem DOM), por isso rodam no mesmo ambiente node.
    include: ["server/**/*.test.ts", "server/**/*.spec.ts", "client/src/**/*.test.ts"],
  },
});
