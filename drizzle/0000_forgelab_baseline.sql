-- ForgeLab — migration base SQLite (integração ForgeLab + ControlLab).
-- Gerada a partir de drizzle/schema.ts. Para mudanças futuras use `pnpm db:generate`.
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`openId` text NOT NULL,
	`name` text,
	`email` text,
	`avatarUrl` text,
	`loginMethod` text,
	`passwordHash` text,
	`role` text NOT NULL DEFAULT 'student',
	`active` integer NOT NULL DEFAULT 1,
	`createdAt` integer NOT NULL DEFAULT (unixepoch() * 1000),
	`updatedAt` integer NOT NULL DEFAULT (unixepoch() * 1000),
	`lastSignedIn` integer NOT NULL DEFAULT (unixepoch() * 1000)
);

--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_openId_unique` ON `users` (`openId`);
--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`jti` text PRIMARY KEY NOT NULL,
	`openId` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`revokedAt` integer,
	`createdAt` integer NOT NULL DEFAULT (unixepoch() * 1000)
);

--> statement-breakpoint
CREATE INDEX `auth_sessions_open_id_idx` ON `auth_sessions` (`openId`);
--> statement-breakpoint
CREATE INDEX `auth_sessions_active_idx` ON `auth_sessions` (`revokedAt`,`expiresAt`);
--> statement-breakpoint
CREATE TABLE `student_badges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`label` text NOT NULL,
	`detail` text NOT NULL,
	`awardedBy` integer NOT NULL,
	`awardedAt` integer NOT NULL DEFAULT (unixepoch() * 1000)
);

--> statement-breakpoint
CREATE INDEX `student_badges_user_idx` ON `student_badges` (`userId`);
--> statement-breakpoint
CREATE TABLE `learning_modules` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`description` text NOT NULL,
	`objective` text NOT NULL,
	`cover` text NOT NULL,
	`coverImage` text,
	`progress` integer NOT NULL DEFAULT 0,
	`duration` text NOT NULL,
	`published` integer NOT NULL DEFAULT 0,
	`createdBy` integer,
	`createdAt` integer NOT NULL DEFAULT (unixepoch() * 1000),
	`updatedAt` integer NOT NULL DEFAULT (unixepoch() * 1000)
);

--> statement-breakpoint
CREATE INDEX `learning_modules_published_idx` ON `learning_modules` (`published`);
--> statement-breakpoint
CREATE TABLE `learning_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`moduleId` text NOT NULL,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`tip` text NOT NULL,
	`imageUrl` text
);

--> statement-breakpoint
CREATE INDEX `learning_steps_module_idx` ON `learning_steps` (`moduleId`);
--> statement-breakpoint
CREATE TABLE `learning_resources` (
	`id` text PRIMARY KEY NOT NULL,
	`moduleId` text NOT NULL,
	`category` text NOT NULL,
	`label` text NOT NULL,
	`title` text NOT NULL,
	`detail` text NOT NULL,
	`status` text NOT NULL,
	`progress` integer NOT NULL DEFAULT 0,
	`modelUrl` text NOT NULL,
	`color` text NOT NULL,
	`inventoryItemId` integer,
	FOREIGN KEY (`inventoryItemId`) REFERENCES `inventory_items`(`id`) ON UPDATE cascade ON DELETE set null
);

--> statement-breakpoint
CREATE INDEX `learning_resources_module_idx` ON `learning_resources` (`moduleId`);
--> statement-breakpoint
CREATE INDEX `learning_resources_inventory_idx` ON `learning_resources` (`inventoryItemId`);
--> statement-breakpoint
CREATE TABLE `student_progress` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`moduleId` text NOT NULL,
	`stepIndex` integer NOT NULL DEFAULT 0,
	`progress` integer NOT NULL DEFAULT 0,
	`studiedMinutes` integer NOT NULL DEFAULT 0,
	`streakDays` integer NOT NULL DEFAULT 0,
	`updatedAt` integer NOT NULL DEFAULT (unixepoch() * 1000)
);

--> statement-breakpoint
CREATE INDEX `student_progress_user_module_idx` ON `student_progress` (`userId`,`moduleId`);
--> statement-breakpoint
CREATE UNIQUE INDEX `student_progress_user_module_unique` ON `student_progress` (`userId`,`moduleId`);
--> statement-breakpoint
CREATE TABLE `student_step_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`moduleId` text NOT NULL,
	`stepIndex` integer NOT NULL,
	`startedAt` integer NOT NULL DEFAULT (unixepoch() * 1000),
	`completedAt` integer,
	`elapsedSeconds` integer NOT NULL DEFAULT 0
);

