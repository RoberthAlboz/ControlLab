import express, { type Express } from "express";
import { mkdirSync } from "node:fs";
import { getUploadRoot } from "../storage";

/** Serve os arquivos enviados (somente leitura, sem listagem de diretório). */
export function registerStorageProxy(app: Express) {
  const root = getUploadRoot();
  mkdirSync(root, { recursive: true });
  app.use(
    "/uploads",
    express.static(root, {
      dotfiles: "deny",
      fallthrough: false,
      index: false,
      maxAge: "1h",
      setHeaders: res => {
        res.setHeader("X-Content-Type-Options", "nosniff");
      },
    }),
  );
}
