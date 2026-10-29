/**
 * Lista os arquivos de UPLOAD_DIR que nenhum módulo, etapa, anexo ou foto de
 * perfil usa mais (sobram, por exemplo, depois de um db:reset).
 *
 *   pnpm uploads:clean           → só mostra o que seria apagado
 *   pnpm uploads:clean -- --yes  → apaga
 */
import "dotenv/config";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { closeDb, isUploadReferenced } from "../server/db";
import { getUploadRoot, storageDeleteUrl, UPLOAD_URL_PREFIX } from "../server/storage";
import { describeConnectionError } from "./lib/database";

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(entries.map(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : Promise.resolve([full]);
  }));
  return nested.flat();
}

async function main() {
  const apply = process.argv.includes("--yes");
  const root = getUploadRoot();
  const files = await listFiles(root);
  let orphanBytes = 0;
  const orphans: string[] = [];
  for (const file of files) {
    const key = path.relative(root, file).split(path.sep);
    const url = `${UPLOAD_URL_PREFIX}${key.map(encodeURIComponent).join("/")}`;
    if (await isUploadReferenced(url)) continue;
    orphans.push(url);
    orphanBytes += (await stat(file)).size;
  }
  console.log(`[uploads:clean] ${files.length} arquivo(s) em ${root}; ${orphans.length} sem uso (${(orphanBytes / 1024 / 1024).toFixed(1)} MB).`);
  for (const url of orphans) console.log(`  ${apply ? "apagado" : "sem uso"}: ${url}`);
  if (!apply) {
    if (orphans.length) console.log("[uploads:clean] Nada foi apagado. Rode com -- --yes para apagar.");
    return;
  }
  for (const url of orphans) await storageDeleteUrl(url);
}

main()
  .catch(error => {
    console.error(`[uploads:clean] Falhou: ${describeConnectionError(error)}`);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
