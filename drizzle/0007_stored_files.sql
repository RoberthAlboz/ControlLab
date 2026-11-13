CREATE TABLE `stored_files` (
	`key` text PRIMARY KEY NOT NULL,
	`contentType` text NOT NULL,
	`size` integer NOT NULL,
	`data` blob NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
