import { sql } from "drizzle-orm";

import { isFinancialRecord } from "../../../shared/record-status.js";
import { conflictError, validationError } from "../../api/errors.js";
import { batchAssert, lockRows } from "../batch.js";
import { toNumeric } from "../mappers.js";
import { isPgError } from "../pg-error.js";
import { creditCardRecords, creditCards, records } from "../schema.js";

import type { WalletRecord } from "../../../shared/types.js";
import type { Db, NewCreditCardRecord, NewRecord } from "../input-types.js";

export function lockCreditCard(db: Db, creditCardId: string) {
  return lockRows(db, creditCards, [creditCardId])[0]!;
}

export function creditCardRecordGuard(
  db: Db,
  creditCardId: string,
  input: NewCreditCardRecord,
  recordId?: string,
) {
  // A division by zero aborts the entire Neon batch, including any bank refund.
  // Keep comparisons in PostgreSQL numeric and exclude the edited refund itself.
  return batchAssert(
    db,
    sql`(
      ${input.kind} = 'purchase' AND ${input.originalRecordId ?? null}::uuid IS NULL
      AND round(${toNumeric(input.amountInLimitCurrency)}::numeric, 2) = round(${toNumeric(input.amount)}::numeric * ${toNumeric(input.exchangeRateToLimitCurrency)}::numeric, 2)
      AND NOT EXISTS (
        SELECT 1 FROM credit_card_records p WHERE p.id = ${recordId ?? null}::uuid
          AND (EXISTS (SELECT 1 FROM credit_card_records r WHERE r.original_record_id = p.id AND r.kind = 'refund' AND r.deleted_at IS NULL)
            OR EXISTS (SELECT 1 FROM credit_card_payment_allocations a JOIN credit_card_payments pay ON pay.id=a.payment_id AND pay.deleted_at IS NULL WHERE a.credit_card_record_id = p.id))
          AND (p.account_id IS DISTINCT FROM ${input.accountId ?? null}::uuid
            OR p.account_amount IS DISTINCT FROM ${input.accountAmount === undefined ? null : toNumeric(input.accountAmount)}::numeric
            OR p.account_impact_at_creation IS DISTINCT FROM ${input.accountImpactAtCreation})
      )
      AND NOT EXISTS (SELECT 1 FROM credit_card_records r WHERE r.original_record_id = ${recordId ?? null}::uuid AND r.deleted_at IS NULL
        AND (r.currency <> ${input.currency} OR r.exchange_rate_to_limit_currency <> ${toNumeric(input.exchangeRateToLimitCurrency)}::numeric))
      AND round(${toNumeric(input.amountInLimitCurrency)}::numeric, 2) >= coalesce((SELECT sum(r.amount_in_limit_currency) FROM credit_card_records r
        WHERE r.original_record_id = ${recordId ?? null}::uuid AND r.deleted_at IS NULL AND r.kind = 'refund'), 0)
    ) OR (
      ${input.kind} = 'refund' AND EXISTS (
        SELECT 1 FROM credit_card_records p WHERE p.id = ${input.originalRecordId ?? null}::uuid
          AND p.credit_card_id = ${creditCardId}::uuid AND p.kind = 'purchase' AND p.deleted_at IS NULL
          AND p.currency = ${input.currency}
          AND p.exchange_rate_to_limit_currency = ${toNumeric(input.exchangeRateToLimitCurrency)}::numeric
          AND round(${toNumeric(input.amountInLimitCurrency)}::numeric, 2) = round(${toNumeric(input.amount)}::numeric * p.exchange_rate_to_limit_currency, 2)
          AND ${toNumeric(input.amount)}::numeric <= p.amount - coalesce((SELECT sum(r.amount) FROM credit_card_records r
            WHERE r.original_record_id = p.id AND r.kind = 'refund' AND r.deleted_at IS NULL AND r.id <> coalesce(${recordId ?? null}::uuid, '00000000-0000-0000-0000-000000000000'::uuid)), 0)
          AND round(${toNumeric(input.amountInLimitCurrency)}::numeric, 2) <= p.amount_in_limit_currency - coalesce((SELECT sum(r.amount_in_limit_currency) FROM credit_card_records r
            WHERE r.original_record_id = p.id AND r.kind = 'refund' AND r.deleted_at IS NULL AND r.id <> coalesce(${recordId ?? null}::uuid, '00000000-0000-0000-0000-000000000000'::uuid)), 0)
      )
    )`,
    "valid",
  );
}

