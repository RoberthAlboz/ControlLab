CREATE TABLE IF NOT EXISTS "stored_files" (
	"key" text PRIMARY KEY NOT NULL,
	"contentType" text NOT NULL,
	"size" integer NOT NULL,
	"data" bytea NOT NULL,
	"createdAt" bigint NOT NULL DEFAULT (unixepoch() * 1000)
);
--> statement-breakpoint
ALTER TABLE "stored_files" ENABLE ROW LEVEL SECURITY;
