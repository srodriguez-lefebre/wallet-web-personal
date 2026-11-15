import { randomUUID } from "node:crypto";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { categoryReferenceQueries, rejectUnavailableCategories } from "../category-references.js";
import { cardStatementSyncQueries } from "../cards/cycles.js";
import { isReviewCategory, splitImportNote } from "../../../shared/record-review.js";
import { isFinancialRecord } from "../../../shared/record-status.js";
import { type RecordPatch, recordSchema } from "../../../shared/schemas.js";
import { conflictError, validationError } from "../../api/errors.js";
import {
  assertGenericCardRecord,
  assertLinkedRefundMetadata,
  cardMutationError,
  creditCardRecordGuard,
  genericCardPurchaseGuard,
  recordCardDependencyGuard,
  recordCardLockQueries,
  recordCardMutationError,
  recordFinancialSnapshotGuard,
} from "../cards/guards.js";
import { goalReservationLockQueries, recordReservationWriteQueries } from "../goals/ledger.js";
import {
  groupGoalAssociations,
  groupIds,
  mapCreditCardRecord,
  mapRecord,
  nullToUndefined,
  toNumeric,
} from "../mappers.js";
import { hasOwn } from "../patch.js";
import { categories, creditCardRecords, recordGoals, records, recordTags } from "../schema.js";
import {
  buildRecordMovementCompensations,
  buildRecordReservationMovements,
  recordGoalWriteQueries,
  resolveGoalAssociations,
} from "./goal-links.js";
import { normalizeRecordMoneyPatch } from "./money-patch.js";

import type { RecordGoalAssociation, WalletRecord } from "../../../shared/types.js";
import type { Db, NewRecord, ReservationMovementWrite } from "../input-types.js";

export async function createRecord(db: Db, input: NewRecord) {
  const [record] = await createRecordsBulk(db, [input]);
  if (!record) throw new Error("Database mutation returned no record");
  return record;
}

function recordInsertValues(id: string, input: NewRecord, warnings: string[]) {
  return {
    id,
    type: input.type,
    amount: toNumeric(input.amount),
    currency: input.currency,
    accountId: input.accountId ?? null,
    accountAmount: input.accountAmount === undefined ? null : toNumeric(input.accountAmount),
    creditCardId: input.creditCardId ?? null,
    destinationAccountId: input.destinationAccountId ?? null,
    destinationAmount:
      input.destinationAmount === undefined ? null : toNumeric(input.destinationAmount),
    categoryId: input.categoryId ?? null,
    counterpartyName: input.counterpartyName ?? null,
    paymentType: input.paymentType,
    paymentStatus: input.paymentStatus,
    exchangeRateToPrimary: toNumeric(input.exchangeRateToPrimary),
    amountInLimitCurrency:
      input.amountInLimitCurrency === undefined ? null : toNumeric(input.amountInLimitCurrency),
    exchangeRateToLimitCurrency:
      input.exchangeRateToLimitCurrency === undefined
        ? null
        : toNumeric(input.exchangeRateToLimitCurrency),
    occurredAt: new Date(input.occurredAt),
    note: [input.note, ...warnings].filter(Boolean).join(" | ") || null,
    isFixed: input.isFixed ?? false,
    debtId: input.debtId ?? null,
  };
}

