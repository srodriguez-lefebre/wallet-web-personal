ALTER TABLE "records" DROP CONSTRAINT IF EXISTS "records_funding_source_check";
--> statement-breakpoint
CREATE TABLE "credit_card_statements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "credit_card_id" uuid NOT NULL REFERENCES "credit_cards"("id"),
  "cycle_start" timestamp with time zone NOT NULL,
  "cycle_end" timestamp with time zone NOT NULL,
  "due_at" timestamp with time zone NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "closed_at" timestamp with time zone NOT NULL,
  "paid_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "credit_card_statements_card_cycle_idx" ON "credit_card_statements" ("credit_card_id", "cycle_start", "cycle_end");
--> statement-breakpoint
CREATE TABLE "credit_card_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "credit_card_id" uuid NOT NULL REFERENCES "credit_cards"("id"),
  "wallet_record_id" uuid UNIQUE REFERENCES "records"("id"),
  "original_record_id" uuid,
  "statement_id" uuid REFERENCES "credit_card_statements"("id"),
  "kind" text DEFAULT 'purchase' NOT NULL,
  "amount" numeric(14, 2) NOT NULL,
  "currency" text NOT NULL,
  "amount_in_limit_currency" numeric(14, 2) NOT NULL,
  "exchange_rate_to_limit_currency" numeric(14, 6) NOT NULL,
  "category_id" uuid NOT NULL REFERENCES "categories"("id"),
  "counterparty_name" text,
  "note" text,
  "account_id" uuid REFERENCES "accounts"("id"),
  "account_amount" numeric(14, 2),
  "account_impact_at_creation" boolean DEFAULT false NOT NULL,
  "occurred_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "credit_card_records" ADD CONSTRAINT "credit_card_records_original_record_id_credit_card_records_id_fk" FOREIGN KEY ("original_record_id") REFERENCES "credit_card_records"("id");
--> statement-breakpoint
CREATE INDEX "credit_card_records_card_idx" ON "credit_card_records" ("credit_card_id");
--> statement-breakpoint
CREATE INDEX "credit_card_records_statement_idx" ON "credit_card_records" ("statement_id");
--> statement-breakpoint
CREATE INDEX "credit_card_records_occurred_at_idx" ON "credit_card_records" ("occurred_at");
--> statement-breakpoint
ALTER TABLE "credit_card_payments" ADD COLUMN "statement_id" uuid REFERENCES "credit_card_statements"("id");
--> statement-breakpoint
CREATE TABLE "credit_card_payment_allocations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "payment_id" uuid NOT NULL REFERENCES "credit_card_payments"("id") ON DELETE CASCADE,
  "credit_card_record_id" uuid NOT NULL REFERENCES "credit_card_records"("id"),
  "amount" numeric(14, 2) NOT NULL,
  "amount_in_limit_currency" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE INDEX "credit_card_payment_allocations_payment_idx" ON "credit_card_payment_allocations" ("payment_id");
--> statement-breakpoint
CREATE INDEX "credit_card_payment_allocations_record_idx" ON "credit_card_payment_allocations" ("credit_card_record_id");
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "default_account_id" uuid REFERENCES "accounts"("id");
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "default_payment_type" "payment_type" DEFAULT 'debit' NOT NULL;
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "default_credit_card_id" uuid REFERENCES "credit_cards"("id");
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "default_payment_status" "payment_status" DEFAULT 'cleared' NOT NULL;
--> statement-breakpoint
INSERT INTO "credit_card_records" (
  "credit_card_id", "wallet_record_id", "kind", "amount", "currency",
  "amount_in_limit_currency", "exchange_rate_to_limit_currency", "category_id",
  "counterparty_name", "note", "account_id", "account_amount",
  "account_impact_at_creation", "occurred_at", "created_at", "updated_at"
)
SELECT
  r."credit_card_id", CASE WHEN r."account_id" IS NULL THEN NULL ELSE r."id" END,
  'purchase', r."amount", r."currency",
  COALESCE(r."amount_in_limit_currency", r."amount"),
  COALESCE(r."exchange_rate_to_limit_currency", 1), r."category_id",
  r."counterparty_name", r."note", r."account_id",
  CASE WHEN r."account_id" IS NULL THEN NULL ELSE r."amount" END,
  r."account_id" IS NOT NULL, r."occurred_at", r."created_at", r."updated_at"
FROM "records" r
WHERE r."credit_card_id" IS NOT NULL AND r."deleted_at" IS NULL AND r."category_id" IS NOT NULL;
--> statement-breakpoint
UPDATE "records" SET "deleted_at" = now(), "updated_at" = now()
WHERE "credit_card_id" IS NOT NULL AND "account_id" IS NULL AND "deleted_at" IS NULL;
