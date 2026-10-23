/**
 * Hash de senhas com scrypt (node:crypto), sem dependências externas.
 * Formato armazenado: `scrypt$N$r$p$saltBase64$hashBase64`.
 */
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const DEFAULT_COST = { N: 16384, r: 8, p: 1 } as const;
export const MIN_PASSWORD_LENGTH = 8;

function scrypt(password: string, salt: Buffer, N: number, r: number, p: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password.normalize("NFKC"), salt, KEY_LENGTH, { N, r, p, maxmem: 64 * 1024 * 1024 }, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

export async function hashPassword(password: string) {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  const salt = randomBytes(16);
  const { N, r, p } = DEFAULT_COST;
  const hash = await scrypt(password, salt, N, r, p);
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

/** Compara em tempo constante. Retorna false para hashes malformados. */
export async function verifyPassword(password: string, stored: string | null | undefined) {
  if (!stored || typeof password !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (![N, r, p].every(value => Number.isInteger(value) && value > 0) || N > 1 << 20) return false;
  const salt = Buffer.from(saltRaw, "base64");
  const expected = Buffer.from(hashRaw, "base64");
  if (!salt.length || expected.length !== KEY_LENGTH) return false;
  const actual = await scrypt(password, salt, N, r, p);
  return timingSafeEqual(actual, expected);
}

/**
 * Hash fixo usado quando o e-mail não existe, para que a resposta demore o
 * mesmo tempo e não revele quais contas estão cadastradas.
 */
let dummyHash: Promise<string> | null = null;
export function getDummyPasswordHash() {
  dummyHash ??= hashPassword("forgelab-timing-placeholder");
  return dummyHash;
}
