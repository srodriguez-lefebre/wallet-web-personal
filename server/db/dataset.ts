import { desc, isNull, sql } from "drizzle-orm";

import { namedBatch } from "./batch.js";
import { generateDueRecurringDebts } from "./debts.js";
import { goalReservationBalancesQuery, mapGoalReservationBalance } from "./goals/ledger.js";
import {
  asIso,
  asNumber,
  asRequiredIso,
  groupGoalAssociations,
  groupIds,
  mapAccount,
  mapBudget,
  mapCategory,
  mapCreditCard,
  mapCreditCardPayment,
  mapCreditCardPaymentAllocation,
  mapCreditCardRecord,
  mapCreditCardStatement,
  mapDebt,
  mapExchangeRate,
  mapGoal,
  mapGoalReservationMovement,
  mapInstallmentPlan,
  mapInvestment,
  mapRecord,
  mapRecordTemplate,
  mapRecurringDebt,
  mapSettings,
  mapTag,
  nullToUndefined,
} from "./mappers.js";
import { listRecords } from "./records/list.js";
import {
  accounts,
  budgets,
  categories,
  creditCardPaymentAllocations,
  creditCardPayments,
  creditCardRecords,
  creditCards,
  creditCardStatements,
  debts,
  exchangeRates,
  goalReservationMovements,
  goals,
  goalTags,
  ingestionEvents,
  installmentPlans,
  investments,
  merchantAliases,
  merchants,
  recordGoals,
  records,
  recordTags,
  recordTemplates,
  recurringDebts,
  settings,
  tags,
} from "./schema.js";

import type { WalletDataset, WalletRecord } from "../../shared/types.js";
import type { Db } from "./input-types.js";

