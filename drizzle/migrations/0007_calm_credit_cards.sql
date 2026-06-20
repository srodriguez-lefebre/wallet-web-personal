CREATE TABLE "credit_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"issuer" text NOT NULL,
	"last_four" text NOT NULL,
	"credit_limit" numeric(14, 2) NOT NULL,
	"limit_currency" text NOT NULL,
	"closing_day" integer NOT NULL,
	"due_day" integer NOT NULL,
	"color" text NOT NULL,
	"icon" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "credit_card_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"credit_card_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"amount_in_limit_currency" numeric(14, 2) NOT NULL,
	"account_id" uuid,
	"account_amount" numeric(14, 2),
	"occurred_at" timestamp with time zone NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "records" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "credit_card_id" uuid;
--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "amount_in_limit_currency" numeric(14, 2);
--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "exchange_rate_to_limit_currency" numeric(14, 6);
--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_funding_source_check"
CHECK ((CASE WHEN "account_id" IS NULL THEN 0 ELSE 1 END + CASE WHEN "credit_card_id" IS NULL THEN 0 ELSE 1 END) = 1);
--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_credit_card_id_credit_cards_id_fk"
FOREIGN KEY ("credit_card_id") REFERENCES "public"."credit_cards"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "credit_card_payments" ADD CONSTRAINT "credit_card_payments_credit_card_id_credit_cards_id_fk"
FOREIGN KEY ("credit_card_id") REFERENCES "public"."credit_cards"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "credit_card_payments" ADD CONSTRAINT "credit_card_payments_account_id_accounts_id_fk"
FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "records_credit_card_idx" ON "records" USING btree ("credit_card_id");
--> statement-breakpoint
CREATE INDEX "credit_card_payments_card_idx" ON "credit_card_payments" USING btree ("credit_card_id");
--> statement-breakpoint
CREATE INDEX "credit_card_payments_account_idx" ON "credit_card_payments" USING btree ("account_id");
--> statement-breakpoint
CREATE INDEX "credit_card_payments_occurred_at_idx" ON "credit_card_payments" USING btree ("occurred_at");
