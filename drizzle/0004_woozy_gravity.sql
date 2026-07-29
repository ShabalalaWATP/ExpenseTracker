CREATE TABLE `receipt_intake_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text DEFAULT 'singleton-owner' NOT NULL,
	`receipt_intake_id` text NOT NULL,
	`source` text NOT NULL,
	`fields_json` text DEFAULT '[]' NOT NULL,
	`before_json` text DEFAULT '{}' NOT NULL,
	`after_json` text DEFAULT '{}' NOT NULL,
	`model` text,
	`reason_code` text,
	`transform_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`receipt_intake_id`) REFERENCES `receipt_intakes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `receipt_intake_revisions_owner_intake_idx` ON `receipt_intake_revisions` (`owner_id`,`receipt_intake_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `receipt_intakes` ADD `analysis_history_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `receipt_intakes` ADD `correction_provenance_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `receipt_intakes` ADD `duplicate_candidates_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `receipt_intakes` ADD `duplicate_fingerprint` text;--> statement-breakpoint
ALTER TABLE `receipt_intakes` ADD `duplicate_reviewed_fingerprint` text;--> statement-breakpoint
ALTER TABLE `receipt_intakes` ADD `duplicate_reviewed` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `receipt_intakes` ADD `reconciliation_reviewed` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `receipt_intakes` ADD `image_edits_json` text DEFAULT '{}' NOT NULL;