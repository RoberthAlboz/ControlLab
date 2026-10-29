import express, { type Express } from "express";
import { mkdirSync } from "node:fs";
import { attachmentExtension, INLINE_ATTACHMENT_EXTENSIONS } from "@shared/attachments";
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
      setHeaders: (res, filePath) => {
        res.setHeader("X-Content-Type-Options", "nosniff");
        // Anexos que o navegador não exibe com segurança (CAD, Office, zip…) só baixam.
        if (!INLINE_ATTACHMENT_EXTENSIONS.has(attachmentExtension(filePath.replace(/\\/g, "/")))) {
          res.setHeader("Content-Disposition", "attachment");
        }
      },
    }),
  );
}
