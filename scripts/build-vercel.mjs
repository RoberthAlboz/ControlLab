// Gera o deploy da Vercel no formato Build Output API (.vercel/output), depois do `vite build`:
//   static/            frontend (dist/public), entregue pela CDN da Vercel
//   functions/api.func  servidor Express empacotado (atende /api/* e /uploads/*)
//   config.json        rotas: arquivos estáticos, API e o fallback da SPA
// Script em Node puro para funcionar igual no Windows, macOS e Linux.
import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const clientDist = path.join(root, "dist", "public");
const output = path.join(root, ".vercel", "output");
const functionDir = path.join(output, "functions", "api.func");

if (!existsSync(path.join(clientDist, "index.html"))) {
  console.error("[build:vercel] dist/public/index.html não existe: rode `vite build` antes (pnpm build:vercel faz os dois).");
  process.exit(1);
}

rmSync(output, { recursive: true, force: true });
mkdirSync(functionDir, { recursive: true });
cpSync(clientDist, path.join(output, "static"), { recursive: true });

await build({
  entryPoints: ["server/_core/vercel.ts"],
  platform: "node",
  target: "node22",
  bundle: true,
  format: "esm",
  outfile: path.join(functionDir, "index.mjs"),
  // Partes opcionais do driver do Postgres que o sistema não usa.
  external: ["pg-native", "pg-cloudflare"],
  define: { "process.env.NODE_ENV": '"production"' },
  // Dependências CommonJS (Express) precisam de `require` dentro de um módulo ESM.
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url); process.env.NODE_ENV ??= "production";',
  },
  logLevel: "info",
});

writeFileSync(
  path.join(functionDir, ".vc-config.json"),
  JSON.stringify(
    {
      runtime: "nodejs22.x",
      handler: "index.mjs",
      launcherType: "Nodejs",
      shouldAddHelpers: false,
      maxDuration: 30,
      // São Paulo: perto do banco do Supabase em sa-east-1.
      regions: ["gru1"],
    },
    null,
    2,
  ),
);

// Mesma política de segurança do servidor (server/_core/security-headers.ts), aplicada aos arquivos estáticos.
const { CONTENT_SECURITY_POLICY, SECURITY_HEADERS } = await loadSecurityHeaders();

writeFileSync(
  path.join(output, "config.json"),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: "/((?!api/|uploads/).*)", headers: { ...SECURITY_HEADERS, "Content-Security-Policy": CONTENT_SECURITY_POLICY }, continue: true },
        // Arquivos do Vite têm hash no nome: podem ficar em cache para sempre.
        { src: "/assets/(.*)", headers: { "Cache-Control": "public, max-age=31536000, immutable" }, continue: true },
        { handle: "filesystem" },
        { src: "/(api|uploads)(/.*)?", dest: "/api" },
        // Qualquer outro endereço é uma tela da SPA.
        { src: "/.*", dest: "/index.html" },
      ],
    },
    null,
    2,
  ),
);

console.log("[build:vercel] .vercel/output pronto (static + functions/api.func + config.json).");

/** Lê as constantes de segurança direto do código do servidor, sem duplicá-las aqui. */
async function loadSecurityHeaders() {
  const result = await build({
    stdin: {
      contents: 'export { CONTENT_SECURITY_POLICY, SECURITY_HEADERS } from "./server/_core/security-headers";',
      resolveDir: root,
      loader: "ts",
    },
    platform: "node",
    bundle: true,
    format: "esm",
    write: false,
    logLevel: "silent",
  });
  const code = result.outputFiles[0].text;
  const dataUrl = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  return import(dataUrl).catch(() => {
    throw new Error("Não foi possível ler os cabeçalhos de segurança de server/_core/security-headers.ts.");
  });
}
