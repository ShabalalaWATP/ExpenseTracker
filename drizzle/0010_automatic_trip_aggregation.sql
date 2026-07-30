UPDATE `trips`
SET
  `aggregate_election` = CASE
    WHEN julianday(`end_date`) - julianday(`start_date`) >= 2 THEN 1
    ELSE 0
  END,
  `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE NOT EXISTS (
  SELECT 1
  FROM `trip_days` AS `d`
  JOIN `claim_period_locks` AS `l`
    ON `l`.`owner_id` = `d`.`owner_id`
   AND `l`.`period` = substr(`d`.`date`, 1, 7)
  WHERE `d`.`owner_id` = `trips`.`owner_id`
    AND `d`.`trip_id` = `trips`.`id`
)
AND `aggregate_election` <> CASE
  WHEN julianday(`end_date`) - julianday(`start_date`) >= 2 THEN 1
  ELSE 0
END;
