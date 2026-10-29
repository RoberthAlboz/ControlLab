ALTER TABLE "learning_modules" ADD COLUMN IF NOT EXISTS "archivedAt" bigint;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learning_modules_archived_idx" ON "learning_modules" ("archivedAt");
--> statement-breakpoint
ALTER TABLE "learning_activities" ADD COLUMN IF NOT EXISTS "createdBy" integer;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learning_activities_created_by_idx" ON "learning_activities" ("createdBy");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_notes" (
	"userId" integer PRIMARY KEY NOT NULL,
	"content" text DEFAULT '[]' NOT NULL,
	"updatedAt" bigint NOT NULL DEFAULT (unixepoch() * 1000),
	FOREIGN KEY ("userId") REFERENCES "users"("id") ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE "student_notes" ENABLE ROW LEVEL SECURITY;
