CREATE TABLE `auth_sessions` (
	`jti` varchar(64) NOT NULL,
	`openId` varchar(64) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`revokedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auth_sessions_jti` PRIMARY KEY(`jti`)
);
--> statement-breakpoint
CREATE INDEX `auth_sessions_open_id_idx` ON `auth_sessions` (`openId`);--> statement-breakpoint
CREATE INDEX `auth_sessions_active_idx` ON `auth_sessions` (`revokedAt`,`expiresAt`);