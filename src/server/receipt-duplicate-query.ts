export const DUPLICATE_CANDIDATE_QUERY = `
  SELECT id, 'expense' AS kind, merchant, service_date,
         receipt_total_pence, original_currency,
         original_receipt_total_minor
  FROM expenses
  WHERE owner_id = ? AND deleted_at IS NULL
    AND (
      (service_date = ? AND original_currency = ?
        AND original_receipt_total_minor = ?)
      OR (service_date = ? AND lower(merchant) = lower(?))
    )
  UNION ALL
  SELECT id, 'intake' AS kind, COALESCE(merchant, original_name),
         service_date, receipt_total_pence, original_currency,
         original_receipt_total_minor
  FROM receipt_intakes
  WHERE owner_id = ? AND id <> ? AND status <> 'confirmed'
    AND discarded_at IS NULL
    AND service_date IS NOT NULL
    AND original_receipt_total_minor IS NOT NULL
    AND (
      (service_date = ? AND original_currency = ?
        AND original_receipt_total_minor = ?)
      OR (service_date = ? AND lower(COALESCE(merchant, original_name)) = lower(?))
    )
  LIMIT 8`;
