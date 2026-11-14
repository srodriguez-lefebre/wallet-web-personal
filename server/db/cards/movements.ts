import { randomUUID } from "node:crypto";

import { and, desc, eq, isNull, sql } from "drizzle-orm";

import {
  type CreditCardPatch,
  type CreditCardRecordPatch,
  creditCardRecordSchema,
  creditCardSchema,
} from "../../../shared/schemas.js";
import { conflictError, validationError } from "../../api/errors.js";
import { getExchangeRate } from "../fx.js";
import { asNumber, mapCreditCard, mapCreditCardRecord, toNumeric } from "../mappers.js";
import { hasOwn, mergePatch } from "../patch.js";
import { isPgError } from "../pg-error.js";
import {
  accounts,
  creditCardRecords,
  creditCards,
  records,
  recordTemplates,
  settings,
} from "../schema.js";
import { cardStatementSyncQueries, creditCardCycleQueries } from "./cycles.js";
import {
  cardMutationError,
  creditCardBankRefundAmount,
  creditCardRecordGuard,
  lockCreditCard,
} from "./guards.js";

import type { CreditCardRecord, WalletSettings } from "../../../shared/types.js";
import type { Db, NewCreditCard, NewCreditCardRecord } from "../input-types.js";

export async function listCreditCards(db: Db) {
  const rows = await db.select().from(creditCards).orderBy(desc(creditCards.createdAt));
  return rows.map(mapCreditCard);
}

export async function createCreditCard(db: Db, input: NewCreditCard) {
  const [row] = await db
    .insert(creditCards)
    .values({
      ...input,
      creditLimit: toNumeric(input.creditLimit),
    })
    .returning();
  return mapCreditCard(row);
}

export async function updateCreditCard(db: Db, id: string, input: CreditCardPatch) {
  const [current] = await db.select().from(creditCards).where(eq(creditCards.id, id)).limit(1);
  if (!current) return null;
  const merged = mergePatch(creditCardSchema, mapCreditCard(current), input, ["note"]);
  const values: Partial<typeof creditCards.$inferInsert> = { updatedAt: new Date() };
  for (const key of [
    "name",
    "issuer",
    "lastFour",
    "limitCurrency",
    "closingDay",
    "dueDay",
    "color",
    "icon",
    "isActive",
  ] as const) {
    if (hasOwn(input, key)) values[key] = merged[key] as never;
  }
  if (hasOwn(input, "creditLimit")) values.creditLimit = toNumeric(merged.creditLimit);
  if (hasOwn(input, "note")) values.note = merged.note ?? null;
  if (hasOwn(input, "isActive")) values.deletedAt = merged.isActive ? null : new Date();
  const result = await db.batch([
    lockCreditCard(db, id),
    db.update(creditCards).set(values).where(eq(creditCards.id, id)).returning(),
    ...cardStatementSyncQueries(db, id),
  ] as unknown as Parameters<Db["batch"]>[0]);
  const row = (result[1] as (typeof creditCards.$inferSelect)[])[0];
  return row ? mapCreditCard(row) : null;
}

export async function archiveCreditCard(db: Db, id: string) {
  const now = new Date();
  const result = await db.batch([
    lockCreditCard(db, id),
    db
      .update(creditCards)
      .set({ isActive: false, deletedAt: now, updatedAt: now })
      .where(eq(creditCards.id, id))
      .returning(),
    db
      .update(settings)
      .set({ defaultPaymentType: "debit", defaultCreditCardId: null, updatedAt: now })
      .where(eq(settings.defaultCreditCardId, id)),
    db
      .update(recordTemplates)
      .set({ creditCardId: null, paymentType: "debit" })
      .where(eq(recordTemplates.creditCardId, id)),
    ...cardStatementSyncQueries(db, id),
  ] as unknown as Parameters<Db["batch"]>[0]);
  return (result[1] as unknown[]).length > 0;
}

export async function listCreditCardRecords(db: Db, creditCardId: string) {
  const rows = await db
    .select()
    .from(creditCardRecords)
    .where(
      and(eq(creditCardRecords.creditCardId, creditCardId), isNull(creditCardRecords.deletedAt)),
    )
    .orderBy(desc(creditCardRecords.occurredAt));
  return rows.map(mapCreditCardRecord);
}