export async function createRecordsBulk(db: Db, inputs: NewRecord[], importIds?: string[]) {
  if (!inputs.length) return [];
  inputs.forEach(assertGenericCardRecord);
  if (inputs.some((input) => input.debtId))
    throw validationError(
      "Debt-linked records must be created through the debt payment action. Restore a complete JSON backup for existing payment history.",
    );
  if (importIds && importIds.length !== inputs.length)
    throw new Error("Import IDs must match records");
  const ids = importIds ?? inputs.map(() => randomUUID());
  // These arrays map the same inputs and always have matching indices.
  const resolvedByInput = await Promise.all(
    inputs.map((input) => resolveGoalAssociations(db, input)),
  );
  const unresolvedAutomaticByInput = inputs.map(() => ({
    goalIds: new Set<string>(),
    warnings: [] as string[],
  }));
  const movementsByInput = await Promise.all(
    inputs.map((input, index) =>
      buildRecordReservationMovements(
        db,
        ids[index]!,
        input,
        resolvedByInput[index]!,
        unresolvedAutomaticByInput[index],
      ),
    ),
  );
  const associationsByInput = resolvedByInput.map((items, index) =>
    items.filter((item) => !unresolvedAutomaticByInput[index]!.goalIds.has(item.goalId)),
  );
  const queries: unknown[] = [];
  inputs.forEach((input, index) => {
    const id = ids[index]!;
    if (input.creditCardId && input.categoryId) queries.push(genericCardPurchaseGuard(db, input));
    queries.push(
      db
        .insert(records)
        .values(recordInsertValues(id, input, unresolvedAutomaticByInput[index]!.warnings)),
    );
    if (input.creditCardId && input.categoryId)
      queries.push(
        db.insert(creditCardRecords).values({
          id: randomUUID(),
          creditCardId: input.creditCardId,
          walletRecordId: id,
          kind: input.type === "income" ? "refund" : "purchase",
          amount: toNumeric(input.amount),
          currency: input.currency,
          amountInLimitCurrency: toNumeric(input.amountInLimitCurrency ?? input.amount),
          exchangeRateToLimitCurrency: toNumeric(input.exchangeRateToLimitCurrency ?? 1),
          categoryId: input.categoryId,
          counterpartyName: input.counterpartyName ?? null,
          note: input.note ?? null,
          accountId: input.accountId ?? null,
          accountAmount: input.accountId ? toNumeric(input.accountAmount ?? input.amount) : null,
          accountImpactAtCreation: Boolean(input.accountId),
          occurredAt: new Date(input.occurredAt),
          deletedAt: input.paymentStatus === "cancelled" ? new Date() : null,
        }),
      );
    if (input.tagIds.length)
      queries.push(
        db.insert(recordTags).values(input.tagIds.map((tagId) => ({ recordId: id, tagId }))),
      );
    const associations = associationsByInput[index]!;
    queries.push(...recordGoalWriteQueries(db, id, input, associations));
  });
  queries.push(...recordReservationWriteQueries(db, movementsByInput.flat()));
  const cardIds = [
    ...new Set(inputs.map((input) => input.creditCardId).filter((id): id is string => Boolean(id))),
  ];
  queries.push(...cardIds.flatMap((id) => cardStatementSyncQueries(db, id)));
  try {
    await db.batch([
      ...categoryReferenceQueries(
        db,
        inputs.map((input) => input.categoryId),
      ),
      ...recordCardLockQueries(
        db,
        inputs.map((input) => input.creditCardId),
      ),
      ...goalReservationLockQueries(
        db,
        associationsByInput.flat().map((item) => item.goalId),
      ),
      ...queries,
    ] as unknown as Parameters<Db["batch"]>[0]);
  } catch (error) {
    await rejectUnavailableCategories(
      db,
      inputs.map((input) => input.categoryId),
      error,
    );
    cardMutationError(error);
  }
  const [rows, tagRows, goalRows] = await db.batch([
    db.select().from(records).where(inArray(records.id, ids)),
    db.select().from(recordTags).where(inArray(recordTags.recordId, ids)),
    db.select().from(recordGoals).where(inArray(recordGoals.recordId, ids)),
  ]);
  const tagIdsByRecord = groupIds(tagRows, "recordId", "tagId");
  const associationsByRecord = groupGoalAssociations(goalRows);
  const byId = new Map(
    rows.map((row) => [row.id, mapRecord(row, tagIdsByRecord, associationsByRecord)]),
  );
  return ids.map((id) => byId.get(id)).filter((record): record is WalletRecord => Boolean(record));
}

