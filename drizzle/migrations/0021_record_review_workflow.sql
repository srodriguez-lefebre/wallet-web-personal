ALTER TABLE "records" ADD COLUMN "import_merchant" text;--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "import_history" jsonb;--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "merchant_correction" jsonb;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "review_seen_through" timestamp with time zone;--> statement-breakpoint
UPDATE records AS r
SET import_merchant = e.sanitized_payload->'transaction'->>'merchantRaw'
FROM ingestion_events AS e
WHERE e.record_id = r.id AND e.action IN ('created', 'needs_review')
  AND e.sanitized_payload->'transaction'->>'merchantRaw' IS NOT NULL;--> statement-breakpoint
UPDATE records
SET import_merchant = substring(note from '(?:^| \| )Merchant: ([^|]+)')
WHERE import_merchant IS NULL AND note LIKE 'Auto Itaú | Merchant: %';--> statement-breakpoint
UPDATE records
SET import_merchant = counterparty_name
WHERE import_merchant IS NULL AND counterparty_name IS NOT NULL
  AND (note LIKE 'Auto Itaú | %' OR note LIKE 'Auto Wallet | %')
  AND note LIKE '% | Category could not be determined automatically; review this expense.%';--> statement-breakpoint
UPDATE records AS r
SET merchant_correction = jsonb_build_object(
  'savedAt', to_char(r.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'autoApply', false
)
FROM categories AS c
WHERE r.category_id = c.id AND c.deleted_at IS NULL AND c.system_key IS NULL
  AND lower(c.name) NOT IN ('unknown expense', 'others', 'category eliminated')
  AND r.deleted_at IS NULL AND r.payment_status <> 'cancelled'
  AND r.type = 'expense' AND r.payment_type <> 'transfer'
  AND r.import_merchant IS NOT NULL
  AND r.note LIKE '% | Category could not be determined automatically; review this expense.%';