export async function createCreditCardRecord(
  db: Db,
  creditCardId: string,
  input: NewCreditCardRecord,
) {
  let walletRecordId: string | null = null;
  let walletRefundValues: typeof records.$inferInsert | undefined;
  let walletRefundAmount: ReturnType<typeof sql> | undefined;
  let originalMovement: typeof creditCardRecords.$inferSelect | undefined;
  let refundBankRateMissing = false;
  if (input.kind === "refund" && input.originalRecordId) {
    const [original] = await db
      .select()
      .from(creditCardRecords)
      .where(
        and(
          eq(creditCardRecords.id, input.originalRecordId),
          eq(creditCardRecords.creditCardId, creditCardId),
          eq(creditCardRecords.kind, "purchase"),
          isNull(creditCardRecords.deletedAt),
        ),
      )
      .limit(1);
    if (!original) throw validationError("Original movement not found");
    originalMovement = original;
    walletRefundAmount = creditCardBankRefundAmount(original.id, input.amountInLimitCurrency);
    if (original.walletRecordId && original.accountId) {
      const [account] = await db
        .select()
        .from(accounts)
        .where(eq(accounts.id, original.accountId))
        .limit(1);
      if (!account || original.accountAmount === null)
        throw validationError("Original account amount is required for a bank refund");
      const [[walletOriginal], [walletSettings]] = await db.batch([
        db.select().from(records).where(eq(records.id, original.walletRecordId)).limit(1),
        db.select().from(settings).limit(1),
      ]);
      const primaryCurrency = (walletSettings?.primaryCurrency ??
        "UYU") as WalletSettings["primaryCurrency"];
      const refundCurrency = account.currency as CreditCardRecord["currency"];
      const originalPrimaryRate =
        walletOriginal?.currency === refundCurrency
          ? asNumber(walletOriginal.exchangeRateToPrimary)
          : null;
      const primaryRate =
        refundCurrency === primaryCurrency
          ? 1
          : originalPrimaryRate !== null &&
              Number.isFinite(originalPrimaryRate) &&
              originalPrimaryRate > 0
            ? originalPrimaryRate
            : await getExchangeRate(db, refundCurrency, primaryCurrency, input.occurredAt);
      refundBankRateMissing =
        primaryRate === null || !Number.isFinite(primaryRate) || primaryRate <= 0;
      walletRecordId = randomUUID();
      walletRefundValues = {
        id: walletRecordId,
        type: "income",
        amount: toNumeric(input.accountAmount ?? input.amount),
        currency: account?.currency ?? input.currency,
        accountId: original.accountId,
        creditCardId,
        categoryId: input.categoryId,
        counterpartyName: input.counterpartyName ?? null,
        paymentType: "credit",
        paymentStatus: "cleared",
        exchangeRateToPrimary: toNumeric(primaryRate ?? 0),
        amountInLimitCurrency: toNumeric(input.amountInLimitCurrency),
        exchangeRateToLimitCurrency: toNumeric(input.exchangeRateToLimitCurrency),
        occurredAt: new Date(input.occurredAt),
        note: input.note ?? null,
      };
    }
  }
  const movementValues = {
    id: randomUUID(),
    creditCardId,
    walletRecordId,
    originalRecordId: input.originalRecordId ?? null,
    kind: input.kind,
    amount: toNumeric(input.amount),
    currency: input.currency,
    amountInLimitCurrency: toNumeric(input.amountInLimitCurrency),
    exchangeRateToLimitCurrency: toNumeric(input.exchangeRateToLimitCurrency),
    categoryId: input.categoryId,
    counterpartyName: input.counterpartyName ?? null,
    note: input.note ?? null,
    accountId: input.accountId ?? null,
    accountAmount: input.accountAmount === undefined ? null : toNumeric(input.accountAmount),
    accountImpactAtCreation: input.accountImpactAtCreation,
    occurredAt: new Date(input.occurredAt),
  };
  const cycleQueries = await creditCardCycleQueries(
    db,
    creditCardId,
    movementValues.id,
    input.occurredAt,
  );
  const walletRefundInsert = walletRefundValues
    ? db.execute(sql`
    INSERT INTO records (id, type, amount, currency, account_id, credit_card_id, category_id, counterparty_name,
      payment_type, payment_status, exchange_rate_to_primary, amount_in_limit_currency, exchange_rate_to_limit_currency, occurred_at, note)
    SELECT ${walletRefundValues.id}::uuid, 'income', ${walletRefundAmount!}, ${walletRefundValues.currency},
      ${walletRefundValues.accountId}::uuid, ${creditCardId}::uuid, ${walletRefundValues.categoryId}::uuid, ${walletRefundValues.counterpartyName},
      'credit', 'cleared', ${walletRefundValues.exchangeRateToPrimary}::numeric,
      ${walletRefundValues.amountInLimitCurrency}::numeric, ${walletRefundValues.exchangeRateToLimitCurrency}::numeric,
      ${input.occurredAt}::timestamptz, ${walletRefundValues.note}
    WHERE ${walletRefundAmount!} > 0
  `)
    : undefined;
  const authoritativeRefund =
    originalMovement && walletRefundAmount
      ? {
          walletRecordId: walletRecordId
            ? sql`CASE WHEN ${walletRefundAmount} > 0 THEN ${walletRecordId}::uuid ELSE NULL END`
            : null,
          accountId: sql`CASE WHEN ${walletRefundAmount} > 0 THEN ${originalMovement.accountId}::uuid ELSE NULL END`,
          accountAmount: sql`CASE WHEN ${walletRefundAmount} > 0 THEN ${walletRefundAmount} ELSE NULL END`,
          accountImpactAtCreation: sql`${walletRefundAmount} > 0`,
        }
      : {};
  try {
    await db.batch([
      lockCreditCard(db, creditCardId),
      creditCardRecordGuard(db, creditCardId, input),
      // Bank and FX metadata was read before entering the batch. Reject a stale
      // source rather than crediting the previously observed bank account.
      ...(originalMovement
        ? [
            db.execute(sql`SELECT 1 / CASE WHEN EXISTS (
        SELECT 1 FROM credit_card_records p WHERE p.id = ${originalMovement.id}::uuid
          AND p.account_id IS NOT DISTINCT FROM ${originalMovement.accountId}::uuid
          AND p.account_amount IS NOT DISTINCT FROM ${originalMovement.accountAmount}::numeric
          AND p.account_impact_at_creation = ${originalMovement.accountImpactAtCreation}
          AND p.wallet_record_id IS NOT DISTINCT FROM ${originalMovement.walletRecordId}::uuid
      ) THEN 1 ELSE 0 END AS valid`),
          ]
        : []),
      ...(refundBankRateMissing
        ? [
            db.execute(
              sql`SELECT 1 / CASE WHEN ${walletRefundAmount!} <= 0 THEN 1 ELSE 0 END AS valid`,
            ),
          ]
        : []),
      ...(walletRefundInsert ? [walletRefundInsert] : []),
      db.insert(creditCardRecords).values({ ...movementValues, ...authoritativeRefund }),
      ...cycleQueries,
      ...cardStatementSyncQueries(db, creditCardId),
    ]);
  } catch (error) {
    if (refundBankRateMissing && isPgError(error, "22012"))
      throw validationError("Exchange rate is required for the bank refund");
    cardMutationError(error);
  }
  const [row] = await db
    .select()
    .from(creditCardRecords)
    .where(eq(creditCardRecords.id, movementValues.id));
  return mapCreditCardRecord(row);
}

