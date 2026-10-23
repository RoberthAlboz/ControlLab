// Empacota o servidor para produção com NODE_ENV fixado em "production".
// Script em Node puro para funcionar igual no Windows, macOS e Linux.
import { build } from "esbuild";

await build({
  entryPoints: ["server/_core/index.ts"],
  platform: "node",
  packages: "external",
  bundle: true,
  format: "esm",
  outdir: "dist",
  define: { "process.env.NODE_ENV": '"production"' },
  // As dependências externas (Express, tRPC) leem o NODE_ENV real: sem isto, um
  // deploy que esqueça NODE_ENV=production devolveria stack traces ao navegador.
  banner: { js: 'process.env.NODE_ENV ??= "production";' },
  logLevel: "info",
});