// Bank impact at creation is an unpaid reservation. Refund only that remaining
// reservation; settled money stays on the card and can fund another purchase.
// The last refund returns the remainder so proportional rounding loses no cent.
export function creditCardBankRefundAmount(
  originalId: string,
  amountInLimitCurrency: number,
  editedRefundId?: string,
) {
  return sql`coalesce((
    SELECT CASE WHEN round(${toNumeric(amountInLimitCurrency)}::numeric, 2) >= b.unpaid_limit THEN b.unpaid_bank
      ELSE least(b.unpaid_bank, round(p.account_amount * round(${toNumeric(amountInLimitCurrency)}::numeric, 2)
        / nullif(p.amount_in_limit_currency, 0), 2)) END
    FROM credit_card_records p
    CROSS JOIN LATERAL (
      SELECT coalesce((SELECT sum(a.amount_in_limit_currency) FROM credit_card_payment_allocations a JOIN credit_card_payments pay ON pay.id=a.payment_id AND pay.deleted_at IS NULL WHERE a.credit_card_record_id = p.id), 0) AS paid,
        coalesce((SELECT sum(r.amount_in_limit_currency) FROM credit_card_records r WHERE r.original_record_id = p.id AND r.kind = 'refund' AND r.deleted_at IS NULL AND r.id <> coalesce(${editedRefundId ?? null}::uuid, '00000000-0000-0000-0000-000000000000'::uuid)), 0) AS refunded,
        coalesce((SELECT sum(coalesce(w.account_amount, w.amount, r.account_amount, 0)) FROM credit_card_records r
          LEFT JOIN records w ON w.id = r.wallet_record_id
          WHERE r.original_record_id = p.id AND r.kind = 'refund' AND r.deleted_at IS NULL AND r.account_impact_at_creation AND r.id <> coalesce(${editedRefundId ?? null}::uuid, '00000000-0000-0000-0000-000000000000'::uuid)), 0) AS refunded_bank
    ) prior
    CROSS JOIN LATERAL (
      SELECT greatest(0, p.amount_in_limit_currency - prior.paid - prior.refunded) AS unpaid_limit,
        greatest(0, p.account_amount - round(p.account_amount * least(p.amount_in_limit_currency, prior.paid)
          / nullif(p.amount_in_limit_currency, 0), 2) - prior.refunded_bank) AS unpaid_bank
    ) b
    WHERE p.id = ${originalId}::uuid AND p.account_impact_at_creation AND p.account_id IS NOT NULL AND p.account_amount IS NOT NULL
  ), 0)`;
}

export function cardMutationError(error: unknown): never {
  if (isPgError(error, "22012")) {
    throw validationError("Refund exceeds its purchase or movement currency/conversion is invalid");
  }
  throw error;
}

export function recordCardLockQueries(db: Db, cardIds: Array<string | undefined | null>) {
  return lockRows(
    db,
    creditCards,
    cardIds.filter((id): id is string => Boolean(id)),
  );
}

export function recordCardDependencyGuard(db: Db, walletRecordId: string) {
  return batchAssert(
    db,
    sql`NOT EXISTS (
    SELECT 1 FROM credit_card_records p WHERE p.wallet_record_id = ${walletRecordId}::uuid AND p.kind = 'purchase'
      AND (EXISTS (SELECT 1 FROM credit_card_records r WHERE r.original_record_id = p.id AND r.deleted_at IS NULL)
        OR EXISTS (SELECT 1 FROM credit_card_payment_allocations a JOIN credit_card_payments pay ON pay.id=a.payment_id AND pay.deleted_at IS NULL WHERE a.credit_card_record_id = p.id))
  )`,
    "valid",
  );
}

