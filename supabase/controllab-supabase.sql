-- ===========================================================================
-- Control Lab — banco completo para o Supabase (estrutura + seed de demonstração)
--
-- Gerado por `pnpm db:export-sql` em 2026-11-13T18:01:57.268Z. Não edite à mão: altere
-- drizzle/postgres/ ou server/seed.ts e gere de novo.
--
-- Como usar: Supabase → SQL Editor → New query → colar este arquivo → Run.
-- Pode ser executado mais de uma vez: migrations já aplicadas são puladas e
-- linhas que já existem não são duplicadas.
--
-- Contas criadas (senhas em supabase/CONTAS-SEED.local.txt, fora do git):
--   Administração: admin@forgelab.local
--   Docente: docente@forgelab.local
--   Aluno: aluno@forgelab.local
--
-- Segurança: todas as tabelas ficam com RLS ligado e sem políticas, então a
-- API pública do Supabase (chave anon) não lê nada. O sistema conecta como
-- `postgres` pela DATABASE_URL e não depende da API do Supabase.
-- ===========================================================================

BEGIN;

-- Controle de migrations (o mesmo de `pnpm db:migrate`).
CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint);
ALTER TABLE "__drizzle_migrations" ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 1. Estrutura (drizzle/postgres/)
-- ---------------------------------------------------------------------------

-- 0000_controllab_baseline
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "__drizzle_migrations" WHERE created_at >= 1792710000000) THEN
    EXECUTE $m0$-- ===========================================================================
-- Control Lab — banco de dados PostgreSQL (Supabase)
--
-- Estrutura equivalente à do SQLite (drizzle/0000_forgelab_baseline.sql), que
-- continua sendo o banco principal do projeto. Este arquivo é usado quando
-- DATABASE_PROVIDER=postgres (ex.: Supabase) e pode ser aplicado de 2 formas:
--   1. pelo projeto:            pnpm db:setup   (ou pnpm db:migrate)
--   2. pelo Supabase:           SQL Editor → colar este arquivo → Run
-- O script é idempotente: rodar de novo não apaga nem duplica nada.
--
-- Convenções (iguais às do SQLite, para o mesmo código servir aos dois bancos):
--   - datas: BIGINT em milissegundos desde 1970 (UTC);
--   - booleanos: INTEGER 0/1;
--   - enums: TEXT validado pela aplicação.
-- ===========================================================================

-- Mesma função do SQLite: segundos desde 1970. Usada nos valores padrão de data.
CREATE OR REPLACE FUNCTION public.unixepoch() RETURNS bigint
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT floor(extract(epoch FROM now()))::bigint
$$;$m0$;
    EXECUTE $m0$-- O SQLite gera o id quando a aplicação envia NULL; no Postgres este gatilho
-- faz o mesmo, usando a sequência da coluna serial.
CREATE OR REPLACE FUNCTION public.controllab_fill_serial_id() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.id IS NULL THEN
    NEW.id := nextval(pg_get_serial_sequence(format('%I.%I', TG_TABLE_SCHEMA, TG_TABLE_NAME), 'id'));
  END IF;
  RETURN NEW;
