CREATE TABLE `instructors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`role` varchar(120) NOT NULL,
	`badge` varchar(80) NOT NULL,
	`initials` varchar(8) NOT NULL,
	`avatarUrl` text,
	`active` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `instructors_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `learning_activities` (
	`id` varchar(64) NOT NULL,
	`moduleId` varchar(64) NOT NULL,
	`title` varchar(180) NOT NULL,
	`subtitle` varchar(180) NOT NULL,
	`activityType` enum('aula','laboratorio','avaliacao') NOT NULL,
	`startsAt` timestamp NOT NULL,
	`endsAt` timestamp NOT NULL,
	`color` varchar(32) NOT NULL,
	CONSTRAINT `learning_activities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `learning_modules` (
	`id` varchar(64) NOT NULL,
	`code` varchar(32) NOT NULL,
	`title` varchar(180) NOT NULL,
	`kind` enum('Ferramenta','Montagem','Processo') NOT NULL,
	`description` text NOT NULL,
	`objective` text NOT NULL,
	`cover` varchar(32) NOT NULL,
	`coverImage` text,
	`progress` int NOT NULL DEFAULT 0,
	`duration` varchar(32) NOT NULL,
	`published` int NOT NULL DEFAULT 0,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `learning_modules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `learning_resources` (
	`id` varchar(64) NOT NULL,
	`moduleId` varchar(64) NOT NULL,
	`category` enum('materials','machines','tools','parts') NOT NULL,
	`label` varchar(80) NOT NULL,
	`title` varchar(180) NOT NULL,
	`detail` text NOT NULL,
	`status` varchar(80) NOT NULL,
	`progress` int NOT NULL DEFAULT 0,
	`modelUrl` text NOT NULL,
	`color` varchar(32) NOT NULL,
	CONSTRAINT `learning_resources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `learning_steps` (
	`id` varchar(64) NOT NULL,
	`moduleId` varchar(64) NOT NULL,
	`position` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`description` text NOT NULL,
	`tip` text NOT NULL,
	`imageUrl` text,
	CONSTRAINT `learning_steps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `student_progress` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`moduleId` varchar(64) NOT NULL,
	`stepIndex` int NOT NULL DEFAULT 0,
	`progress` int NOT NULL DEFAULT 0,
	`studiedMinutes` int NOT NULL DEFAULT 0,
	`streakDays` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `student_progress_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
--> statement-breakpoint
CREATE INDEX `learning_modules_published_idx` ON `learning_modules` (`published`);--> statement-breakpoint
CREATE INDEX `learning_resources_module_idx` ON `learning_resources` (`moduleId`);--> statement-breakpoint
CREATE INDEX `learning_steps_module_idx` ON `learning_steps` (`moduleId`);--> statement-breakpoint
CREATE INDEX `student_progress_user_module_idx` ON `student_progress` (`userId`,`moduleId`);