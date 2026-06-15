ALTER TABLE "records" ADD COLUMN "counterparty_name" text;--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "counterparty_name" text;--> statement-breakpoint
UPDATE "records"
SET "counterparty_name" = "counterparties"."name"
FROM "counterparties"
WHERE "records"."counterparty_id" = "counterparties"."id";--> statement-breakpoint
UPDATE "debts"
SET "counterparty_name" = "counterparties"."name"
FROM "counterparties"
WHERE "debts"."counterparty_id" = "counterparties"."id";--> statement-breakpoint
ALTER TABLE "records" DROP CONSTRAINT IF EXISTS "records_counterparty_id_counterparties_id_fk";--> statement-breakpoint
ALTER TABLE "debts" DROP CONSTRAINT IF EXISTS "debts_counterparty_id_counterparties_id_fk";--> statement-breakpoint
ALTER TABLE "records" DROP COLUMN IF EXISTS "counterparty_id";--> statement-breakpoint
ALTER TABLE "debts" DROP COLUMN IF EXISTS "counterparty_id";--> statement-breakpoint
DROP TABLE IF EXISTS "counterparties";--> statement-breakpoint