END
$$;$m0$;
    EXECUTE $m0$CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY,
	"openId" text NOT NULL,
	"name" text,
	"email" text,
	"avatarUrl" text,
	"loginMethod" text,
	"passwordHash" text,
	"role" text NOT NULL DEFAULT 'student',
	"active" integer NOT NULL DEFAULT 1,
	"createdAt" bigint NOT NULL DEFAULT (unixepoch() * 1000),
	"updatedAt" bigint NOT NULL DEFAULT (unixepoch() * 1000),
	"lastSignedIn" bigint NOT NULL DEFAULT (unixepoch() * 1000)
);$m0$;
    EXECUTE $m0$CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique" ON "users" ("email");$m0$;
    EXECUTE $m0$CREATE UNIQUE INDEX IF NOT EXISTS "users_openId_unique" ON "users" ("openId");$m0$;
    EXECUTE $m0$CREATE TABLE IF NOT EXISTS "auth_sessions" (
	"jti" text PRIMARY KEY NOT NULL,
	"openId" text NOT NULL,
	"expiresAt" bigint NOT NULL,
	"revokedAt" bigint,
	"createdAt" bigint NOT NULL DEFAULT (unixepoch() * 1000)
);$m0$;
    EXECUTE $m0$CREATE INDEX IF NOT EXISTS "auth_sessions_open_id_idx" ON "auth_sessions" ("openId");$m0$;
    EXECUTE $m0$CREATE INDEX IF NOT EXISTS "auth_sessions_active_idx" ON "auth_sessions" ("revokedAt","expiresAt");$m0$;
    EXECUTE $m0$CREATE TABLE IF NOT EXISTS "student_badges" (
	"id" serial PRIMARY KEY,
	"userId" integer NOT NULL,
	"label" text NOT NULL,
	"detail" text NOT NULL,
	"awardedBy" integer NOT NULL,
	"awardedAt" bigint NOT NULL DEFAULT (unixepoch() * 1000)
);$m0$;
    EXECUTE $m0$CREATE INDEX IF NOT EXISTS "student_badges_user_idx" ON "student_badges" ("userId");$m0$;
    EXECUTE $m0$CREATE TABLE IF NOT EXISTS "learning_modules" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"description" text NOT NULL,
	"objective" text NOT NULL,
	"cover" text NOT NULL,
	"coverImage" text,
	"progress" integer NOT NULL DEFAULT 0,
	"duration" text NOT NULL,
	"published" integer NOT NULL DEFAULT 0,
	"createdBy" integer,
	"createdAt" bigint NOT NULL DEFAULT (unixepoch() * 1000),
	"updatedAt" bigint NOT NULL DEFAULT (unixepoch() * 1000)
);$m0$;
    EXECUTE $m0$CREATE INDEX IF NOT EXISTS "learning_modules_published_idx" ON "learning_modules" ("published");$m0$;
    EXECUTE $m0$CREATE TABLE IF NOT EXISTS "learning_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"moduleId" text NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"tip" text NOT NULL,
	"imageUrl" text
);$m0$;
    EXECUTE $m0$CREATE INDEX IF NOT EXISTS "learning_steps_module_idx" ON "learning_steps" ("moduleId");$m0$;
    EXECUTE $m0$CREATE TABLE IF NOT EXISTS "learning_resources" (
	"id" text PRIMARY KEY NOT NULL,
	"moduleId" text NOT NULL,
	"category" text NOT NULL,
	"label" text NOT NULL,
	"title" text NOT NULL,
	"detail" text NOT NULL,
	"status" text NOT NULL,
	"progress" integer NOT NULL DEFAULT 0,
	"modelUrl" text NOT NULL,
	"color" text NOT NULL,
	"inventoryItemId" integer
);$m0$;
    EXECUTE $m0$CREATE INDEX IF NOT EXISTS "learning_resources_module_idx" ON "learning_resources" ("moduleId");$m0$;
    EXECUTE $m0$CREATE INDEX IF NOT EXISTS "learning_resources_inventory_idx" ON "learning_resources" ("inventoryItemId");$m0$;
    EXECUTE $m0$CREATE TABLE IF NOT EXISTS "student_progress" (
	"id" serial PRIMARY KEY,
	"userId" integer NOT NULL,
	"moduleId" text NOT NULL,
	"stepIndex" integer NOT NULL DEFAULT 0,
	"progress" integer NOT NULL DEFAULT 0,
	"studiedMinutes" integer NOT NULL DEFAULT 0,
	"streakDays" integer NOT NULL DEFAULT 0,
	"updatedAt" bigint NOT NULL DEFAULT (unixepoch() * 1000)
);$m0$;
    EXECUTE $m0$CREATE INDEX IF NOT EXISTS "student_progress_user_module_idx" ON "student_progress" ("userId","moduleId");$m0$;
    EXECUTE $m0$CREATE UNIQUE INDEX IF NOT EXISTS "student_progress_user_module_unique" ON "student_progress" ("userId","moduleId");$m0$;
    EXECUTE $m0$CREATE TABLE IF NOT EXISTS "student_step_sessions" (
	"id" serial PRIMARY KEY,
	"userId" integer NOT NULL,
	"moduleId" text NOT NULL,
	"stepIndex" integer NOT NULL,
	"startedAt" bigint NOT NULL DEFAULT (unixepoch() * 1000),
	"completedAt" bigint,
	"elapsedSeconds" integer NOT NULL DEFAULT 0
);$m0$;
    EXECUTE $m0$CREATE UNIQUE INDEX IF NOT EXISTS "student_step_sessions_user_step_idx" ON "student_step_sessions" ("userId","moduleId","stepIndex");$m0$;
    EXECUTE $m0$CREATE INDEX IF NOT EXISTS "student_step_sessions_module_idx" ON "student_step_sessions" ("userId","moduleId");$m0$;
    EXECUTE $m0$CREATE TABLE IF NOT EXISTS "instructors" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"badge" text NOT NULL,
	"initials" text NOT NULL,
	"avatarUrl" text,
	"active" integer NOT NULL DEFAULT 1,
	"createdAt" bigint NOT NULL DEFAULT (unixepoch() * 1000)
);$m0$;
    EXECUTE $m0$CREATE TABLE IF NOT EXISTS "learning_activities" (
	"id" text PRIMARY KEY NOT NULL,
	"moduleId" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text NOT NULL,
	"activityType" text NOT NULL,
	"startsAt" bigint NOT NULL,
	"endsAt" bigint NOT NULL,
	"color" text NOT NULL
);$m0$;
    EXECUTE $m0$CREATE TABLE IF NOT EXISTS "inventory_categories" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"description" text,
	"archivedAt" bigint,
	"createdBy" integer,
	"createdAt" bigint NOT NULL DEFAULT (unixepoch() * 1000),
	"updatedAt" bigint NOT NULL DEFAULT (unixepoch() * 1000),
	FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON UPDATE no action ON DELETE set null
);$m0$;
    EXECUTE $m0$CREATE UNIQUE INDEX IF NOT EXISTS "inventory_categories_name_unique" ON "inventory_categories" ("name");$m0$;
    EXECUTE $m0$CREATE TABLE IF NOT EXISTS "inventory_items" (
	"id" serial PRIMARY KEY,
	"code" text NOT NULL,
	"sapCode" text,
	"name" text NOT NULL,
	"description" text,
	"itemType" text NOT NULL,
	"categoryId" integer,
	"unit" text NOT NULL DEFAULT 'UN',
	"returnable" integer NOT NULL DEFAULT 1,
	"quantityPhysical" integer NOT NULL DEFAULT 0,
	"quantityReserved" integer NOT NULL DEFAULT 0,
	"minQuantity" integer NOT NULL DEFAULT 0,
	"sector" text NOT NULL,
	"location" text NOT NULL,
	"conservation" text NOT NULL DEFAULT 'bom',
	"status" text NOT NULL DEFAULT 'disponivel',
	"version" integer NOT NULL DEFAULT 0,
	"archivedAt" bigint,
	"archivedBy" integer,
	"archiveReason" text,
	"createdBy" integer,
	"updatedBy" integer,
	"createdAt" bigint NOT NULL DEFAULT (unixepoch() * 1000),
	"updatedAt" bigint NOT NULL DEFAULT (unixepoch() * 1000),
	FOREIGN KEY ("categoryId") REFERENCES "inventory_categories"("id") ON UPDATE no action ON DELETE set null,
	FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON UPDATE no action ON DELETE set null,
	FOREIGN KEY ("updatedBy") REFERENCES "users"("id") ON UPDATE no action ON DELETE set null,
	FOREIGN KEY ("archivedBy") REFERENCES "users"("id") ON UPDATE no action ON DELETE set null,
	CONSTRAINT "inventory_items_physical_check" CHECK("quantityPhysical" >= 0),
	CONSTRAINT "inventory_items_reserved_check" CHECK("quantityReserved" >= 0 AND "quantityReserved" <= "quantityPhysical"),
	CONSTRAINT "inventory_items_min_check" CHECK("minQuantity" >= 0)
);$m0$;
    EXECUTE $m0$CREATE UNIQUE INDEX IF NOT EXISTS "inventory_items_code_unique" ON "inventory_items" ("code");$m0$;
    EXECUTE $m0$CREATE INDEX IF NOT EXISTS "inventory_items_sap_idx" ON "inventory_items" ("sapCode");$m0$;
    EXECUTE $m0$CREATE INDEX IF NOT EXISTS "inventory_items_type_idx" ON "inventory_items" ("itemType");$m0$;
    EXECUTE $m0$CREATE INDEX IF NOT EXISTS "inventory_items_category_idx" ON "inventory_items" ("categoryId");$m0$;
    EXECUTE $m0$CREATE INDEX IF NOT EXISTS "inventory_items_archived_idx" ON "inventory_items" ("archivedAt");$m0$;
    EXECUTE $m0$CREATE TABLE IF NOT EXISTS "inventory_loans" (
	"id" serial PRIMARY KEY,
	"itemId" integer NOT NULL,
	"borrowerUserId" integer,
	"borrowerName" text NOT NULL,
	"quantity" integer NOT NULL,
	"returnedQuantity" integer NOT NULL DEFAULT 0,
	"damagedQuantity" integer NOT NULL DEFAULT 0,
	"status" text NOT NULL DEFAULT 'reservado',
	"purpose" text NOT NULL,
	"moduleId" text,
	"dueAt" bigint,
	"cancelReason" text,
	"requestKey" text,
	"createdBy" integer NOT NULL,
	"deliveredBy" integer,
	"closedBy" integer,
	"createdAt" bigint NOT NULL DEFAULT (unixepoch() * 1000),
	"deliveredAt" bigint,
	"closedAt" bigint,
	"updatedAt" bigint NOT NULL DEFAULT (unixepoch() * 1000),
	FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("borrowerUserId") REFERENCES "users"("id") ON UPDATE no action ON DELETE set null,
	FOREIGN KEY ("moduleId") REFERENCES "learning_modules"("id") ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("deliveredBy") REFERENCES "users"("id") ON UPDATE no action ON DELETE set null,
	FOREIGN KEY ("closedBy") REFERENCES "users"("id") ON UPDATE no action ON DELETE set null,
	CONSTRAINT "inventory_loans_quantity_check" CHECK("quantity" > 0),
	CONSTRAINT "inventory_loans_return_check" CHECK("returnedQuantity" >= 0 AND "damagedQuantity" >= 0 AND "returnedQuantity" + "damagedQuantity" <= "quantity")
);$m0$;
    EXECUTE $m0$CREATE UNIQUE INDEX IF NOT EXISTS "inventory_loans_request_key_unique" ON "inventory_loans" ("requestKey");$m0$;
    EXECUTE $m0$CREATE INDEX IF NOT EXISTS "inventory_loans_item_idx" ON "inventory_loans" ("itemId");$m0$;
    EXECUTE $m0$CREATE INDEX IF NOT EXISTS "inventory_loans_status_idx" ON "inventory_loans" ("status");$m0$;
    EXECUTE $m0$CREATE TABLE IF NOT EXISTS "inventory_movements" (
	"id" serial PRIMARY KEY,
	"itemId" integer NOT NULL,
	"movementType" text NOT NULL,
	"quantity" integer NOT NULL,
	"physicalBefore" integer NOT NULL,
	"physicalAfter" integer NOT NULL,
	"reservedBefore" integer NOT NULL,
	"reservedAfter" integer NOT NULL,
	"reason" text NOT NULL,
	"reference" text,
	"note" text,
	"loanId" integer,
	"moduleId" text,
	"moduleTitleSnapshot" text,
	"itemCodeSnapshot" text NOT NULL,
	"itemNameSnapshot" text NOT NULL,
	"unitSnapshot" text NOT NULL,
	"requestKey" text,
	"userId" integer NOT NULL,
	"createdAt" bigint NOT NULL DEFAULT (unixepoch() * 1000),
	FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("loanId") REFERENCES "inventory_loans"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("moduleId") REFERENCES "learning_modules"("id") ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY ("userId") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
	CONSTRAINT "inventory_movements_quantity_check" CHECK("quantity" > 0),
	CONSTRAINT "inventory_movements_balance_check" CHECK("physicalAfter" >= 0 AND "reservedAfter" >= 0 AND "reservedAfter" <= "physicalAfter")
);$m0$;
    EXECUTE $m0$CREATE UNIQUE INDEX IF NOT EXISTS "inventory_movements_request_key_unique" ON "inventory_movements" ("requestKey");$m0$;
    EXECUTE $m0$CREATE INDEX IF NOT EXISTS "inventory_movements_item_idx" ON "inventory_movements" ("itemId","createdAt");$m0$;
    EXECUTE $m0$CREATE INDEX IF NOT EXISTS "inventory_movements_type_idx" ON "inventory_movements" ("movementType");$m0$;
    EXECUTE $m0$CREATE INDEX IF NOT EXISTS "inventory_movements_user_idx" ON "inventory_movements" ("userId");$m0$;
    EXECUTE $m0$CREATE INDEX IF NOT EXISTS "inventory_movements_loan_idx" ON "inventory_movements" ("loanId");$m0$;
    EXECUTE $m0$CREATE TABLE IF NOT EXISTS "inventory_audit_log" (
	"id" serial PRIMARY KEY,
	"entityType" text NOT NULL,
	"entityId" integer NOT NULL,
	"action" text NOT NULL,
	"changes" text NOT NULL,
	"userId" integer NOT NULL,
	"createdAt" bigint NOT NULL DEFAULT (unixepoch() * 1000),
	FOREIGN KEY ("userId") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action
);$m0$;
    EXECUTE $m0$CREATE INDEX IF NOT EXISTS "inventory_audit_entity_idx" ON "inventory_audit_log" ("entityType","entityId");$m0$;
    EXECUTE $m0$DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'learning_resources_inventory_fk') THEN
    ALTER TABLE "learning_resources" ADD CONSTRAINT "learning_resources_inventory_fk"
      FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON UPDATE cascade ON DELETE set null;
  END IF;
