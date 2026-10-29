CREATE TABLE `student_notes` (
	`userId` integer PRIMARY KEY NOT NULL,
	`content` text DEFAULT '[]' NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `learning_modules` ADD `archivedAt` integer;--> statement-breakpoint
CREATE INDEX `learning_modules_archived_idx` ON `learning_modules` (`archivedAt`);--> statement-breakpoint
ALTER TABLE `learning_activities` ADD `createdBy` integer;--> statement-breakpoint
CREATE INDEX `learning_activities_created_by_idx` ON `learning_activities` (`createdBy`);