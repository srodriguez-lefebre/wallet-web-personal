import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { DbClient } from "../db/client.js";
import { merchantAliases, merchants } from "../db/schema.js";
import { normalizeMerchantTerm } from "./normalization.js";

// Learned descriptors are exact cache entries; explicit aliases retain broad matching.
export const LEARNED_MERCHANT_PRIORITY = -1;

export interface MerchantRuleLearning {
  merchantName: string;
  merchantRaw: string;
  categoryId: string;
  existingMerchant?: { id: string; previousCategoryId: string };
}

/** Queries must run inside the guarded ingestion transaction, never separately. */
export function prepareMerchantLearning(db: DbClient, learning?: MerchantRuleLearning) {
  if (!learning) return [];
  if (learning.existingMerchant) {
    const previous = learning.existingMerchant;
    // A manual correction or another worker's result wins over stale inference.
    return [db.execute(sql`UPDATE ${merchants}
      SET category_id = ${learning.categoryId}::uuid, updated_at = now()
      WHERE id = ${previous.id}::uuid
        AND category_id = ${previous.previousCategoryId}::uuid AND is_active`)];
  }

  const normalizedAlias = normalizeMerchantTerm(learning.merchantRaw);
  if (!normalizedAlias) return [];
  return [
    db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${'merchant-learning:' + normalizedAlias}, 0))`),
    db.execute(sql`INSERT INTO ${merchants} (id, name, category_id, priority)
      SELECT ${randomUUID()}::uuid, ${learning.merchantName}, ${learning.categoryId}::uuid, ${LEARNED_MERCHANT_PRIORITY}
      WHERE NOT EXISTS (SELECT 1 FROM ${merchantAliases} WHERE normalized_alias = ${normalizedAlias})
        AND NOT EXISTS (
          SELECT 1 FROM ${merchantAliases} a JOIN ${merchants} m ON m.id = a.merchant_id
          WHERE m.is_active AND m.priority <> ${LEARNED_MERCHANT_PRIORITY}
            AND btrim(a.normalized_alias) <> ''
            AND strpos(${' ' + normalizedAlias + ' '}, ' ' || btrim(regexp_replace(upper(a.normalized_alias), '[^A-Z0-9]+', ' ', 'g')) || ' ') > 0
        )
      ON CONFLICT (name) DO NOTHING`),
    db.execute(sql`INSERT INTO ${merchantAliases} (merchant_id, alias, normalized_alias)
      SELECT id, ${learning.merchantRaw}, ${normalizedAlias} FROM ${merchants}
      WHERE name = ${learning.merchantName} AND category_id = ${learning.categoryId}::uuid AND is_active
      ON CONFLICT (normalized_alias) DO NOTHING`),
  ];
}
