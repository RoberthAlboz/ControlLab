/**
 * Anexos de etapas e recursos técnicos: arquivos enviados pelo docente
 * (PDF, planilhas, CAD, 3D, compactados…) ou links externos (ex.: pasta no
 * Drive). Arquivos enviados juntos de uma pasta guardam o caminho relativo no
 * nome ("Pasta/sub/arquivo.pdf"), o que permite agrupá-los na tela.
 */
export type ContentAttachment = {
  id: string;
  /** Nome exibido; pode conter "/" quando veio de uma pasta. */
  name: string;
  /** `/uploads/...` para arquivos enviados ou URL HTTPS para links. */
  url: string;
  size: number;
  mimeType: string;
};

export type AttachmentKind =
  | "pdf"
  | "image"
  | "model"
  | "cad"
  | "document"
  | "sheet"
  | "slides"
  | "archive"
  | "video"
  | "text"
  | "link";

export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_ITEM = 40;
export const MAX_ATTACHMENT_NAME_LENGTH = 255;
export const ATTACHMENT_UPLOAD_PATH = "/api/uploads/module-attachment";

const KIND_BY_EXTENSION: Record<string, Exclude<AttachmentKind, "link">> = {
  pdf: "pdf",
  jpg: "image", jpeg: "image", png: "image", webp: "image", gif: "image",
  glb: "model", gltf: "model", stl: "model", obj: "model", "3mf": "model", fbx: "model",
  step: "cad", stp: "cad", iges: "cad", igs: "cad", dwg: "cad", dxf: "cad", ipt: "cad", iam: "cad", sldprt: "cad", sldasm: "cad", f3d: "cad",
  nc: "text", gcode: "text", tap: "text", txt: "text", csv: "sheet", md: "text",
  doc: "document", docx: "document", odt: "document", rtf: "document",
  xls: "sheet", xlsx: "sheet", ods: "sheet",
  ppt: "slides", pptx: "slides", odp: "slides",
  zip: "archive", rar: "archive", "7z": "archive",
  mp4: "video", webm: "video",
};

/** Abertos direto no navegador; o resto é servido como download. */
export const INLINE_ATTACHMENT_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png", "webp", "gif", "mp4", "webm", "txt"]);

export const ATTACHMENT_ACCEPT = Object.keys(KIND_BY_EXTENSION).map(ext => `.${ext}`).join(",");

export const ATTACHMENT_KIND_LABEL: Record<AttachmentKind, string> = {
  pdf: "PDF",
  image: "Imagem",
  model: "Modelo 3D",
  cad: "CAD",
  document: "Documento",
  sheet: "Planilha",
  slides: "Apresentação",
  archive: "Compactado",
  video: "Vídeo",
  text: "Texto",
  link: "Link",
};

export function attachmentExtension(name: string): string {
  const base = name.split("/").pop() ?? name;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

export function isAllowedAttachmentName(name: string): boolean {
  return attachmentExtension(name) in KIND_BY_EXTENSION;
}

export function isLinkAttachment(attachment: Pick<ContentAttachment, "url">): boolean {
  return !attachment.url.startsWith("/uploads/");
}

export function attachmentKind(attachment: Pick<ContentAttachment, "name" | "url">): AttachmentKind {
  if (isLinkAttachment(attachment)) return "link";
  return KIND_BY_EXTENSION[attachmentExtension(attachment.name)] ?? "document";
}

/** Pasta de primeiro nível do anexo ("" quando é um arquivo solto). */
export function attachmentFolder(name: string): string {
  const slash = name.indexOf("/");
  return slash > 0 ? name.slice(0, slash) : "";
}

export function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** Remove separadores perigosos e partes vazias do caminho enviado pelo navegador. */
export function sanitizeAttachmentName(raw: string): string {
  return raw
    .replace(/\\/g, "/")
    .split("/")
    .map(part => part.replace(/[\u0000-\u001f<>:"|?*]/g, "").trim())
    .filter(part => part && part !== "." && part !== "..")
    .join("/")
    .slice(-MAX_ATTACHMENT_NAME_LENGTH);
}

export function formatAttachmentSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/** Lê a coluna JSON do banco sem nunca lançar: valores inválidos são descartados. */
export function parseStoredAttachments(raw: string | null | undefined): ContentAttachment[] {
  if (!raw) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const { id, name, url, size, mimeType } = item as Record<string, unknown>;
    if (typeof id !== "string" || typeof name !== "string" || typeof url !== "string") return [];
    return [{
      id,
      name,
      url,
      size: typeof size === "number" && Number.isFinite(size) ? size : 0,
      mimeType: typeof mimeType === "string" ? mimeType : "",
    }];
  });
}
