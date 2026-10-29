ALTER TABLE "learning_resources" ADD COLUMN IF NOT EXISTS "attachments" text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE "learning_steps" ADD COLUMN IF NOT EXISTS "attachments" text DEFAULT '[]' NOT NULL;
