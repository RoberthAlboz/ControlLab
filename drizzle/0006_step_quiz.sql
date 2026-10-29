CREATE TABLE `student_quiz_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`moduleId` text NOT NULL,
	`stepId` text NOT NULL,
	`selectedIndex` integer NOT NULL,
	`correct` integer NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`moduleId`) REFERENCES `learning_modules`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `student_quiz_attempts_user_step_idx` ON `student_quiz_attempts` (`userId`,`stepId`);--> statement-breakpoint
CREATE INDEX `student_quiz_attempts_module_idx` ON `student_quiz_attempts` (`moduleId`);--> statement-breakpoint
ALTER TABLE `learning_steps` ADD `quiz` text;