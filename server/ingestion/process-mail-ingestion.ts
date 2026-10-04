import { and, eq, gte, isNotNull, isNull, lt, lte, ne, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { CurrencyCode, MailIngestionResult } from "../../shared/types.js";
import type { MailIngestionInput } from "../../shared/schemas.js";
import { createDb, type DbClient } from "../db/client.js";
import {
  accounts,
  categories,
  creditCardRecords,
  creditCards,
  ingestionEvents,
  merchantAliases,
  merchants,
  records,
  settings,
} from "../db/schema.js";
import { prepareRecordGoalWrites } from "../db/wallet-repository.js";
import { resolveFrozenRate, type FrozenRate } from "./exchange-rates.js";
import { inferCategoryWithOpenAi, type CategoryInferenceDiagnostic } from "./openai-category.js";
import { LEARNED_MERCHANT_PRIORITY, prepareMerchantLearning, type MerchantRuleLearning } from "./learned-merchant.js";
import {
  cardLastFour,
  normalizeMerchantTerm,
  merchantTokenSequenceMatch,
  pickLongestMerchantMatch,
} from "./normalization.js";

export class IngestionInProgressError extends Error {}

function money(value: number) {
  return value.toFixed(2);
}

function rate(value: number) {
  return value.toFixed(6);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

const genericMerchantCategoryRules = [
  {
    aliases: ["PANALERA", "PANALERIA"],
    categoryNames: ["Shopping"],
  },
  {
    aliases: ["BANCO DE SEGUROS", "ASEGURADORA"],
    categoryNames: ["Insurance", "Seguros"],
  },
  {
    aliases: ["UBER EATS", "UBEREATS"],
    categoryNames: ["Restaurant, fast-food", "Restaurants"],
  },
  {
    aliases: ["UBER", "CABIFY", "TAXI"],
    categoryNames: ["Taxi"],
  },
  {
    aliases: ["HBOMAX", "HBO MAX", "HELPHBOMAX"],
    categoryNames: ["TV, Streaming", "Subscriptions"],
  },
  {
    aliases: ["FRUTERIA", "VERDULERIA", "VERDULERIA Y FRUTERIA"],
    categoryNames: ["Fruits, vegetables and healthy", "Greengrocer"],
  },
  {
    aliases: ["PANADERIA", "CROISSANTERIA", "PANES 1"],
    categoryNames: ["Bakery"],
  },
  {
    aliases: ["CARNICERIA"],
    categoryNames: ["Meat, fish and eggs", "Butcher"],
  },
  {
    aliases: ["FARMACIA"],
    categoryNames: ["Drug-store, chemist", "Medical services"],
  },
  {
    aliases: ["SUPERMERCADO", "MINIMARKET"],
    categoryNames: ["Supermarket"],
  },
  {
    aliases: ["PIZZERIA", "CAFETERIA", "RESTAURANTE"],
    categoryNames: ["Restaurant, fast-food", "Restaurants"],
  },
  {
    aliases: ["ESTACION DE SERVICIO"],
    categoryNames: ["Service station"],
  },
] as const;

function pickGenericMerchantCategory(
  merchantRaw: string,
  categoryRows: Array<typeof categories.$inferSelect>,
) {
  const categoryByName = new Map(
    categoryRows.map((category) => [category.name.toLowerCase(), category]),
  );
  const candidates = genericMerchantCategoryRules.flatMap((rule, ruleIndex) => {
    const category = rule.categoryNames
      .map((name) => categoryByName.get(name.toLowerCase()))
      .find(Boolean);
    if (!category) return [];
    return rule.aliases.map((alias) => ({
      normalizedAlias: normalizeMerchantTerm(alias),
      priority: genericMerchantCategoryRules.length - ruleIndex,
      categoryId: category.id,
      merchantName: merchantRaw,
    }));
  });

  return pickLongestMerchantMatch(merchantRaw, candidates);
}

function sanitizedPayload(input: MailIngestionInput) {
  const mask = (value: string | undefined) => value ? `****${value.replace(/\D/g, "").slice(-4)}` : undefined;
  return {
    integration: input.integration,
    email: { ...input.email },
    transaction: { ...input.transaction, accountNumber: mask(input.transaction.accountNumber), destinationAccountNumber: mask(input.transaction.destinationAccountNumber) },
    destination: { ...input.destination },
  };
}

async function pruneExpiredMetadata(db: DbClient) {
  const now = new Date();
  await db
    .update(ingestionEvents)
    .set({
      emailThreadId: null,
      emailSubject: null,
      emailFrom: null,
      sanitizedPayload: null,
      updatedAt: now,
    })
    .where(
      and(
        lt(ingestionEvents.metadataExpiresAt, now),
        isNotNull(ingestionEvents.sanitizedPayload),
      ),
    );
}

interface CategoryResolution {
  categoryId: string | undefined;
  merchantName: string;
  source: "merchant_rule" | "corrected_rule" | "generic_rule" | "openai" | "fallback" | "transfer";
  needsReview: boolean;
  reason?: string;
  modelAttempt?: CategoryInferenceDiagnostic;
  learning?: MerchantRuleLearning;
}

export async function resolveCategory(db: DbClient, merchantRaw: string): Promise<CategoryResolution> {
  const aliasRows = await db
    .select({
      normalizedAlias: merchantAliases.normalizedAlias,
      merchantId: merchants.id,
      merchantName: merchants.name,
      categoryId: merchants.categoryId,
      priority: merchants.priority,
    })
    .from(merchantAliases)
    .innerJoin(
      merchants,
      and(
        eq(merchantAliases.merchantId, merchants.id),
        eq(merchants.isActive, true),
      ),
    );
  const explicit = pickLongestMerchantMatch(merchantRaw, aliasRows.filter(alias => alias.priority !== LEARNED_MERCHANT_PRIORITY));
  const learned = aliasRows.find(alias => alias.priority === LEARNED_MERCHANT_PRIORITY
    && normalizeMerchantTerm(alias.normalizedAlias) === normalizeMerchantTerm(merchantRaw));
  const local = explicit ?? learned;
  // Classification may change, but the identity used to deduplicate must stay stable.
  const merchantName = local?.merchantName ?? merchantRaw;
  const allCategories = await db.select().from(categories);
  const fallback = allCategories.find(item => item.systemKey === "unknown_expense")
    ?? allCategories.find(item => item.name.toLowerCase() === "unknown expense")
    ?? allCategories.find(item => item.name.toLowerCase() === "others");
  const isUnknown = (id: string) => {
    const category = allCategories.find(item => item.id === id);
    return !category || category.systemKey === "unknown_expense" || ["unknown expense", "others"].includes(category.name.toLowerCase());
  };
  const generic = pickGenericMerchantCategory(merchantRaw, allCategories);
  // A broad Uber alias must not consume the more specific food-delivery notice.
  if (generic && local && normalizeMerchantTerm(local.merchantName) === "UBER" && ["UBER EATS", "UBEREATS"].includes(generic.normalizedAlias)) {
    return { categoryId: generic.categoryId, merchantName: merchantRaw, source: "generic_rule", needsReview: false };
  }
  const taxi = allCategories.find(item => item.name.toLowerCase() === "taxi");
  if (local && taxi && ["UBER", "CABIFY", "TAXI"].includes(normalizeMerchantTerm(local.merchantName)) && allCategories.find(item => item.id === local.categoryId)?.name.toLowerCase() === "public transport") {
    return { categoryId: taxi.id, merchantName: local.merchantName, source: "corrected_rule", needsReview: false };
  }
  if (local && !isUnknown(local.categoryId))
    return {
      categoryId: local.categoryId,
      merchantName: local.merchantName,
      source: "merchant_rule",
      needsReview: false,
    };

  const missingInsuranceCategory = genericMerchantCategoryRules.find(rule => rule.categoryNames[0] === "Insurance"
    && rule.aliases.some(alias => merchantTokenSequenceMatch(merchantRaw, alias))
    && !allCategories.some(category => rule.categoryNames.some(name => name.toLowerCase() === category.name.toLowerCase())));
  if (missingInsuranceCategory && fallback) return { categoryId: fallback.id, merchantName, source: "fallback", needsReview: true, reason: "missing_insurance_category" };

  if (generic)
    return {
      categoryId: generic.categoryId,
      merchantName,
      source: "generic_rule",
      needsReview: false,
    };

  const parentIds = new Set(
    allCategories.map((item) => item.parentId).filter(Boolean),
  );
  const byId = new Map(allCategories.map((item) => [item.id, item]));
  const leaves = allCategories.filter((item) => !parentIds.has(item.id));
  const options = leaves.map((item) => ({
    id: item.id,
    path: item.parentId
      ? `${byId.get(item.parentId)?.name ?? ""} > ${item.name}`
      : item.name,
  }));
  let modelAttempt: CategoryInferenceDiagnostic | undefined;
  try {
    const inferred = await inferCategoryWithOpenAi(merchantRaw, options, diagnostic => { modelAttempt = diagnostic; });
    if (inferred && options.some(item => item.id === inferred))
      return {
        categoryId: inferred,
        merchantName,
        source: "openai",
        needsReview: isUnknown(inferred),
        modelAttempt,
        learning: isUnknown(inferred) ? undefined : {
          merchantName,
          merchantRaw,
          categoryId: inferred,
          existingMerchant: local ? { id: local.merchantId, previousCategoryId: local.categoryId } : undefined,
        },
      };
  } catch {
    modelAttempt = { outcome: "failed", model: process.env.OPENAI_MODEL?.trim() || "gpt-5-nano", reason: "unexpected_classifier_error", elapsedMs: 0 };
  }
  if (!fallback)
    throw new Error("Protected Unknown expense category is not configured");
  return {
    categoryId: fallback.id,
    merchantName,
    source: "fallback",
    needsReview: true,
    modelAttempt,
  };
}

async function convert(
  db: DbClient,
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  occurredAt: Date,
) {
  const frozen = await resolveFrozenRate(db, from, to, occurredAt);
  return frozen ? { amount: amount * frozen.rate, frozen } : null;
}

function conversionNote(
  from: CurrencyCode,
  to: CurrencyCode,
  frozen: FrozenRate,
) {
  if (from === to) return undefined;
  return `${from}/${to} ${frozen.rate.toFixed(6)} (${frozen.source}, ${frozen.date.toISOString().slice(0, 10)})`;
}

export async function processMailIngestion(
  input: MailIngestionInput,
  db: DbClient = createDb(),
): Promise<MailIngestionResult> {
  await pruneExpiredMetadata(db);
  const eventId = randomUUID();
  const now = new Date();
  const occurredAt = new Date(input.transaction.occurredAt);
  const merchantNormalized = normalizeMerchantTerm(
    input.transaction.merchantRaw,
  );
  // An abandoned worker may be retried after its lease; its old event ID cannot write again.
  await db.delete(ingestionEvents).where(and(eq(ingestionEvents.idempotencyKey,input.idempotencyKey),eq(ingestionEvents.status,"processing"),lt(ingestionEvents.updatedAt,new Date(now.getTime()-5*60_000))));
  const [claimed] = await db
    .insert(ingestionEvents)
    .values({
      id: eventId,
      idempotencyKey: input.idempotencyKey,
      source: input.transaction.source,
      status: "processing",
      merchantNormalized,
      amount: money(input.transaction.amount),
      currency: input.transaction.currency,
      occurredAt,
      emailMessageId: input.email.messageId,
      emailThreadId: input.email.threadId,
      emailSubject: input.email.subject,
      emailFrom: input.email.from,
      sanitizedPayload: sanitizedPayload(input),
      metadataExpiresAt: addDays(now, 90),
    })
    .onConflictDoNothing()
    .returning();

  if (!claimed) {
    const [existing] = await db
      .select()
      .from(ingestionEvents)
      .where(eq(ingestionEvents.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (existing?.status === "processing")
      throw new IngestionInProgressError("Ingestion is still processing");
    return {
      status: "already_processed",
      recordId: existing?.recordId ?? undefined,
      creditCardRecordId: existing?.creditCardRecordId ?? undefined,
    };
  }

  try {
    if (input.transaction.amount === 0) {
      await db
        .update(ingestionEvents)
        .set({
          status: "completed",
          action: "ignored",
          completedAt: now,
          updatedAt: now,
        })
        .where(eq(ingestionEvents.id, eventId));
      return { status: "ignored" };
    }

    const isCredit = input.transaction.paymentType === "credit_card";
    const isTransfer = input.transaction.paymentType === "transfer";
    const [account] = input.destination.accountId
      ? await db
          .select()
          .from(accounts)
          .where(
            and(
              eq(accounts.id, input.destination.accountId),
              isNull(accounts.deletedAt),
              eq(accounts.isActive, true),
            ),
          )
          .limit(1)
      : [];
    const [destinationAccount] = isTransfer && input.destination.destinationAccountId
      ? await db.select().from(accounts).where(and(eq(accounts.id, input.destination.destinationAccountId), isNull(accounts.deletedAt), eq(accounts.isActive, true))).limit(1)
      : [];
    if (isTransfer && input.destination.destinationAccountId && (!account || !destinationAccount || destinationAccount.id === account.id)) {
      throw new Error("Invalid owned transfer destination or source account");
    }
    const isOwnedTransfer = Boolean(isTransfer && destinationAccount);
    const recordType = isOwnedTransfer ? "transfer" : "expense";
    const paymentType = input.transaction.paymentType === "credit_card" ? "credit" : input.transaction.paymentType;
    let [card] = isCredit && input.destination.creditCardId
      ? await db
          .select()
          .from(creditCards)
          .where(
            and(
              eq(creditCards.id, input.destination.creditCardId),
              isNull(creditCards.deletedAt),
            ),
          )
          .limit(1)
      : [];
    if (isCredit && !input.destination.creditCardId) {
      const lastFour = cardLastFour(input.transaction.cardNumber);
      if (lastFour) {
        [card] = await db
          .select()
          .from(creditCards)
          .where(
            and(
              eq(creditCards.lastFour, lastFour),
              isNull(creditCards.deletedAt),
            ),
          )
          .limit(1);
      }
    }

    const accountWasInvalid = Boolean(input.destination.accountId && !account);
    const cardWasInvalid = Boolean(isCredit && input.destination.creditCardId && !card);
    const category = isOwnedTransfer
      ? { categoryId: undefined, merchantName: input.transaction.merchantRaw, source: "transfer" as const, needsReview: false }
      : await resolveCategory(db, input.transaction.merchantRaw);
    console.info(JSON.stringify({ event: "mail_category_classification", ingestionEventId: eventId, source: category.source, categoryId: category.categoryId, needsReview: category.needsReview, reason: "reason" in category ? category.reason : undefined, modelAttempt: "modelAttempt" in category ? category.modelAttempt : undefined }));
    const canonicalMerchantNormalized = normalizeMerchantTerm(
      category.merchantName,
    );
    // Keep existing credit fingerprints stable; bank methods cannot collide with them.
    const targetKey = `account:${account?.id ?? "none"}|card:${card?.id ?? "none"}${isCredit ? "" : `|method:${paymentType}|destination:${destinationAccount?.id ?? "none"}`}`;
    const fingerprint = [
      input.transaction.currency,
      money(input.transaction.amount),
      canonicalMerchantNormalized,
      targetKey,
    ].join("|");
    const duplicateWindowStart = new Date(occurredAt.getTime() - 10 * 60_000);
    const duplicateWindowEnd = new Date(occurredAt.getTime() + 10 * 60_000);
    const duplicateWhere = and(
      eq(ingestionEvents.fingerprint, fingerprint),
      ne(ingestionEvents.source, input.transaction.source),
      eq(ingestionEvents.status, "completed"),
      gte(ingestionEvents.occurredAt, duplicateWindowStart),
      lte(ingestionEvents.occurredAt, duplicateWindowEnd),
    );
    const findDuplicate = () => db
      .select()
      .from(ingestionEvents)
      .where(duplicateWhere)
      .limit(1);
    const completeDuplicate = async (duplicateId: string): Promise<MailIngestionResult> => {
      const completed = await db
        .update(ingestionEvents)
        .set({
          status: "completed",
          action: "duplicate",
          duplicateOfId: duplicateId,
          fingerprint,
          targetKey,
          merchantNormalized: canonicalMerchantNormalized,
          completedAt: now,
          updatedAt: now,
        })
        .where(and(eq(ingestionEvents.id, eventId), eq(ingestionEvents.status, "processing")))
        .returning({ id: ingestionEvents.id });
      if (!completed.length) throw new IngestionInProgressError("Ingestion claim expired");
      return { status: "duplicate", duplicateOfId: duplicateId };
    };
    const [duplicate] = await findDuplicate();
    if (duplicate) return await completeDuplicate(duplicate.id);

    const [settingsRow] = await db.select().from(settings).limit(1);
    const primaryCurrency = (settingsRow?.primaryCurrency ??
      "UYU") as CurrencyCode;
    const warnings: string[] = [];
    const primary = await convert(
      db,
      input.transaction.amount,
      input.transaction.currency,
      primaryCurrency,
      occurredAt,
    );
    const accountConversion = account
      ? await convert(
          db,
          input.transaction.amount,
          input.transaction.currency,
          account.currency as CurrencyCode,
          occurredAt,
        )
      : null;
    const cardConversion = card
      ? await convert(
          db,
          input.transaction.amount,
          input.transaction.currency,
          card.limitCurrency as CurrencyCode,
          occurredAt,
        )
      : null;
    const destinationConversion = destinationAccount
      ? await convert(db, input.transaction.amount, input.transaction.currency, destinationAccount.currency as CurrencyCode, occurredAt)
      : null;
    [
      primary?.frozen,
      accountConversion?.frozen,
      cardConversion?.frozen,
      destinationConversion?.frozen,
    ].forEach((item) => {
      if (item?.warning && !warnings.includes(item.warning))
        warnings.push(item.warning);
    });

    const unavailableConversion =
      !primary || (account && !accountConversion) || (card && !cardConversion) || (destinationAccount && !destinationConversion);
    if (isTransfer && !isOwnedTransfer) {
      warnings.push("Transfer destination ownership is unconfirmed; review whether it belongs to another Wallet account.");
    }
    if (!isCredit && !account) warnings.push("Bank account mapping unavailable; assign the correct account before confirming this notice.");
    if (category.needsReview) warnings.push("Category could not be determined automatically; review this expense.");
    const requiresReview =
      accountWasInvalid || cardWasInvalid || (isCredit ? !card : !account) || (isTransfer && !isOwnedTransfer) || unavailableConversion || category.needsReview;
    const effectiveAccount = isOwnedTransfer ? account : !accountWasInvalid && (isCredit ? Boolean(card) : true) && accountConversion ? account : undefined;
    const effectiveCard = cardConversion ? card : undefined;
    const noteParts = [
      input.transaction.sourceLabel ||
        `Imported from ${input.transaction.source}`,
      category.source === "openai" ? "Categorized by OpenAI" : undefined,
      primary &&
        conversionNote(
          input.transaction.currency,
          primaryCurrency,
          primary.frozen,
        ),
      accountConversion &&
        account &&
        conversionNote(
          input.transaction.currency,
          account.currency as CurrencyCode,
          accountConversion.frozen,
        ),
      cardConversion &&
        card &&
        conversionNote(
          input.transaction.currency,
          card.limitCurrency as CurrencyCode,
          cardConversion.frozen,
        ),
      ...warnings,
      isCredit && (cardWasInvalid || (!card && input.transaction.cardNumber))
        ? `Unknown card: ${input.transaction.cardAlias || input.transaction.cardNumber}`
        : undefined,
      accountWasInvalid
        ? `Unknown account: ${input.destination.accountId}`
        : undefined,
      destinationConversion && destinationAccount
        ? conversionNote(input.transaction.currency, destinationAccount.currency as CurrencyCode, destinationConversion.frozen)
        : undefined,
      isTransfer && input.transaction.destinationAccountNumber
        ? `Destination: ${input.transaction.destinationBank || "bank"} ****${input.transaction.destinationAccountNumber.replace(/\D/g, "").slice(-4)}`
        : undefined,
      unavailableConversion
        ? "Currency conversion unavailable; unresolved amounts remain under review."
        : undefined,
    ].filter(Boolean);
    const recordId =
      effectiveAccount || !effectiveCard || requiresReview ? randomUUID() : undefined;
    const cardRecordId = effectiveCard ? randomUUID() : undefined;
    const goalWrites=recordId?await prepareRecordGoalWrites(recordId,{
      type:recordType,amount:input.transaction.amount,currency:input.transaction.currency,
      accountId:effectiveAccount?.id,accountAmount:effectiveAccount?accountConversion?.amount:undefined,
      destinationAccountId:destinationAccount?.id,destinationAmount:destinationConversion?.amount,
      creditCardId:effectiveCard?.id,categoryId:category.categoryId,counterpartyName:category.merchantName,
      paymentType,paymentStatus:requiresReview?"needs_review":"cleared",
      exchangeRateToPrimary:primary?.frozen.rate??0,occurredAt:occurredAt.toISOString(),tagIds:[],
      amountInLimitCurrency:effectiveCard?cardConversion?.amount:undefined,exchangeRateToLimitCurrency:effectiveCard?cardConversion?.frozen.rate:undefined,
    },db):null;
    for (const warning of goalWrites?.warnings ?? []) {
      if (!warnings.includes(warning)) warnings.push(warning);
      noteParts.push(warning);
    }
    const note = [...new Set(noteParts)].join(" | ");
    const recordInsert = recordId
      ? db.insert(records).values({
          id: recordId,
          type: recordType,
          amount: money(input.transaction.amount),
          currency: input.transaction.currency,
          accountId: effectiveAccount?.id ?? null,
          accountAmount:
            effectiveAccount && accountConversion
              ? money(accountConversion.amount)
              : null,
          creditCardId: effectiveCard?.id ?? null,
          destinationAccountId: destinationAccount?.id ?? null,
          destinationAmount: destinationConversion ? money(destinationConversion.amount) : null,
          categoryId: category.categoryId,
          counterpartyName: category.merchantName,
          paymentType,
          paymentStatus: requiresReview ? "needs_review" : "cleared",
          exchangeRateToPrimary: rate(primary?.frozen.rate ?? 0),
          amountInLimitCurrency:
            effectiveCard && cardConversion
              ? money(cardConversion.amount)
              : null,
          exchangeRateToLimitCurrency:
            effectiveCard && cardConversion
              ? rate(cardConversion.frozen.rate)
              : null,
          occurredAt,
          note,
        })
      : null;
    const cardInsert =
      cardRecordId && effectiveCard && cardConversion && category.categoryId
        ? db.insert(creditCardRecords).values({
            id: cardRecordId,
            creditCardId: effectiveCard.id,
            walletRecordId: recordId ?? null,
            kind: "purchase",
            amount: money(input.transaction.amount),
            currency: input.transaction.currency,
            amountInLimitCurrency: money(cardConversion.amount),
            exchangeRateToLimitCurrency: rate(cardConversion.frozen.rate),
            categoryId: category.categoryId,
            counterpartyName: category.merchantName,
            note,
            accountId: effectiveAccount?.id ?? null,
            accountAmount:
              effectiveAccount && accountConversion
                ? money(accountConversion.amount)
                : null,
            accountImpactAtCreation: Boolean(effectiveAccount),
            occurredAt,
          })
        : null;
    const eventUpdate = db
      .update(ingestionEvents)
      .set({
        status: "completed",
        action: requiresReview ? "needs_review" : "created",
        fingerprint,
        targetKey,
        merchantNormalized: canonicalMerchantNormalized,
        recordId: recordId ?? null,
        creditCardRecordId: cardRecordId ?? null,
        sanitizedPayload: { ...sanitizedPayload(input), classification: category },
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(ingestionEvents.id, eventId));
    const claimLock=db.update(ingestionEvents).set({updatedAt:new Date()}).where(and(eq(ingestionEvents.id,eventId),eq(ingestionEvents.status,"processing")));
    const claimGuard=db.execute(sql`SELECT 1 / count(*)::int AS owned FROM ${ingestionEvents} WHERE id = ${eventId}::uuid AND status = 'processing'`);
    const cardLocks=effectiveCard?[db.update(creditCards).set({updatedAt:new Date()}).where(eq(creditCards.id,effectiveCard.id))]:[];
    const bankAccountIds = [...new Set([effectiveAccount?.id, destinationAccount?.id].filter((id): id is string => Boolean(id)))].sort();
    const bankReferences = bankAccountIds.length ? [
      db.execute(sql`SELECT id FROM ${accounts} WHERE id IN (${sql.join(bankAccountIds.map(id => sql`${id}::uuid`), sql`, `)}) ORDER BY id FOR UPDATE`),
      db.execute(sql`SELECT 1 / CASE WHEN count(*) = ${bankAccountIds.length} THEN 1 ELSE 0 END AS valid_bank_accounts
        FROM ${accounts} WHERE id IN (${sql.join(bankAccountIds.map(id => sql`${id}::uuid`), sql`, `)}) AND is_active AND deleted_at IS NULL`),
    ] : [];
    // Serialize matching cross-source notifications before rechecking the window.
    // Separate statements let READ COMMITTED see the prior worker's commit after
    // the advisory lock wait; no financial query runs if the guard finds a match.
    const fingerprintLock = db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${fingerprint}, 0))`);
    const duplicateGuard = db.execute(sql`SELECT 1 / CASE WHEN EXISTS (
      SELECT 1 FROM ${ingestionEvents} WHERE ${duplicateWhere}
    ) THEN 0 ELSE 1 END AS unique_notification`);
    const learningQueries = prepareMerchantLearning(db, "learning" in category ? category.learning : undefined);
    try {
      await db.batch([fingerprintLock,...cardLocks,...bankReferences,claimLock,claimGuard,duplicateGuard,...(goalWrites?.lockQueries??[]),...(recordInsert?[recordInsert]:[]),...(cardInsert?[cardInsert]:[]),...(goalWrites?.queries??[]),...learningQueries,eventUpdate] as unknown as Parameters<DbClient["batch"]>[0]);
    } catch (error) {
      const failure = error as { code?: string; cause?: { code?: string } };
      if (failure.code === "22012" || failure.cause?.code === "22012") {
        const [concurrentDuplicate] = await findDuplicate();
        if (concurrentDuplicate) return await completeDuplicate(concurrentDuplicate.id);
      }
      throw error;
    }
    return {
      status: requiresReview ? "needs_review" : "created",
      recordId,
      creditCardRecordId: cardRecordId,
      warnings: warnings.length ? warnings : undefined,
    };
  } catch (error) {
    await db
      .delete(ingestionEvents)
      .where(
        and(
          eq(ingestionEvents.id, eventId),
          eq(ingestionEvents.status, "processing"),
        ),
      );
    throw error;
  }
}
