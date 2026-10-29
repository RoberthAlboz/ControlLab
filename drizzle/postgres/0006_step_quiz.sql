CREATE TABLE IF NOT EXISTS "student_quiz_attempts" (
	"id" serial PRIMARY KEY,
	"userId" integer NOT NULL,
	"moduleId" text NOT NULL,
	"stepId" text NOT NULL,
	"selectedIndex" integer NOT NULL,
	"correct" integer NOT NULL,
	"createdAt" bigint NOT NULL DEFAULT (unixepoch() * 1000),
	CONSTRAINT "student_quiz_attempts_user_fk" FOREIGN KEY ("userId") REFERENCES "users"("id") ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "student_quiz_attempts_module_fk" FOREIGN KEY ("moduleId") REFERENCES "learning_modules"("id") ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_quiz_attempts_user_step_idx" ON "student_quiz_attempts" ("userId","stepId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_quiz_attempts_module_idx" ON "student_quiz_attempts" ("moduleId");
--> statement-breakpoint
DROP TRIGGER IF EXISTS "student_quiz_attempts_fill_id" ON "student_quiz_attempts";
--> statement-breakpoint
CREATE TRIGGER "student_quiz_attempts_fill_id" BEFORE INSERT ON "student_quiz_attempts" FOR EACH ROW EXECUTE FUNCTION public.controllab_fill_serial_id();
--> statement-breakpoint
ALTER TABLE "student_quiz_attempts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "learning_steps" ADD COLUMN IF NOT EXISTS "quiz" text;