END
$$;$m0$;
    EXECUTE $m0$DROP TRIGGER IF EXISTS "users_fill_id" ON "users";$m0$;
    EXECUTE $m0$CREATE TRIGGER "users_fill_id" BEFORE INSERT ON "users" FOR EACH ROW EXECUTE FUNCTION public.controllab_fill_serial_id();$m0$;
    EXECUTE $m0$DROP TRIGGER IF EXISTS "student_badges_fill_id" ON "student_badges";$m0$;
    EXECUTE $m0$CREATE TRIGGER "student_badges_fill_id" BEFORE INSERT ON "student_badges" FOR EACH ROW EXECUTE FUNCTION public.controllab_fill_serial_id();$m0$;
    EXECUTE $m0$DROP TRIGGER IF EXISTS "student_progress_fill_id" ON "student_progress";$m0$;
    EXECUTE $m0$CREATE TRIGGER "student_progress_fill_id" BEFORE INSERT ON "student_progress" FOR EACH ROW EXECUTE FUNCTION public.controllab_fill_serial_id();$m0$;
    EXECUTE $m0$DROP TRIGGER IF EXISTS "student_step_sessions_fill_id" ON "student_step_sessions";$m0$;
    EXECUTE $m0$CREATE TRIGGER "student_step_sessions_fill_id" BEFORE INSERT ON "student_step_sessions" FOR EACH ROW EXECUTE FUNCTION public.controllab_fill_serial_id();$m0$;
    EXECUTE $m0$DROP TRIGGER IF EXISTS "instructors_fill_id" ON "instructors";$m0$;
    EXECUTE $m0$CREATE TRIGGER "instructors_fill_id" BEFORE INSERT ON "instructors" FOR EACH ROW EXECUTE FUNCTION public.controllab_fill_serial_id();$m0$;
    EXECUTE $m0$DROP TRIGGER IF EXISTS "inventory_categories_fill_id" ON "inventory_categories";$m0$;
    EXECUTE $m0$CREATE TRIGGER "inventory_categories_fill_id" BEFORE INSERT ON "inventory_categories" FOR EACH ROW EXECUTE FUNCTION public.controllab_fill_serial_id();$m0$;
    EXECUTE $m0$DROP TRIGGER IF EXISTS "inventory_items_fill_id" ON "inventory_items";$m0$;
    EXECUTE $m0$CREATE TRIGGER "inventory_items_fill_id" BEFORE INSERT ON "inventory_items" FOR EACH ROW EXECUTE FUNCTION public.controllab_fill_serial_id();$m0$;
    EXECUTE $m0$DROP TRIGGER IF EXISTS "inventory_loans_fill_id" ON "inventory_loans";$m0$;
    EXECUTE $m0$CREATE TRIGGER "inventory_loans_fill_id" BEFORE INSERT ON "inventory_loans" FOR EACH ROW EXECUTE FUNCTION public.controllab_fill_serial_id();$m0$;
    EXECUTE $m0$DROP TRIGGER IF EXISTS "inventory_movements_fill_id" ON "inventory_movements";$m0$;
    EXECUTE $m0$CREATE TRIGGER "inventory_movements_fill_id" BEFORE INSERT ON "inventory_movements" FOR EACH ROW EXECUTE FUNCTION public.controllab_fill_serial_id();$m0$;
    EXECUTE $m0$DROP TRIGGER IF EXISTS "inventory_audit_log_fill_id" ON "inventory_audit_log";$m0$;
    EXECUTE $m0$CREATE TRIGGER "inventory_audit_log_fill_id" BEFORE INSERT ON "inventory_audit_log" FOR EACH ROW EXECUTE FUNCTION public.controllab_fill_serial_id();$m0$;
    EXECUTE $m0$-- Supabase expõe o schema public pela API REST (chave anon). O Control Lab acessa
-- o banco direto pela connection string (papel postgres, que ignora RLS), então
-- ativamos RLS sem políticas: a API pública não lê nem grava nenhuma tabela.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "auth_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_badges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "learning_modules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "learning_steps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "learning_resources" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_progress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_step_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "instructors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "learning_activities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_loans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_audit_log" ENABLE ROW LEVEL SECURITY;$m0$;
    INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ('a948e0cc5445c4f0ddda9be59e7df8b43e1cf1e60dcd4a6f1ebb80bd920cb083', 1792710000000);
  END IF;
END
$do$;

-- 0001_ownership_archive_notes
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "__drizzle_migrations" WHERE created_at >= 1792800000000) THEN
    EXECUTE $m1$ALTER TABLE "learning_modules" ADD COLUMN IF NOT EXISTS "archivedAt" bigint;$m1$;
    EXECUTE $m1$CREATE INDEX IF NOT EXISTS "learning_modules_archived_idx" ON "learning_modules" ("archivedAt");$m1$;
    EXECUTE $m1$ALTER TABLE "learning_activities" ADD COLUMN IF NOT EXISTS "createdBy" integer;$m1$;
    EXECUTE $m1$CREATE INDEX IF NOT EXISTS "learning_activities_created_by_idx" ON "learning_activities" ("createdBy");$m1$;
    EXECUTE $m1$CREATE TABLE IF NOT EXISTS "student_notes" (
	"userId" integer PRIMARY KEY NOT NULL,
	"content" text DEFAULT '[]' NOT NULL,
	"updatedAt" bigint NOT NULL DEFAULT (unixepoch() * 1000),
	FOREIGN KEY ("userId") REFERENCES "users"("id") ON UPDATE no action ON DELETE cascade
);$m1$;
    EXECUTE $m1$ALTER TABLE "student_notes" ENABLE ROW LEVEL SECURITY;$m1$;
    INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ('5d59d7761e593064f429a5a6854d258452d713c53a1018448a432237e4b366f1', 1792800000000);
  END IF;
END
$do$;

-- 0002_classrooms
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "__drizzle_migrations" WHERE created_at >= 1793000000000) THEN
    EXECUTE $m2$CREATE TABLE IF NOT EXISTS "classrooms" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"teacherId" integer,
	"archivedAt" bigint,
	"createdAt" bigint NOT NULL DEFAULT (unixepoch() * 1000),
	"updatedAt" bigint NOT NULL DEFAULT (unixepoch() * 1000),
	FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON UPDATE no action ON DELETE set null
);$m2$;
    EXECUTE $m2$CREATE UNIQUE INDEX IF NOT EXISTS "classrooms_name_unique" ON "classrooms" ("name");$m2$;
    EXECUTE $m2$CREATE INDEX IF NOT EXISTS "classrooms_teacher_idx" ON "classrooms" ("teacherId");$m2$;
    EXECUTE $m2$DROP TRIGGER IF EXISTS "classrooms_fill_id" ON "classrooms";$m2$;
    EXECUTE $m2$CREATE TRIGGER "classrooms_fill_id" BEFORE INSERT ON "classrooms" FOR EACH ROW EXECUTE FUNCTION public.controllab_fill_serial_id();$m2$;
    EXECUTE $m2$ALTER TABLE "classrooms" ENABLE ROW LEVEL SECURITY;$m2$;
    EXECUTE $m2$ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "classroomId" integer REFERENCES "classrooms"("id") ON DELETE set null;$m2$;
    EXECUTE $m2$CREATE INDEX IF NOT EXISTS "users_classroom_idx" ON "users" ("classroomId");$m2$;
    EXECUTE $m2$ALTER TABLE "inventory_loans" ADD COLUMN IF NOT EXISTS "classroomId" integer REFERENCES "classrooms"("id") ON DELETE set null;$m2$;
    EXECUTE $m2$ALTER TABLE "inventory_movements" ADD COLUMN IF NOT EXISTS "classroomId" integer REFERENCES "classrooms"("id") ON DELETE set null;$m2$;
    INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ('08c33d2325350985ca80034eeb0ed845a15d6b30d43826f9f6a2f1e000d593b6', 1793000000000);
  END IF;
END
$do$;

-- 0003_module_attachments
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "__drizzle_migrations" WHERE created_at >= 1793100000000) THEN
    EXECUTE $m3$ALTER TABLE "learning_resources" ADD COLUMN IF NOT EXISTS "attachments" text DEFAULT '[]' NOT NULL;$m3$;
    EXECUTE $m3$ALTER TABLE "learning_steps" ADD COLUMN IF NOT EXISTS "attachments" text DEFAULT '[]' NOT NULL;$m3$;
    INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ('efa01d5079939957a6c002bfc215e01e6a19216bf67478ccfbbca3613257c1c3', 1793100000000);
  END IF;
END
$do$;

-- 0004_inventory_item_icon
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "__drizzle_migrations" WHERE created_at >= 1793200000000) THEN
    EXECUTE $m4$ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "icon" text;$m4$;
    INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ('4a1403a0382d18a473e723c49382e71982d35f94a88970fad391293f2807aa39', 1793200000000);
  END IF;
END
$do$;

-- 0005_learning_foreign_keys
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "__drizzle_migrations" WHERE created_at >= 1793300000000) THEN
    EXECUTE $m5$-- Linhas órfãs (aluno ou módulo inexistente) não passariam nas novas FKs.
DELETE FROM "student_progress" WHERE "userId" NOT IN (SELECT "id" FROM "users") OR "moduleId" NOT IN (SELECT "id" FROM "learning_modules");$m5$;
    EXECUTE $m5$DELETE FROM "student_step_sessions" WHERE "userId" NOT IN (SELECT "id" FROM "users") OR "moduleId" NOT IN (SELECT "id" FROM "learning_modules");$m5$;
    EXECUTE $m5$DELETE FROM "student_badges" WHERE "userId" NOT IN (SELECT "id" FROM "users");$m5$;
    EXECUTE $m5$DELETE FROM "learning_steps" WHERE "moduleId" NOT IN (SELECT "id" FROM "learning_modules");$m5$;
    EXECUTE $m5$DELETE FROM "learning_resources" WHERE "moduleId" NOT IN (SELECT "id" FROM "learning_modules");$m5$;
    EXECUTE $m5$DELETE FROM "learning_activities" WHERE "moduleId" NOT IN (SELECT "id" FROM "learning_modules");$m5$;
    EXECUTE $m5$UPDATE "learning_activities" SET "createdBy" = NULL WHERE "createdBy" NOT IN (SELECT "id" FROM "users");$m5$;
    EXECUTE $m5$UPDATE "learning_modules" SET "createdBy" = NULL WHERE "createdBy" NOT IN (SELECT "id" FROM "users");$m5$;
    EXECUTE $m5$DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_progress_user_fk') THEN
    ALTER TABLE "student_progress" ADD CONSTRAINT "student_progress_user_fk"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON UPDATE no action ON DELETE cascade;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_progress_module_fk') THEN
    ALTER TABLE "student_progress" ADD CONSTRAINT "student_progress_module_fk"
      FOREIGN KEY ("moduleId") REFERENCES "learning_modules"("id") ON UPDATE cascade ON DELETE cascade;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_step_sessions_user_fk') THEN
    ALTER TABLE "student_step_sessions" ADD CONSTRAINT "student_step_sessions_user_fk"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON UPDATE no action ON DELETE cascade;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_step_sessions_module_fk') THEN
    ALTER TABLE "student_step_sessions" ADD CONSTRAINT "student_step_sessions_module_fk"
      FOREIGN KEY ("moduleId") REFERENCES "learning_modules"("id") ON UPDATE cascade ON DELETE cascade;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_badges_user_fk') THEN
    ALTER TABLE "student_badges" ADD CONSTRAINT "student_badges_user_fk"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON UPDATE no action ON DELETE cascade;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'learning_steps_module_fk') THEN
    ALTER TABLE "learning_steps" ADD CONSTRAINT "learning_steps_module_fk"
      FOREIGN KEY ("moduleId") REFERENCES "learning_modules"("id") ON UPDATE cascade ON DELETE cascade;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'learning_resources_module_fk') THEN
    ALTER TABLE "learning_resources" ADD CONSTRAINT "learning_resources_module_fk"
      FOREIGN KEY ("moduleId") REFERENCES "learning_modules"("id") ON UPDATE cascade ON DELETE cascade;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'learning_activities_module_fk') THEN
    ALTER TABLE "learning_activities" ADD CONSTRAINT "learning_activities_module_fk"
      FOREIGN KEY ("moduleId") REFERENCES "learning_modules"("id") ON UPDATE cascade ON DELETE cascade;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'learning_activities_created_by_fk') THEN
    ALTER TABLE "learning_activities" ADD CONSTRAINT "learning_activities_created_by_fk"
      FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON UPDATE no action ON DELETE set null;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'learning_modules_created_by_fk') THEN
    ALTER TABLE "learning_modules" ADD CONSTRAINT "learning_modules_created_by_fk"
      FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON UPDATE no action ON DELETE set null;
  END IF;