export async function updateCreditCardRecord(
  db: Db,
  creditCardId: string,
  id: string,
  input: CreditCardRecordPatch,
) {
  const [current] = await db
    .select()
    .from(creditCardRecords)
    .where(
      and(
        eq(creditCardRecords.id, id),
        eq(creditCardRecords.creditCardId, creditCardId),
        isNull(creditCardRecords.walletRecordId),
        isNull(creditCardRecords.deletedAt),
      ),
    )
    .limit(1);
  if (!current) return null;
  const mapped = mapCreditCardRecord(current);
  const merged = mergePatch(creditCardRecordSchema, mapped, input, [
    "originalRecordId",
    "counterpartyName",
    "note",
    "accountId",
    "accountAmount",
  ]);
  const values: Partial<typeof creditCardRecords.$inferInsert> = { updatedAt: new Date() };
  if (hasOwn(input, "originalRecordId")) values.originalRecordId = merged.originalRecordId ?? null;
  if (hasOwn(input, "kind")) values.kind = merged.kind;
  if (hasOwn(input, "amount")) values.amount = toNumeric(merged.amount);
  if (hasOwn(input, "currency")) values.currency = merged.currency;
  if (hasOwn(input, "amountInLimitCurrency"))
    values.amountInLimitCurrency = toNumeric(merged.amountInLimitCurrency);
  if (hasOwn(input, "exchangeRateToLimitCurrency"))
    values.exchangeRateToLimitCurrency = toNumeric(merged.exchangeRateToLimitCurrency);
  if (hasOwn(input, "categoryId")) values.categoryId = merged.categoryId;
  if (hasOwn(input, "counterpartyName")) values.counterpartyName = merged.counterpartyName ?? null;
  if (hasOwn(input, "note")) values.note = merged.note ?? null;
  if (hasOwn(input, "accountId")) values.accountId = merged.accountId ?? null;
  if (hasOwn(input, "accountAmount"))
    values.accountAmount =
      merged.accountAmount === undefined ? null : toNumeric(merged.accountAmount);
  if (hasOwn(input, "accountImpactAtCreation"))
    values.accountImpactAtCreation = merged.accountImpactAtCreation;
  if (hasOwn(input, "occurredAt")) values.occurredAt = new Date(merged.occurredAt);
  if (merged.kind !== mapped.kind) throw validationError("Movement kind cannot be changed");
  const cycleQueries = await creditCardCycleQueries(db, creditCardId, id, merged.occurredAt);
  const refundBankAmount =
    merged.kind === "refund" && merged.originalRecordId
      ? creditCardBankRefundAmount(merged.originalRecordId, merged.amountInLimitCurrency, id)
      : undefined;
  const authoritativeRefund = refundBankAmount
    ? {
        accountId: sql`CASE WHEN ${refundBankAmount} > 0 THEN (SELECT account_id FROM credit_card_records WHERE id = ${merged.originalRecordId!}::uuid) ELSE NULL END`,
        accountAmount: sql`CASE WHEN ${refundBankAmount} > 0 THEN ${refundBankAmount} ELSE NULL END`,
        accountImpactAtCreation: sql`${refundBankAmount} > 0`,
      }
    : {};
  try {
    await db.batch([
      lockCreditCard(db, creditCardId),
      creditCardRecordGuard(db, creditCardId, merged, id),
      db
        .update(creditCardRecords)
        .set({ ...values, ...authoritativeRefund })
        .where(
          and(
            eq(creditCardRecords.id, id),
            eq(creditCardRecords.creditCardId, creditCardId),
            isNull(creditCardRecords.walletRecordId),
          ),
        ),
      ...cycleQueries,
      ...cardStatementSyncQueries(db, creditCardId),
    ]);
  } catch (error) {
    cardMutationError(error);
  }
  const [row] = await db.select().from(creditCardRecords).where(eq(creditCardRecords.id, id));
  return row ? mapCreditCardRecord(row) : null;
}

export async function deleteCreditCardRecord(db: Db, creditCardId: string, id: string) {
  try {
    const [, , deleted] = await db.batch([
      lockCreditCard(db, creditCardId),
      db.execute(sql`SELECT 1 / CASE WHEN NOT EXISTS (
        SELECT 1 FROM credit_card_records WHERE original_record_id = ${id}::uuid AND deleted_at IS NULL
      ) AND NOT EXISTS (
        SELECT 1 FROM credit_card_payment_allocations a JOIN credit_card_payments pay ON pay.id=a.payment_id AND pay.deleted_at IS NULL WHERE a.credit_card_record_id = ${id}::uuid
      ) THEN 1 ELSE 0 END AS valid`),
      db
        .update(creditCardRecords)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(creditCardRecords.id, id),
            eq(creditCardRecords.creditCardId, creditCardId),
            isNull(creditCardRecords.walletRecordId),
            isNull(creditCardRecords.deletedAt),
          ),
        )
        .returning({ id: creditCardRecords.id }),
      ...cardStatementSyncQueries(db, creditCardId),
    ]);
    return deleted.length > 0;
  } catch (error) {
    if (isPgError(error, "22012")) throw conflictError("Movement has linked refunds or payments");
    throw error;
  }
}
