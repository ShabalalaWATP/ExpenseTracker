CREATE TABLE `exchange_rate_quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text DEFAULT 'singleton-owner' NOT NULL,
	`provider` text NOT NULL,
	`base_currency` text NOT NULL,
	`quote_currency` text DEFAULT 'GBP' NOT NULL,
	`requested_date` text NOT NULL,
	`observation_date` text NOT NULL,
	`rate_numerator` text NOT NULL,
	`rate_denominator` text NOT NULL,
	`rate_display` text NOT NULL,
	`provider_reference` text NOT NULL,
	`payload_sha256` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "exchange_rate_quotes_base_valid"
		CHECK(length(`base_currency`) = 3 AND `base_currency` = upper(`base_currency`)),
	CONSTRAINT "exchange_rate_quotes_quote_gbp"
		CHECK(`quote_currency` = 'GBP')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exchange_rate_quotes_lookup_uidx`
	ON `exchange_rate_quotes`
	(`owner_id`,`provider`,`base_currency`,`quote_currency`,`requested_date`);
--> statement-breakpoint
CREATE TABLE `trip_legs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text DEFAULT 'singleton-owner' NOT NULL,
	`trip_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`country_code` text NOT NULL,
	`location` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "trip_legs_sequence_valid" CHECK(`sequence` >= 0),
	CONSTRAINT "trip_legs_country_code_valid"
		CHECK(length(`country_code`) = 2 AND `country_code` = upper(`country_code`)),
	CONSTRAINT "trip_legs_dates_ordered" CHECK(`end_date` >= `start_date`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trip_legs_owner_trip_sequence_uidx`
	ON `trip_legs` (`owner_id`,`trip_id`,`sequence`);
--> statement-breakpoint
CREATE INDEX `trip_legs_owner_dates_idx`
	ON `trip_legs` (`owner_id`,`start_date`,`end_date`);
--> statement-breakpoint
INSERT INTO `trip_legs` (
	`id`, `owner_id`, `trip_id`, `sequence`, `country_code`,
	`location`, `start_date`, `end_date`, `created_at`, `updated_at`
)
SELECT
	'legacy-' || `id`, `owner_id`, `id`, 0, 'GB',
	COALESCE(NULLIF(trim(`purpose`), ''), 'Location not recorded'),
	`start_date`, `end_date`, `created_at`, `updated_at`
FROM `trips`;
--> statement-breakpoint
ALTER TABLE `receipt_intakes`
	ADD `original_currency` text DEFAULT 'UNKNOWN' NOT NULL;
--> statement-breakpoint
ALTER TABLE `receipt_intakes`
	ADD `original_country` text DEFAULT 'UNKNOWN' NOT NULL;
--> statement-breakpoint
ALTER TABLE `receipt_intakes`
	ADD `original_language` text DEFAULT 'und' NOT NULL;
--> statement-breakpoint
ALTER TABLE `receipt_intakes`
	ADD `original_receipt_total_minor` integer;
--> statement-breakpoint
ALTER TABLE `receipt_intakes`
	ADD `original_eligible_minor` integer;
--> statement-breakpoint
ALTER TABLE `receipt_intakes`
	ADD `original_gratuity_minor` integer;
--> statement-breakpoint
ALTER TABLE `receipt_intakes`
	ADD `original_minor_unit_digits` integer;
--> statement-breakpoint
ALTER TABLE `receipt_intakes`
	ADD `exchange_rate_quote_id` text;
--> statement-breakpoint
ALTER TABLE `receipt_intakes`
	ADD `translation_json` text DEFAULT '{}' NOT NULL;
--> statement-breakpoint
ALTER TABLE `receipt_intakes`
	ADD `conversion_json` text DEFAULT '{}' NOT NULL;
--> statement-breakpoint
ALTER TABLE `receipt_intakes`
	ADD `trip_leg_id` text;
--> statement-breakpoint
UPDATE `receipt_intakes`
SET
	`original_currency` = 'GBP',
	`original_country` = 'GB',
	`original_language` = 'und',
	`original_receipt_total_minor` = `receipt_total_pence`,
	`original_eligible_minor` = `eligible_pence`,
	`original_gratuity_minor` = `gratuity_pence`,
	`original_minor_unit_digits` = 2,
	`conversion_json` = '{"source":"identity","provider":"identity","fromCurrency":"GBP","toCurrency":"GBP","rateDisplay":"1","observationDate":null,"rounding":"half_up","indicative":false}'
WHERE `receipt_total_pence` IS NOT NULL;
--> statement-breakpoint
UPDATE `receipt_intakes`
SET `trip_leg_id` = (
	SELECT `id`
	FROM `trip_legs`
	WHERE `owner_id` = `receipt_intakes`.`owner_id`
	  AND `trip_id` = `receipt_intakes`.`trip_id`
	  AND `receipt_intakes`.`service_date` BETWEEN `start_date` AND `end_date`
	LIMIT 1
)
WHERE `trip_id` IS NOT NULL AND `service_date` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `receipt_intakes_owner_trip_leg_idx`
	ON `receipt_intakes` (`owner_id`,`trip_leg_id`);
--> statement-breakpoint
CREATE INDEX `receipt_intakes_owner_fx_quote_idx`
	ON `receipt_intakes` (`owner_id`,`exchange_rate_quote_id`);
--> statement-breakpoint
ALTER TABLE `expenses`
	ADD `original_currency` text DEFAULT 'GBP' NOT NULL;
--> statement-breakpoint
ALTER TABLE `expenses`
	ADD `original_country` text DEFAULT 'GB' NOT NULL;
--> statement-breakpoint
ALTER TABLE `expenses`
	ADD `original_language` text DEFAULT 'und' NOT NULL;
--> statement-breakpoint
ALTER TABLE `expenses`
	ADD `original_receipt_total_minor` integer;
--> statement-breakpoint
ALTER TABLE `expenses`
	ADD `original_eligible_minor` integer;
--> statement-breakpoint
ALTER TABLE `expenses`
	ADD `original_gratuity_minor` integer;
--> statement-breakpoint
ALTER TABLE `expenses`
	ADD `original_minor_unit_digits` integer;
--> statement-breakpoint
ALTER TABLE `expenses`
	ADD `exchange_rate_quote_id` text;
--> statement-breakpoint
ALTER TABLE `expenses`
	ADD `translation_json` text DEFAULT '{}' NOT NULL;
--> statement-breakpoint
ALTER TABLE `expenses`
	ADD `conversion_json` text DEFAULT '{}' NOT NULL;
--> statement-breakpoint
ALTER TABLE `expenses`
	ADD `trip_leg_id` text;
--> statement-breakpoint
UPDATE `expenses`
SET
	`original_currency` = 'GBP',
	`original_country` = 'GB',
	`original_language` = 'und',
	`original_receipt_total_minor` = `receipt_total_pence`,
	`original_eligible_minor` = `eligible_pence`,
	`original_gratuity_minor` = `gratuity_pence`,
	`original_minor_unit_digits` = 2,
	`conversion_json` = '{"source":"identity","provider":"identity","fromCurrency":"GBP","toCurrency":"GBP","rateDisplay":"1","observationDate":null,"rounding":"half_up","indicative":false}';
--> statement-breakpoint
UPDATE `expenses`
SET `trip_leg_id` = (
	SELECT `id`
	FROM `trip_legs`
	WHERE `owner_id` = `expenses`.`owner_id`
	  AND `trip_id` = `expenses`.`trip_id`
	  AND `expenses`.`service_date` BETWEEN `start_date` AND `end_date`
	LIMIT 1
)
WHERE `trip_id` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `expenses_owner_trip_leg_idx`
	ON `expenses` (`owner_id`,`trip_leg_id`);
--> statement-breakpoint
CREATE INDEX `expenses_owner_fx_quote_idx`
	ON `expenses` (`owner_id`,`exchange_rate_quote_id`);
--> statement-breakpoint
CREATE TRIGGER `trip_legs_claim_lock_insert`
BEFORE INSERT ON `trip_legs`
WHEN EXISTS (
	SELECT 1 FROM `claim_period_locks`
	WHERE `owner_id` = NEW.`owner_id`
	  AND `period` BETWEEN substr(NEW.`start_date`, 1, 7)
	                   AND substr(NEW.`end_date`, 1, 7)
)
BEGIN
	SELECT RAISE(ABORT, 'claim_period_locked');
END;
--> statement-breakpoint
CREATE TRIGGER `trip_legs_claim_lock_update`
BEFORE UPDATE ON `trip_legs`
WHEN EXISTS (
	SELECT 1 FROM `claim_period_locks`
	WHERE `owner_id` = OLD.`owner_id`
	  AND `period` BETWEEN substr(OLD.`start_date`, 1, 7)
	                   AND substr(OLD.`end_date`, 1, 7)
) OR EXISTS (
	SELECT 1 FROM `claim_period_locks`
	WHERE `owner_id` = NEW.`owner_id`
	  AND `period` BETWEEN substr(NEW.`start_date`, 1, 7)
	                   AND substr(NEW.`end_date`, 1, 7)
)
BEGIN
	SELECT RAISE(ABORT, 'claim_period_locked');
END;
--> statement-breakpoint
CREATE TRIGGER `trip_legs_claim_lock_delete`
BEFORE DELETE ON `trip_legs`
WHEN EXISTS (
	SELECT 1 FROM `claim_period_locks`
	WHERE `owner_id` = OLD.`owner_id`
	  AND `period` BETWEEN substr(OLD.`start_date`, 1, 7)
	                   AND substr(OLD.`end_date`, 1, 7)
)
BEGIN
	SELECT RAISE(ABORT, 'claim_period_locked');
END;
--> statement-breakpoint
CREATE TRIGGER `trip_legs_evidence_update`
BEFORE UPDATE OF `country_code`, `start_date`, `end_date` ON `trip_legs`
WHEN (
	NEW.`country_code` <> OLD.`country_code`
	OR NEW.`start_date` <> OLD.`start_date`
	OR NEW.`end_date` <> OLD.`end_date`
) AND (
	EXISTS (
		SELECT 1 FROM `expenses`
		WHERE `owner_id` = OLD.`owner_id`
		  AND `trip_leg_id` = OLD.`id`
	)
	OR EXISTS (
		SELECT 1 FROM `receipt_intakes`
		WHERE `owner_id` = OLD.`owner_id`
		  AND `trip_leg_id` = OLD.`id`
	)
)
BEGIN
	SELECT RAISE(ABORT, 'trip_leg_has_receipt_evidence');
END;
--> statement-breakpoint
CREATE TRIGGER `trip_legs_evidence_delete`
BEFORE DELETE ON `trip_legs`
WHEN EXISTS (
	SELECT 1 FROM `expenses`
	WHERE `owner_id` = OLD.`owner_id`
	  AND `trip_leg_id` = OLD.`id`
) OR EXISTS (
	SELECT 1 FROM `receipt_intakes`
	WHERE `owner_id` = OLD.`owner_id`
	  AND `trip_leg_id` = OLD.`id`
)
BEGIN
	SELECT RAISE(ABORT, 'trip_leg_has_receipt_evidence');
END;
--> statement-breakpoint
PRAGMA foreign_key_check;
