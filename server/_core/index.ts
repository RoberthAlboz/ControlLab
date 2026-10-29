import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerStorageProxy } from "./storageProxy";
import { registerAttachmentUpload } from "../attachmentUpload";
import { appRouter } from "../routers";
import { checkDatabaseConnection } from "../db";
import { createContext } from "./context";
import { assertServerEnv, ENV } from "./env";
import { serveStatic, setupVite } from "./vite";
import { sdk } from "./sdk";

const SMALL_BODY_LIMIT = "1mb";
// Imagens enviadas no editor chegam em base64; o limite cobre capa + etapas.
const LARGE_BODY_LIMIT = "25mb";
const LARGE_UPLOAD_PROCEDURES = new Set(["learning.saveModule", "profile.uploadAvatar"]);

/** `/learning.saveModule` ou um lote (`/a,b`) em que todas as chamadas aceitam corpo grande. */
function isLargeUploadPath(path: string) {
  const procedures = path.replace(/^\//, "").split(",");
  return procedures.length > 0 && procedures.every(name => LARGE_UPLOAD_PROCEDURES.has(name));
}

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

  const app = express();
  app.disable("x-powered-by");
  if (ENV.trustProxy !== undefined) app.set("trust proxy", ENV.trustProxy);
  const server = createServer(app);
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    next();
  });
  // Corpo pequeno por padrão. Só o editor e a foto de perfil (imagens em base64)
  // aceitam corpos grandes, e apenas de quem apresenta uma sessão assinada: um
  // visitante anônimo não consegue fazer o servidor ler 25 MB.
  const smallJson = express.json({ limit: SMALL_BODY_LIMIT });
  const largeJson = express.json({ limit: LARGE_BODY_LIMIT });
  app.use("/api/trpc", (req, res, next) => {
    if (!isLargeUploadPath(req.path)) return smallJson(req, res, next);
    sdk.hasValidSignature(req).then(
      signed => (signed ? largeJson : smallJson)(req, res, next),
      next,
    );
  });
  registerAttachmentUpload(app);
  app.use(express.json({ limit: SMALL_BODY_LIMIT }));
  app.use(express.urlencoded({ limit: "1mb", extended: false }));
  registerStorageProxy(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      maxBodySize: 25 * 1024 * 1024,
      onError: ({ error, path }) => {
        if (error.code === "INTERNAL_SERVER_ERROR") console.error(`[tRPC] ${path ?? "?"}:`, error);
      },
    }),
  );
  app.use("/api", (_req, res) => res.status(404).json({ error: "Rota de API inexistente" }));

  if (!ENV.isProduction) {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000", 10);
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) console.log(`Porta ${preferredPort} ocupada; usando ${port}.`);
  server.listen(port, () => {
    console.log(`Control Lab em http://localhost:${port}/`);
  });
}

startServer().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