END
$$;$m5$;
    EXECUTE $m5$-- O índice único de mesmas colunas já atende às consultas.
DROP INDEX IF EXISTS "student_progress_user_module_idx";$m5$;
    INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ('140c664a46b640fd380438271d3faf9f2735f2b29be41930134be7b4c24a532f', 1793300000000);
  END IF;
END
$do$;

-- 0006_step_quiz
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "__drizzle_migrations" WHERE created_at >= 1793400000000) THEN
    EXECUTE $m6$CREATE TABLE IF NOT EXISTS "student_quiz_attempts" (
	"id" serial PRIMARY KEY,
	"userId" integer NOT NULL,
	"moduleId" text NOT NULL,
	"stepId" text NOT NULL,
	"selectedIndex" integer NOT NULL,
	"correct" integer NOT NULL,
	"createdAt" bigint NOT NULL DEFAULT (unixepoch() * 1000),
	CONSTRAINT "student_quiz_attempts_user_fk" FOREIGN KEY ("userId") REFERENCES "users"("id") ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "student_quiz_attempts_module_fk" FOREIGN KEY ("moduleId") REFERENCES "learning_modules"("id") ON UPDATE cascade ON DELETE cascade
);$m6$;
    EXECUTE $m6$CREATE INDEX IF NOT EXISTS "student_quiz_attempts_user_step_idx" ON "student_quiz_attempts" ("userId","stepId");$m6$;
    EXECUTE $m6$CREATE INDEX IF NOT EXISTS "student_quiz_attempts_module_idx" ON "student_quiz_attempts" ("moduleId");$m6$;
    EXECUTE $m6$DROP TRIGGER IF EXISTS "student_quiz_attempts_fill_id" ON "student_quiz_attempts";$m6$;
    EXECUTE $m6$CREATE TRIGGER "student_quiz_attempts_fill_id" BEFORE INSERT ON "student_quiz_attempts" FOR EACH ROW EXECUTE FUNCTION public.controllab_fill_serial_id();$m6$;
    EXECUTE $m6$ALTER TABLE "student_quiz_attempts" ENABLE ROW LEVEL SECURITY;$m6$;
    EXECUTE $m6$ALTER TABLE "learning_steps" ADD COLUMN IF NOT EXISTS "quiz" text;$m6$;
    INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ('06dd2c3004dd90568e69afba08feee30e476070f1fc1b821c0b4c3634f02f0a4', 1793400000000);
  END IF;
END
$do$;

-- 0007_stored_files
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "__drizzle_migrations" WHERE created_at >= 1794600000000) THEN
    EXECUTE $m7$CREATE TABLE IF NOT EXISTS "stored_files" (
	"key" text PRIMARY KEY NOT NULL,
	"contentType" text NOT NULL,
	"size" integer NOT NULL,
	"data" bytea NOT NULL,
	"createdAt" bigint NOT NULL DEFAULT (unixepoch() * 1000)
);$m7$;
    EXECUTE $m7$ALTER TABLE "stored_files" ENABLE ROW LEVEL SECURITY;$m7$;
    INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ('bef70f791e3abbe56454fa2e8bba2c0ee0b4968505f6c5899d4fa74903586941', 1794600000000);
  END IF;
END
$do$;

-- ---------------------------------------------------------------------------
-- 2. Seed de demonstração (66 linhas)
-- ---------------------------------------------------------------------------

-- classrooms (2)
INSERT INTO "classrooms" ("id", "name", "teacherId", "archivedAt", "createdAt", "updatedAt") VALUES (1, '2º Ano Mecânica A', NULL, NULL, 1794592917000, 1794592917000) ON CONFLICT DO NOTHING;
INSERT INTO "classrooms" ("id", "name", "teacherId", "archivedAt", "createdAt", "updatedAt") VALUES (2, '2º Ano Mecânica B', NULL, NULL, 1794592917000, 1794592917000) ON CONFLICT DO NOTHING;

-- instructors (3)
INSERT INTO "instructors" ("id", "name", "role", "badge", "initials", "avatarUrl", "active", "createdAt") VALUES (1, 'Marina Ribeiro', 'Usinagem e CNC', 'Especialista', 'MR', NULL, 1, 1794592917000) ON CONFLICT DO NOTHING;
INSERT INTO "instructors" ("id", "name", "role", "badge", "initials", "avatarUrl", "active", "createdAt") VALUES (2, 'Carlos Almeida', 'Montagem de moldes', 'Instrutor', 'CA', NULL, 1, 1794592917000) ON CONFLICT DO NOTHING;
INSERT INTO "instructors" ("id", "name", "role", "badge", "initials", "avatarUrl", "active", "createdAt") VALUES (3, 'João Santos', 'Metrologia aplicada', 'Instrutor', 'JS', NULL, 1, 1794592917000) ON CONFLICT DO NOTHING;

-- users (3)
INSERT INTO "users" ("id", "openId", "name", "email", "avatarUrl", "loginMethod", "passwordHash", "role", "active", "createdAt", "updatedAt", "lastSignedIn", "classroomId") VALUES (1, 'local:docente@forgelab.local', 'Docente Control Lab', 'docente@forgelab.local', NULL, 'password', 'scrypt$16384$8$1$xCPAqwp2K7jRpfSa3QqdSg==$gj58247ZiAy09F8AnBszfz/wFLKvQ3RPcNR6PzItogfbVTwC9/wfEV0PjK1dleD0EMr66RcdXg/JNkl80o/vSw==', 'teacher', 1, 1794592917000, 1794592917000, 1794592917000, NULL) ON CONFLICT DO NOTHING;
INSERT INTO "users" ("id", "openId", "name", "email", "avatarUrl", "loginMethod", "passwordHash", "role", "active", "createdAt", "updatedAt", "lastSignedIn", "classroomId") VALUES (2, 'local:aluno@forgelab.local', 'Aluno Control Lab', 'aluno@forgelab.local', NULL, 'password', 'scrypt$16384$8$1$6rBfcLjMHzoIi/SqlO97lQ==$7AQZPHUwM9bAWvF9qFOEeYmXiWneQvl77GRahWqeMx6AgiD9sMJOy4fVDTyOb+fPeqalwlmQnxVIPALfR4ClFw==', 'student', 1, 1794592917000, 1794592917233, 1794592917000, 1) ON CONFLICT DO NOTHING;
INSERT INTO "users" ("id", "openId", "name", "email", "avatarUrl", "loginMethod", "passwordHash", "role", "active", "createdAt", "updatedAt", "lastSignedIn", "classroomId") VALUES (3, 'local:admin@forgelab.local', 'Administração Control Lab', 'admin@forgelab.local', NULL, 'password', 'scrypt$16384$8$1$ZnfTxjVaKSya1lK/WnQqvg==$XITypzuHPTzo1YtDsmnucFd5oNQmi7Fy5XF9BDjUJyg+rQYdLjpouR7Zw6AZdY6KiO0O+xa/EhQY5AT6EhyAqA==', 'admin', 1, 1794592917000, 1794592917000, 1794592917000, NULL) ON CONFLICT DO NOTHING;

