/** Entrada do servidor local (pnpm dev / pnpm start): API, uploads e frontend no mesmo endereço. */
import "dotenv/config";
import { createServer } from "http";
import net from "net";
import { checkDatabaseConnection } from "../db";
import { createApp } from "./app";
import { assertServerEnv, ENV } from "./env";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`Nenhuma porta livre encontrada a partir de ${startPort}`);
}

async function startServer() {
  assertServerEnv();

  const database = await checkDatabaseConnection();
  if (!database.ok) {
    console.error(
      database.provider === "postgres"
        ? `\n[ControlLab] Não foi possível conectar ao Postgres em ${database.file} (${database.error}).\n` +
            "  1. Confira DATABASE_URL no .env (Supabase: Project Settings → Database → Connection string, modo Session pooler).\n" +
            "  2. Confira a senha do banco e se o projeto do Supabase não está pausado.\n" +
            "  3. Rode `pnpm db:setup` para criar as tabelas.\n"
        : `\n[ControlLab] Não foi possível abrir o banco SQLite em ${database.file} (${database.error}).\n` +
            "  1. Use o Node.js 22.16 ou mais novo (o SQLite vem embutido no Node).\n" +
            "  2. Confira DATABASE_FILE no arquivo .env.\n" +
            "  3. Rode `pnpm db:setup` para criar o banco, aplicar as migrations e a seed.\n",
    );
  } else if (!database.migrated) {
    console.warn(`[ControlLab] O banco ${database.file} ainda não tem as tabelas. Rode \`pnpm db:setup\`.`);
  } else {
    console.log(`[ControlLab] Banco ${database.provider === "postgres" ? "Postgres" : "SQLite"}: ${database.file}`);
  }
  if (ENV.isProduction && ENV.databaseProvider === "postgres" && (process.env.DATABASE_SSL ?? "require").trim().toLowerCase() === "require") {
    console.warn("[ControlLab] DATABASE_SSL=require criptografa a conexão, mas não confere o certificado do Postgres. Em produção prefira DATABASE_SSL=verify com DATABASE_SSL_CA.");
  }

  const app = createApp();
  const server = createServer(app);

  if (!ENV.isProduction) {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000", 10);
  // Porta ocupada quase sempre é outro `pnpm dev` aberto. Subir em outra porta
  // deixaria dois servidores gravando no mesmo banco (e travando o db:reset).
  if (!(await isPortAvailable(preferredPort))) {
    const free = await findAvailablePort(preferredPort + 1).catch(() => null);
    throw new Error(
      `Porta ${preferredPort} ocupada — provavelmente outro Control Lab já está rodando. ` +
        `Feche-o (Ctrl+C no terminal dele) ou escolha outra porta: PORT=${free ?? preferredPort + 1} pnpm dev`,
    );
  }
  const port = preferredPort;
  server.listen(port, () => {
    console.log(`Control Lab em http://localhost:${port}/`);
  });
}

startServer().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