export async function updateRecord(db: Db, id: string, input: RecordPatch) {
  const [[linked], [existingRecord], existingTagRows, existingGoalRows] = await Promise.all([
    db.select().from(creditCardRecords).where(eq(creditCardRecords.walletRecordId, id)).limit(1),
    db.select().from(records).where(eq(records.id, id)).limit(1),
    db.select().from(recordTags).where(eq(recordTags.recordId, id)),
    db.select().from(recordGoals).where(eq(recordGoals.recordId, id)),
  ]);
  if (!existingRecord || existingRecord.deletedAt) return null;
  if (
    input.expectedUpdatedAt &&
    existingRecord.updatedAt.toISOString() !== input.expectedUpdatedAt
  ) {
    throw conflictError("This record changed. Reload it before trying again.");
  }
  if (input.debtId !== undefined && (input.debtId ?? null) !== existingRecord.debtId) {
    throw validationError(
      "A record's debt association cannot be added, removed, or changed. Use the debt payment action.",
    );
  }
  const current = mapRecord(
    existingRecord,
    { [id]: existingTagRows.map((item) => item.tagId) },
    { [id]: groupGoalAssociations(existingGoalRows)[id] ?? [] },
  );
  input = await normalizeRecordMoneyPatch(db, current, input);
  const merged = recordSchema.parse({
    ...current,
    ...input,
    creditCardId: hasOwn(input, "creditCardId")
      ? (input.creditCardId ?? undefined)
      : current.creditCardId,
    goalAssociations: hasOwn(input, "goalAssociations")
      ? input.goalAssociations
      : hasOwn(input, "goalIds")
        ? []
        : current.goalAssociations,
    destinationAccountId:
      input.destinationAccountId === null
        ? undefined
        : (input.destinationAccountId ?? current.destinationAccountId),
    categoryId: input.categoryId === null ? undefined : (input.categoryId ?? current.categoryId),
    counterpartyName:
      input.counterpartyName === null
        ? undefined
        : (input.counterpartyName ?? current.counterpartyName),
    note: input.note === null ? undefined : (input.note ?? current.note),
    debtId: input.debtId === null ? undefined : (input.debtId ?? current.debtId),
  });
  if (linked?.kind === "refund") assertLinkedRefundMetadata(current, merged);
  if (
    merged.creditCardId &&
    merged.type !== "expense" &&
    (merged.type !== current.type || merged.creditCardId !== current.creditCardId)
  )
    assertGenericCardRecord(merged);
  const updatedAt = new Date(Math.max(Date.now(), existingRecord.updatedAt.getTime() + 1));
  const recordValues: Partial<typeof records.$inferInsert> = { updatedAt };
  if (input.restoreMerchantCorrection !== undefined) {
    if (!current.importMerchant) throw validationError("This record has no imported merchant");
    recordValues.merchantCorrection = input.restoreMerchantCorrection;
  } else if (
    current.importMerchant &&
    current.type === "expense" &&
    current.paymentType !== "transfer" &&
    ((hasOwn(input, "categoryId") && merged.categoryId !== current.categoryId) ||
      input.merchantAutoApply !== undefined)
  ) {
    const [category] = merged.categoryId
      ? await db
          .select()
          .from(categories)
          .where(and(eq(categories.id, merged.categoryId), isNull(categories.deletedAt)))
      : [];
    if (isReviewCategory(category)) {
      recordValues.merchantCorrection = {
        savedAt: updatedAt.toISOString(),
        autoApply: input.merchantAutoApply ?? false,
      };
    } else if (input.merchantAutoApply !== undefined) {
      throw validationError("Choose a category before saving a merchant rule");
    } else {
      recordValues.merchantCorrection = null;
    }
  }
  const legacy = splitImportNote(nullToUndefined(existingRecord.note));
  if (legacy.history.length) {
    recordValues.importHistory = current.importHistory;
    recordValues.note = current.note ?? null;
  }
  if (hasOwn(input, "type")) recordValues.type = merged.type;
  if (hasOwn(input, "amount")) recordValues.amount = toNumeric(merged.amount);
  if (hasOwn(input, "currency")) recordValues.currency = merged.currency;
  if (hasOwn(input, "accountId")) recordValues.accountId = merged.accountId ?? null;
  if (hasOwn(input, "accountAmount"))
    recordValues.accountAmount =
      merged.accountAmount === undefined ? null : toNumeric(merged.accountAmount);
  if (hasOwn(input, "creditCardId")) recordValues.creditCardId = merged.creditCardId ?? null;
  if (hasOwn(input, "destinationAccountId"))
    recordValues.destinationAccountId = merged.destinationAccountId ?? null;
  if (hasOwn(input, "destinationAmount"))
    recordValues.destinationAmount =
      merged.destinationAmount === undefined ? null : toNumeric(merged.destinationAmount);
  if (hasOwn(input, "categoryId")) recordValues.categoryId = merged.categoryId ?? null;
  if (hasOwn(input, "counterpartyName"))
    recordValues.counterpartyName = merged.counterpartyName ?? null;
  if (hasOwn(input, "paymentType")) recordValues.paymentType = merged.paymentType;
  if (hasOwn(input, "paymentStatus")) recordValues.paymentStatus = merged.paymentStatus;
  if (hasOwn(input, "exchangeRateToPrimary"))
    recordValues.exchangeRateToPrimary = toNumeric(merged.exchangeRateToPrimary);
  if (hasOwn(input, "amountInLimitCurrency"))
    recordValues.amountInLimitCurrency =
      merged.amountInLimitCurrency === undefined ? null : toNumeric(merged.amountInLimitCurrency);
  if (hasOwn(input, "exchangeRateToLimitCurrency"))
    recordValues.exchangeRateToLimitCurrency =
      merged.exchangeRateToLimitCurrency === undefined
        ? null
        : toNumeric(merged.exchangeRateToLimitCurrency);
  if (hasOwn(input, "occurredAt")) recordValues.occurredAt = new Date(merged.occurredAt);
  if (hasOwn(input, "note")) recordValues.note = merged.note ?? null;
  if (hasOwn(input, "isFixed")) recordValues.isFixed = merged.isFixed ?? false;
  if (hasOwn(input, "debtId")) recordValues.debtId = merged.debtId ?? null;
  const sideQueries = [];
  if (linked?.kind === "refund") {
    // Wallet refund currency/amount describe the bank credit. The card movement
    // retains the original purchase currency, amount, bank destination and link.
    sideQueries.push(
      db
        .update(creditCardRecords)
        .set({
          categoryId: merged.categoryId ?? linked.categoryId,
          counterpartyName: merged.counterpartyName ?? null,
          note: merged.note ?? null,
          updatedAt: new Date(),
        })
        .where(eq(creditCardRecords.id, linked.id)),
    );
  } else if (merged.creditCardId && merged.categoryId && merged.type === "expense") {
    const values = {
      creditCardId: merged.creditCardId,
      walletRecordId: id,
      statementId:
        hasOwn(input, "occurredAt") || hasOwn(input, "creditCardId")
          ? null
          : (linked?.statementId ?? null),
      kind: "purchase",
      amount: toNumeric(merged.amount),
      currency: merged.currency,
      amountInLimitCurrency: toNumeric(merged.amountInLimitCurrency ?? merged.amount),
      exchangeRateToLimitCurrency: toNumeric(merged.exchangeRateToLimitCurrency ?? 1),
      categoryId: merged.categoryId,
      counterpartyName: merged.counterpartyName ?? null,
      note: merged.note ?? null,
      accountId: merged.accountId ?? null,
      accountAmount: merged.accountId ? toNumeric(merged.accountAmount ?? merged.amount) : null,
      accountImpactAtCreation: Boolean(merged.accountId),
      occurredAt: new Date(merged.occurredAt),
      updatedAt: new Date(),
      deletedAt: merged.paymentStatus === "cancelled" ? new Date() : null,
    };
    sideQueries.push(
      linked
        ? db.update(creditCardRecords).set(values).where(eq(creditCardRecords.id, linked.id))
        : db.insert(creditCardRecords).values({ id: randomUUID(), ...values }),
    );
  } else if (linked) {
    sideQueries.push(
      db
        .update(creditCardRecords)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(creditCardRecords.id, linked.id)),
    );
  }
  if (hasOwn(input, "tagIds")) {
    sideQueries.push(db.delete(recordTags).where(eq(recordTags.recordId, id)));
    if (merged.tagIds.length)
      sideQueries.push(
        db.insert(recordTags).values(merged.tagIds.map((tagId) => ({ recordId: id, tagId }))),
      );
  }
  const currentAssociations = groupGoalAssociations(existingGoalRows)[id] ?? [];
  let requested = hasOwn(input, "goalAssociations")
    ? (input.goalAssociations ?? [])
    : hasOwn(input, "goalIds")
      ? (input.goalIds ?? []).map((goalId) => ({
          goalId,
          assignmentSource: "manual" as const,
          useReserved: true,
          reserveIncome: true,
        }))
      : currentAssociations;
  const refreshDateRules = hasOwn(input, "occurredAt") || hasOwn(input, "type");
  if (refreshDateRules)
    requested = requested.filter((item) => item.assignmentSource !== "date_rule");
  const existingGoalIds = new Set(existingGoalRows.map((row) => row.goalId));
  let associations = await resolveGoalAssociations(
    db,
    { ...merged, goalIds: [], goalAssociations: requested },
    existingGoalIds,
    refreshDateRules,
  );
  const reservationFingerprint = (record: NewRecord, items: RecordGoalAssociation[]) =>
    JSON.stringify({
      type: record.type,
      amount: record.amount,
      currency: record.currency,
      accountId: record.accountId,
      accountAmount: record.accountAmount,
      financial: isFinancialRecord(record),
      associations: items
        .map((item) => ({
          goalId: item.goalId,
          useReserved: item.useReserved,
          reserveIncome: item.reserveIncome,
          allocatedAmount: item.allocatedAmount,
        }))
        .sort((a, b) => a.goalId.localeCompare(b.goalId)),
    });
  let newMovements: ReservationMovementWrite[] = [];
  if (
    reservationFingerprint(current, currentAssociations) !==
    reservationFingerprint(merged, associations)
  ) {
    const unresolvedAutomatic = {
      goalIds: new Set<string>(),
      warnings: [] as string[],
      preservedGoalIds: existingGoalIds,
    };
    newMovements = await buildRecordReservationMovements(
      db,
      id,
      merged,
      associations,
      unresolvedAutomatic,
    );
    associations = associations.filter((item) => !unresolvedAutomatic.goalIds.has(item.goalId));
    if (unresolvedAutomatic.warnings.length)
      recordValues.note = [merged.note, ...unresolvedAutomatic.warnings]
        .filter(Boolean)
        .join(" | ");
  }
  if (JSON.stringify(currentAssociations) !== JSON.stringify(associations)) {
    sideQueries.push(db.delete(recordGoals).where(eq(recordGoals.recordId, id)));
    const preservedAutomaticGoalIds = new Set(
      refreshDateRules
        ? []
        : currentAssociations
            .filter((item) => item.assignmentSource === "date_rule")
            .map((item) => item.goalId),
    );
    sideQueries.push(
      ...recordGoalWriteQueries(db, id, merged, associations, preservedAutomaticGoalIds),
    );
  }
  let compensationGoalIds: string[] = [];
  if (
    reservationFingerprint(current, currentAssociations) !==
    reservationFingerprint(merged, associations)
  ) {
    const compensations = await buildRecordMovementCompensations(db, id);
    compensationGoalIds = compensations.goalIds;
    sideQueries.push(...compensations.queries);
    sideQueries.push(
      ...recordReservationWriteQueries(
        db,
        newMovements.map((movement) => ({
          ...movement,
          idempotencyKey: `${movement.idempotencyKey}:${randomUUID()}`,
        })),
      ),
    );
  }
  const recordUpdate = db.update(records).set(recordValues).where(eq(records.id, id)).returning();
  const locks = [
    ...recordCardLockQueries(db, [
      existingRecord.creditCardId,
      linked?.creditCardId,
      merged.creditCardId,
    ]),
    db.execute(sql`select id from records where id = ${id}::uuid for update`),
    ...goalReservationLockQueries(db, [
      ...existingGoalIds,
      ...associations.map((item) => item.goalId),
      ...compensationGoalIds,
    ]),
  ];
  const keepsPurchase = Boolean(
    merged.creditCardId &&
    merged.categoryId &&
    merged.type === "expense" &&
    merged.paymentStatus !== "cancelled" &&
    (!linked || linked.creditCardId === merged.creditCardId),
  );
  const guards = [
    recordFinancialSnapshotGuard(db, existingRecord, linked),
    ...(!keepsPurchase && linked ? [recordCardDependencyGuard(db, id)] : []),
    ...(linked?.kind === "refund" && linked.originalRecordId
      ? [creditCardRecordGuard(db, linked.creditCardId, mapCreditCardRecord(linked), linked.id)]
      : []),
    ...(keepsPurchase
      ? [
          creditCardRecordGuard(
            db,
            merged.creditCardId!,
            {
              kind: "purchase",
              amount: merged.amount,
              currency: merged.currency,
              amountInLimitCurrency: merged.amountInLimitCurrency ?? merged.amount,
              exchangeRateToLimitCurrency: merged.exchangeRateToLimitCurrency ?? 1,
              categoryId: merged.categoryId!,
              accountId: merged.accountId,
              accountAmount: merged.accountId ? (merged.accountAmount ?? merged.amount) : undefined,
              accountImpactAtCreation: Boolean(merged.accountId),
              occurredAt: merged.occurredAt,
            },
            linked?.id,
          ),
        ]
      : []),
  ];
  const categoryLocks = categoryReferenceQueries(db, [
    hasOwn(input, "categoryId") || merged.creditCardId ? merged.categoryId : undefined,
  ]);
  let results;
  try {
    results = await db.batch([
      ...categoryLocks,
      ...locks,
      ...guards,
      recordUpdate,
      ...sideQueries,
      ...[
        ...new Set(
          [current.creditCardId, linked?.creditCardId, merged.creditCardId].filter(
            (id): id is string => Boolean(id),
          ),
        ),
      ].flatMap((id) => cardStatementSyncQueries(db, id)),
    ] as unknown as Parameters<Db["batch"]>[0]);
  } catch (error) {
    recordCardMutationError(error);
  }
  const rows = results[
    categoryLocks.length + locks.length + guards.length
  ] as (typeof records.$inferSelect)[];
  const row = rows[0];
  if (!row) throw new Error("Database mutation returned no record");
  const goalRows = await db.select().from(recordGoals).where(eq(recordGoals.recordId, id));
  return mapRecord(row, { [id]: merged.tagIds }, groupGoalAssociations(goalRows));
}