-- inventory_audit_log (9)
INSERT INTO "inventory_audit_log" ("id", "entityType", "entityId", "action", "changes", "userId", "createdAt") VALUES (1, 'item', 1, 'create', '{"code":"BRC-HSS-008","sapCode":null,"name":"Broca helicoidal HSS Ø 8 mm","description":"Broca de aço rápido para furação em aço carbono.","itemType":"tool","unit":"UN","returnable":true,"minQuantity":5,"sector":"Ferramentaria","location":"Armário A · gaveta 1","conservation":"bom","status":"disponivel","icon":null,"categoryId":1,"initialQuantity":20}', 1, 1794592917000) ON CONFLICT DO NOTHING;
INSERT INTO "inventory_audit_log" ("id", "entityType", "entityId", "action", "changes", "userId", "createdAt") VALUES (2, 'item', 2, 'create', '{"code":"INS-WNMG-060404","sapCode":"1004916","name":"Inserto WNMG 060404 - PP IC907","description":"Consumível de torneamento. O código SAP pode se repetir em outras descrições.","itemType":"tool","unit":"UN","returnable":false,"minQuantity":10,"sector":"Mecânica","location":"Mecânica · gaveta de insertos","conservation":"novo","status":"disponivel","icon":null,"categoryId":1,"initialQuantity":12}', 1, 1794592917000) ON CONFLICT DO NOTHING;
INSERT INTO "inventory_audit_log" ("id", "entityType", "entityId", "action", "changes", "userId", "createdAt") VALUES (3, 'item', 3, 'create', '{"code":"PAQ-150","sapCode":null,"name":"Paquímetro universal 150 mm","description":"Resolução 0,02 mm.","itemType":"tool","unit":"UN","returnable":true,"minQuantity":2,"sector":"Metrologia","location":"Armário B · prateleira 2","conservation":"bom","status":"disponivel","icon":null,"categoryId":2,"initialQuantity":6}', 1, 1794592917000) ON CONFLICT DO NOTHING;
INSERT INTO "inventory_audit_log" ("id", "entityType", "entityId", "action", "changes", "userId", "createdAt") VALUES (4, 'item', 4, 'create', '{"code":"MIC-025","sapCode":null,"name":"Micrômetro externo 0–25 mm","description":"Aguardando aferição.","itemType":"tool","unit":"UN","returnable":true,"minQuantity":1,"sector":"Metrologia","location":"Armário B · prateleira 1","conservation":"regular","status":"manutencao","icon":null,"categoryId":2,"initialQuantity":2}', 1, 1794592917000) ON CONFLICT DO NOTHING;
INSERT INTO "inventory_audit_log" ("id", "entityType", "entityId", "action", "changes", "userId", "createdAt") VALUES (5, 'item', 5, 'create', '{"code":"FUR-BANC-01","sapCode":null,"name":"Furadeira de bancada","description":"Equipamento fixo da bancada 3.","itemType":"machine","unit":"UN","returnable":false,"minQuantity":0,"sector":"Ferramentaria","location":"Oficina · bancada 3","conservation":"bom","status":"disponivel","icon":null,"categoryId":3,"initialQuantity":1}', 1, 1794592917000) ON CONFLICT DO NOTHING;
INSERT INTO "inventory_audit_log" ("id", "entityType", "entityId", "action", "changes", "userId", "createdAt") VALUES (6, 'item', 6, 'create', '{"code":"TOR-01","sapCode":null,"name":"Torno mecânico universal","description":"Equipamento fixo da oficina.","itemType":"machine","unit":"UN","returnable":false,"minQuantity":0,"sector":"Mecânica","location":"Oficina · posição 1","conservation":"bom","status":"disponivel","icon":null,"categoryId":3,"initialQuantity":1}', 1, 1794592917000) ON CONFLICT DO NOTHING;
INSERT INTO "inventory_audit_log" ("id", "entityType", "entityId", "action", "changes", "userId", "createdAt") VALUES (7, 'item', 7, 'create', '{"code":"ACO-1045-50","sapCode":null,"name":"Barra de aço SAE 1045 Ø 50 × 100 mm","description":"Peças cortadas para os exercícios de usinagem.","itemType":"material","unit":"PC","returnable":false,"minQuantity":5,"sector":"Almoxarifado","location":"Almoxarifado · estante M1","conservation":"novo","status":"disponivel","icon":null,"categoryId":4,"initialQuantity":15}', 1, 1794592917000) ON CONFLICT DO NOTHING;
INSERT INTO "inventory_audit_log" ("id", "entityType", "entityId", "action", "changes", "userId", "createdAt") VALUES (8, 'item', 8, 'create', '{"code":"CHV-COMB-JG","sapCode":null,"name":"Jogo de chaves combinadas 8–19 mm","description":"Jogo com 12 peças.","itemType":"tool","unit":"JG","returnable":true,"minQuantity":1,"sector":"Ferramentaria","location":"Armário A · gaveta 4","conservation":"bom","status":"disponivel","icon":null,"categoryId":5,"initialQuantity":3}', 1, 1794592917000) ON CONFLICT DO NOTHING;
INSERT INTO "inventory_audit_log" ("id", "entityType", "entityId", "action", "changes", "userId", "createdAt") VALUES (9, 'item', 9, 'create', '{"code":"PIN-GUIA-10","sapCode":null,"name":"Pino-guia Ø 10 mm","description":"Mini peça para montagem de matrizes.","itemType":"part","unit":"UN","returnable":false,"minQuantity":20,"sector":"Ferramentaria","location":"Gaveteiro C · divisória 2","conservation":"novo","status":"disponivel","icon":null,"categoryId":6,"initialQuantity":50}', 1, 1794592917000) ON CONFLICT DO NOTHING;

-- inventory_categories (6)
INSERT INTO "inventory_categories" ("id", "name", "description", "archivedAt", "createdBy", "createdAt", "updatedAt") VALUES (1, 'Ferramentas de corte', 'Brocas, insertos e fresas', NULL, 1, 1794592917000, 1794592917000) ON CONFLICT DO NOTHING;
INSERT INTO "inventory_categories" ("id", "name", "description", "archivedAt", "createdBy", "createdAt", "updatedAt") VALUES (2, 'Instrumentos de medição', 'Paquímetros, micrômetros e relógios comparadores', NULL, 1, 1794592917000, 1794592917000) ON CONFLICT DO NOTHING;
INSERT INTO "inventory_categories" ("id", "name", "description", "archivedAt", "createdBy", "createdAt", "updatedAt") VALUES (3, 'Máquinas', 'Equipamentos fixos da oficina', NULL, 1, 1794592917000, 1794592917000) ON CONFLICT DO NOTHING;
INSERT INTO "inventory_categories" ("id", "name", "description", "archivedAt", "createdBy", "createdAt", "updatedAt") VALUES (4, 'Matéria-prima', 'Barras, blocos e chapas', NULL, 1, 1794592917000, 1794592917000) ON CONFLICT DO NOTHING;
INSERT INTO "inventory_categories" ("id", "name", "description", "archivedAt", "createdBy", "createdAt", "updatedAt") VALUES (5, 'Ferramentas manuais', 'Chaves, limas e martelos', NULL, 1, 1794592917000, 1794592917000) ON CONFLICT DO NOTHING;
INSERT INTO "inventory_categories" ("id", "name", "description", "archivedAt", "createdBy", "createdAt", "updatedAt") VALUES (6, 'Componentes de montagem', 'Pinos, buchas e parafusos', NULL, 1, 1794592917000, 1794592917000) ON CONFLICT DO NOTHING;

-- inventory_items (9)
INSERT INTO "inventory_items" ("id", "code", "sapCode", "name", "description", "itemType", "categoryId", "unit", "returnable", "quantityPhysical", "quantityReserved", "minQuantity", "sector", "location", "conservation", "status", "version", "archivedAt", "archivedBy", "archiveReason", "createdBy", "updatedBy", "createdAt", "updatedAt", "icon") VALUES (1, 'BRC-HSS-008', NULL, 'Broca helicoidal HSS Ø 8 mm', 'Broca de aço rápido para furação em aço carbono.', 'tool', 1, 'UN', 1, 20, 2, 5, 'Ferramentaria', 'Armário A · gaveta 1', 'bom', 'disponivel', 0, NULL, NULL, NULL, 1, 1, 1794592917000, 1794592917254, NULL) ON CONFLICT DO NOTHING;
INSERT INTO "inventory_items" ("id", "code", "sapCode", "name", "description", "itemType", "categoryId", "unit", "returnable", "quantityPhysical", "quantityReserved", "minQuantity", "sector", "location", "conservation", "status", "version", "archivedAt", "archivedBy", "archiveReason", "createdBy", "updatedBy", "createdAt", "updatedAt", "icon") VALUES (2, 'INS-WNMG-060404', '1004916', 'Inserto WNMG 060404 - PP IC907', 'Consumível de torneamento. O código SAP pode se repetir em outras descrições.', 'tool', 1, 'UN', 0, 8, 0, 10, 'Mecânica', 'Mecânica · gaveta de insertos', 'novo', 'disponivel', 0, NULL, NULL, NULL, 1, 1, 1794592917000, 1794592917248, NULL) ON CONFLICT DO NOTHING;
INSERT INTO "inventory_items" ("id", "code", "sapCode", "name", "description", "itemType", "categoryId", "unit", "returnable", "quantityPhysical", "quantityReserved", "minQuantity", "sector", "location", "conservation", "status", "version", "archivedAt", "archivedBy", "archiveReason", "createdBy", "updatedBy", "createdAt", "updatedAt", "icon") VALUES (3, 'PAQ-150', NULL, 'Paquímetro universal 150 mm', 'Resolução 0,02 mm.', 'tool', 2, 'UN', 1, 5, 0, 2, 'Metrologia', 'Armário B · prateleira 2', 'bom', 'disponivel', 0, NULL, NULL, NULL, 1, 1, 1794592917000, 1794592917253, NULL) ON CONFLICT DO NOTHING;
INSERT INTO "inventory_items" ("id", "code", "sapCode", "name", "description", "itemType", "categoryId", "unit", "returnable", "quantityPhysical", "quantityReserved", "minQuantity", "sector", "location", "conservation", "status", "version", "archivedAt", "archivedBy", "archiveReason", "createdBy", "updatedBy", "createdAt", "updatedAt", "icon") VALUES (4, 'MIC-025', NULL, 'Micrômetro externo 0–25 mm', 'Aguardando aferição.', 'tool', 2, 'UN', 1, 2, 0, 1, 'Metrologia', 'Armário B · prateleira 1', 'regular', 'manutencao', 0, NULL, NULL, NULL, 1, 1, 1794592917000, 1794592917241, NULL) ON CONFLICT DO NOTHING;
INSERT INTO "inventory_items" ("id", "code", "sapCode", "name", "description", "itemType", "categoryId", "unit", "returnable", "quantityPhysical", "quantityReserved", "minQuantity", "sector", "location", "conservation", "status", "version", "archivedAt", "archivedBy", "archiveReason", "createdBy", "updatedBy", "createdAt", "updatedAt", "icon") VALUES (5, 'FUR-BANC-01', NULL, 'Furadeira de bancada', 'Equipamento fixo da bancada 3.', 'machine', 3, 'UN', 0, 1, 0, 0, 'Ferramentaria', 'Oficina · bancada 3', 'bom', 'disponivel', 0, NULL, NULL, NULL, 1, 1, 1794592917000, 1794592917242, NULL) ON CONFLICT DO NOTHING;
INSERT INTO "inventory_items" ("id", "code", "sapCode", "name", "description", "itemType", "categoryId", "unit", "returnable", "quantityPhysical", "quantityReserved", "minQuantity", "sector", "location", "conservation", "status", "version", "archivedAt", "archivedBy", "archiveReason", "createdBy", "updatedBy", "createdAt", "updatedAt", "icon") VALUES (6, 'TOR-01', NULL, 'Torno mecânico universal', 'Equipamento fixo da oficina.', 'machine', 3, 'UN', 0, 1, 0, 0, 'Mecânica', 'Oficina · posição 1', 'bom', 'disponivel', 0, NULL, NULL, NULL, 1, 1, 1794592917000, 1794592917243, NULL) ON CONFLICT DO NOTHING;
INSERT INTO "inventory_items" ("id", "code", "sapCode", "name", "description", "itemType", "categoryId", "unit", "returnable", "quantityPhysical", "quantityReserved", "minQuantity", "sector", "location", "conservation", "status", "version", "archivedAt", "archivedBy", "archiveReason", "createdBy", "updatedBy", "createdAt", "updatedAt", "icon") VALUES (7, 'ACO-1045-50', NULL, 'Barra de aço SAE 1045 Ø 50 × 100 mm', 'Peças cortadas para os exercícios de usinagem.', 'material', 4, 'PC', 0, 12, 0, 5, 'Almoxarifado', 'Almoxarifado · estante M1', 'novo', 'disponivel', 0, NULL, NULL, NULL, 1, 1, 1794592917000, 1794592917249, NULL) ON CONFLICT DO NOTHING;
INSERT INTO "inventory_items" ("id", "code", "sapCode", "name", "description", "itemType", "categoryId", "unit", "returnable", "quantityPhysical", "quantityReserved", "minQuantity", "sector", "location", "conservation", "status", "version", "archivedAt", "archivedBy", "archiveReason", "createdBy", "updatedBy", "createdAt", "updatedAt", "icon") VALUES (8, 'CHV-COMB-JG', NULL, 'Jogo de chaves combinadas 8–19 mm', 'Jogo com 12 peças.', 'tool', 5, 'JG', 1, 3, 0, 1, 'Ferramentaria', 'Armário A · gaveta 4', 'bom', 'disponivel', 0, NULL, NULL, NULL, 1, 1, 1794592917000, 1794592917246, NULL) ON CONFLICT DO NOTHING;
INSERT INTO "inventory_items" ("id", "code", "sapCode", "name", "description", "itemType", "categoryId", "unit", "returnable", "quantityPhysical", "quantityReserved", "minQuantity", "sector", "location", "conservation", "status", "version", "archivedAt", "archivedBy", "archiveReason", "createdBy", "updatedBy", "createdAt", "updatedAt", "icon") VALUES (9, 'PIN-GUIA-10', NULL, 'Pino-guia Ø 10 mm', 'Mini peça para montagem de matrizes.', 'part', 6, 'UN', 0, 50, 0, 20, 'Ferramentaria', 'Gaveteiro C · divisória 2', 'novo', 'disponivel', 0, NULL, NULL, NULL, 1, 1, 1794592917000, 1794592917247, NULL) ON CONFLICT DO NOTHING;

