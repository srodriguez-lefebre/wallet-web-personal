CREATE TABLE "record_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "record_type" NOT NULL,
	"amount" numeric NOT NULL,
	"currency" text NOT NULL,
	"account_id" uuid,
	"credit_card_id" uuid,
	"destination_account_id" uuid,
	"category_id" uuid,
	"tag_id" uuid,
	"counterparty_name" text,
	"note" text,
	"payment_type" "payment_type" NOT NULL,
	CONSTRAINT "record_templates_name_check" CHECK (length(btrim("record_templates"."name")) BETWEEN 1 AND 80),
	CONSTRAINT "record_templates_amount_check" CHECK ("record_templates"."amount" > 0 AND "record_templates"."amount" NOT IN ('Infinity'::numeric,'NaN'::numeric)),
	CONSTRAINT "record_templates_currency_check" CHECK ("record_templates"."currency" IN ('UYU','USD','EUR','BRL','ARS'))
);
--> statement-breakpoint
ALTER TABLE "record_templates" ADD CONSTRAINT "record_templates_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_templates" ADD CONSTRAINT "record_templates_credit_card_id_credit_cards_id_fk" FOREIGN KEY ("credit_card_id") REFERENCES "public"."credit_cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_templates" ADD CONSTRAINT "record_templates_destination_account_id_accounts_id_fk" FOREIGN KEY ("destination_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_templates" ADD CONSTRAINT "record_templates_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_templates" ADD CONSTRAINT "record_templates_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "record_templates_name_idx" ON "record_templates" USING btree (lower(btrim("name")));
