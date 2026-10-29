import express, { type Express, type Request, type Response } from "express";
import { HttpError } from "@shared/_core/errors";
import { isStaffRole } from "@shared/roles";
import {
  ATTACHMENT_UPLOAD_PATH,
  isAllowedAttachmentName,
  MAX_ATTACHMENT_BYTES,
  sanitizeAttachmentName,
  type ContentAttachment,
} from "@shared/attachments";
import { sdk } from "./_core/sdk";
import { storagePut } from "./storage";

/**
 * Upload de anexos do editor de módulos (PDF, CAD, 3D, compactados…).
 * O arquivo vai cru no corpo (sem base64) e o nome em `X-File-Name`
 * (codificado com encodeURIComponent; pode conter "pasta/sub/arquivo.ext").
 * O cabeçalho próprio força preflight em outra origem, o que barra CSRF.
 * Devolve o anexo pronto para entrar no módulo no próximo "Salvar".
 */
export function registerAttachmentUpload(app: Express) {
  const rawBody = express.raw({ type: () => true, limit: MAX_ATTACHMENT_BYTES });

  app.post(
    ATTACHMENT_UPLOAD_PATH,
    // Só quem tem sessão assinada faz o servidor ler um corpo grande.
    (req, res, next) => {
      sdk.hasValidSignature(req).then(
        signed => (signed ? next() : res.status(401).json({ error: "Entre novamente para enviar arquivos." })),
        next,
      );
    },
    rawBody,
    (req: Request, res: Response, next) => {
      handleUpload(req, res).catch(next);
    },
  );
}

async function handleUpload(req: Request, res: Response) {
  let user;
  try {
    user = await sdk.authenticateRequest(req);
  } catch (error) {
    if (error instanceof HttpError) return res.status(401).json({ error: "Entre novamente para enviar arquivos." });
    throw error;
  }
  if (!isStaffRole(user.role)) return res.status(403).json({ error: "Somente docentes podem enviar anexos." });

  let rawName = "";
  try {
    rawName = decodeURIComponent(String(req.header("x-file-name") ?? ""));
  } catch {
    rawName = "";
  }
  const name = sanitizeAttachmentName(rawName);
  if (!name) return res.status(400).json({ error: "Informe o nome do arquivo." });
  if (!isAllowedAttachmentName(name)) return res.status(415).json({ error: `Tipo de arquivo não permitido: ${name.split("/").pop()}` });

  const body = req.body;
  if (!Buffer.isBuffer(body) || body.length === 0) return res.status(400).json({ error: "O arquivo está vazio." });

  const baseName = name.split("/").pop()!.replace(/[^\w.\-]+/g, "_").slice(-120);
  const stored = await storagePut(`learning-attachments/${user.id}/${crypto.randomUUID()}/${baseName}`, body);
  const attachment: ContentAttachment = {
    id: `att-${crypto.randomUUID()}`,
    name,
    url: stored.url,
    size: body.length,
    mimeType: String(req.header("content-type") ?? "application/octet-stream").slice(0, 160),
  };
  return res.status(201).json(attachment);
}