-- inventory_loans (2)
INSERT INTO "inventory_loans" ("id", "itemId", "borrowerUserId", "borrowerName", "quantity", "returnedQuantity", "damagedQuantity", "status", "purpose", "moduleId", "dueAt", "cancelReason", "requestKey", "createdBy", "deliveredBy", "closedBy", "createdAt", "deliveredAt", "closedAt", "updatedAt", "classroomId") VALUES (1, 3, 2, 'Aluno Control Lab', 1, 0, 0, 'retirado', 'Medição das peças do módulo Matriz de molde', NULL, NULL, NULL, 'seed-emprestimo-paquimetro', 1, 1, NULL, 1794592917000, 1794592917253, NULL, 1794592917253, 1) ON CONFLICT DO NOTHING;
INSERT INTO "inventory_loans" ("id", "itemId", "borrowerUserId", "borrowerName", "quantity", "returnedQuantity", "damagedQuantity", "status", "purpose", "moduleId", "dueAt", "cancelReason", "requestKey", "createdBy", "deliveredBy", "closedBy", "createdAt", "deliveredAt", "closedAt", "updatedAt", "classroomId") VALUES (2, 1, NULL, 'Turma de Ferramentaria — Bancada 3', 2, 0, 0, 'reservado', 'Furação dos blocos na próxima aula', NULL, NULL, NULL, 'seed-reserva-broca', 1, NULL, NULL, 1794592917000, NULL, NULL, 1794592917000, NULL) ON CONFLICT DO NOTHING;

-- inventory_movements (14)
INSERT INTO "inventory_movements" ("id", "itemId", "movementType", "quantity", "physicalBefore", "physicalAfter", "reservedBefore", "reservedAfter", "reason", "reference", "note", "loanId", "moduleId", "moduleTitleSnapshot", "itemCodeSnapshot", "itemNameSnapshot", "unitSnapshot", "requestKey", "userId", "createdAt", "classroomId") VALUES (1, 1, 'entrada', 20, 0, 20, 0, 0, 'compra', 'Cadastro inicial', NULL, NULL, NULL, NULL, 'BRC-HSS-008', 'Broca helicoidal HSS Ø 8 mm', 'UN', 'seed-entrada-BRC-HSS-008', 1, 1794592917000, NULL) ON CONFLICT DO NOTHING;
INSERT INTO "inventory_movements" ("id", "itemId", "movementType", "quantity", "physicalBefore", "physicalAfter", "reservedBefore", "reservedAfter", "reason", "reference", "note", "loanId", "moduleId", "moduleTitleSnapshot", "itemCodeSnapshot", "itemNameSnapshot", "unitSnapshot", "requestKey", "userId", "createdAt", "classroomId") VALUES (2, 2, 'entrada', 12, 0, 12, 0, 0, 'compra', 'Cadastro inicial', NULL, NULL, NULL, NULL, 'INS-WNMG-060404', 'Inserto WNMG 060404 - PP IC907', 'UN', 'seed-entrada-INS-WNMG-060404', 1, 1794592917000, NULL) ON CONFLICT DO NOTHING;
INSERT INTO "inventory_movements" ("id", "itemId", "movementType", "quantity", "physicalBefore", "physicalAfter", "reservedBefore", "reservedAfter", "reason", "reference", "note", "loanId", "moduleId", "moduleTitleSnapshot", "itemCodeSnapshot", "itemNameSnapshot", "unitSnapshot", "requestKey", "userId", "createdAt", "classroomId") VALUES (3, 3, 'entrada', 6, 0, 6, 0, 0, 'inventario', 'Cadastro inicial', NULL, NULL, NULL, NULL, 'PAQ-150', 'Paquímetro universal 150 mm', 'UN', 'seed-entrada-PAQ-150', 1, 1794592917000, NULL) ON CONFLICT DO NOTHING;
INSERT INTO "inventory_movements" ("id", "itemId", "movementType", "quantity", "physicalBefore", "physicalAfter", "reservedBefore", "reservedAfter", "reason", "reference", "note", "loanId", "moduleId", "moduleTitleSnapshot", "itemCodeSnapshot", "itemNameSnapshot", "unitSnapshot", "requestKey", "userId", "createdAt", "classroomId") VALUES (4, 4, 'entrada', 2, 0, 2, 0, 0, 'inventario', 'Cadastro inicial', NULL, NULL, NULL, NULL, 'MIC-025', 'Micrômetro externo 0–25 mm', 'UN', 'seed-entrada-MIC-025', 1, 1794592917000, NULL) ON CONFLICT DO NOTHING;
INSERT INTO "inventory_movements" ("id", "itemId", "movementType", "quantity", "physicalBefore", "physicalAfter", "reservedBefore", "reservedAfter", "reason", "reference", "note", "loanId", "moduleId", "moduleTitleSnapshot", "itemCodeSnapshot", "itemNameSnapshot", "unitSnapshot", "requestKey", "userId", "createdAt", "classroomId") VALUES (5, 5, 'entrada', 1, 0, 1, 0, 0, 'inventario', 'Cadastro inicial', NULL, NULL, NULL, NULL, 'FUR-BANC-01', 'Furadeira de bancada', 'UN', 'seed-entrada-FUR-BANC-01', 1, 1794592917000, NULL) ON CONFLICT DO NOTHING;
INSERT INTO "inventory_movements" ("id", "itemId", "movementType", "quantity", "physicalBefore", "physicalAfter", "reservedBefore", "reservedAfter", "reason", "reference", "note", "loanId", "moduleId", "moduleTitleSnapshot", "itemCodeSnapshot", "itemNameSnapshot", "unitSnapshot", "requestKey", "userId", "createdAt", "classroomId") VALUES (6, 6, 'entrada', 1, 0, 1, 0, 0, 'inventario', 'Cadastro inicial', NULL, NULL, NULL, NULL, 'TOR-01', 'Torno mecânico universal', 'UN', 'seed-entrada-TOR-01', 1, 1794592917000, NULL) ON CONFLICT DO NOTHING;
INSERT INTO "inventory_movements" ("id", "itemId", "movementType", "quantity", "physicalBefore", "physicalAfter", "reservedBefore", "reservedAfter", "reason", "reference", "note", "loanId", "moduleId", "moduleTitleSnapshot", "itemCodeSnapshot", "itemNameSnapshot", "unitSnapshot", "requestKey", "userId", "createdAt", "classroomId") VALUES (7, 7, 'entrada', 15, 0, 15, 0, 0, 'compra', 'Cadastro inicial', NULL, NULL, NULL, NULL, 'ACO-1045-50', 'Barra de aço SAE 1045 Ø 50 × 100 mm', 'PC', 'seed-entrada-ACO-1045-50', 1, 1794592917000, NULL) ON CONFLICT DO NOTHING;
INSERT INTO "inventory_movements" ("id", "itemId", "movementType", "quantity", "physicalBefore", "physicalAfter", "reservedBefore", "reservedAfter", "reason", "reference", "note", "loanId", "moduleId", "moduleTitleSnapshot", "itemCodeSnapshot", "itemNameSnapshot", "unitSnapshot", "requestKey", "userId", "createdAt", "classroomId") VALUES (8, 8, 'entrada', 3, 0, 3, 0, 0, 'doacao', 'Cadastro inicial', NULL, NULL, NULL, NULL, 'CHV-COMB-JG', 'Jogo de chaves combinadas 8–19 mm', 'JG', 'seed-entrada-CHV-COMB-JG', 1, 1794592917000, NULL) ON CONFLICT DO NOTHING;
INSERT INTO "inventory_movements" ("id", "itemId", "movementType", "quantity", "physicalBefore", "physicalAfter", "reservedBefore", "reservedAfter", "reason", "reference", "note", "loanId", "moduleId", "moduleTitleSnapshot", "itemCodeSnapshot", "itemNameSnapshot", "unitSnapshot", "requestKey", "userId", "createdAt", "classroomId") VALUES (9, 9, 'entrada', 50, 0, 50, 0, 0, 'compra', 'Cadastro inicial', NULL, NULL, NULL, NULL, 'PIN-GUIA-10', 'Pino-guia Ø 10 mm', 'UN', 'seed-entrada-PIN-GUIA-10', 1, 1794592917000, NULL) ON CONFLICT DO NOTHING;
INSERT INTO "inventory_movements" ("id", "itemId", "movementType", "quantity", "physicalBefore", "physicalAfter", "reservedBefore", "reservedAfter", "reason", "reference", "note", "loanId", "moduleId", "moduleTitleSnapshot", "itemCodeSnapshot", "itemNameSnapshot", "unitSnapshot", "requestKey", "userId", "createdAt", "classroomId") VALUES (10, 2, 'saida', 4, 12, 8, 0, 0, 'aula', 'Aula de torneamento', NULL, NULL, NULL, 'Operação de torno', 'INS-WNMG-060404', 'Inserto WNMG 060404 - PP IC907', 'UN', 'seed-saida-inserto-aula', 1, 1794592917000, NULL) ON CONFLICT DO NOTHING;
INSERT INTO "inventory_movements" ("id", "itemId", "movementType", "quantity", "physicalBefore", "physicalAfter", "reservedBefore", "reservedAfter", "reason", "reference", "note", "loanId", "moduleId", "moduleTitleSnapshot", "itemCodeSnapshot", "itemNameSnapshot", "unitSnapshot", "requestKey", "userId", "createdAt", "classroomId") VALUES (11, 7, 'saida', 3, 15, 12, 0, 0, 'aula', 'Exercício de faceamento', NULL, NULL, NULL, 'Matriz de molde', 'ACO-1045-50', 'Barra de aço SAE 1045 Ø 50 × 100 mm', 'PC', 'seed-saida-aco-aula', 1, 1794592917000, NULL) ON CONFLICT DO NOTHING;
INSERT INTO "inventory_movements" ("id", "itemId", "movementType", "quantity", "physicalBefore", "physicalAfter", "reservedBefore", "reservedAfter", "reason", "reference", "note", "loanId", "moduleId", "moduleTitleSnapshot", "itemCodeSnapshot", "itemNameSnapshot", "unitSnapshot", "requestKey", "userId", "createdAt", "classroomId") VALUES (12, 3, 'reserva', 1, 6, 6, 0, 1, 'emprestimo', 'Empréstimo #1', 'Medição das peças do módulo Matriz de molde', 1, NULL, 'Matriz de molde', 'PAQ-150', 'Paquímetro universal 150 mm', 'UN', NULL, 1, 1794592917000, 1) ON CONFLICT DO NOTHING;
INSERT INTO "inventory_movements" ("id", "itemId", "movementType", "quantity", "physicalBefore", "physicalAfter", "reservedBefore", "reservedAfter", "reason", "reference", "note", "loanId", "moduleId", "moduleTitleSnapshot", "itemCodeSnapshot", "itemNameSnapshot", "unitSnapshot", "requestKey", "userId", "createdAt", "classroomId") VALUES (13, 3, 'retirada', 1, 6, 5, 1, 0, 'emprestimo', 'Empréstimo #1', 'Entregue para Aluno Control Lab', 1, NULL, 'Matriz de molde', 'PAQ-150', 'Paquímetro universal 150 mm', 'UN', NULL, 1, 1794592917000, 1) ON CONFLICT DO NOTHING;
INSERT INTO "inventory_movements" ("id", "itemId", "movementType", "quantity", "physicalBefore", "physicalAfter", "reservedBefore", "reservedAfter", "reason", "reference", "note", "loanId", "moduleId", "moduleTitleSnapshot", "itemCodeSnapshot", "itemNameSnapshot", "unitSnapshot", "requestKey", "userId", "createdAt", "classroomId") VALUES (14, 1, 'reserva', 2, 20, 20, 0, 2, 'emprestimo', 'Empréstimo #2', 'Furação dos blocos na próxima aula', 2, NULL, 'Matriz de molde', 'BRC-HSS-008', 'Broca helicoidal HSS Ø 8 mm', 'UN', NULL, 1, 1794592917000, NULL) ON CONFLICT DO NOTHING;

