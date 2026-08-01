CREATE TABLE `activity_logs` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`groupId` bigint unsigned,
	`userId` bigint unsigned NOT NULL,
	`action` varchar(60) NOT NULL,
	`detail` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activity_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `attendance` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`bookingId` bigint unsigned NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`attended` boolean NOT NULL DEFAULT true,
	`nameOverride` varchar(255),
	CONSTRAINT `attendance_id` PRIMARY KEY(`id`),
	CONSTRAINT `attendance_unique` UNIQUE(`bookingId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`groupId` bigint unsigned NOT NULL,
	`sport` varchar(40) NOT NULL,
	`venue` varchar(160) NOT NULL,
	`startsAt` timestamp NOT NULL,
	`durationMin` int NOT NULL DEFAULT 60,
	`costPaise` int NOT NULL,
	`shuttleCostPaise` int NOT NULL DEFAULT 0,
	`bookedById` bigint unsigned NOT NULL,
	`notes` text,
	`splitType` enum('equal','custom','percentage','weighted') NOT NULL DEFAULT 'equal',
	`splitConfig` text,
	`status` enum('scheduled','played','cancelled') NOT NULL DEFAULT 'scheduled',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `bookings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contributions` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`bookingId` bigint unsigned NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`amountPaise` int NOT NULL,
	CONSTRAINT `contributions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `group_members` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`groupId` bigint unsigned NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`role` enum('owner','admin','member') NOT NULL DEFAULT 'member',
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `group_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `group_members_unique` UNIQUE(`groupId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `groups` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`sport` varchar(40) NOT NULL DEFAULT 'Badminton',
	`description` text,
	`emoji` varchar(16) NOT NULL DEFAULT '🏸',
	`inviteCode` varchar(24) NOT NULL,
	`ownerId` bigint unsigned NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `groups_id` PRIMARY KEY(`id`),
	CONSTRAINT `groups_inviteCode_unique` UNIQUE(`inviteCode`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`type` varchar(40) NOT NULL,
	`title` varchar(160) NOT NULL,
	`body` varchar(500),
	`href` varchar(255),
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`groupId` bigint unsigned NOT NULL,
	`fromUserId` bigint unsigned NOT NULL,
	`toUserId` bigint unsigned NOT NULL,
	`amountPaise` int NOT NULL,
	`status` enum('pending','completed','cancelled') NOT NULL DEFAULT 'pending',
	`method` enum('upi','cash','other') NOT NULL DEFAULT 'upi',
	`note` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `splits` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`bookingId` bigint unsigned NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`amountPaise` int NOT NULL,
	`settled` boolean NOT NULL DEFAULT false,
	CONSTRAINT `splits_id` PRIMARY KEY(`id`),
	CONSTRAINT `splits_unique` UNIQUE(`bookingId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`unionId` varchar(255) NOT NULL,
	`name` varchar(255),
	`email` varchar(320),
	`avatar` text,
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`upiId` varchar(120),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	`lastSignInAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_unionId_unique` UNIQUE(`unionId`)
);
--> statement-breakpoint
CREATE INDEX `activity_group_idx` ON `activity_logs` (`groupId`);--> statement-breakpoint
CREATE INDEX `attendance_booking_idx` ON `attendance` (`bookingId`);--> statement-breakpoint
CREATE INDEX `bookings_group_idx` ON `bookings` (`groupId`);--> statement-breakpoint
CREATE INDEX `bookings_starts_idx` ON `bookings` (`startsAt`);--> statement-breakpoint
CREATE INDEX `contributions_booking_idx` ON `contributions` (`bookingId`);--> statement-breakpoint
CREATE INDEX `group_members_user_idx` ON `group_members` (`userId`);--> statement-breakpoint
CREATE INDEX `groups_owner_idx` ON `groups` (`ownerId`);--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`userId`);--> statement-breakpoint
CREATE INDEX `payments_group_idx` ON `payments` (`groupId`);--> statement-breakpoint
CREATE INDEX `payments_from_idx` ON `payments` (`fromUserId`);--> statement-breakpoint
CREATE INDEX `payments_to_idx` ON `payments` (`toUserId`);--> statement-breakpoint
CREATE INDEX `splits_booking_idx` ON `splits` (`bookingId`);