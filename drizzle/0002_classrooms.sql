CREATE TABLE `classrooms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`teacherId` integer,
	`archivedAt` integer,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`teacherId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `classrooms_name_unique` ON `classrooms` (`name`);--> statement-breakpoint
CREATE INDEX `classrooms_teacher_idx` ON `classrooms` (`teacherId`);--> statement-breakpoint
ALTER TABLE `inventory_loans` ADD `classroomId` integer REFERENCES classrooms(id);--> statement-breakpoint
ALTER TABLE `inventory_movements` ADD `classroomId` integer REFERENCES classrooms(id);--> statement-breakpoint
ALTER TABLE `users` ADD `classroomId` integer REFERENCES classrooms(id);--> statement-breakpoint
CREATE INDEX `users_classroom_idx` ON `users` (`classroomId`);