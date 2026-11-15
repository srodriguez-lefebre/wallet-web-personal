-- The legacy runtime may still be active when this migration runs.
SELECT pg_advisory_xact_lock(1791000024);
--> statement-breakpoint
ALTER TABLE categories ADD COLUMN kind text NOT NULL DEFAULT 'both',
  ADD CONSTRAINT categories_kind_check CHECK (kind IN ('expense', 'income', 'both'));
--> statement-breakpoint
WITH evidence AS (
  SELECT r.category_id, r.type::text AS direction
  FROM records r
  WHERE r.category_id IS NOT NULL AND r.deleted_at IS NULL AND r.payment_status <> 'cancelled'
    AND r.type IN ('income', 'expense')
    AND NOT EXISTS (
      SELECT 1 FROM credit_card_records c
      WHERE c.wallet_record_id = r.id AND c.kind = 'refund'
    )
  UNION ALL
  SELECT c.category_id, 'expense' AS direction
  FROM credit_card_records c
  WHERE c.deleted_at IS NULL
), inferred AS (
  SELECT category_id, min(direction) AS kind
  FROM evidence
  GROUP BY category_id
  HAVING count(DISTINCT direction) = 1
)
UPDATE categories c SET kind = inferred.kind
FROM inferred
WHERE c.id = inferred.category_id AND c.deleted_at IS NULL
  AND (c.system_key IS NULL OR c.system_key NOT IN ('unknown_expense', 'others', 'category_eliminated'));