-- learning_modules (3)
INSERT INTO "learning_modules" ("id", "code", "title", "kind", "description", "objective", "cover", "coverImage", "progress", "duration", "published", "createdBy", "archivedAt", "createdAt", "updatedAt") VALUES ('ajuste', 'MÓDULO 05', 'Ajuste e acabamento', 'Processo', 'Técnicas de lima, lixa e inspeção para entregar uma peça dentro da tolerância.', 'Escolher o acabamento correto e documentar a inspeção final.', '#e9edf4', NULL, 0, '25 min', 0, NULL, NULL, 1794592917000, 1794592917000) ON CONFLICT DO NOTHING;
INSERT INTO "learning_modules" ("id", "code", "title", "kind", "description", "objective", "cover", "coverImage", "progress", "duration", "published", "createdBy", "archivedAt", "createdAt", "updatedAt") VALUES ('matriz', 'MÓDULO 03', 'Matriz de molde', 'Montagem', 'Do material bruto ao conjunto final, com foco em superfícies de contato e precisão.', 'Construir e validar uma matriz funcional respeitando as tolerâncias do projeto.', '#f6e7e8', NULL, 0, '45 min', 1, NULL, NULL, 1794592917000, 1794592917000) ON CONFLICT DO NOTHING;
INSERT INTO "learning_modules" ("id", "code", "title", "kind", "description", "objective", "cover", "coverImage", "progress", "duration", "published", "createdBy", "archivedAt", "createdAt", "updatedAt") VALUES ('torno', 'MÓDULO 04', 'Operação de torno', 'Ferramenta', 'Leitura do torno, escolha da ferramenta e sequência de acabamento do componente.', 'Reconhecer a máquina e executar o torneamento com segurança e controle dimensional.', '#eee9e2', NULL, 0, '35 min', 1, NULL, NULL, 1794592917000, 1794592917000) ON CONFLICT DO NOTHING;

-- learning_activities (2)
INSERT INTO "learning_activities" ("id", "moduleId", "title", "subtitle", "activityType", "startsAt", "endsAt", "color", "createdBy") VALUES ('activity-material', 'matriz', 'Material bruto e preparação', 'Matriz de molde', 'aula', 1794566700000, 1794569400000, '#fae5e7', NULL) ON CONFLICT DO NOTHING;
INSERT INTO "learning_activities" ("id", "moduleId", "title", "subtitle", "activityType", "startsAt", "endsAt", "color", "createdBy") VALUES ('activity-torno', 'torno', 'Operação de torno', 'Laboratório presencial', 'laboratorio', 1794820500000, 1794823200000, '#fff1bd', NULL) ON CONFLICT DO NOTHING;

-- learning_resources (6)
INSERT INTO "learning_resources" ("id", "moduleId", "category", "label", "title", "detail", "status", "progress", "modelUrl", "attachments", "color", "inventoryItemId") VALUES ('machine', 'matriz', 'machines', 'Máquina', 'Furadeira de bancada', 'Furação e preparação das faces', 'Etapa 02', 72, 'https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/drill_press_01/drill_press_01_1k.gltf', '[]', '#333333', 5) ON CONFLICT DO NOTHING;
INSERT INTO "learning_resources" ("id", "moduleId", "category", "label", "title", "detail", "status", "progress", "modelUrl", "attachments", "color", "inventoryItemId") VALUES ('material', 'matriz', 'materials', 'Material bruto', 'Barra de aço SAE 1045', 'Bloco base para iniciar o processo', 'Etapa 01', 100, 'https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/utility_box_01/utility_box_01_1k.gltf', '[]', '#b21e2b', 7) ON CONFLICT DO NOTHING;
INSERT INTO "learning_resources" ("id", "moduleId", "category", "label", "title", "detail", "status", "progress", "modelUrl", "attachments", "color", "inventoryItemId") VALUES ('parts', 'matriz', 'parts', 'Mini peças', 'Pinos-guia Ø 10 mm', 'Componentes de alinhamento da montagem', 'Etapa 04', 26, 'https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/metal_tool_chest/metal_tool_chest_1k.gltf', '[]', '#b21e2b', 9) ON CONFLICT DO NOTHING;
INSERT INTO "learning_resources" ("id", "moduleId", "category", "label", "title", "detail", "status", "progress", "modelUrl", "attachments", "color", "inventoryItemId") VALUES ('tools', 'matriz', 'tools', 'Ferramenta', 'Jogo de chaves combinadas', 'Aço temperado · fixação do conjunto', 'Etapa 03', 48, 'https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/combination_wrench/combination_wrench_1k.gltf', '[]', '#777777', 8) ON CONFLICT DO NOTHING;
INSERT INTO "learning_resources" ("id", "moduleId", "category", "label", "title", "detail", "status", "progress", "modelUrl", "attachments", "color", "inventoryItemId") VALUES ('torno-inserto', 'torno', 'tools', 'Ferramenta de corte', 'Inserto WNMG 060404', 'Pastilha para desbaste e acabamento', 'Etapa 03', 0, '', '[]', '#777777', 2) ON CONFLICT DO NOTHING;
INSERT INTO "learning_resources" ("id", "moduleId", "category", "label", "title", "detail", "status", "progress", "modelUrl", "attachments", "color", "inventoryItemId") VALUES ('torno-maquina', 'torno', 'machines', 'Máquina', 'Torno mecânico universal', 'Máquina usada em todas as etapas', 'Etapa 01', 0, '', '[]', '#333333', 6) ON CONFLICT DO NOTHING;

