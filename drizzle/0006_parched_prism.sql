ALTER TABLE `receipt_intakes` ADD `auto_confirm_token` text;--> statement-breakpoint
ALTER TABLE `receipt_intakes` ADD `auto_confirm_lease_expires_at` text;--> statement-breakpoint
CREATE TABLE `receipt_auto_confirm_reservations` (
	`owner_id` text DEFAULT 'singleton-owner' NOT NULL,
	`fingerprint` text NOT NULL,
	`receipt_intake_id` text NOT NULL,
	`lease_token` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`receipt_intake_id`) REFERENCES `receipt_intakes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `receipt_auto_confirm_reservations_owner_fingerprint_uidx` ON `receipt_auto_confirm_reservations` (`owner_id`,`fingerprint`);--> statement-breakpoint
CREATE UNIQUE INDEX `receipt_auto_confirm_reservations_owner_intake_uidx` ON `receipt_auto_confirm_reservations` (`owner_id`,`receipt_intake_id`);
