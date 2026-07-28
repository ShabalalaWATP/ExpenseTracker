CREATE TABLE `claim_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`period` text NOT NULL,
	`status` text DEFAULT 'prepared' NOT NULL,
	`policy_version` text NOT NULL,
	`total_spend_pence` integer NOT NULL,
	`total_gratuity_pence` integer NOT NULL,
	`qualifying_actual_pence` integer NOT NULL,
	`allowance_pence` integer NOT NULL,
	`claimable_pence` integer NOT NULL,
	`snapshot_json` text NOT NULL,
	`snapshot_sha256` text NOT NULL,
	`prepared_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`submitted_at` text,
	CONSTRAINT "claim_snapshots_status_valid" CHECK("claim_snapshots"."status" IN ('prepared', 'submitted'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `claim_snapshots_period_uidx` ON `claim_snapshots` (`period`);--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`service_date` text NOT NULL,
	`merchant` text NOT NULL,
	`location` text NOT NULL,
	`business_reason` text NOT NULL,
	`receipt_total_pence` integer NOT NULL,
	`eligible_pence` integer NOT NULL,
	`gratuity_pence` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'GBP' NOT NULL,
	`country` text DEFAULT 'GB' NOT NULL,
	`trip_id` text,
	`meal_context` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "expenses_receipt_total_positive" CHECK("expenses"."receipt_total_pence" > 0),
	CONSTRAINT "expenses_eligible_valid" CHECK("expenses"."eligible_pence" > 0 AND "expenses"."eligible_pence" <= "expenses"."receipt_total_pence"),
	CONSTRAINT "expenses_gratuity_valid" CHECK("expenses"."gratuity_pence" >= 0 AND "expenses"."gratuity_pence" <= "expenses"."eligible_pence"),
	CONSTRAINT "expenses_currency_gbp" CHECK("expenses"."currency" = 'GBP'),
	CONSTRAINT "expenses_country_gb" CHECK("expenses"."country" = 'GB')
);
--> statement-breakpoint
CREATE INDEX `expenses_date_idx` ON `expenses` (`service_date`);--> statement-breakpoint
CREATE INDEX `expenses_trip_idx` ON `expenses` (`trip_id`);--> statement-breakpoint
CREATE TABLE `receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`expense_id` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`sha256` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `receipts_expense_uidx` ON `receipts` (`expense_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `receipts_object_key_uidx` ON `receipts` (`object_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `receipts_sha256_uidx` ON `receipts` (`sha256`);--> statement-breakpoint
CREATE UNIQUE INDEX `receipts_idempotency_uidx` ON `receipts` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `trip_days` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`date` text NOT NULL,
	`eligible` integer DEFAULT true NOT NULL,
	`confirmed` integer DEFAULT false NOT NULL,
	`note` text,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trip_days_trip_date_uidx` ON `trip_days` (`trip_id`,`date`);--> statement-breakpoint
CREATE INDEX `trip_days_date_idx` ON `trip_days` (`date`);--> statement-breakpoint
CREATE TABLE `trips` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`purpose` text,
	`country` text DEFAULT 'GB' NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`aggregate_election` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "trips_country_gb" CHECK("trips"."country" = 'GB'),
	CONSTRAINT "trips_dates_ordered" CHECK("trips"."end_date" >= "trips"."start_date")
);
--> statement-breakpoint
CREATE INDEX `trips_dates_idx` ON `trips` (`start_date`,`end_date`);