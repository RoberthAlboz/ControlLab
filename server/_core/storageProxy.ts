import express, { type Express, type Response } from "express";
import { mkdirSync } from "node:fs";
import { attachmentExtension, INLINE_ATTACHMENT_EXTENSIONS } from "@shared/attachments";
import { getUploadRoot, storageGetFromDatabase, UPLOAD_URL_PREFIX, urlToStorageKey, usesDatabaseStorage } from "../storage";

/** Cabeçalhos comuns aos dois modos: sem "adivinhar" o tipo e download para o que não é seguro exibir. */
function setFileHeaders(res: Response, filePath: string) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Anexos que o navegador não exibe com segurança (CAD, Office, zip…) só baixam.
  if (!INLINE_ATTACHMENT_EXTENSIONS.has(attachmentExtension(filePath.replace(/\\/g, "/")))) {
    res.setHeader("Content-Disposition", "attachment");
  }
}

/** Serve os arquivos enviados (somente leitura, sem listagem de diretório). */
export function registerStorageProxy(app: Express) {
  if (usesDatabaseStorage()) {
    app.get(`${UPLOAD_URL_PREFIX}*`, (req, res, next) => {
      const key = urlToStorageKey(req.path);
      if (!key) return res.status(404).end();
      storageGetFromDatabase(key).then(file => {
        if (!file) return res.status(404).end();
        // O tipo vem da extensão (como no disco), nunca do que o navegador declarou no envio.
        res.type(key.slice(key.lastIndexOf(".")) || "application/octet-stream");
        setFileHeaders(res, key);
        // A chave tem um sufixo aleatório: o mesmo endereço nunca muda de conteúdo.
        res.setHeader("Cache-Control", "public, max-age=3600");
        res.setHeader("Content-Length", String(file.data.length));
        res.end(file.data);
      }, next);
    });
    return;
  }
  const root = getUploadRoot();
  mkdirSync(root, { recursive: true });
  app.use(
    "/uploads",
    express.static(root, {
      dotfiles: "deny",
      fallthrough: false,
      index: false,
      maxAge: "1h",
      setHeaders: setFileHeaders,
    }),
  );
}
