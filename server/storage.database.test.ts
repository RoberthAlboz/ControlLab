/**
 * Arquivos enviados guardados no banco (STORAGE_DRIVER=database, o modo da
 * Vercel), num SQLite real: gravação, leitura por /uploads/, listagem,
 * remoção e recusa de caminhos inválidos.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "controllab-storage-db-"));
process.env.DATABASE_FILE = path.join(dir, "teste.db");
process.env.STORAGE_DRIVER = "database";
process.env.UPLOAD_DIR = path.join(dir, "uploads");

const { runMigrations } = await import("../scripts/lib/database");
const db = await import("./db");
const storage = await import("./storage");
const { registerStorageProxy } = await import("./_core/storageProxy");

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
let server: ReturnType<express.Express["listen"]>;
let base = "";

beforeAll(async () => {
  await runMigrations(process.env.DATABASE_FILE);
  const app = express();
  registerStorageProxy(app);
  server = app.listen(0);
  await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server?.close();
  await db.closeDb();
  rmSync(dir, { recursive: true, force: true });
});

describe("armazenamento no banco", () => {
  it("grava no banco, não no disco, e serve o mesmo conteúdo em /uploads/", async () => {
    expect(storage.usesDatabaseStorage()).toBe(true);
    const { url } = await storage.storagePut("7-profile/avatar.png", PNG, "image/png");
    expect(url).toMatch(/^\/uploads\/7-profile\/avatar_[0-9a-f]{8}\.png$/);
    expect(readdirSync(dir)).not.toContain("uploads");

    const response = await fetch(base + url);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-disposition")).toBeNull();
    expect(Buffer.from(await response.arrayBuffer()).equals(PNG)).toBe(true);
  });

  it("o tipo vem da extensão, e anexos que o navegador não exibe com segurança só baixam", async () => {
    const { url } = await storage.storagePut("learning-attachments/2/x/pagina.html", "<script>alert(1)</script>", "text/html");
    const response = await fetch(base + url);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe("attachment");
  });

  it("lista e remove pelo endereço", async () => {
    const { url } = await storage.storagePut("modulo/capa.webp", Buffer.from("RIFF0000WEBP"), "image/webp");
    expect((await storage.listStoredUploads()).map(file => file.url)).toContain(url);
    expect(await storage.storageDeleteUrl(url)).toBe(true);
    expect(await storage.storageDeleteUrl(url)).toBe(false);
    expect((await fetch(base + url)).status).toBe(404);
  });

  it("recusa caminhos fora do armazenamento", async () => {
    await expect(storage.storagePut("../fora.png", PNG)).rejects.toThrow();
    expect(storage.urlToStorageKey("/uploads/a/../b.png")).toBeNull();
    expect(storage.urlToStorageKey("/uploads/a%2F..%2F..%2Fb.png")).toBeNull();
    expect(await storage.storageDeleteUrl("https://exemplo.com/x.png")).toBe(false);
    expect((await fetch(`${base}/uploads/..%2F..%2Fpackage.json`)).status).toBe(404);
  });
});