export async function getWalletDataset(
  db: Db,
  options: {
    recordsOverride?: WalletRecord[];
    includeArchived?: boolean;
  } = {},
): Promise<WalletDataset> {
  const {
    settingsRows,
    accountRows,
    categoryRows,
    tagRows,
    creditCardRows,
    creditCardPaymentRows,
    creditCardRecordRows,
    creditCardStatementRows,
    creditCardAllocationRows,
    recordRows,
    recordTagRows,
    recordGoalRows,
    goalRows,
    goalTagRows,
    goalReservationMovementRows,
    reservationBalanceRows,
    budgetRows,
    exchangeRateRows,
    investmentRows,
    debtRows,
    recurringDebtRows,
    installmentPlanRows,
    merchantRows,
    merchantAliasRows,
    ingestionRows,
    templateRows,
  } = await namedBatch(db, {
    isolation: db.execute(
      sql`SET TRANSACTION ISOLATION LEVEL ${sql.raw(options.includeArchived ? "REPEATABLE READ" : "READ COMMITTED")}`,
    ),
    settingsRows: db.select().from(settings).limit(1),
    accountRows: db
      .select()
      .from(accounts)
      .where(options.includeArchived ? undefined : isNull(accounts.deletedAt)),
    categoryRows: db
      .select()
      .from(categories)
      .where(options.includeArchived ? undefined : isNull(categories.deletedAt)),
    tagRows: db.select().from(tags),
    creditCardRows: db.select().from(creditCards).orderBy(desc(creditCards.createdAt)),
    creditCardPaymentRows: db
      .select()
      .from(creditCardPayments)
      .orderBy(desc(creditCardPayments.occurredAt)),
    creditCardRecordRows: db
      .select()
      .from(creditCardRecords)
      .where(options.includeArchived ? undefined : isNull(creditCardRecords.deletedAt))
      .orderBy(desc(creditCardRecords.occurredAt)),
    creditCardStatementRows: db
      .select()
      .from(creditCardStatements)
      .orderBy(desc(creditCardStatements.cycleEnd)),
    creditCardAllocationRows: db.select().from(creditCardPaymentAllocations),
    recordRows: options.recordsOverride
      ? db
          .select()
          .from(records)
          .where(sql`false`)
          .limit(0)
      : db
          .select()
          .from(records)
          .where(options.includeArchived ? undefined : isNull(records.deletedAt))
          .orderBy(desc(records.occurredAt), desc(records.id)),
    recordTagRows: options.recordsOverride
      ? db
          .select()
          .from(recordTags)
          .where(sql`false`)
          .limit(0)
      : db.select().from(recordTags),
    recordGoalRows: options.recordsOverride
      ? db
          .select()
          .from(recordGoals)
          .where(sql`false`)
          .limit(0)
      : db.select().from(recordGoals),
    goalRows: db
      .select()
      .from(goals)
      .where(options.includeArchived ? undefined : isNull(goals.deletedAt)),
    goalTagRows: db.select().from(goalTags),
    goalReservationMovementRows: db
      .select()
      .from(goalReservationMovements)
      .orderBy(desc(goalReservationMovements.createdAt)),
    reservationBalanceRows: goalReservationBalancesQuery(db),
    budgetRows: db.select().from(budgets),
    exchangeRateRows: db.select().from(exchangeRates).orderBy(desc(exchangeRates.date)),
    investmentRows: db.select().from(investments).orderBy(desc(investments.startedAt)),
    debtRows: db.select().from(debts),
    recurringDebtRows: db.select().from(recurringDebts).orderBy(desc(recurringDebts.startedAt)),
    installmentPlanRows: db.select().from(installmentPlans),
    merchantRows: db
      .select()
      .from(merchants)
      .where(options.includeArchived ? undefined : sql`false`),
    merchantAliasRows: db
      .select()
      .from(merchantAliases)
      .where(options.includeArchived ? undefined : sql`false`),
    ingestionRows: db
      .select()
      .from(ingestionEvents)
      .where(options.includeArchived ? undefined : sql`false`),
    templateRows: db
      .select()
      .from(recordTemplates)
      .orderBy(recordTemplates.name, recordTemplates.id),
  });
  const tagIdsByRecord = groupIds(recordTagRows, "recordId", "tagId");
  const goalAssociationsByRecord = groupGoalAssociations(recordGoalRows);
  const withMetadata = <T>(mapped: T, row: Record<string, unknown> | undefined): T => {
    if (!options.includeArchived || !row) return mapped;
    const keys = new Set(["deletedAt", "createdAt", "updatedAt", "idempotencyKey", "requestHash"]);
    const metadata = Object.fromEntries(
      Object.entries(row)
        .filter(([key, value]) => keys.has(key) && value !== null && value !== undefined)
        .map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value]),
    );
    return { ...mapped, ...metadata };
  };
  return {
    recordTemplates: templateRows.map(mapRecordTemplate),
    ...(options.includeArchived
      ? {
          merchants: merchantRows.map((row) =>
            withMetadata(
              {
                id: row.id,
                name: row.name,
                categoryId: row.categoryId,
                priority: row.priority,
                matchMode: row.matchMode,
                isActive: row.isActive,
              },
              row,
            ),
          ),
          merchantAliases: merchantAliasRows.map((row) =>
            withMetadata(
              {
                id: row.id,
                merchantId: row.merchantId,
                alias: row.alias,
                normalizedAlias: row.normalizedAlias,
              },
              row,
            ),
          ),
          ingestionEvents: ingestionRows.map((row) => ({
            id: row.id,
            idempotencyKey: row.idempotencyKey,
            source: row.source,
            status: row.status,
            action: nullToUndefined(row.action),
            fingerprint: nullToUndefined(row.fingerprint),
            targetKey: nullToUndefined(row.targetKey),
            merchantNormalized: nullToUndefined(row.merchantNormalized),
            amount: row.amount === null ? undefined : asNumber(row.amount),
            currency: nullToUndefined(row.currency) as WalletRecord["currency"] | undefined,
            occurredAt: asIso(row.occurredAt),
            recordId: nullToUndefined(row.recordId),
            creditCardRecordId: nullToUndefined(row.creditCardRecordId),
            duplicateOfId: nullToUndefined(row.duplicateOfId),
            completedAt: asIso(row.completedAt),
            createdAt: asRequiredIso(row.createdAt),
            updatedAt: asRequiredIso(row.updatedAt),
          })),
        }
      : {}),
    settings: withMetadata(mapSettings(settingsRows[0]), settingsRows[0]),
    accounts: accountRows.map((row) => withMetadata(mapAccount(row), row)),
    categories: categoryRows.map((row) => withMetadata(mapCategory(row), row)),
    tags: tagRows.map((row) => withMetadata(mapTag(row), row)),
    creditCards: creditCardRows.map((row) => withMetadata(mapCreditCard(row), row)),
    creditCardRecords: creditCardRecordRows.map((row) =>
      withMetadata(mapCreditCardRecord(row), row),
    ),
    creditCardStatements: creditCardStatementRows.map((row) =>
      withMetadata(mapCreditCardStatement(row), row),
    ),
    creditCardPayments: creditCardPaymentRows.map((row) =>
      withMetadata(mapCreditCardPayment(row), row),
    ),
    creditCardPaymentAllocations: creditCardAllocationRows.map((row) =>
      withMetadata(mapCreditCardPaymentAllocation(row), row),
    ),
    records:
      options.recordsOverride ??
      recordRows.map((record) =>
        withMetadata(mapRecord(record, tagIdsByRecord, goalAssociationsByRecord), record),
      ),
    goals: goalRows.map((goal) =>
      withMetadata(
        mapGoal(
          goal,
          goalTagRows.filter((link) => link.goalId === goal.id).map((link) => link.tagId),
        ),
        goal,
      ),
    ),
    goalReservations: reservationBalanceRows.map(mapGoalReservationBalance),
    goalReservationMovements: goalReservationMovementRows.map((row) =>
      withMetadata(mapGoalReservationMovement(row), row),
    ),
    budgets: budgetRows.map((row) => withMetadata(mapBudget(row), row)),
    exchangeRates: exchangeRateRows.map((row) => withMetadata(mapExchangeRate(row), row)),
    investments: investmentRows.map((row) => withMetadata(mapInvestment(row), row)),
    debts: debtRows.map((row) => withMetadata(mapDebt(row), row)),
    recurringDebts: recurringDebtRows.map((row) => withMetadata(mapRecurringDebt(row), row)),
    installmentPlans: installmentPlanRows.map((row) => withMetadata(mapInstallmentPlan(row), row)),
  };
}

/** Complete, consistent financial history for backup; archived rows stay hidden in ordinary wallet reads. */
export async function getWalletBackup(db: Db): Promise<WalletDataset> {
  return getWalletDataset(db, { includeArchived: true });
}

export async function bootstrapWallet(
  db: Db,
  input: {
    recordsLimit: number;
    recordsCursor?: string | null;
  },
  currentDate = new Date(),
) {
  const generatedDebts = await generateDueRecurringDebts(db, currentDate);
  const recordsPage = await listRecords(db, {
    limit: input.recordsLimit,
    cursor: input.recordsCursor ?? undefined,
  });
  const dataset = await getWalletDataset(db, { recordsOverride: recordsPage.items });
  return {
    dataset,
    recordsPage: {
      nextCursor: recordsPage.nextCursor,
      hasMore: recordsPage.hasMore,
    },
    generatedDebts,
    serverDate: currentDate.toISOString().slice(0, 10),
  };
}
