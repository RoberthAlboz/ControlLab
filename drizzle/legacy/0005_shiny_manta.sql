CREATE TABLE `student_step_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`moduleId` varchar(64) NOT NULL,
	`stepIndex` int NOT NULL,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`elapsedSeconds` int NOT NULL DEFAULT 0,
	CONSTRAINT `student_step_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `student_step_sessions_user_step_idx` UNIQUE(`userId`,`moduleId`,`stepIndex`)
);
--> statement-breakpoint
CREATE INDEX `student_step_sessions_module_idx` ON `student_step_sessions` (`userId`,`moduleId`);