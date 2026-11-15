import { and, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";

import { categoryReadColumns } from "../db/category-metadata.js";
import { isReviewCategory, normalizeBankMerchant } from "../../shared/record-review.js";
import {
  categories,
  merchantAliases,
  merchants,
  records,
  merchantCategoryRules,
} from "../db/schema.js";
import { normalizeMerchantTerm, pickLongestMerchantMatch } from "./normalization.js";
import { matchingMerchantTerms } from "./merchant-rules.js";
import { type CategoryInferenceDiagnostic } from "./openai-category.js";
import { callCategoryProvider } from "./providers/category.js";

import type { DbClient } from "../db/client.js";
import type { MerchantRuleLearning } from "./learned-merchant.js";
interface CategoryResolution {
  categoryId: string | undefined;
  merchantName: string;
  source:
    | "merchant_rule"
    | "corrected_rule"
    | "generic_rule"
    | "openai"
    | "fallback"
    | "transfer"
    | "user_rule"
    | "user_suggestion";
  needsReview: boolean;
  reason?: string;
  modelAttempt?: CategoryInferenceDiagnostic;
  learning?: MerchantRuleLearning;
}
export async function resolveCategory(
  db: DbClient,
  merchantRaw: string,
  useCorrections = true,
): Promise<CategoryResolution> {
  const merchantTerms = matchingMerchantTerms(merchantRaw);
  const aliasRows = await db
    .select({
      normalizedAlias: merchantAliases.normalizedAlias,
      merchantId: merchants.id,
      merchantName: merchants.name,
      categoryId: merchants.categoryId,
      priority: merchants.priority,
      matchMode: merchants.matchMode,
    })
    .from(merchantAliases)
    .innerJoin(
      merchants,
      and(eq(merchantAliases.merchantId, merchants.id), eq(merchants.isActive, true)),
    )
    .where(
      sql`wallet_normalize_merchant(${merchantAliases.normalizedAlias}) IN (SELECT value FROM jsonb_array_elements_text(${JSON.stringify(merchantTerms)}::jsonb))`,
    );
  const explicit = pickLongestMerchantMatch(
    merchantRaw,
    aliasRows.filter((alias) => alias.matchMode === "alias"),
  );
  const learned = aliasRows.find(
    (alias) =>
      alias.matchMode === "exact" &&
      normalizeMerchantTerm(alias.normalizedAlias) === normalizeMerchantTerm(merchantRaw),
  );
  const local = explicit ?? learned;
  // Classification may change, but the identity used to deduplicate must stay stable.
  const merchantName = local?.merchantName ?? merchantRaw;
  const allCategories = await db
    .select(categoryReadColumns)
    .from(categories)
    .where(isNull(categories.deletedAt));
  const fallback =
    allCategories.find((item) => item.systemKey === "unknown_expense") ??
    allCategories.find(
      (item) => !item.systemKey && item.name.toLowerCase() === "unknown expense",
    ) ??
    allCategories.find((item) => item.systemKey === "others") ??
    allCategories.find((item) => !item.systemKey && item.name.toLowerCase() === "others");
  const isUnknown = (id: string) => !isReviewCategory(allCategories.find((item) => item.id === id));
  if (useCorrections) {
    const correctedRecords = await db
      .select({
        categoryId: categories.id,
        merchant: records.importMerchant,
        correction: records.merchantCorrection,
      })
      .from(records)
      .innerJoin(categories, eq(records.categoryId, categories.id))
      .where(
        and(
          isNull(records.deletedAt),
          isNull(categories.deletedAt),
          isNotNull(records.merchantCorrection),
          sql`upper(btrim(regexp_replace(normalize(${records.importMerchant},NFKC),'\\s+',' ','g'))) = ${normalizeBankMerchant(merchantRaw)}`,
          eq(records.type, "expense"),
          ne(records.paymentType, "transfer"),
          ne(records.paymentStatus, "cancelled"),
        ),
      )
      .orderBy(sql`${records.merchantCorrection}->>'savedAt' DESC`, sql`${records.id} DESC`);
    const merchantKey = normalizeBankMerchant(merchantRaw);
    const match = correctedRecords.find(
      ({ merchant, categoryId }) =>
        merchant &&
        normalizeBankMerchant(merchant) === merchantKey &&
        isReviewCategory(allCategories.find((category) => category.id === categoryId)),
    );
    if (match?.correction) {
      if (match.correction.autoApply) {
        return {
          categoryId: match.categoryId,
          merchantName,
          source: "user_rule",
          needsReview: false,
        };
      }
      if (fallback)
        return {
          categoryId: fallback.id,
          merchantName,
          source: "user_suggestion",
          needsReview: true,
        };
    }
  }
  const descriptorWithoutReferences = normalizeMerchantTerm(merchantRaw)
    .split(" ")
    .filter((token) => !/^\d+$/.test(token))
    .join(" ");
  // Numeric terminal references may interrupt a processor's location suffix.
  // Only policy candidates use this alternate descriptor; merchant identity does not.
  const policyTerms = [
    ...new Set([...merchantTerms, ...matchingMerchantTerms(descriptorWithoutReferences)]),
  ];
  const policies = await db
    .select()
    .from(merchantCategoryRules)
    .where(
      sql`${merchantCategoryRules.normalizedAlias} IN (SELECT value FROM jsonb_array_elements_text(${JSON.stringify(policyTerms)}::jsonb))`,
    );
  const policy = pickLongestMerchantMatch(
    merchantRaw,
    policies.filter((rule) =>
      allCategories.some((category) => category.systemKey === rule.categorySystemKey),
    ),
  );
  const processorPolicy = policies.find(
    (rule) =>
      rule.reviewWhenMissing &&
      rule.categorySystemKey === "unknown_expense" &&
      rule.normalizedAlias === descriptorWithoutReferences,
  );
  if (
    fallback &&
    processorPolicy &&
    (!local || isUnknown(local.categoryId)) &&
    descriptorWithoutReferences === processorPolicy.normalizedAlias
  ) {
    return {
      categoryId: fallback.id,
      merchantName,
      source: "fallback",
      needsReview: true,
      reason: "generic_payment_processor",
    };
  }
  const target = allCategories.find((item) => item.systemKey === policy?.categorySystemKey);
  const localCategory = allCategories.find((item) => item.id === local?.categoryId);
  const overrides =
    policy?.overrideMerchant &&
    local &&
    normalizeMerchantTerm(local.merchantName) === policy.overrideMerchant &&
    (!policy.overrideFromCategoryKey ||
      localCategory?.systemKey === policy.overrideFromCategoryKey);
  if (policy && target && overrides)
    return {
      categoryId: target.id,
      merchantName: policy.overrideFromCategoryKey ? local.merchantName : merchantRaw,
      source: policy.overrideFromCategoryKey ? "corrected_rule" : "generic_rule",
      needsReview: false,
    };
  if (local && !isUnknown(local.categoryId))
    return {
      categoryId: local.categoryId,
      merchantName: local.merchantName,
      source: "merchant_rule",
      needsReview: false,
    };
  const missingRequiredPolicy = policies.find(
    (rule) =>
      rule.reviewWhenMissing &&
      rule.categorySystemKey !== "unknown_expense" &&
      !allCategories.some((category) => category.systemKey === rule.categorySystemKey),
  );
  if (missingRequiredPolicy && fallback)
    return {
      categoryId: fallback.id,
      merchantName,
      source: "fallback",
      needsReview: true,
      reason: "missing_insurance_category",
    };
  if (policy && target && !isUnknown(target.id))
    return {
      categoryId: target.id,
      merchantName,
      source: "generic_rule",
      needsReview: false,
    };
  const parentIds = new Set(allCategories.map((item) => item.parentId).filter(Boolean));
  const byId = new Map(allCategories.map((item) => [item.id, item]));
  const leaves = allCategories.filter((item) => !parentIds.has(item.id));
  const options = leaves.map((item) => ({
    id: item.id,
    path: item.parentId ? `${byId.get(item.parentId)?.name ?? ""} > ${item.name}` : item.name,
  }));
  let modelAttempt: CategoryInferenceDiagnostic | undefined;
  try {
    const inferred = await callCategoryProvider(db, {
      merchantRaw,
      categories: options,
      report: (diagnostic) => {
        modelAttempt = diagnostic;
      },
    });
    if (inferred && options.some((item) => item.id === inferred))
      return {
        categoryId: inferred,
        merchantName,
        source: "openai",
        needsReview: isUnknown(inferred),
        modelAttempt,
        learning: isUnknown(inferred)
          ? undefined
          : {
              merchantName,
              merchantRaw,
              categoryId: inferred,
              existingMerchant: local
                ? { id: local.merchantId, previousCategoryId: local.categoryId }
                : undefined,
            },
      };
  } catch {
    modelAttempt = {
      outcome: "failed",
      model: process.env.OPENAI_MODEL?.trim() || "gpt-5-nano",
      reason: "unexpected_classifier_error",
      elapsedMs: 0,
    };
  }
  if (!fallback) throw new Error("Protected Unknown expense category is not configured");
  return {
    categoryId: fallback.id,
    merchantName,
    source: "fallback",
    needsReview: true,
    modelAttempt,
  };
}
