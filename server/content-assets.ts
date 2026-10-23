import { storagePut } from "./storage";

type StorageUploader = typeof storagePut;

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const INLINE_IMAGE = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

export type InlineImage = { mimeType: "image/jpeg" | "image/png" | "image/webp"; bytes: Buffer };

function hasExpectedSignature(bytes: Buffer, mimeType: string): boolean {
  if (mimeType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (mimeType === "image/webp") {
    return bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  }
  return false;
}

export function parseInlineImage(reference: string, expectedMimeType?: InlineImage["mimeType"]): InlineImage {
  const match = INLINE_IMAGE.exec(reference);
  if (!match) throw new Error("Formato de imagem inválido.");

  const rawMimeType = match[1];
  const mimeType = rawMimeType === "image/jpg" ? "image/jpeg" : rawMimeType as InlineImage["mimeType"];
  const encoded = match[2];
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES || bytes.toString("base64") !== encoded) {
    throw new Error("A imagem deve ter até 5 MB e estar em base64 válido.");
  }
  if (expectedMimeType && mimeType !== expectedMimeType) {
    throw new Error("O tipo declarado não corresponde ao conteúdo da imagem.");
  }
  if (!hasExpectedSignature(bytes, mimeType)) throw new Error("O conteúdo não corresponde ao formato de imagem informado.");
  return { mimeType, bytes };
}

/** Upload inline image content and return its URL so binary data never reaches database columns. */
export async function persistImageReference(
  reference: string | null | undefined,
  storageKey: string,
  uploader: StorageUploader = storagePut,
): Promise<string | null | undefined> {
  if (reference == null || !reference.startsWith("data:")) return reference;

  const { mimeType, bytes } = parseInlineImage(reference);

  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1];
  const uploaded = await uploader(`${storageKey}.${extension}`, bytes, mimeType);
  return uploaded.url;
}
