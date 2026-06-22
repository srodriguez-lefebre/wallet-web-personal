CREATE TABLE "goal_reservation_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"record_id" uuid,
	"reverses_movement_id" uuid,
	"idempotency_key" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "record_goals" (
	"record_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"assignment_source" text DEFAULT 'manual' NOT NULL,
	"use_reserved" boolean DEFAULT true NOT NULL,
	"reserve_income" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "auto_capture_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "auto_capture_start" date;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "auto_capture_end" date;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "auto_reservation_account_id" uuid;--> statement-breakpoint
ALTER TABLE "goal_reservation_movements" ADD CONSTRAINT "goal_reservation_movements_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_reservation_movements" ADD CONSTRAINT "goal_reservation_movements_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_reservation_movements" ADD CONSTRAINT "goal_reservation_movements_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_reservation_movements" ADD CONSTRAINT "goal_reservation_movements_reverses_movement_id_goal_reservation_movements_id_fk" FOREIGN KEY ("reverses_movement_id") REFERENCES "public"."goal_reservation_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_goals" ADD CONSTRAINT "record_goals_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_goals" ADD CONSTRAINT "record_goals_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goal_reservation_movements_goal_idx" ON "goal_reservation_movements" USING btree ("goal_id");--> statement-breakpoint
CREATE INDEX "goal_reservation_movements_account_idx" ON "goal_reservation_movements" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "goal_reservation_movements_record_idx" ON "goal_reservation_movements" USING btree ("record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "goal_reservation_movements_idempotency_idx" ON "goal_reservation_movements" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "record_goals_record_goal_idx" ON "record_goals" USING btree ("record_id","goal_id");--> statement-breakpoint
CREATE INDEX "record_goals_goal_idx" ON "record_goals" USING btree ("goal_id");--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_auto_reservation_account_id_accounts_id_fk" FOREIGN KEY ("auto_reservation_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "goal_reservation_movements" ("goal_id", "account_id", "type", "amount", "currency", "note", "created_at")
SELECT "goal_id", "account_id", 'reserve', "amount", "currency", COALESCE("note", 'Migrated reservation'), "created_at"
FROM "goal_reservations";
