CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text DEFAULT 'singleton-owner' NOT NULL,
	`actor_hash` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_events_owner_created_idx` ON `audit_events` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_events_owner_entity_idx` ON `audit_events` (`owner_id`,`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `receipt_intakes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text DEFAULT 'singleton-owner' NOT NULL,
	`batch_id` text NOT NULL,
	`status` text DEFAULT 'uploaded' NOT NULL,
	`original_name` text NOT NULL,
	`original_object_key` text NOT NULL,
	`analysis_object_key` text,
	`content_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`sha256` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`merchant` text,
	`service_date` text,
	`receipt_total_pence` integer,
	`eligible_pence` integer,
	`gratuity_pence` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'GBP' NOT NULL,
	`location` text,
	`business_reason` text,
	`meal_context` text,
	`trip_id` text,
	`line_items_json` text DEFAULT '[]' NOT NULL,
	`confidence_json` text DEFAULT '{}' NOT NULL,
	`missing_fields_json` text DEFAULT '[]' NOT NULL,
	`uncertain_fields_json` text DEFAULT '[]' NOT NULL,
	`alcohol_suspected` integer DEFAULT false NOT NULL,
	`alcohol_reviewed` integer DEFAULT false NOT NULL,
	`extraction_json` text,
	`clarification_json` text,
	`ai_model` text,
	`expense_id` text,
	`error_code` text,
	`error_message` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "receipt_intakes_status_valid" CHECK("receipt_intakes"."status" IN ('uploaded', 'analysing', 'needs_review', 'ready', 'confirmed', 'failed')),
	CONSTRAINT "receipt_intakes_currency_gbp" CHECK("receipt_intakes"."currency" = 'GBP')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `receipt_intakes_owner_sha256_uidx` ON `receipt_intakes` (`owner_id`,`sha256`);--> statement-breakpoint
CREATE UNIQUE INDEX `receipt_intakes_owner_idempotency_uidx` ON `receipt_intakes` (`owner_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `receipt_intakes_owner_status_idx` ON `receipt_intakes` (`owner_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `receipt_intakes_owner_batch_idx` ON `receipt_intakes` (`owner_id`,`batch_id`);--> statement-breakpoint
DROP INDEX `claim_snapshots_period_uidx`;--> statement-breakpoint
ALTER TABLE `claim_snapshots` ADD `owner_id` text DEFAULT 'singleton-owner' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `claim_snapshots_owner_period_uidx` ON `claim_snapshots` (`owner_id`,`period`);--> statement-breakpoint
DROP INDEX `expenses_date_idx`;--> statement-breakpoint
DROP INDEX `expenses_trip_idx`;--> statement-breakpoint
ALTER TABLE `expenses` ADD `owner_id` text DEFAULT 'singleton-owner' NOT NULL;--> statement-breakpoint
CREATE INDEX `expenses_owner_date_idx` ON `expenses` (`owner_id`,`service_date`);--> statement-breakpoint
CREATE INDEX `expenses_owner_trip_idx` ON `expenses` (`owner_id`,`trip_id`);--> statement-breakpoint
DROP INDEX `receipts_expense_uidx`;--> statement-breakpoint
DROP INDEX `receipts_sha256_uidx`;--> statement-breakpoint
DROP INDEX `receipts_idempotency_uidx`;--> statement-breakpoint
ALTER TABLE `receipts` ADD `owner_id` text DEFAULT 'singleton-owner' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `receipts_owner_expense_uidx` ON `receipts` (`owner_id`,`expense_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `receipts_owner_sha256_uidx` ON `receipts` (`owner_id`,`sha256`);--> statement-breakpoint
CREATE UNIQUE INDEX `receipts_owner_idempotency_uidx` ON `receipts` (`owner_id`,`idempotency_key`);--> statement-breakpoint
DROP INDEX `trip_days_trip_date_uidx`;--> statement-breakpoint
DROP INDEX `trip_days_date_idx`;--> statement-breakpoint
ALTER TABLE `trip_days` ADD `owner_id` text DEFAULT 'singleton-owner' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `trip_days_owner_trip_date_uidx` ON `trip_days` (`owner_id`,`trip_id`,`date`);--> statement-breakpoint
CREATE INDEX `trip_days_owner_date_idx` ON `trip_days` (`owner_id`,`date`);--> statement-breakpoint
DROP INDEX `trips_dates_idx`;--> statement-breakpoint
ALTER TABLE `trips` ADD `owner_id` text DEFAULT 'singleton-owner' NOT NULL;--> statement-breakpoint
CREATE INDEX `trips_owner_dates_idx` ON `trips` (`owner_id`,`start_date`,`end_date`);