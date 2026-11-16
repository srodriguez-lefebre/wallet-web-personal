CREATE TABLE "card_mail_settings" (
	"credit_card_id" uuid PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"alias" text DEFAULT '' NOT NULL,
	"account_id" uuid,
	"rate_profile" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "card_mail_settings" ADD CONSTRAINT "card_mail_settings_credit_card_id_credit_cards_id_fk" FOREIGN KEY ("credit_card_id") REFERENCES "public"."credit_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_mail_settings" ADD CONSTRAINT "card_mail_settings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "card_mail_settings_source_idx" ON "card_mail_settings" USING btree ("source");