export async function deleteRecord(db: Db, id: string) {
  const now = new Date();
  const compensations = await buildRecordMovementCompensations(db, id);
  const [recordRows, linkedRows] = await db.batch([
    db.select().from(records).where(eq(records.id, id)),
    db.select().from(creditCardRecords).where(eq(creditCardRecords.walletRecordId, id)),
  ]);
  if (!recordRows[0]) return false;
  if (linkedRows.some((row) => row.kind === "refund"))
    throw validationError(
      "Bank-linked card refund financial history cannot be deleted here. Use the Cards refund workflow.",
    );
  const locks = [
    ...recordCardLockQueries(
      db,
      [...recordRows, ...linkedRows].map((row) => row.creditCardId),
    ),
    db.execute(sql`select id from records where id = ${id}::uuid for update`),
    ...goalReservationLockQueries(db, compensations.goalIds),
  ];
  const guards = [
    recordFinancialSnapshotGuard(db, recordRows[0], linkedRows[0]),
    recordCardDependencyGuard(db, id),
  ];
  let results;
  try {
    results = await db.batch([
      ...locks,
      ...guards,
      db
        .update(records)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(records.id, id))
        .returning(),
      db
        .update(creditCardRecords)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(creditCardRecords.walletRecordId, id)),
      ...compensations.queries,
      ...[
        ...new Set(
          [...recordRows, ...linkedRows]
            .map((row) => row.creditCardId)
            .filter((id): id is string => Boolean(id)),
        ),
      ].flatMap((id) => cardStatementSyncQueries(db, id)),
    ] as unknown as Parameters<Db["batch"]>[0]);
  } catch (error) {
    recordCardMutationError(error);
  }
  const recordResult = results[locks.length + guards.length] as Array<typeof records.$inferSelect>;
  const row = recordResult[0];
  return Boolean(row);
}
