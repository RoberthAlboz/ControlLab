PRAGMA foreign_keys=OFF;--> statement-breakpoint
-- Linhas órfãs (aluno ou módulo inexistente) não passariam nas novas FKs.
DELETE FROM `student_progress` WHERE `userId` NOT IN (SELECT `id` FROM `users`) OR `moduleId` NOT IN (SELECT `id` FROM `learning_modules`);--> statement-breakpoint
DELETE FROM `student_step_sessions` WHERE `userId` NOT IN (SELECT `id` FROM `users`) OR `moduleId` NOT IN (SELECT `id` FROM `learning_modules`);--> statement-breakpoint
DELETE FROM `student_badges` WHERE `userId` NOT IN (SELECT `id` FROM `users`);--> statement-breakpoint
DELETE FROM `learning_steps` WHERE `moduleId` NOT IN (SELECT `id` FROM `learning_modules`);--> statement-breakpoint
DELETE FROM `learning_resources` WHERE `moduleId` NOT IN (SELECT `id` FROM `learning_modules`);--> statement-breakpoint
DELETE FROM `learning_activities` WHERE `moduleId` NOT IN (SELECT `id` FROM `learning_modules`);--> statement-breakpoint
UPDATE `learning_activities` SET `createdBy` = NULL WHERE `createdBy` NOT IN (SELECT `id` FROM `users`);--> statement-breakpoint
UPDATE `learning_modules` SET `createdBy` = NULL WHERE `createdBy` NOT IN (SELECT `id` FROM `users`);--> statement-breakpoint
CREATE TABLE `__new_student_progress` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`moduleId` text NOT NULL,
	`stepIndex` integer DEFAULT 0 NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`studiedMinutes` integer DEFAULT 0 NOT NULL,
	`streakDays` integer DEFAULT 0 NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`moduleId`) REFERENCES `learning_modules`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_student_progress`("id", "userId", "moduleId", "stepIndex", "progress", "studiedMinutes", "streakDays", "updatedAt") SELECT "id", "userId", "moduleId", "stepIndex", "progress", "studiedMinutes", "streakDays", "updatedAt" FROM `student_progress`;--> statement-breakpoint
DROP TABLE `student_progress`;--> statement-breakpoint
ALTER TABLE `__new_student_progress` RENAME TO `student_progress`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `student_progress_user_module_unique` ON `student_progress` (`userId`,`moduleId`);--> statement-breakpoint
CREATE TABLE `__new_learning_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`moduleId` text NOT NULL,
	`title` text NOT NULL,
	`subtitle` text NOT NULL,
	`activityType` text NOT NULL,
	`startsAt` integer NOT NULL,
	`endsAt` integer NOT NULL,
	`color` text NOT NULL,
	`createdBy` integer,
	FOREIGN KEY (`moduleId`) REFERENCES `learning_modules`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_learning_activities`("id", "moduleId", "title", "subtitle", "activityType", "startsAt", "endsAt", "color", "createdBy") SELECT "id", "moduleId", "title", "subtitle", "activityType", "startsAt", "endsAt", "color", "createdBy" FROM `learning_activities`;--> statement-breakpoint
DROP TABLE `learning_activities`;--> statement-breakpoint
ALTER TABLE `__new_learning_activities` RENAME TO `learning_activities`;--> statement-breakpoint
CREATE INDEX `learning_activities_created_by_idx` ON `learning_activities` (`createdBy`);--> statement-breakpoint
CREATE TABLE `__new_learning_modules` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`description` text NOT NULL,
	`objective` text NOT NULL,
	`cover` text NOT NULL,
	`coverImage` text,
	`progress` integer DEFAULT 0 NOT NULL,
	`duration` text NOT NULL,
	`published` integer DEFAULT 0 NOT NULL,
	`createdBy` integer,
	`archivedAt` integer,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_learning_modules`("id", "code", "title", "kind", "description", "objective", "cover", "coverImage", "progress", "duration", "published", "createdBy", "archivedAt", "createdAt", "updatedAt") SELECT "id", "code", "title", "kind", "description", "objective", "cover", "coverImage", "progress", "duration", "published", "createdBy", "archivedAt", "createdAt", "updatedAt" FROM `learning_modules`;--> statement-breakpoint
