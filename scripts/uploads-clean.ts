/**
 * Lista os arquivos enviados que nenhum módulo, etapa, anexo ou foto de
 * perfil usa mais (sobram, por exemplo, depois de um db:reset). Funciona nos
 * dois modos de armazenamento (STORAGE_DRIVER=database ou disk).
 *
 *   pnpm uploads:clean           → só mostra o que seria apagado
 *   pnpm uploads:clean -- --yes  → apaga
 */
import "dotenv/config";
import { closeDb, isUploadReferenced } from "../server/db";
import { getUploadRoot, listStoredUploads, storageDeleteUrl, usesDatabaseStorage } from "../server/storage";
import { describeConnectionError } from "./lib/database";

async function main() {
  const apply = process.argv.includes("--yes");
  const files = await listStoredUploads();
  let orphanBytes = 0;
  const orphans: string[] = [];
  for (const file of files) {
    if (await isUploadReferenced(file.url)) continue;
    orphans.push(file.url);
    orphanBytes += file.size;
  }
  const where = usesDatabaseStorage() ? "no banco (stored_files)" : `em ${getUploadRoot()}`;
  console.log(`[uploads:clean] ${files.length} arquivo(s) ${where}; ${orphans.length} sem uso (${(orphanBytes / 1024 / 1024).toFixed(1)} MB).`);
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
