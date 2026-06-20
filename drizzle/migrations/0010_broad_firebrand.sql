ALTER TYPE "public"."payment_status" ADD VALUE 'needs_review' BEFORE 'cancelled';--> statement-breakpoint
CREATE TABLE "ingestion_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"action" text,
	"fingerprint" text,
	"target_key" text,
	"merchant_normalized" text,
	"amount" numeric(14, 2),
	"currency" text,
	"occurred_at" timestamp with time zone,
	"record_id" uuid,
	"credit_card_record_id" uuid,
	"duplicate_of_id" uuid,
	"email_message_id" text,
	"email_thread_id" text,
	"email_subject" text,
	"email_from" text,
	"sanitized_payload" jsonb,
	"metadata_expires_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"normalized_alias" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category_id" uuid NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "system_key" text;--> statement-breakpoint
UPDATE "categories" SET "system_key" = 'unknown_expense' WHERE lower("name") = 'unknown expense';--> statement-breakpoint
UPDATE "categories" SET "system_key" = 'category_eliminated' WHERE lower("name") = 'category eliminated';--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "ingestion_events" ADD CONSTRAINT "ingestion_events_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_events" ADD CONSTRAINT "ingestion_events_credit_card_record_id_credit_card_records_id_fk" FOREIGN KEY ("credit_card_record_id") REFERENCES "public"."credit_card_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_events" ADD CONSTRAINT "ingestion_events_duplicate_of_id_ingestion_events_id_fk" FOREIGN KEY ("duplicate_of_id") REFERENCES "public"."ingestion_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_aliases" ADD CONSTRAINT "merchant_aliases_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ingestion_events_idempotency_idx" ON "ingestion_events" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "ingestion_events_fingerprint_idx" ON "ingestion_events" USING btree ("fingerprint","occurred_at");--> statement-breakpoint
CREATE INDEX "ingestion_events_expiry_idx" ON "ingestion_events" USING btree ("metadata_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_aliases_normalized_idx" ON "merchant_aliases" USING btree ("normalized_alias");--> statement-breakpoint
CREATE INDEX "merchant_aliases_merchant_idx" ON "merchant_aliases" USING btree ("merchant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "merchants_name_idx" ON "merchants" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "exchange_rates_pair_date_idx" ON "exchange_rates" USING btree ("from_currency","to_currency","date");--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_system_key_unique" UNIQUE("system_key");
