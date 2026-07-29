ALTER TABLE `expenses` ADD `deleted_at` text;--> statement-breakpoint
CREATE INDEX `expenses_owner_deleted_idx` ON `expenses` (`owner_id`,`deleted_at`);