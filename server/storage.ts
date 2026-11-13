/**
 * Armazenamento dos arquivos enviados (fotos de perfil, imagens e anexos de
 * módulos), servidos em /uploads/... pelo próprio servidor. Dois modos
 * (STORAGE_DRIVER):
 *  - `database` (padrão com Postgres/Supabase e na Vercel): o arquivo fica na
 *    tabela `stored_files`. Necessário onde o disco não persiste (Vercel).
 *  - `disk` (padrão com SQLite): o arquivo fica em UPLOAD_DIR (./uploads).
 *
 * Nos dois modos os registros do sistema guardam apenas a URL relativa.
 */
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { storedFiles } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { requireDb } from "./db";

export const UPLOAD_URL_PREFIX = "/uploads/";

export function usesDatabaseStorage() {
  return ENV.storageDriver === "database";
}

export function getUploadRoot() {
  return path.resolve(process.cwd(), ENV.uploadDir);
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "").replace(/\\/g, "/");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

/** Chave relativa válida: sem partes vazias, sem `..` e sem barra invertida. */
export function isSafeStorageKey(key: string) {
  return key.length > 0 && key.length <= 512 && !key.includes("\\") && !key.split("/").some(part => part === ".." || part === "." || part === "");
}

function getSafeUploadPath(key: string) {
  const root = getUploadRoot();
  const target = path.resolve(root, key);
  if (target === root || !target.startsWith(`${root}${path.sep}`)) {
    throw new Error("Caminho de arquivo inválido.");
  }
  return target;
}

function keyToUrl(key: string) {
  return `${UPLOAD_URL_PREFIX}${key.split("/").map(encodeURIComponent).join("/")}`;
}

/** Chave de uma URL `/uploads/...`, ou null se a URL não for de upload ou for inválida. */
export function urlToStorageKey(url: string): string | null {
  if (!isLocalUploadUrl(url)) return null;
  let key: string;
  try {
    key = url.slice(UPLOAD_URL_PREFIX.length).split("/").map(decodeURIComponent).join("/");
  } catch {
    return null;
  }
  return isSafeStorageKey(key) ? key : null;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  if (!isSafeStorageKey(key)) throw new Error("Caminho de arquivo inválido.");
  if (usesDatabaseStorage()) {
    const bytes = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
    const db = await requireDb();
    await db.insert(storedFiles).values({ key, contentType: contentType.slice(0, 160), size: bytes.length, data: bytes });
  } else {
    const target = getSafeUploadPath(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
  }
  return { key, url: keyToUrl(key) };
}

/** Conteúdo de um arquivo guardado no banco (modo `database`), ou null. */
export async function storageGetFromDatabase(key: string): Promise<{ data: Buffer; size: number } | null> {
  if (!isSafeStorageKey(key)) return null;
  const db = await requireDb();
  const [row] = await db.select({ data: storedFiles.data, size: storedFiles.size }).from(storedFiles).where(eq(storedFiles.key, key)).limit(1);
  if (!row) return null;
  return { data: Buffer.from(row.data as Uint8Array), size: row.size };
}

/** Todos os arquivos enviados (chave, URL e tamanho), no modo em uso. */
export async function listStoredUploads(): Promise<Array<{ key: string; url: string; size: number }>> {
  if (usesDatabaseStorage()) {
    const db = await requireDb();
    const rows = await db.select({ key: storedFiles.key, size: storedFiles.size }).from(storedFiles);
    return rows.map(row => ({ key: row.key, url: keyToUrl(row.key), size: row.size }));
  }
  const { readdir, stat } = await import("node:fs/promises");
  const root = getUploadRoot();
  const walk = async (dir: string): Promise<string[]> => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    const nested = await Promise.all(entries.map(entry => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : Promise.resolve([full]);
    }));
    return nested.flat();
  };
  const files = await walk(root);
  return Promise.all(files.map(async file => {
    const key = path.relative(root, file).split(path.sep).join("/");
    return { key, url: keyToUrl(key), size: (await stat(file)).size };
  }));
}

/** Aceita somente URLs geradas por `storagePut` (sem travessia de diretório). */
export function isLocalUploadUrl(value: string) {
  return value.startsWith(UPLOAD_URL_PREFIX) && !value.includes("..") && !value.includes("\\") && !value.includes("?");
}

/**
 * Apaga o arquivo de uma URL `/uploads/...`. URLs externas são ignoradas e um
 * arquivo que já não existe não é erro. No disco, nunca sai da pasta de uploads.
 */
export async function storageDeleteUrl(url: string | null | undefined): Promise<boolean> {
  if (!url) return false;
  const key = urlToStorageKey(url);
  if (!key) return false;
  try {
    if (usesDatabaseStorage()) {
      const db = await requireDb();
      const deleted = await db.delete(storedFiles).where(eq(storedFiles.key, key)).returning({ key: storedFiles.key });
      return deleted.length > 0;
    }
    await unlink(getSafeUploadPath(key));
    return true;
  } catch {
    return false;
  }
}
