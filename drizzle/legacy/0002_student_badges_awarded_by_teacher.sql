CREATE TABLE `student_badges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`label` varchar(100) NOT NULL,
	`detail` text NOT NULL,
	`awardedBy` int NOT NULL,
	`awardedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `student_badges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `student_badges_user_idx` ON `student_badges` (`userId`);