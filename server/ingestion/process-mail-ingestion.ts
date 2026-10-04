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
import { inferCategoryWithOpenAi } from "./openai-category.js";
import {
  cardLastFour,
  normalizeMerchantTerm,
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
    aliases: ["FRUTERIA", "VERDULERIA", "VERDULERIA Y FRUTERIA"],
    categoryNames: ["Fruits, vegetables and healthy", "Greengrocer"],
  },
  {
    aliases: ["PANADERIA"],
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
    aliases: ["SUPERMERCADO"],
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
  return {
    integration: input.integration,
    email: { ...input.email },
    transaction: { ...input.transaction },
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

async function resolveCategory(db: DbClient, merchantRaw: string) {
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
  const local = pickLongestMerchantMatch(merchantRaw, aliasRows);
  if (local)
    return {
      categoryId: local.categoryId,
      merchantName: local.merchantName,
      source: "merchant_rule",
    };

  const allCategories = await db.select().from(categories);
  const generic = pickGenericMerchantCategory(merchantRaw, allCategories);
  if (generic)
    return {
      categoryId: generic.categoryId,
      merchantName: generic.merchantName,
      source: "generic_rule",
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
  try {
    const inferred = await inferCategoryWithOpenAi(merchantRaw, options);
    if (inferred)
      return {
        categoryId: inferred,
        merchantName: merchantRaw,
        source: "openai",
      };
  } catch {
    // Classification failure deliberately falls through to the protected category.
  }
  const fallback =
    allCategories.find((item) => item.systemKey === "unknown_expense") ??
    allCategories.find(
      (item) => item.name.toLowerCase() === "unknown expense",
    ) ??
    allCategories.find((item) => item.name.toLowerCase() === "others");
  if (!fallback)
    throw new Error("Protected Unknown expense category is not configured");
  return {
    categoryId: fallback.id,
    merchantName: merchantRaw,
    source: "fallback",
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

    const [account] = input.destination.accountId
      ? await db
          .select()
          .from(accounts)
          .where(
            and(
              eq(accounts.id, input.destination.accountId),
              isNull(accounts.deletedAt),
            ),
          )
          .limit(1)
      : [];
    let [card] = input.destination.creditCardId
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
    if (!input.destination.creditCardId) {
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
    const cardWasInvalid = Boolean(input.destination.creditCardId && !card);
    const category = await resolveCategory(db, input.transaction.merchantRaw);
    const canonicalMerchantNormalized = normalizeMerchantTerm(
      category.merchantName,
    );
    const targetKey = `account:${account?.id ?? "none"}|card:${card?.id ?? "none"}`;
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
    [
      primary?.frozen,
      accountConversion?.frozen,
      cardConversion?.frozen,
    ].forEach((item) => {
      if (item?.warning && !warnings.includes(item.warning))
        warnings.push(item.warning);
    });

    const unavailableConversion =
      !primary || (account && !accountConversion) || (card && !cardConversion);
    const requiresReview =
      accountWasInvalid || cardWasInvalid || !card || unavailableConversion;
    const allowFinancialImpact = !accountWasInvalid && !unavailableConversion && Boolean(card);
    const effectiveAccount = allowFinancialImpact ? account : undefined;
    const effectiveCard = allowFinancialImpact ? card : undefined;
    const noteParts = [
      input.transaction.sourceLabel ||
        `Imported from ${input.transaction.source}`,
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
      cardWasInvalid || (!card && input.transaction.cardNumber)
        ? `Unknown card: ${input.transaction.cardAlias || input.transaction.cardNumber}`
        : undefined,
      accountWasInvalid
        ? `Unknown account: ${input.destination.accountId}`
        : undefined,
      unavailableConversion
        ? "Currency conversion unavailable; no financial impact was applied."
        : undefined,
    ].filter(Boolean);
    const note = [...new Set(noteParts)].join(" | ");
    const recordId =
      effectiveAccount || !effectiveCard ? randomUUID() : undefined;
    const cardRecordId = effectiveCard ? randomUUID() : undefined;
    const goalWrites=recordId?await prepareRecordGoalWrites(recordId,{
      type:"expense",amount:input.transaction.amount,currency:input.transaction.currency,
      accountId:effectiveAccount?.id,accountAmount:effectiveAccount?accountConversion?.amount:undefined,
      creditCardId:effectiveCard?.id,categoryId:category.categoryId,counterpartyName:category.merchantName,
      paymentType:effectiveCard?"credit":"cash",paymentStatus:requiresReview?"needs_review":"cleared",
      exchangeRateToPrimary:primary?.frozen.rate??1,occurredAt:occurredAt.toISOString(),tagIds:[],
      amountInLimitCurrency:effectiveCard?cardConversion?.amount:undefined,exchangeRateToLimitCurrency:effectiveCard?cardConversion?.frozen.rate:undefined,
    },db):null;
    const recordInsert = recordId
      ? db.insert(records).values({
          id: recordId,
          type: "expense",
          amount: money(input.transaction.amount),
          currency: input.transaction.currency,
          accountId: effectiveAccount?.id ?? null,
          accountAmount:
            effectiveAccount && accountConversion
              ? money(accountConversion.amount)
              : null,
          creditCardId: effectiveCard?.id ?? null,
          categoryId: category.categoryId,
          counterpartyName: category.merchantName,
          paymentType: effectiveCard ? "credit" : "cash",
          paymentStatus: requiresReview ? "needs_review" : "cleared",
          exchangeRateToPrimary: rate(primary?.frozen.rate ?? 1),
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
      cardRecordId && effectiveCard && cardConversion
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
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(ingestionEvents.id, eventId));
    const claimLock=db.update(ingestionEvents).set({updatedAt:new Date()}).where(and(eq(ingestionEvents.id,eventId),eq(ingestionEvents.status,"processing")));
    const claimGuard=db.execute(sql`SELECT 1 / count(*)::int AS owned FROM ${ingestionEvents} WHERE id = ${eventId}::uuid AND status = 'processing'`);
    const cardLocks=effectiveCard?[db.update(creditCards).set({updatedAt:new Date()}).where(eq(creditCards.id,effectiveCard.id))]:[];
    // Serialize matching cross-source notifications before rechecking the window.
    // Separate statements let READ COMMITTED see the prior worker's commit after
    // the advisory lock wait; no financial query runs if the guard finds a match.
    const fingerprintLock = db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${fingerprint}, 0))`);
    const duplicateGuard = db.execute(sql`SELECT 1 / CASE WHEN EXISTS (
      SELECT 1 FROM ${ingestionEvents} WHERE ${duplicateWhere}
    ) THEN 0 ELSE 1 END AS unique_notification`);
    try {
      await db.batch([fingerprintLock,...cardLocks,claimLock,claimGuard,duplicateGuard,...(goalWrites?.lockQueries??[]),...(recordInsert?[recordInsert]:[]),...(cardInsert?[cardInsert]:[]),...(goalWrites?.queries??[]),eventUpdate] as unknown as Parameters<DbClient["batch"]>[0]);
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
