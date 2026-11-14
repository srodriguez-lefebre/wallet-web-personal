-- Additive baseline only. New archive mutations/FK activation ship after this reader is a safe rollback target.
DO $$ BEGIN
  IF (SELECT count(*) FROM settings) > 1 THEN
    RAISE EXCEPTION 'Settings has multiple rows; stop for explicit reconciliation before migrating';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "credit_card_payments" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "installment_plans" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "installment_plans" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "installment_plans" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "investments" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "recurring_debts" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "singleton" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "session_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "auth_attempts_pruned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tags" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "credit_card_records_original_record_idx" ON "credit_card_records" USING btree ("original_record_id");--> statement-breakpoint
CREATE INDEX "credit_card_records_category_idx" ON "credit_card_records" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "records_category_idx" ON "records" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "records_destination_account_idx" ON "records" USING btree ("destination_account_id");--> statement-breakpoint
CREATE INDEX "records_payment_status_active_idx" ON "records" USING btree ("payment_status") WHERE "records"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "records_debt_idx" ON "records" USING btree ("debt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "settings_singleton_idx" ON "settings" USING btree ("singleton");--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_singleton_true" CHECK ("settings"."singleton");