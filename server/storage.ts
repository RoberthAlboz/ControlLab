/**
 * Armazenamento local de arquivos enviados (fotos de perfil e imagens de
 * módulos). Os arquivos ficam em UPLOAD_DIR (padrão: ./uploads, ignorado pelo
 * git) e são servidos em /uploads/... pelo próprio servidor.
 *
 * O banco guarda apenas a URL relativa — nunca o binário.
 */
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { ENV } from "./_core/env";

export const UPLOAD_URL_PREFIX = "/uploads/";

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

function getSafeUploadPath(key: string) {
  const root = getUploadRoot();
  const target = path.resolve(root, key);
  if (target === root || !target.startsWith(`${root}${path.sep}`)) {
    throw new Error("Caminho de arquivo inválido.");
  }
  return target;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  _contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  if (key.split("/").some(part => part === ".." || part === "")) throw new Error("Caminho de arquivo inválido.");
  const target = getSafeUploadPath(key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, data);
  const url = `${UPLOAD_URL_PREFIX}${key.split("/").map(encodeURIComponent).join("/")}`;
  return { key, url };
}

/** Aceita somente URLs geradas por `storagePut` (sem travessia de diretório). */
export function isLocalUploadUrl(value: string) {
  return value.startsWith(UPLOAD_URL_PREFIX) && !value.includes("..") && !value.includes("\\") && !value.includes("?");
}

/**
 * Apaga o arquivo de uma URL `/uploads/...`. URLs externas são ignoradas e um
 * arquivo que já não existe não é erro. Nunca sai da pasta de uploads.
 */
export async function storageDeleteUrl(url: string | null | undefined): Promise<boolean> {
  if (!url || !isLocalUploadUrl(url)) return false;
  let key: string;
  try {
    key = url.slice(UPLOAD_URL_PREFIX.length).split("/").map(decodeURIComponent).join("/");
  } catch {
    return false;
  }
  if (key.split("/").some(part => part === ".." || part === "")) return false;
  try {
    await unlink(getSafeUploadPath(key));
    return true;
  } catch {
    return false;
  }
}
