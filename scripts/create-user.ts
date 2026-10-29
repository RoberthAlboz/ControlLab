/**
 * Cria ou atualiza uma conta real (fora da seed de demonstração).
 *
 *   pnpm user:create -- --email maria@escola.br --name "Maria Silva" --role teacher
 *
 * A senha é pedida no terminal (não fica no histórico do shell). Para automação,
 * defina a variável NEW_USER_PASSWORD.
 */
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { eq } from "drizzle-orm";
import { users } from "../drizzle/schema";
import { isUserRole } from "../shared/roles";
import { hashPassword, MIN_PASSWORD_LENGTH } from "../server/_core/password";
import { closeDb, requireDb } from "../server/db";
import { localOpenId } from "../server/userAdmin";
import { describeConnectionError } from "./lib/database";

function arg(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const email = arg("email")?.trim().toLowerCase();
  const name = arg("name")?.trim();
  const role = arg("role") ?? "student";
  if (!email || !/^[^\s@]+@[^\s@]+$/.test(email)) throw new Error("Informe --email válido.");
  if (!name) throw new Error('Informe --name "Nome completo".');
  if (!isUserRole(role)) throw new Error("--role deve ser student, teacher ou admin.");
  let password = process.env.NEW_USER_PASSWORD ?? "";
  if (!password) {
    const rl = createInterface({ input, output });
    password = await rl.question(`Senha para ${email} (mín. ${MIN_PASSWORD_LENGTH} caracteres): `);
    rl.close();
  }
  const passwordHash = await hashPassword(password);
  const db = await requireDb();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    await db.update(users).set({ name, role, passwordHash, active: 1 }).where(eq(users.id, existing.id));
    console.log(`[user:create] Conta atualizada: ${email} (${role}).`);
  } else {
    await db.insert(users).values({ openId: localOpenId(), email, name, role, passwordHash, loginMethod: "password", active: 1 });
    console.log(`[user:create] Conta criada: ${email} (${role}).`);
  }
}

main()
  .catch(error => {
    console.error(`[user:create] Falhou: ${describeConnectionError(error)}`);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
