/**
 * Configuração lida do ambiente (.env). Veja `.env.example` para a lista
 * completa e o significado de cada variável.
 */
const nodeEnv = process.env.NODE_ENV ?? "development";

function readSessionSecret() {
  // JWT_SECRET é aceito por compatibilidade com o projeto original.
  return process.env.SESSION_SECRET || process.env.JWT_SECRET || "";
}

function readPositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readDatabaseProvider() {
  const value = (process.env.DATABASE_PROVIDER || "sqlite").trim().toLowerCase();
  if (value === "postgresql" || value === "supabase") return "postgres";
  return value;
}

export const ENV = {
  /** Identificador gravado no JWT; sessões de outro app são rejeitadas. */
  appId: process.env.APP_ID || "forgelab",
  cookieSecret: readSessionSecret(),
  /**
   * Banco usado: `sqlite` (padrão, banco principal do projeto) ou `postgres`
   * (ex.: Supabase, via DATABASE_URL). Aceita também `supabase`/`postgresql`.
   */
  databaseProvider: readDatabaseProvider() as "sqlite" | "postgres",
  /** Arquivo SQLite (padrão: data/forgelab.db, relativo à pasta do projeto). */
  databaseFile: process.env.DATABASE_FILE || "data/forgelab.db",
  /** Connection string do Postgres/Supabase (somente com DATABASE_PROVIDER=postgres). */
  databaseUrl: process.env.DATABASE_URL ?? "",
  appUrl: process.env.APP_URL ?? "",
  nodeEnv,
  isProduction: nodeEnv === "production",
  isTest: nodeEnv === "test" || process.env.VITEST === "true",
  /** Duração da sessão em horas (padrão: 12 h). */
  sessionTtlMs: readPositiveInt(process.env.SESSION_TTL_HOURS, 12) * 60 * 60 * 1000,
  /** Pasta local onde fotos de perfil e imagens de módulos são gravadas. */
  uploadDir: process.env.UPLOAD_DIR || "uploads",
};

/**
 * Falha cedo quando a configuração mínima está ausente, com mensagem clara.
 * Chamado na inicialização do servidor (não nos testes unitários).
 */
export function assertServerEnv() {
  const problems: string[] = [];
  if (!ENV.cookieSecret) problems.push("SESSION_SECRET não definido (use uma frase longa e aleatória)");
  else if (ENV.isProduction && ENV.cookieSecret.length < 32) problems.push("SESSION_SECRET precisa ter pelo menos 32 caracteres em produção");
  if (ENV.databaseProvider !== "sqlite" && ENV.databaseProvider !== "postgres") {
    problems.push(`DATABASE_PROVIDER inválido ("${ENV.databaseProvider}"); use sqlite ou postgres`);
  } else if (ENV.databaseProvider === "postgres" && !ENV.databaseUrl) {
    problems.push("DATABASE_URL não definido (obrigatório com DATABASE_PROVIDER=postgres)");
  }
  if (problems.length) {
    const message = `Configuração incompleta no .env:\n - ${problems.join("\n - ")}\nCopie .env.example para .env e ajuste os valores.`;
    throw new Error(message);
  }
}
