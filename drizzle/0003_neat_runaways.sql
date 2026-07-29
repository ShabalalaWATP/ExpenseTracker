CREATE TABLE `claim_period_locks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text DEFAULT 'singleton-owner' NOT NULL,
	`period` text NOT NULL,
	`status` text DEFAULT 'preparing' NOT NULL,
	`token` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "claim_period_locks_status_valid" CHECK("claim_period_locks"."status" IN ('preparing', 'prepared'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `claim_period_locks_owner_period_uidx` ON `claim_period_locks` (`owner_id`,`period`);--> statement-breakpoint
CREATE UNIQUE INDEX `claim_period_locks_token_uidx` ON `claim_period_locks` (`token`);
--> statement-breakpoint
INSERT INTO `claim_period_locks`
  (`id`, `owner_id`, `period`, `status`, `token`)
SELECT
  'migration-' || `id`, `owner_id`, `period`, 'prepared', 'migration-' || `id`
FROM `claim_snapshots`;
--> statement-breakpoint
CREATE TRIGGER `expenses_claim_lock_insert`
BEFORE INSERT ON `expenses`
WHEN EXISTS (
  SELECT 1 FROM `claim_period_locks`
  WHERE `owner_id` = NEW.`owner_id`
    AND `period` = substr(NEW.`service_date`, 1, 7)
)
BEGIN
  SELECT RAISE(ABORT, 'claim_period_locked');
END;
--> statement-breakpoint
CREATE TRIGGER `expenses_claim_lock_update`
BEFORE UPDATE ON `expenses`
WHEN EXISTS (
  SELECT 1 FROM `claim_period_locks`
  WHERE `owner_id` = OLD.`owner_id`
    AND `period` = substr(OLD.`service_date`, 1, 7)
) OR EXISTS (
  SELECT 1 FROM `claim_period_locks`
  WHERE `owner_id` = NEW.`owner_id`
    AND `period` = substr(NEW.`service_date`, 1, 7)
)
BEGIN
  SELECT RAISE(ABORT, 'claim_period_locked');
END;
--> statement-breakpoint
CREATE TRIGGER `expenses_claim_lock_delete`
BEFORE DELETE ON `expenses`
WHEN EXISTS (
  SELECT 1 FROM `claim_period_locks`
  WHERE `owner_id` = OLD.`owner_id`
    AND `period` = substr(OLD.`service_date`, 1, 7)
)
BEGIN
  SELECT RAISE(ABORT, 'claim_period_locked');
END;
--> statement-breakpoint
CREATE TRIGGER `receipts_claim_lock_insert`
BEFORE INSERT ON `receipts`
WHEN EXISTS (
  SELECT 1
  FROM `expenses` e
  JOIN `claim_period_locks` l
    ON l.`owner_id` = e.`owner_id`
   AND l.`period` = substr(e.`service_date`, 1, 7)
  WHERE e.`owner_id` = NEW.`owner_id` AND e.`id` = NEW.`expense_id`
)
BEGIN
  SELECT RAISE(ABORT, 'claim_period_locked');
END;
--> statement-breakpoint
CREATE TRIGGER `receipts_claim_lock_update`
BEFORE UPDATE ON `receipts`
WHEN EXISTS (
  SELECT 1
  FROM `expenses` e
  JOIN `claim_period_locks` l
    ON l.`owner_id` = e.`owner_id`
   AND l.`period` = substr(e.`service_date`, 1, 7)
  WHERE e.`owner_id` = OLD.`owner_id` AND e.`id` = OLD.`expense_id`
) OR EXISTS (
  SELECT 1
  FROM `expenses` e
  JOIN `claim_period_locks` l
    ON l.`owner_id` = e.`owner_id`
   AND l.`period` = substr(e.`service_date`, 1, 7)
  WHERE e.`owner_id` = NEW.`owner_id` AND e.`id` = NEW.`expense_id`
)
BEGIN
  SELECT RAISE(ABORT, 'claim_period_locked');
END;
--> statement-breakpoint
CREATE TRIGGER `receipts_claim_lock_delete`
BEFORE DELETE ON `receipts`
WHEN EXISTS (
  SELECT 1
  FROM `expenses` e
  JOIN `claim_period_locks` l
    ON l.`owner_id` = e.`owner_id`
   AND l.`period` = substr(e.`service_date`, 1, 7)
  WHERE e.`owner_id` = OLD.`owner_id` AND e.`id` = OLD.`expense_id`
)
BEGIN
  SELECT RAISE(ABORT, 'claim_period_locked');
END;
--> statement-breakpoint
CREATE TRIGGER `trip_days_claim_lock_insert`
BEFORE INSERT ON `trip_days`
WHEN EXISTS (
  SELECT 1 FROM `claim_period_locks`
  WHERE `owner_id` = NEW.`owner_id`
    AND `period` = substr(NEW.`date`, 1, 7)
)
BEGIN
  SELECT RAISE(ABORT, 'claim_period_locked');
END;
--> statement-breakpoint
CREATE TRIGGER `trip_days_claim_lock_update`
BEFORE UPDATE ON `trip_days`
WHEN EXISTS (
  SELECT 1 FROM `claim_period_locks`
  WHERE `owner_id` = OLD.`owner_id`
    AND `period` = substr(OLD.`date`, 1, 7)
) OR EXISTS (
  SELECT 1 FROM `claim_period_locks`
  WHERE `owner_id` = NEW.`owner_id`
    AND `period` = substr(NEW.`date`, 1, 7)
)
BEGIN
  SELECT RAISE(ABORT, 'claim_period_locked');
END;
--> statement-breakpoint
CREATE TRIGGER `trip_days_claim_lock_delete`
BEFORE DELETE ON `trip_days`
WHEN EXISTS (
  SELECT 1 FROM `claim_period_locks`
  WHERE `owner_id` = OLD.`owner_id`
    AND `period` = substr(OLD.`date`, 1, 7)
)
BEGIN
  SELECT RAISE(ABORT, 'claim_period_locked');
END;
--> statement-breakpoint
CREATE TRIGGER `trips_claim_lock_update`
BEFORE UPDATE ON `trips`
WHEN EXISTS (
  SELECT 1
  FROM `trip_days` d
  JOIN `claim_period_locks` l
    ON l.`owner_id` = d.`owner_id`
   AND l.`period` = substr(d.`date`, 1, 7)
  WHERE d.`owner_id` = OLD.`owner_id` AND d.`trip_id` = OLD.`id`
)
BEGIN
  SELECT RAISE(ABORT, 'claim_period_locked');
END;
--> statement-breakpoint
CREATE TRIGGER `trips_claim_lock_delete`
BEFORE DELETE ON `trips`
WHEN EXISTS (
  SELECT 1
  FROM `trip_days` d
  JOIN `claim_period_locks` l
    ON l.`owner_id` = d.`owner_id`
   AND l.`period` = substr(d.`date`, 1, 7)
  WHERE d.`owner_id` = OLD.`owner_id` AND d.`trip_id` = OLD.`id`
)
BEGIN
  SELECT RAISE(ABORT, 'claim_period_locked');
END;
--> statement-breakpoint
CREATE TRIGGER `receipt_intakes_claim_lock_insert`
BEFORE INSERT ON `receipt_intakes`
WHEN (
  NEW.`service_date` IS NULL AND EXISTS (
    SELECT 1 FROM `claim_period_locks`
    WHERE `owner_id` = NEW.`owner_id` AND `status` = 'preparing'
  )
) OR (
  NEW.`service_date` IS NOT NULL AND EXISTS (
    SELECT 1 FROM `claim_period_locks`
    WHERE `owner_id` = NEW.`owner_id`
      AND `period` = substr(NEW.`service_date`, 1, 7)
  )
)
BEGIN
  SELECT RAISE(ABORT, 'claim_period_locked');
END;
--> statement-breakpoint
CREATE TRIGGER `receipt_intakes_claim_lock_update`
BEFORE UPDATE ON `receipt_intakes`
WHEN (
  (
    OLD.`service_date` IS NULL AND EXISTS (
      SELECT 1 FROM `claim_period_locks`
      WHERE `owner_id` = OLD.`owner_id` AND `status` = 'preparing'
    )
  ) OR (
    OLD.`service_date` IS NOT NULL AND EXISTS (
      SELECT 1 FROM `claim_period_locks`
      WHERE `owner_id` = OLD.`owner_id`
        AND `period` = substr(OLD.`service_date`, 1, 7)
    )
  )
) OR (
  (
    NEW.`service_date` IS NULL AND EXISTS (
      SELECT 1 FROM `claim_period_locks`
      WHERE `owner_id` = NEW.`owner_id` AND `status` = 'preparing'
    )
  ) OR (
    NEW.`service_date` IS NOT NULL AND EXISTS (
      SELECT 1 FROM `claim_period_locks`
      WHERE `owner_id` = NEW.`owner_id`
        AND `period` = substr(NEW.`service_date`, 1, 7)
    )
  )
)
BEGIN
  SELECT RAISE(ABORT, 'claim_period_locked');
END;
--> statement-breakpoint
CREATE TRIGGER `receipt_intakes_claim_lock_delete`
BEFORE DELETE ON `receipt_intakes`
WHEN (
  OLD.`service_date` IS NULL AND EXISTS (
    SELECT 1 FROM `claim_period_locks`
    WHERE `owner_id` = OLD.`owner_id` AND `status` = 'preparing'
  )
) OR (
  OLD.`service_date` IS NOT NULL AND EXISTS (
    SELECT 1 FROM `claim_period_locks`
    WHERE `owner_id` = OLD.`owner_id`
      AND `period` = substr(OLD.`service_date`, 1, 7)
  )
)
BEGIN
  SELECT RAISE(ABORT, 'claim_period_locked');
END;
