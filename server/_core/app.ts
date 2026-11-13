/** Aplicação Express: política de segurança, API tRPC, uploads. Usada pelo servidor local e pela Vercel. */
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerStorageProxy } from "./storageProxy";
import { registerAttachmentUpload } from "../attachmentUpload";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { ENV } from "./env";
import { sdk } from "./sdk";
import { CONTENT_SECURITY_POLICY, SECURITY_HEADERS } from "./security-headers";

const SMALL_BODY_LIMIT = "1mb";
// Imagens enviadas no editor chegam em base64; o limite cobre capa + etapas.
const LARGE_BODY_LIMIT = "25mb";
const LARGE_UPLOAD_PROCEDURES = new Set(["learning.saveModule", "profile.uploadAvatar"]);

/** `/learning.saveModule` ou um lote (`/a,b`) em que todas as chamadas aceitam corpo grande. */
function isLargeUploadPath(path: string) {
  const procedures = path.replace(/^\//, "").split(",");
  return procedures.length > 0 && procedures.every(name => LARGE_UPLOAD_PROCEDURES.has(name));
}

/** Monta a API. O frontend (Vite em dev, arquivos estáticos em produção) é ligado por quem chama. */
export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  if (ENV.trustProxy !== undefined) app.set("trust proxy", ENV.trustProxy);
  app.use((_req, res, next) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
    // Em desenvolvimento o Vite injeta scripts inline (HMR); a CSP vale no build de produção.
    if (ENV.isProduction) res.setHeader("Content-Security-Policy", CONTENT_SECURITY_POLICY);
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
  return app;
}
