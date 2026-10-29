-- Linhas órfãs (aluno ou módulo inexistente) não passariam nas novas FKs.
DELETE FROM "student_progress" WHERE "userId" NOT IN (SELECT "id" FROM "users") OR "moduleId" NOT IN (SELECT "id" FROM "learning_modules");
--> statement-breakpoint
DELETE FROM "student_step_sessions" WHERE "userId" NOT IN (SELECT "id" FROM "users") OR "moduleId" NOT IN (SELECT "id" FROM "learning_modules");
--> statement-breakpoint
DELETE FROM "student_badges" WHERE "userId" NOT IN (SELECT "id" FROM "users");
--> statement-breakpoint
DELETE FROM "learning_steps" WHERE "moduleId" NOT IN (SELECT "id" FROM "learning_modules");
--> statement-breakpoint
DELETE FROM "learning_resources" WHERE "moduleId" NOT IN (SELECT "id" FROM "learning_modules");
--> statement-breakpoint
DELETE FROM "learning_activities" WHERE "moduleId" NOT IN (SELECT "id" FROM "learning_modules");
--> statement-breakpoint
UPDATE "learning_activities" SET "createdBy" = NULL WHERE "createdBy" NOT IN (SELECT "id" FROM "users");
--> statement-breakpoint
UPDATE "learning_modules" SET "createdBy" = NULL WHERE "createdBy" NOT IN (SELECT "id" FROM "users");
--> statement-breakpoint
DO $$
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
$$;
--> statement-breakpoint
-- O índice único de mesmas colunas já atende às consultas.
DROP INDEX IF EXISTS "student_progress_user_module_idx";
