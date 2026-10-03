ALTER TABLE "credit_card_payments" ADD COLUMN "idempotency_key" text;
--> statement-breakpoint
ALTER TABLE "credit_card_payments" ADD COLUMN "request_hash" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "credit_card_payments_idempotency_idx" ON "credit_card_payments" ("idempotency_key");
