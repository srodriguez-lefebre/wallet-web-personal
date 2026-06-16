ALTER TABLE "categories" DROP COLUMN "type";--> statement-breakpoint
ALTER TABLE "categories" DROP COLUMN "is_active";--> statement-breakpoint
DROP TYPE "public"."category_type";