-- ===========================================================================
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
$$;
--> statement-breakpoint
-- O SQLite gera o id quando a aplicação envia NULL; no Postgres este gatilho
-- faz o mesmo, usando a sequência da coluna serial.
CREATE OR REPLACE FUNCTION public.controllab_fill_serial_id() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.id IS NULL THEN
    NEW.id := nextval(pg_get_serial_sequence(format('%I.%I', TG_TABLE_SCHEMA, TG_TABLE_NAME), 'id'));
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
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
);

--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique" ON "users" ("email");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_openId_unique" ON "users" ("openId");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_sessions" (
	"jti" text PRIMARY KEY NOT NULL,
	"openId" text NOT NULL,
	"expiresAt" bigint NOT NULL,
	"revokedAt" bigint,
	"createdAt" bigint NOT NULL DEFAULT (unixepoch() * 1000)
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_sessions_open_id_idx" ON "auth_sessions" ("openId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_sessions_active_idx" ON "auth_sessions" ("revokedAt","expiresAt");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_badges" (
	"id" serial PRIMARY KEY,
	"userId" integer NOT NULL,
	"label" text NOT NULL,
	"detail" text NOT NULL,
	"awardedBy" integer NOT NULL,
	"awardedAt" bigint NOT NULL DEFAULT (unixepoch() * 1000)
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_badges_user_idx" ON "student_badges" ("userId");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "learning_modules" (
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
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learning_modules_published_idx" ON "learning_modules" ("published");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "learning_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"moduleId" text NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"tip" text NOT NULL,
	"imageUrl" text
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learning_steps_module_idx" ON "learning_steps" ("moduleId");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "learning_resources" (
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
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learning_resources_module_idx" ON "learning_resources" ("moduleId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learning_resources_inventory_idx" ON "learning_resources" ("inventoryItemId");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_progress" (
	"id" serial PRIMARY KEY,
	"userId" integer NOT NULL,
	"moduleId" text NOT NULL,
	"stepIndex" integer NOT NULL DEFAULT 0,
	"progress" integer NOT NULL DEFAULT 0,
	"studiedMinutes" integer NOT NULL DEFAULT 0,
	"streakDays" integer NOT NULL DEFAULT 0,
	"updatedAt" bigint NOT NULL DEFAULT (unixepoch() * 1000)
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_progress_user_module_idx" ON "student_progress" ("userId","moduleId");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "student_progress_user_module_unique" ON "student_progress" ("userId","moduleId");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_step_sessions" (
	"id" serial PRIMARY KEY,
	"userId" integer NOT NULL,
	"moduleId" text NOT NULL,
	"stepIndex" integer NOT NULL,
	"startedAt" bigint NOT NULL DEFAULT (unixepoch() * 1000),
	"completedAt" bigint,
	"elapsedSeconds" integer NOT NULL DEFAULT 0
);

--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "student_step_sessions_user_step_idx" ON "student_step_sessions" ("userId","moduleId","stepIndex");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_step_sessions_module_idx" ON "student_step_sessions" ("userId","moduleId");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "instructors" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"badge" text NOT NULL,
	"initials" text NOT NULL,
	"avatarUrl" text,
	"active" integer NOT NULL DEFAULT 1,
	"createdAt" bigint NOT NULL DEFAULT (unixepoch() * 1000)
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "learning_activities" (
	"id" text PRIMARY KEY NOT NULL,
	"moduleId" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text NOT NULL,
	"activityType" text NOT NULL,
	"startsAt" bigint NOT NULL,
	"endsAt" bigint NOT NULL,
	"color" text NOT NULL
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inventory_categories" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"description" text,
	"archivedAt" bigint,
	"createdBy" integer,
	"createdAt" bigint NOT NULL DEFAULT (unixepoch() * 1000),
	"updatedAt" bigint NOT NULL DEFAULT (unixepoch() * 1000),
	FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON UPDATE no action ON DELETE set null
);

--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_categories_name_unique" ON "inventory_categories" ("name");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inventory_items" (
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
);

--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_items_code_unique" ON "inventory_items" ("code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_items_sap_idx" ON "inventory_items" ("sapCode");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_items_type_idx" ON "inventory_items" ("itemType");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_items_category_idx" ON "inventory_items" ("categoryId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_items_archived_idx" ON "inventory_items" ("archivedAt");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inventory_loans" (
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
);

--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_loans_request_key_unique" ON "inventory_loans" ("requestKey");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_loans_item_idx" ON "inventory_loans" ("itemId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_loans_status_idx" ON "inventory_loans" ("status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inventory_movements" (
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
);

--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_movements_request_key_unique" ON "inventory_movements" ("requestKey");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_movements_item_idx" ON "inventory_movements" ("itemId","createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_movements_type_idx" ON "inventory_movements" ("movementType");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_movements_user_idx" ON "inventory_movements" ("userId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_movements_loan_idx" ON "inventory_movements" ("loanId");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inventory_audit_log" (
	"id" serial PRIMARY KEY,
	"entityType" text NOT NULL,
	"entityId" integer NOT NULL,
	"action" text NOT NULL,
	"changes" text NOT NULL,
	"userId" integer NOT NULL,
	"createdAt" bigint NOT NULL DEFAULT (unixepoch() * 1000),
	FOREIGN KEY ("userId") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_audit_entity_idx" ON "inventory_audit_log" ("entityType","entityId");

--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'learning_resources_inventory_fk') THEN
    ALTER TABLE "learning_resources" ADD CONSTRAINT "learning_resources_inventory_fk"
      FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON UPDATE cascade ON DELETE set null;
  END IF;
END
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "users_fill_id" ON "users";
--> statement-breakpoint
CREATE TRIGGER "users_fill_id" BEFORE INSERT ON "users" FOR EACH ROW EXECUTE FUNCTION public.controllab_fill_serial_id();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "student_badges_fill_id" ON "student_badges";
--> statement-breakpoint
CREATE TRIGGER "student_badges_fill_id" BEFORE INSERT ON "student_badges" FOR EACH ROW EXECUTE FUNCTION public.controllab_fill_serial_id();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "student_progress_fill_id" ON "student_progress";
--> statement-breakpoint
CREATE TRIGGER "student_progress_fill_id" BEFORE INSERT ON "student_progress" FOR EACH ROW EXECUTE FUNCTION public.controllab_fill_serial_id();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "student_step_sessions_fill_id" ON "student_step_sessions";
--> statement-breakpoint
CREATE TRIGGER "student_step_sessions_fill_id" BEFORE INSERT ON "student_step_sessions" FOR EACH ROW EXECUTE FUNCTION public.controllab_fill_serial_id();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "instructors_fill_id" ON "instructors";
--> statement-breakpoint
CREATE TRIGGER "instructors_fill_id" BEFORE INSERT ON "instructors" FOR EACH ROW EXECUTE FUNCTION public.controllab_fill_serial_id();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "inventory_categories_fill_id" ON "inventory_categories";
--> statement-breakpoint
CREATE TRIGGER "inventory_categories_fill_id" BEFORE INSERT ON "inventory_categories" FOR EACH ROW EXECUTE FUNCTION public.controllab_fill_serial_id();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "inventory_items_fill_id" ON "inventory_items";
--> statement-breakpoint
CREATE TRIGGER "inventory_items_fill_id" BEFORE INSERT ON "inventory_items" FOR EACH ROW EXECUTE FUNCTION public.controllab_fill_serial_id();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "inventory_loans_fill_id" ON "inventory_loans";
--> statement-breakpoint
CREATE TRIGGER "inventory_loans_fill_id" BEFORE INSERT ON "inventory_loans" FOR EACH ROW EXECUTE FUNCTION public.controllab_fill_serial_id();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "inventory_movements_fill_id" ON "inventory_movements";
--> statement-breakpoint
CREATE TRIGGER "inventory_movements_fill_id" BEFORE INSERT ON "inventory_movements" FOR EACH ROW EXECUTE FUNCTION public.controllab_fill_serial_id();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "inventory_audit_log_fill_id" ON "inventory_audit_log";
--> statement-breakpoint
CREATE TRIGGER "inventory_audit_log_fill_id" BEFORE INSERT ON "inventory_audit_log" FOR EACH ROW EXECUTE FUNCTION public.controllab_fill_serial_id();
--> statement-breakpoint
-- Supabase expõe o schema public pela API REST (chave anon). O Control Lab acessa
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
ALTER TABLE "inventory_audit_log" ENABLE ROW LEVEL SECURITY;
