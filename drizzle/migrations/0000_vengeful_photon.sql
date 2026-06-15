CREATE TYPE "public"."account_type" AS ENUM('cash', 'bank', 'credit_card', 'savings', 'recurring', 'investment', 'custom');--> statement-breakpoint
CREATE TYPE "public"."category_type" AS ENUM('expense', 'income');--> statement-breakpoint
CREATE TYPE "public"."debt_status" AS ENUM('active', 'paid', 'paused');--> statement-breakpoint
CREATE TYPE "public"."goal_status" AS ENUM('active', 'completed', 'paused', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('cleared', 'pending', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_type" AS ENUM('cash', 'debit', 'credit', 'transfer', 'other');--> statement-breakpoint
CREATE TYPE "public"."record_type" AS ENUM('expense', 'income', 'transfer');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "account_type" NOT NULL,
	"currency" text NOT NULL,
	"initial_balance" numeric(14, 2) NOT NULL,
	"color" text NOT NULL,
	"icon" text NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"limit_amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"period" text DEFAULT 'monthly' NOT NULL,
	"category_id" uuid,
	"tag_id" uuid,
	"account_id" uuid,
	"goal_id" uuid,
	"color" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "category_type" NOT NULL,
	"color" text NOT NULL,
	"icon" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "counterparties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "debts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"original_amount" numeric(14, 2) NOT NULL,
	"pending_amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"counterparty_id" uuid,
	"account_id" uuid,
	"status" "debt_status" DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"due_at" timestamp with time zone,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_currency" text NOT NULL,
	"to_currency" text NOT NULL,
	"rate" numeric(14, 6) NOT NULL,
	"date" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goal_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "goal_tags" (
	"goal_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"target_amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"color" text NOT NULL,
	"icon" text NOT NULL,
	"deadline" timestamp with time zone,
	"status" "goal_status" DEFAULT 'active' NOT NULL,
	"account_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "installment_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"total_amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"installments_total" numeric(4, 0) NOT NULL,
	"installments_paid" numeric(4, 0) NOT NULL,
	"account_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"next_payment_at" timestamp with time zone,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "investments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"amount_invested" numeric(14, 2) NOT NULL,
	"current_value" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "record_tags" (
	"record_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "record_type" NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"account_id" uuid NOT NULL,
	"destination_account_id" uuid,
	"category_id" uuid,
	"counterparty_id" uuid,
	"payment_type" "payment_type" NOT NULL,
	"payment_status" "payment_status" NOT NULL,
	"exchange_rate_to_primary" numeric(14, 6) DEFAULT '1' NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"note" text,
	"is_fixed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"primary_currency" text DEFAULT 'UYU' NOT NULL,
	"theme" text DEFAULT 'light' NOT NULL,
	"default_dashboard_preset" text DEFAULT 'general' NOT NULL,
	"locale" text DEFAULT 'es-UY' NOT NULL,
	"include_hidden_accounts_in_reports" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_counterparty_id_counterparties_id_fk" FOREIGN KEY ("counterparty_id") REFERENCES "public"."counterparties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_reservations" ADD CONSTRAINT "goal_reservations_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_reservations" ADD CONSTRAINT "goal_reservations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_tags" ADD CONSTRAINT "goal_tags_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_tags" ADD CONSTRAINT "goal_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_tags" ADD CONSTRAINT "record_tags_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_tags" ADD CONSTRAINT "record_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_destination_account_id_accounts_id_fk" FOREIGN KEY ("destination_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_counterparty_id_counterparties_id_fk" FOREIGN KEY ("counterparty_id") REFERENCES "public"."counterparties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goal_tags_goal_idx" ON "goal_tags" USING btree ("goal_id");--> statement-breakpoint
CREATE INDEX "goal_tags_tag_idx" ON "goal_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "record_tags_record_idx" ON "record_tags" USING btree ("record_id");--> statement-breakpoint
CREATE INDEX "record_tags_tag_idx" ON "record_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "records_account_idx" ON "records" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "records_occurred_at_idx" ON "records" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "records_type_idx" ON "records" USING btree ("type");