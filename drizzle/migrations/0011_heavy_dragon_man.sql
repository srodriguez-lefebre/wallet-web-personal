CREATE TABLE "auth_attempts" (
	"key" text PRIMARY KEY NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"blocked_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
DO $$
DECLARE
	others_id uuid;
	eliminated_id uuid;
BEGIN
	SELECT "id" INTO others_id FROM "categories" WHERE "system_key" = 'others' LIMIT 1;
	IF others_id IS NULL THEN
		SELECT "id" INTO others_id FROM "categories"
		WHERE lower(trim("name")) = 'others' AND "parent_id" IS NULL
		ORDER BY "created_at" LIMIT 1;
	END IF;
	IF others_id IS NULL THEN
		INSERT INTO "categories" ("name", "parent_id", "color", "icon", "system_key")
		VALUES ('Others', NULL, '#64748b', 'folder', 'others') RETURNING "id" INTO others_id;
	ELSE
		UPDATE "categories" SET "system_key" = 'others', "deleted_at" = NULL WHERE "id" = others_id;
	END IF;

	SELECT "id" INTO eliminated_id FROM "categories" WHERE "system_key" = 'category_eliminated' LIMIT 1;
	IF eliminated_id IS NULL THEN
		SELECT "id" INTO eliminated_id FROM "categories"
		WHERE lower(trim("name")) = 'category eliminated' AND "parent_id" = others_id
		ORDER BY "created_at" LIMIT 1;
	END IF;
	IF eliminated_id IS NULL THEN
		INSERT INTO "categories" ("name", "parent_id", "color", "icon", "system_key")
		VALUES ('Category eliminated', others_id, '#94a3b8', 'archive', 'category_eliminated');
	ELSE
		UPDATE "categories"
		SET "parent_id" = others_id, "system_key" = 'category_eliminated', "deleted_at" = NULL
		WHERE "id" = eliminated_id;
	END IF;
END $$;--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "request_hash" text;--> statement-breakpoint
CREATE UNIQUE INDEX "records_idempotency_idx" ON "records" USING btree ("idempotency_key");
