/**
 * Adaptação do SQL gerado para o SQLite ao Postgres (DATABASE_PROVIDER=postgres).
 */
import { describe, expect, it } from "vitest";
import { describePostgresUrl, postgresConfig, translateSql } from "./_core/postgres";

describe("Postgres · tradução do SQL", () => {
  it("numera os parâmetros na ordem", () => {
    expect(translateSql('select "id" from "users" where "email" = ? and "active" = ? limit ?')).toBe(
      'select "id" from "users" where "email" = $1 and "active" = $2 limit $3',
    );
  });

  it("não mexe em ? dentro de textos, identificadores e comentários", () => {
    expect(translateSql(`select '?', 'it''s ?', "col?" from t where a = ? -- ?\n and b = ? /* ? */`)).toBe(
      `select '?', 'it''s ?', "col?" from t where a = $1 -- ?\n and b = $2 /* ? */`,
    );
  });

  it("LIKE vira ILIKE (o LIKE do SQLite ignora maiúsculas)", () => {
    expect(translateSql(`"name" like ? escape '\\' or "code" LIKE ?`)).toBe(`"name" ilike $1 escape '\\' or "code" ilike $2`);
    expect(translateSql(`select 'like' as "like", ilike_col from t`)).toBe(`select 'like' as "like", ilike_col from t`);
  });

  it("BEGIN IMMEDIATE vira BEGIN", () => {
    expect(translateSql("begin immediate")).toBe("begin");
    expect(translateSql("begin")).toBe("begin");
    expect(translateSql("savepoint sp1")).toBe("savepoint sp1");
  });
});

describe("Postgres · configuração", () => {
  const url = "postgresql://postgres.abc:segredo@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require";

  it("não expõe usuário e senha nas mensagens", () => {
    expect(describePostgresUrl(url)).toBe("postgres://aws-0-sa-east-1.pooler.supabase.com:5432/postgres");
  });

  it("usa SSL sem validar certificado por padrão (Supabase) e ignora o sslmode da URL", () => {
    const config = postgresConfig(url, "require");
    expect(config.ssl).toEqual({ rejectUnauthorized: false });
    expect(config.connectionString).not.toContain("sslmode");
  });

  it("permite desligar o SSL para um Postgres local", () => {
    expect(postgresConfig("postgres://localhost:5432/controllab", "disable").ssl).toBe(false);
  });

  it("exige DATABASE_URL", () => {
    expect(() => postgresConfig("", "require")).toThrow(/DATABASE_URL/);
  });
});