DROP TABLE `learning_modules`;--> statement-breakpoint
ALTER TABLE `__new_learning_modules` RENAME TO `learning_modules`;--> statement-breakpoint
CREATE INDEX `learning_modules_published_idx` ON `learning_modules` (`published`);--> statement-breakpoint
CREATE INDEX `learning_modules_archived_idx` ON `learning_modules` (`archivedAt`);--> statement-breakpoint
CREATE TABLE `__new_learning_resources` (
	`id` text PRIMARY KEY NOT NULL,
	`moduleId` text NOT NULL,
	`category` text NOT NULL,
	`label` text NOT NULL,
	`title` text NOT NULL,
	`detail` text NOT NULL,
	`status` text NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`modelUrl` text NOT NULL,
	`attachments` text DEFAULT '[]' NOT NULL,
	`color` text NOT NULL,
	`inventoryItemId` integer,
	FOREIGN KEY (`moduleId`) REFERENCES `learning_modules`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`inventoryItemId`) REFERENCES `inventory_items`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_learning_resources`("id", "moduleId", "category", "label", "title", "detail", "status", "progress", "modelUrl", "attachments", "color", "inventoryItemId") SELECT "id", "moduleId", "category", "label", "title", "detail", "status", "progress", "modelUrl", "attachments", "color", "inventoryItemId" FROM `learning_resources`;--> statement-breakpoint
DROP TABLE `learning_resources`;--> statement-breakpoint
ALTER TABLE `__new_learning_resources` RENAME TO `learning_resources`;--> statement-breakpoint
CREATE INDEX `learning_resources_module_idx` ON `learning_resources` (`moduleId`);--> statement-breakpoint
CREATE INDEX `learning_resources_inventory_idx` ON `learning_resources` (`inventoryItemId`);--> statement-breakpoint
CREATE TABLE `__new_learning_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`moduleId` text NOT NULL,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`tip` text NOT NULL,
	`imageUrl` text,
	`attachments` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`moduleId`) REFERENCES `learning_modules`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_learning_steps`("id", "moduleId", "position", "title", "description", "tip", "imageUrl", "attachments") SELECT "id", "moduleId", "position", "title", "description", "tip", "imageUrl", "attachments" FROM `learning_steps`;--> statement-breakpoint
DROP TABLE `learning_steps`;--> statement-breakpoint
ALTER TABLE `__new_learning_steps` RENAME TO `learning_steps`;--> statement-breakpoint
CREATE INDEX `learning_steps_module_idx` ON `learning_steps` (`moduleId`);--> statement-breakpoint
CREATE TABLE `__new_student_badges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`label` text NOT NULL,
	`detail` text NOT NULL,
	`awardedBy` integer NOT NULL,
	`awardedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_student_badges`("id", "userId", "label", "detail", "awardedBy", "awardedAt") SELECT "id", "userId", "label", "detail", "awardedBy", "awardedAt" FROM `student_badges`;--> statement-breakpoint
DROP TABLE `student_badges`;--> statement-breakpoint
ALTER TABLE `__new_student_badges` RENAME TO `student_badges`;--> statement-breakpoint
CREATE INDEX `student_badges_user_idx` ON `student_badges` (`userId`);--> statement-breakpoint
CREATE TABLE `__new_student_step_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`moduleId` text NOT NULL,
	`stepIndex` integer NOT NULL,
	`startedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`completedAt` integer,
	`elapsedSeconds` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`moduleId`) REFERENCES `learning_modules`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_student_step_sessions`("id", "userId", "moduleId", "stepIndex", "startedAt", "completedAt", "elapsedSeconds") SELECT "id", "userId", "moduleId", "stepIndex", "startedAt", "completedAt", "elapsedSeconds" FROM `student_step_sessions`;--> statement-breakpoint
DROP TABLE `student_step_sessions`;--> statement-breakpoint
ALTER TABLE `__new_student_step_sessions` RENAME TO `student_step_sessions`;--> statement-breakpoint
CREATE UNIQUE INDEX `student_step_sessions_user_step_idx` ON `student_step_sessions` (`userId`,`moduleId`,`stepIndex`);--> statement-breakpoint
CREATE INDEX `student_step_sessions_module_idx` ON `student_step_sessions` (`userId`,`moduleId`);