// Reads used to prepare a Neon HTTP batch happen before its row locks. Check the
// observed financial state after locking so a concurrent reassignment cannot
// bypass card locks or overwrite a different purchase with an outdated payload.
export function recordFinancialSnapshotGuard(
  db: Db,
  observed: typeof records.$inferSelect,
  linked?: typeof creditCardRecords.$inferSelect,
) {
  return batchAssert(
    db,
    sql`EXISTS (
    SELECT 1 FROM records r WHERE r.id = ${observed.id}::uuid
      AND date_trunc('milliseconds', r.updated_at) = ${observed.updatedAt.toISOString()}::timestamptz
      AND r.deleted_at IS NOT DISTINCT FROM ${observed.deletedAt?.toISOString() ?? null}::timestamptz
      AND r.type = ${observed.type} AND r.payment_status = ${observed.paymentStatus}
      AND r.amount = ${observed.amount}::numeric AND r.currency = ${observed.currency}
      AND r.account_id IS NOT DISTINCT FROM ${observed.accountId}::uuid
      AND r.account_amount IS NOT DISTINCT FROM ${observed.accountAmount}::numeric
      AND r.credit_card_id IS NOT DISTINCT FROM ${observed.creditCardId}::uuid
      AND r.amount_in_limit_currency IS NOT DISTINCT FROM ${observed.amountInLimitCurrency}::numeric
      AND r.exchange_rate_to_limit_currency IS NOT DISTINCT FROM ${observed.exchangeRateToLimitCurrency}::numeric
  ) AND ${
    linked
      ? sql`EXISTS (
    SELECT 1 FROM credit_card_records p WHERE p.id = ${linked.id}::uuid AND p.wallet_record_id = ${observed.id}::uuid
      AND p.credit_card_id = ${linked.creditCardId}::uuid AND p.kind = ${linked.kind}
      AND p.statement_id IS NOT DISTINCT FROM ${linked.statementId}::uuid
      AND p.amount = ${linked.amount}::numeric AND p.currency = ${linked.currency}
      AND p.amount_in_limit_currency = ${linked.amountInLimitCurrency}::numeric
      AND p.exchange_rate_to_limit_currency = ${linked.exchangeRateToLimitCurrency}::numeric
      AND p.account_id IS NOT DISTINCT FROM ${linked.accountId}::uuid
      AND p.account_amount IS NOT DISTINCT FROM ${linked.accountAmount}::numeric
      AND p.account_impact_at_creation = ${linked.accountImpactAtCreation}
      AND p.deleted_at IS NOT DISTINCT FROM ${linked.deletedAt?.toISOString() ?? null}::timestamptz
  )`
      : sql`NOT EXISTS (SELECT 1 FROM credit_card_records p WHERE p.wallet_record_id = ${observed.id}::uuid)`
  }
 `,
    "valid",
  );
}

export function recordCardMutationError(error: unknown): never {
  if (isPgError(error, "22012"))
    throw conflictError(
      "Record cannot be changed because its financial history would be invalid or changed concurrently",
    );
  throw error;
}

export function assertGenericCardRecord(input: NewRecord) {
  if (input.creditCardId && input.type !== "expense")
    throw validationError(
      "Use the Cards refund action for a credit-card refund; transfers cannot use a card.",
    );
}

export function genericCardPurchaseGuard(db: Db, input: NewRecord) {
  return creditCardRecordGuard(db, input.creditCardId!, {
    kind: "purchase",
    amount: input.amount,
    currency: input.currency,
    amountInLimitCurrency: input.amountInLimitCurrency ?? input.amount,
    exchangeRateToLimitCurrency: input.exchangeRateToLimitCurrency ?? 1,
    categoryId: input.categoryId!,
    accountId: input.accountId,
    accountAmount: input.accountId ? (input.accountAmount ?? input.amount) : undefined,
    accountImpactAtCreation: Boolean(input.accountId),
    occurredAt: input.occurredAt,
  });
}

export function assertLinkedRefundMetadata(current: WalletRecord, merged: NewRecord) {
  for (const key of [
    "type",
    "amount",
    "currency",
    "accountId",
    "accountAmount",
    "creditCardId",
    "destinationAccountId",
    "destinationAmount",
    "paymentType",
    "paymentStatus",
    "exchangeRateToPrimary",
    "amountInLimitCurrency",
    "exchangeRateToLimitCurrency",
    "occurredAt",
    "debtId",
  ] as const) {
    if (key === "paymentStatus" && isFinancialRecord(current) && isFinancialRecord(merged))
      continue;
    if (current[key] !== merged[key])
      throw validationError(
        "Bank-linked card refund financial history cannot be changed here. Use the Cards refund workflow.",
      );
  }
}
