CREATE TABLE "merchant_category_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"normalized_alias" text NOT NULL,
	"category_system_key" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"override_merchant" text,
	"override_from_category_key" text,
	"review_when_missing" boolean DEFAULT false NOT NULL,
	CONSTRAINT "merchant_category_rules_normalized_alias_unique" UNIQUE("normalized_alias")
);
--> statement-breakpoint
CREATE TABLE "provider_state" (
	"name" text PRIMARY KEY NOT NULL,
	"open_until" timestamp with time zone,
	"failures" integer DEFAULT 0 NOT NULL,
	"generation" integer DEFAULT 0 NOT NULL
);

--> statement-breakpoint
-- Data policies are separate from unique user/learned merchant aliases: seeding a
-- fallback must never steal an alias, change its canonical identity or block learning.
-- Existing categories receive keys only for an unambiguous canonical-name match.
-- No financial history, names, parents or user merchant assignments are changed.
WITH mapping(key,names) AS (VALUES ('shopping',ARRAY['shopping']),
('insurance',ARRAY['insurance','seguros']),
('restaurants',ARRAY['restaurant, fast-food','restaurants']),
('taxi',ARRAY['taxi']),
('streaming',ARRAY['tv, streaming','subscriptions']),
('greengrocer',ARRAY['fruits, vegetables and healthy','greengrocer']),
('bakery',ARRAY['bakery']),
('butcher',ARRAY['meat, fish and eggs','butcher']),
('pharmacy',ARRAY['drug-store, chemist','medical services']),
('supermarket',ARRAY['supermarket']),
('service_station',ARRAY['service station']),
('public_transport',ARRAY['public transport'])),
candidates AS (
 SELECT m.key,c.id,array_position(m.names,lower(c.name)) AS preference,
 count(*) OVER (PARTITION BY m.key,lower(c.name)) AS matches
 FROM mapping m JOIN categories c ON lower(c.name)=ANY(m.names)
 WHERE c.deleted_at IS NULL AND c.system_key IS NULL
 AND NOT EXISTS (SELECT 1 FROM categories existing WHERE existing.system_key=m.key)
), ranked AS (
 SELECT *,row_number() OVER(PARTITION BY key ORDER BY preference,id) AS rank FROM candidates
)
UPDATE categories c SET system_key=r.key FROM ranked r
WHERE c.id=r.id AND r.rank=1 AND r.matches=1;
--> statement-breakpoint
INSERT INTO merchant_category_rules(normalized_alias,category_system_key,priority,override_merchant,override_from_category_key,review_when_missing)
VALUES ('PANALERA','shopping',12,NULL,NULL,false),
('PANALERIA','shopping',12,NULL,NULL,false),
('BANCO DE SEGUROS','insurance',11,NULL,NULL,true),
('ASEGURADORA','insurance',11,NULL,NULL,true),
('UBER EATS','restaurants',10,'UBER',NULL,false),
('UBEREATS','restaurants',10,'UBER',NULL,false),
('UBER','taxi',9,'UBER','public_transport',false),
('CABIFY','taxi',9,'CABIFY','public_transport',false),
('TAXI','taxi',9,'TAXI','public_transport',false),
('HBOMAX','streaming',8,NULL,NULL,false),
('HBO MAX','streaming',8,NULL,NULL,false),
('HELPHBOMAX','streaming',8,NULL,NULL,false),
('FRUTERIA','greengrocer',7,NULL,NULL,false),
('VERDULERIA','greengrocer',7,NULL,NULL,false),
('VERDULERIA Y FRUTERIA','greengrocer',7,NULL,NULL,false),
('PANADERIA','bakery',6,NULL,NULL,false),
('CROISSANTERIA','bakery',6,NULL,NULL,false),
('PANES 1','bakery',6,NULL,NULL,false),
('CARNICERIA','butcher',5,NULL,NULL,false),
('FARMACIA','pharmacy',4,NULL,NULL,false),
('SUPERMERCADO','supermarket',3,NULL,NULL,false),
('MINIMARKET','supermarket',3,NULL,NULL,false),
('PIZZERIA','restaurants',2,NULL,NULL,false),
('CAFETERIA','restaurants',2,NULL,NULL,false),
('RESTAURANTE','restaurants',2,NULL,NULL,false),
('ESTACION DE SERVICIO','service_station',1,NULL,NULL,false)
ON CONFLICT(normalized_alias) DO NOTHING;

--> statement-breakpoint
-- A processor plus a terminal/reference number contains no underlying merchant.
INSERT INTO merchant_category_rules(normalized_alias,category_system_key,priority,review_when_missing)
VALUES ('MERPAGO','unknown_expense',0,true),('MERCADOPAGO','unknown_expense',0,true),('HANDY','unknown_expense',0,true),('DLO','unknown_expense',0,true)
ON CONFLICT(normalized_alias) DO NOTHING;

--> statement-breakpoint
CREATE FUNCTION wallet_normalize_merchant(value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
 SELECT btrim(regexp_replace(upper(regexp_replace(normalize(value,NFD),'[̀-ͯ]','','g')),'[^A-Z0-9]+',' ','g'))
$$;
--> statement-breakpoint
CREATE INDEX merchant_aliases_search_idx ON merchant_aliases(wallet_normalize_merchant(normalized_alias));
--> statement-breakpoint
CREATE INDEX record_merchant_correction_search_idx ON records(upper(btrim(regexp_replace(normalize(import_merchant,NFKC),'\s+',' ','g')))) WHERE deleted_at IS NULL AND merchant_correction IS NOT NULL;

--> statement-breakpoint
-- Import taxonomy identities; keep existing keys, parents, names and financial data.
WITH mapping(name,key) AS (VALUES ('otros','others'),
('others','others'),
('unknown expense','unknown_expense'),
('category eliminated','category_eliminated'),
('shopping','shopping'),
('taxi','taxi'),
('public transport','public_transport'),
('restaurant, fast-food','restaurants'),
('tv, streaming','streaming'),
('subscriptions','subscriptions'),
('groceries','groceries'),
('supermarket','supermarket'),
('fruits, vegetables and healthy','greengrocer'),
('frutas, verduras y saludables','greengrocer'),
('bakery','bakery'),
('meat, fish and eggs','butcher'),
('drug-store, chemist','pharmacy'),
('service station','service_station'),
('services','services'),
('money services','money_services'),
('car','car'),
('clothes & footwear','clothing'),
('software, apps, games','software'),
('hardware','hardware'),
('culture, sport events','culture'),
('bank','bank_fees'),
('education, development','education'),
('wellness, beauty','wellness'),
('active sport, fitness','fitness'),
('holiday, trips, hotels','travel')), candidates AS (
SELECT c.id,m.key,count(*) OVER(PARTITION BY m.key) AS matches FROM categories c JOIN mapping m ON lower(c.name)=m.name
WHERE c.system_key IS NULL AND c.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM categories existing WHERE existing.system_key=m.key)
) UPDATE categories c SET system_key=m.key FROM candidates m WHERE c.id=m.id AND m.matches=1;
