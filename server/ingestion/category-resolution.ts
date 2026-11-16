import { and, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";

import { categoryMatchesKind } from "../../shared/categories.js";
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
import { categoryModel } from "./openai-category.js";
import { callCategoryProvider } from "./providers/category.js";

import type { DbClient } from "../db/client.js";
import type { CategoryRow } from "../db/category-metadata.js";
import type { CategoryDecision, CategoryInferenceDiagnostic } from "./openai-category.js";
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
  suggestedCategoryId?: string;
}

interface UnresolvedCategory {
  source: "unresolved";
  merchantName: string;
  fallbackId: string | undefined;
  activeCategories: CategoryRow[];
}

function readActiveCategories(db: DbClient) {
  return db.select(categoryReadColumns).from(categories).where(isNull(categories.deletedAt));
}

function modelCategoryOptions(activeCategories: CategoryRow[]) {
  const parentIds = new Set(activeCategories.map((category) => category.parentId));
  const byId = new Map(activeCategories.map((category) => [category.id, category]));
  return activeCategories
    .filter(
      (category) =>
        !parentIds.has(category.id) &&
        isReviewCategory(category) &&
        categoryMatchesKind({ kind: category.kind ?? undefined }, "expense"),
    )
    .map((category) => {
      const path = [category.name];
      const visited = new Set([category.id]);
      let parent = category.parentId ? byId.get(category.parentId) : undefined;
      while (parent && !visited.has(parent.id)) {
        path.unshift(parent.name);
        visited.add(parent.id);
        parent = parent.parentId ? byId.get(parent.parentId) : undefined;
      }
      return { id: category.id, path: path.join(" > ") };
    })
    .sort((a, b) => a.path.localeCompare(b.path) || a.id.localeCompare(b.id));
}

export async function resolveCategoryRules(
  db: DbClient,
  merchantRaw: string,
  useCorrections = true,
): Promise<CategoryResolution | UnresolvedCategory> {
  const merchantTerms = matchingMerchantTerms(merchantRaw);
  const aliasRows = await db
    .select({
      normalizedAlias: merchantAliases.normalizedAlias,
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
  const allCategories = await readActiveCategories(db);
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
  return {
    source: "unresolved",
    merchantName,
    fallbackId: fallback?.id,
    activeCategories: allCategories,
  };
}

export async function completeCategoryResolution(
  db: DbClient,
  lookup: CategoryResolution | UnresolvedCategory,
  merchantRaw: string,
  allowModel = true,
): Promise<CategoryResolution> {
  if (lookup.source !== "unresolved") return lookup;
  const { fallbackId, merchantName, activeCategories } = lookup;
  if (!fallbackId) throw new Error("Protected Unknown expense category is not configured");
  const fallback: CategoryResolution = {
    categoryId: fallbackId,
    merchantName,
    source: "fallback",
    needsReview: true,
  };
  if (!allowModel) return fallback;
  const options = modelCategoryOptions(activeCategories);
  let modelAttempt: CategoryInferenceDiagnostic | undefined;
  let decision: CategoryDecision | null = null;
  try {
    decision = await callCategoryProvider(db, {
      merchantRaw,
      categories: options,
      report: (diagnostic) => {
        modelAttempt = diagnostic;
      },
    });
  } catch {
    modelAttempt = {
      outcome: "failed",
      model: categoryModel(),
      reason: "unexpected_classifier_error",
      elapsedMs: 0,
    };
  }
  if (!decision) return { ...fallback, modelAttempt };
  if (decision.decision === "review")
    return { ...fallback, source: "openai", reason: decision.reason, modelAttempt };

  const offered = options.some(({ id }) => id === decision.categoryId);
  const current = offered && modelCategoryOptions(await readActiveCategories(db));
  if (!current || !current.some(({ id }) => id === decision.categoryId))
    return { ...fallback, reason: "category_no_longer_available", modelAttempt };
  return { ...fallback, source: "openai", suggestedCategoryId: decision.categoryId, modelAttempt };
}

export async function resolveCategory(db: DbClient, merchantRaw: string, useCorrections = true) {
  const lookup = await resolveCategoryRules(db, merchantRaw, useCorrections);
  return completeCategoryResolution(db, lookup, merchantRaw);
}
