CREATE TABLE "recurring_debts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"direction" text DEFAULT 'payable' NOT NULL,
	"amount" numeric(14, 2),
	"currency" text NOT NULL,
	"counterparty_name" text NOT NULL,
	"account_id" uuid,
	"category_id" uuid NOT NULL,
	"day_of_month" numeric(2, 0) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "debt_id" uuid;--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "direction" text DEFAULT 'payable' NOT NULL;--> statement-breakpoint
ALTER TABLE "debts" ALTER COLUMN "original_amount" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "debts" ALTER COLUMN "pending_amount" DROP NOT NULL;--> statement-breakpoint
UPDATE "debts" SET "counterparty_name" = 'Counterparty' WHERE "counterparty_name" IS NULL;--> statement-breakpoint
ALTER TABLE "debts" ALTER COLUMN "counterparty_name" SET DEFAULT 'Counterparty';--> statement-breakpoint
ALTER TABLE "debts" ALTER COLUMN "counterparty_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "category_id" uuid;--> statement-breakpoint
UPDATE "debts" SET "category_id" = (SELECT "id" FROM "categories" LIMIT 1) WHERE "category_id" IS NULL;--> statement-breakpoint
ALTER TABLE "debts" ALTER COLUMN "category_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "is_visible" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "recurring_debt_id" uuid;--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "recurring_month" text;--> statement-breakpoint
ALTER TABLE "recurring_debts" ADD CONSTRAINT "recurring_debts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_debts" ADD CONSTRAINT "recurring_debts_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "debts_recurring_generated_idx" ON "debts" USING btree ("recurring_debt_id","recurring_month");
