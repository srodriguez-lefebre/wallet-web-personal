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
CREATE FUNCTION wallet_assign_category_keys(strict_matches boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql VOLATILE AS $$
DECLARE policy record; best_preference integer; matches bigint; chosen uuid;
BEGIN
 FOR policy IN SELECT phase,key,array_agg(name ORDER BY preference,name) AS names FROM (VALUES (1,'shopping',ARRAY['shopping']),
(1,'insurance',ARRAY['insurance','seguros']),
(1,'restaurants',ARRAY['restaurant, fast-food','restaurants']),
(1,'taxi',ARRAY['taxi']),
(1,'streaming',ARRAY['tv, streaming','subscriptions']),
(1,'greengrocer',ARRAY['fruits, vegetables and healthy','greengrocer']),
(1,'bakery',ARRAY['bakery']),
(1,'butcher',ARRAY['meat, fish and eggs','butcher']),
(1,'pharmacy',ARRAY['drug-store, chemist','medical services']),
(1,'supermarket',ARRAY['supermarket']),
(1,'service_station',ARRAY['service station']),
(1,'public_transport',ARRAY['public transport']),
(2,'others',ARRAY['otros']),
(2,'others',ARRAY['others']),
(2,'unknown_expense',ARRAY['unknown expense']),
(2,'category_eliminated',ARRAY['category eliminated']),
(2,'shopping',ARRAY['shopping']),
(2,'taxi',ARRAY['taxi']),
(2,'public_transport',ARRAY['public transport']),
(2,'restaurants',ARRAY['restaurant, fast-food']),
(2,'streaming',ARRAY['tv, streaming']),
(2,'subscriptions',ARRAY['subscriptions']),
(2,'groceries',ARRAY['groceries']),
(2,'supermarket',ARRAY['supermarket']),
(2,'greengrocer',ARRAY['fruits, vegetables and healthy']),
(2,'greengrocer',ARRAY['frutas, verduras y saludables']),
(2,'bakery',ARRAY['bakery']),
(2,'butcher',ARRAY['meat, fish and eggs']),
(2,'pharmacy',ARRAY['drug-store, chemist']),
(2,'service_station',ARRAY['service station']),
(2,'services',ARRAY['services']),
(2,'money_services',ARRAY['money services']),
(2,'car',ARRAY['car']),
(2,'clothing',ARRAY['clothes & footwear']),
(2,'software',ARRAY['software, apps, games']),
(2,'hardware',ARRAY['hardware']),
(2,'culture',ARRAY['culture, sport events']),
(2,'bank_fees',ARRAY['bank']),
(2,'education',ARRAY['education, development']),
(2,'wellness',ARRAY['wellness, beauty']),
(2,'fitness',ARRAY['active sport, fitness']),
(2,'travel',ARRAY['holiday, trips, hotels'])) AS mapping(phase,key,names)
 CROSS JOIN LATERAL unnest(mapping.names) WITH ORDINALITY AS aliases(name,preference)
 GROUP BY phase,key ORDER BY phase,key
 LOOP
  IF EXISTS(SELECT 1 FROM categories WHERE system_key=policy.key) THEN CONTINUE; END IF;
  SELECT min(array_position(policy.names,lower(btrim(c.name)))) INTO best_preference
  FROM categories c WHERE c.deleted_at IS NULL AND c.system_key IS NULL
  AND lower(btrim(c.name))=ANY(policy.names);
  SELECT count(*),(array_agg(c.id))[1] INTO matches,chosen FROM categories c
  WHERE c.deleted_at IS NULL AND c.system_key IS NULL
  AND (policy.phase=2 AND lower(btrim(c.name))=ANY(policy.names)
       OR policy.phase=1 AND array_position(policy.names,lower(btrim(c.name)))=best_preference);
  IF matches > 1 AND strict_matches THEN
   RAISE EXCEPTION 'Ambiguous canonical category identity'
    USING ERRCODE='23514', CONSTRAINT='wallet_restore_category_key_ambiguous';
  END IF;
  IF matches=1 THEN UPDATE categories SET system_key=policy.key WHERE id=chosen; END IF;
 END LOOP;
END
$$;
--> statement-breakpoint
SELECT wallet_assign_category_keys(false);
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
SELECT processor || CASE WHEN location='' THEN '' ELSE ' ' || location END,'unknown_expense',0,true
FROM unnest(ARRAY['MERPAGO','MERCADOPAGO','HANDY','DLO']) AS processor
CROSS JOIN unnest(ARRAY['','UY','MONTE','MONTEVIDEO','URUGUAY','MONTE UY','MONTEVIDEO UY','MONTE URUGUAY','MONTEVIDEO URUGUAY']) AS location
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
