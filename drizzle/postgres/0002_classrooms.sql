CREATE TABLE IF NOT EXISTS "classrooms" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"teacherId" integer,
	"archivedAt" bigint,
	"createdAt" bigint NOT NULL DEFAULT (unixepoch() * 1000),
	"updatedAt" bigint NOT NULL DEFAULT (unixepoch() * 1000),
	FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "classrooms_name_unique" ON "classrooms" ("name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "classrooms_teacher_idx" ON "classrooms" ("teacherId");
--> statement-breakpoint
DROP TRIGGER IF EXISTS "classrooms_fill_id" ON "classrooms";
--> statement-breakpoint
CREATE TRIGGER "classrooms_fill_id" BEFORE INSERT ON "classrooms" FOR EACH ROW EXECUTE FUNCTION public.controllab_fill_serial_id();
--> statement-breakpoint
ALTER TABLE "classrooms" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "classroomId" integer REFERENCES "classrooms"("id") ON DELETE set null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_classroom_idx" ON "users" ("classroomId");
--> statement-breakpoint
ALTER TABLE "inventory_loans" ADD COLUMN IF NOT EXISTS "classroomId" integer REFERENCES "classrooms"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN IF NOT EXISTS "classroomId" integer REFERENCES "classrooms"("id") ON DELETE set null;