-- learning_steps (7)
INSERT INTO "learning_steps" ("id", "moduleId", "position", "title", "description", "tip", "imageUrl", "attachments", "quiz") VALUES ('m1', 'matriz', 0, 'Material bruto', 'Confira dimensões, material e faces de referência antes de iniciar a usinagem.', 'Meça o bloco em três pontos e registre a maior variação.', NULL, '[]', '{"question":"Por que medir o bloco em três pontos antes de usinar?","options":["Para descobrir a maior variação de dimensão do material bruto","Para economizar tempo de máquina","Porque o paquímetro só mede um ponto por vez"],"correctIndex":0,"explanation":"A medição em vários pontos revela a variação do bruto e define quanto material remover."}') ON CONFLICT DO NOTHING;
INSERT INTO "learning_steps" ("id", "moduleId", "position", "title", "description", "tip", "imageUrl", "attachments", "quiz") VALUES ('m2', 'matriz', 1, 'Preparar máquina', 'Selecione a máquina, fixe o material e confira rotação, avanço e segurança.', 'Observe primeiro as superfícies de contato: elas determinam a ordem de usinagem.', NULL, '[]', '{"question":"O que deve ser observado primeiro ao preparar a máquina para a matriz?","options":["A cor da peça","As superfícies de contato","O nome do fabricante da máquina"],"correctIndex":1,"explanation":"As superfícies de contato determinam a ordem de usinagem."}') ON CONFLICT DO NOTHING;
INSERT INTO "learning_steps" ("id", "moduleId", "position", "title", "description", "tip", "imageUrl", "attachments", "quiz") VALUES ('m3', 'matriz', 2, 'Lapidar e medir', 'Use a ferramenta adequada para remover pequenas quantidades e valide a medida após cada passe.', 'Faça uma medição intermediária antes do acabamento final.', NULL, '[]', '{"question":"Quando fazer uma medição intermediária?","options":["Só depois de montar o conjunto","Antes do acabamento final","Nunca: a medida final basta"],"correctIndex":1,"explanation":"Medir antes do acabamento evita remover material demais."}') ON CONFLICT DO NOTHING;
INSERT INTO "learning_steps" ("id", "moduleId", "position", "title", "description", "tip", "imageUrl", "attachments", "quiz") VALUES ('m4', 'matriz', 3, 'Montar peça', 'Limpe as superfícies, confira a orientação e monte as mini peças até formar o conjunto.', 'O encaixe correto não exige força: confirme o alinhamento antes de pressionar.', NULL, '[]', '{"question":"Como saber se o encaixe das mini peças está correto?","options":["Ele exige muita força","Ele entra sem força, com o alinhamento conferido","Basta ouvir um clique"],"correctIndex":1,"explanation":"Encaixe correto não exige força: confirme o alinhamento antes de pressionar."}') ON CONFLICT DO NOTHING;
INSERT INTO "learning_steps" ("id", "moduleId", "position", "title", "description", "tip", "imageUrl", "attachments", "quiz") VALUES ('t1', 'torno', 0, 'Conhecer o torno', 'Identifique placa, contraponto, carro e pontos de risco antes de ligar a máquina.', 'Nunca aproxime a mão de uma peça em rotação.', NULL, '[]', '{"question":"Qual regra de segurança vale com o torno ligado?","options":["Aproximar a mão para sentir a vibração","Nunca aproximar a mão de uma peça em rotação","Limpar o cavaco com a mão"],"correctIndex":1,"explanation":"Peça em rotação pode puxar a mão ou a roupa."}') ON CONFLICT DO NOTHING;
INSERT INTO "learning_steps" ("id", "moduleId", "position", "title", "description", "tip", "imageUrl", "attachments", "quiz") VALUES ('t2', 'torno', 1, 'Fixar e centralizar', 'Prenda a peça corretamente e confirme o alinhamento com o relógio comparador.', 'Uma fixação estável reduz vibração e melhora o acabamento.', NULL, '[]', '{"question":"Qual instrumento confirma o alinhamento da peça no torno?","options":["Relógio comparador","Trena","Esquadro de madeira"],"correctIndex":0,"explanation":"O relógio comparador mostra o batimento da peça ao girar."}') ON CONFLICT DO NOTHING;
INSERT INTO "learning_steps" ("id", "moduleId", "position", "title", "description", "tip", "imageUrl", "attachments", "quiz") VALUES ('t3', 'torno', 2, 'Executar o passe', 'Selecione avanço e profundidade adequados ao material e acompanhe a formação do cavaco.', 'Faça passes leves até alcançar a medida de acabamento.', NULL, '[]', '{"question":"Como alcançar a medida de acabamento com segurança?","options":["Um único passe profundo","Passes leves até a medida","Aumentar ao máximo o avanço"],"correctIndex":1,"explanation":"Passes leves dão controle dimensional e melhor acabamento."}') ON CONFLICT DO NOTHING;

-- Vínculos opcionais que apontam para linhas inseridas depois.
UPDATE "classrooms" SET "teacherId" = 1 WHERE "id" = 1 AND "teacherId" IS NULL;
UPDATE "classrooms" SET "teacherId" = 1 WHERE "id" = 2 AND "teacherId" IS NULL;
UPDATE "inventory_loans" SET "moduleId" = 'matriz' WHERE "id" = 1 AND "moduleId" IS NULL;
UPDATE "inventory_loans" SET "moduleId" = 'matriz' WHERE "id" = 2 AND "moduleId" IS NULL;
UPDATE "inventory_movements" SET "moduleId" = 'torno' WHERE "id" = 10 AND "moduleId" IS NULL;
UPDATE "inventory_movements" SET "moduleId" = 'matriz' WHERE "id" = 11 AND "moduleId" IS NULL;
UPDATE "inventory_movements" SET "moduleId" = 'matriz' WHERE "id" = 12 AND "moduleId" IS NULL;
UPDATE "inventory_movements" SET "moduleId" = 'matriz' WHERE "id" = 13 AND "moduleId" IS NULL;
UPDATE "inventory_movements" SET "moduleId" = 'matriz' WHERE "id" = 14 AND "moduleId" IS NULL;

-- Os próximos ids continuam depois dos inseridos acima.
SELECT setval(pg_get_serial_sequence('"classrooms"', 'id'), GREATEST((SELECT COALESCE(MAX("id"), 0) FROM "classrooms"), 1), (SELECT COUNT(*) > 0 FROM "classrooms"));
SELECT setval(pg_get_serial_sequence('"instructors"', 'id'), GREATEST((SELECT COALESCE(MAX("id"), 0) FROM "instructors"), 1), (SELECT COUNT(*) > 0 FROM "instructors"));
SELECT setval(pg_get_serial_sequence('"users"', 'id'), GREATEST((SELECT COALESCE(MAX("id"), 0) FROM "users"), 1), (SELECT COUNT(*) > 0 FROM "users"));
SELECT setval(pg_get_serial_sequence('"inventory_audit_log"', 'id'), GREATEST((SELECT COALESCE(MAX("id"), 0) FROM "inventory_audit_log"), 1), (SELECT COUNT(*) > 0 FROM "inventory_audit_log"));
SELECT setval(pg_get_serial_sequence('"inventory_categories"', 'id'), GREATEST((SELECT COALESCE(MAX("id"), 0) FROM "inventory_categories"), 1), (SELECT COUNT(*) > 0 FROM "inventory_categories"));
SELECT setval(pg_get_serial_sequence('"inventory_items"', 'id'), GREATEST((SELECT COALESCE(MAX("id"), 0) FROM "inventory_items"), 1), (SELECT COUNT(*) > 0 FROM "inventory_items"));
SELECT setval(pg_get_serial_sequence('"inventory_loans"', 'id'), GREATEST((SELECT COALESCE(MAX("id"), 0) FROM "inventory_loans"), 1), (SELECT COUNT(*) > 0 FROM "inventory_loans"));
SELECT setval(pg_get_serial_sequence('"inventory_movements"', 'id'), GREATEST((SELECT COALESCE(MAX("id"), 0) FROM "inventory_movements"), 1), (SELECT COUNT(*) > 0 FROM "inventory_movements"));
SELECT setval(pg_get_serial_sequence('"student_badges"', 'id'), GREATEST((SELECT COALESCE(MAX("id"), 0) FROM "student_badges"), 1), (SELECT COUNT(*) > 0 FROM "student_badges"));
SELECT setval(pg_get_serial_sequence('"student_progress"', 'id'), GREATEST((SELECT COALESCE(MAX("id"), 0) FROM "student_progress"), 1), (SELECT COUNT(*) > 0 FROM "student_progress"));
SELECT setval(pg_get_serial_sequence('"student_quiz_attempts"', 'id'), GREATEST((SELECT COALESCE(MAX("id"), 0) FROM "student_quiz_attempts"), 1), (SELECT COUNT(*) > 0 FROM "student_quiz_attempts"));
SELECT setval(pg_get_serial_sequence('"student_step_sessions"', 'id'), GREATEST((SELECT COALESCE(MAX("id"), 0) FROM "student_step_sessions"), 1), (SELECT COUNT(*) > 0 FROM "student_step_sessions"));

COMMIT;