--> statement-breakpoint
CREATE UNIQUE INDEX `student_step_sessions_user_step_idx` ON `student_step_sessions` (`userId`,`moduleId`,`stepIndex`);
--> statement-breakpoint
CREATE INDEX `student_step_sessions_module_idx` ON `student_step_sessions` (`userId`,`moduleId`);
--> statement-breakpoint
CREATE TABLE `instructors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`badge` text NOT NULL,
	`initials` text NOT NULL,
	`avatarUrl` text,
	`active` integer NOT NULL DEFAULT 1,
	`createdAt` integer NOT NULL DEFAULT (unixepoch() * 1000)
);

--> statement-breakpoint
CREATE TABLE `learning_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`moduleId` text NOT NULL,
	`title` text NOT NULL,
	`subtitle` text NOT NULL,
	`activityType` text NOT NULL,
	`startsAt` integer NOT NULL,
	`endsAt` integer NOT NULL,
	`color` text NOT NULL
);

--> statement-breakpoint
CREATE TABLE `inventory_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`archivedAt` integer,
	`createdBy` integer,
	`createdAt` integer NOT NULL DEFAULT (unixepoch() * 1000),
	`updatedAt` integer NOT NULL DEFAULT (unixepoch() * 1000),
	FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);

--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_categories_name_unique` ON `inventory_categories` (`name`);
--> statement-breakpoint
CREATE TABLE `inventory_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`sapCode` text,
	`name` text NOT NULL,
	`description` text,
	`itemType` text NOT NULL,
	`categoryId` integer,
	`unit` text NOT NULL DEFAULT 'UN',
	`returnable` integer NOT NULL DEFAULT 1,
	`quantityPhysical` integer NOT NULL DEFAULT 0,
	`quantityReserved` integer NOT NULL DEFAULT 0,
	`minQuantity` integer NOT NULL DEFAULT 0,
	`sector` text NOT NULL,
	`location` text NOT NULL,
	`conservation` text NOT NULL DEFAULT 'bom',
	`status` text NOT NULL DEFAULT 'disponivel',
	`version` integer NOT NULL DEFAULT 0,
	`archivedAt` integer,
	`archivedBy` integer,
	`archiveReason` text,
	`createdBy` integer,
	`updatedBy` integer,
	`createdAt` integer NOT NULL DEFAULT (unixepoch() * 1000),
	`updatedAt` integer NOT NULL DEFAULT (unixepoch() * 1000),
	FOREIGN KEY (`categoryId`) REFERENCES `inventory_categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updatedBy`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`archivedBy`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "inventory_items_physical_check" CHECK(`quantityPhysical` >= 0),
	CONSTRAINT "inventory_items_reserved_check" CHECK(`quantityReserved` >= 0 AND `quantityReserved` <= `quantityPhysical`),
	CONSTRAINT "inventory_items_min_check" CHECK(`minQuantity` >= 0)
);

--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_items_code_unique` ON `inventory_items` (`code`);
--> statement-breakpoint
CREATE INDEX `inventory_items_sap_idx` ON `inventory_items` (`sapCode`);
--> statement-breakpoint
CREATE INDEX `inventory_items_type_idx` ON `inventory_items` (`itemType`);
--> statement-breakpoint
CREATE INDEX `inventory_items_category_idx` ON `inventory_items` (`categoryId`);
--> statement-breakpoint
CREATE INDEX `inventory_items_archived_idx` ON `inventory_items` (`archivedAt`);
--> statement-breakpoint
CREATE TABLE `inventory_loans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`itemId` integer NOT NULL,
	`borrowerUserId` integer,
	`borrowerName` text NOT NULL,
	`quantity` integer NOT NULL,
	`returnedQuantity` integer NOT NULL DEFAULT 0,
	`damagedQuantity` integer NOT NULL DEFAULT 0,
	`status` text NOT NULL DEFAULT 'reservado',
	`purpose` text NOT NULL,
	`moduleId` text,
	`dueAt` integer,
	`cancelReason` text,
	`requestKey` text,
	`createdBy` integer NOT NULL,
	`deliveredBy` integer,
	`closedBy` integer,
	`createdAt` integer NOT NULL DEFAULT (unixepoch() * 1000),
	`deliveredAt` integer,
	`closedAt` integer,
	`updatedAt` integer NOT NULL DEFAULT (unixepoch() * 1000),
	FOREIGN KEY (`itemId`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`borrowerUserId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`moduleId`) REFERENCES `learning_modules`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deliveredBy`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`closedBy`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "inventory_loans_quantity_check" CHECK(`quantity` > 0),
	CONSTRAINT "inventory_loans_return_check" CHECK(`returnedQuantity` >= 0 AND `damagedQuantity` >= 0 AND `returnedQuantity` + `damagedQuantity` <= `quantity`)
);

--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_loans_request_key_unique` ON `inventory_loans` (`requestKey`);
--> statement-breakpoint
CREATE INDEX `inventory_loans_item_idx` ON `inventory_loans` (`itemId`);
--> statement-breakpoint
CREATE INDEX `inventory_loans_status_idx` ON `inventory_loans` (`status`);
--> statement-breakpoint
CREATE TABLE `inventory_movements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`itemId` integer NOT NULL,
	`movementType` text NOT NULL,
	`quantity` integer NOT NULL,
	`physicalBefore` integer NOT NULL,
	`physicalAfter` integer NOT NULL,
	`reservedBefore` integer NOT NULL,
	`reservedAfter` integer NOT NULL,
	`reason` text NOT NULL,
	`reference` text,
	`note` text,
	`loanId` integer,
	`moduleId` text,
	`moduleTitleSnapshot` text,
	`itemCodeSnapshot` text NOT NULL,
	`itemNameSnapshot` text NOT NULL,
	`unitSnapshot` text NOT NULL,
	`requestKey` text,
	`userId` integer NOT NULL,
	`createdAt` integer NOT NULL DEFAULT (unixepoch() * 1000),
	FOREIGN KEY (`itemId`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`loanId`) REFERENCES `inventory_loans`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`moduleId`) REFERENCES `learning_modules`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "inventory_movements_quantity_check" CHECK(`quantity` > 0),
	CONSTRAINT "inventory_movements_balance_check" CHECK(`physicalAfter` >= 0 AND `reservedAfter` >= 0 AND `reservedAfter` <= `physicalAfter`)
);

--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_movements_request_key_unique` ON `inventory_movements` (`requestKey`);
--> statement-breakpoint
CREATE INDEX `inventory_movements_item_idx` ON `inventory_movements` (`itemId`,`createdAt`);
--> statement-breakpoint
CREATE INDEX `inventory_movements_type_idx` ON `inventory_movements` (`movementType`);
--> statement-breakpoint
CREATE INDEX `inventory_movements_user_idx` ON `inventory_movements` (`userId`);
--> statement-breakpoint
CREATE INDEX `inventory_movements_loan_idx` ON `inventory_movements` (`loanId`);
--> statement-breakpoint
CREATE TABLE `inventory_audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entityType` text NOT NULL,
	`entityId` integer NOT NULL,
	`action` text NOT NULL,
	`changes` text NOT NULL,
	`userId` integer NOT NULL,
	`createdAt` integer NOT NULL DEFAULT (unixepoch() * 1000),
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);

--> statement-breakpoint
CREATE INDEX `inventory_audit_entity_idx` ON `inventory_audit_log` (`entityType`,`entityId`);
