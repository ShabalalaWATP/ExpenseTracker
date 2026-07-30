ALTER TABLE `receipt_intakes` ADD `discarded_at` text;--> statement-breakpoint
DROP TRIGGER IF EXISTS `receipt_intakes_claim_lock_delete`;--> statement-breakpoint
CREATE TRIGGER `receipt_intakes_claim_lock_delete`
BEFORE DELETE ON `receipt_intakes`
WHEN OLD.`discarded_at` IS NULL AND ((
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
))
BEGIN
  SELECT RAISE(ABORT, 'claim_period_locked');
END;
