import { and, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, ne, or, sql, type SQL } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { createDb, type DbClient } from "./client.js";
import {
  accounts,
  budgets,
  categories,
  creditCardPayments,
  creditCardPaymentAllocations,
  creditCardRecords,
  creditCardStatements,
  creditCards,
  debts,
  exchangeRates,
  goalReservationMovements,
  goalTags,
  goals,
  installmentPlans,
  investments,
  merchants,
  merchantAliases,
  ingestionEvents,
  records,
  recordGoals,
  recordTags,
  recurringDebts,
  settings,
  tags,
} from "./schema.js";
import type {
  Account,
  Budget,
  Category,
  CreditCard,
  CreditCardPayment,
  CreditCardPaymentAllocation,
  CreditCardRecord,
  CreditCardStatement,
  Debt,
  ExchangeRate,
  Goal,
  GoalReservation,
  GoalReservationMovement,
  RecordGoalAssociation,
  InstallmentPlan,
  Investment,
  RecurringDebt,
  Tag,
  WalletDataset,
  WalletRecord,
  WalletSettings,
} from "../../shared/types.js";
import {
  accountSchema,
  budgetSchema,
  categorySchema,
  creditCardRecordSchema,
  creditCardSchema,
  debtSchema,
  goalSchema,
  investmentSchema,
  recordSchema,
  recurringDebtSchema,
  settingsSchema,
  tagSchema,
  installmentPlanSchema,
  type AccountPatch,
  type BudgetPatch,
  type CategoryPatch,
  type CreditCardPatch,
  type CreditCardRecordPatch,
  type DebtPatch,
  type RecordPatch,
  type RecurringDebtPatch,
  type SettingsPatch,
  type GoalPatch,
  type InvestmentPatch,
  type InstallmentPlanPatch,
  type TagPatch,
} from "../../shared/schemas.js";
import { conflictError, validationError } from "../api/errors.js";
import { decodeRecordCursor, encodeRecordCursor } from "../api/record-cursor.js";
import { findExchangeRate } from "../../shared/money.js";
import { isFinancialRecord } from "../../shared/record-status.js";

type Db = DbClient;
type NewAccount = Omit<Account, "id">;
type NewCategory = Omit<Category, "id">;
type NewTag = Omit<Tag, "id">;
type NewRecord = Omit<WalletRecord, "id">;
type NewCreditCard = Omit<CreditCard, "id">;
type NewCreditCardPayment = Omit<CreditCardPayment, "id" | "creditCardId">;
type NewCreditCardRecord = Omit<
  CreditCardRecord,
  "id" | "creditCardId" | "walletRecordId" | "statementId"
>;
type NewGoal = Omit<Goal, "id" | "tagIds">;
type NewGoalReservation = Omit<GoalReservation, "id">;
type ReservationMovementWrite = Omit<typeof goalReservationMovements.$inferInsert, "amount"> & { amount: string | SQL };
type NewBudget = Omit<Budget, "id">;
type NewInstallmentPlan = Omit<InstallmentPlan, "id">;
type NewInvestment = Omit<Investment, "id" | "startedAt"> & {
  startedAt?: string;
};
type NewDebt = Omit<Debt, "id" | "startedAt"> & {
  startedAt?: string;
};
type NewRecurringDebt = Omit<RecurringDebt, "id" | "startedAt"> & {
  startedAt?: string;
};

function asNumber(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

function optional<T>(value: T | null | undefined) {
  return value ?? undefined;
}

function asIso(value: Date | string | null | undefined) {
  if (!value) return undefined;
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function asRequiredIso(value: Date | string) {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function toDate(value: string | undefined) {
  return value ? new Date(value) : null;
}

function decimal(value: number) {
  return String(value);
}

function hasOwn<T extends object>(value: T, key: PropertyKey) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function groupIds<T extends { [key: string]: string }>(
  rows: T[],
  key: keyof T,
  value: keyof T,
) {
  return rows.reduce<Record<string, string[]>>((groups, row) => {
    const groupKey = row[key];
    const groupValue = row[value];
    groups[groupKey] = [...(groups[groupKey] ?? []), groupValue];
    return groups;
  }, {});
}

function mapAccount(row: typeof accounts.$inferSelect): Account {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    currency: row.currency as Account["currency"],
    initialBalance: asNumber(row.initialBalance),
    color: row.color,
    icon: row.icon,
    isVisible: row.isVisible,
    isActive: row.isActive,
    note: optional(row.note),
  };
}

function mapCategory(row: typeof categories.$inferSelect): Category {
  return {
    id: row.id,
    name: row.name,
    parentId: optional(row.parentId),
    color: row.color,
    icon: row.icon,
    systemKey: optional(row.systemKey),
  };
}

function mapTag(row: typeof tags.$inferSelect): Tag {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    isActive: row.isActive,
  };
}

function mapRecord(
  row: typeof records.$inferSelect,
  tagIdsByRecord: Record<string, string[]>,
  goalAssociationsByRecord: Record<string, RecordGoalAssociation[]> = {},
): WalletRecord {
  const goalAssociations = goalAssociationsByRecord[row.id] ?? [];
  return {
    id: row.id,
    type: row.type,
    amount: asNumber(row.amount),
    currency: row.currency as WalletRecord["currency"],
    accountId: optional(row.accountId),
    accountAmount:
      row.accountAmount === null ? undefined : asNumber(row.accountAmount),
    creditCardId: optional(row.creditCardId),
    destinationAccountId: optional(row.destinationAccountId),
    destinationAmount: row.destinationAmount === null ? undefined : asNumber(row.destinationAmount),
    categoryId: optional(row.categoryId),
    counterpartyName: optional(row.counterpartyName),
    tagIds: tagIdsByRecord[row.id] ?? [],
    goalIds: goalAssociations.map((association) => association.goalId),
    goalAssociations,
    paymentType: row.paymentType,
    paymentStatus: row.paymentStatus,
    exchangeRateToPrimary: asNumber(row.exchangeRateToPrimary),
    amountInLimitCurrency:
      row.amountInLimitCurrency === null
        ? undefined
        : asNumber(row.amountInLimitCurrency),
    exchangeRateToLimitCurrency:
      row.exchangeRateToLimitCurrency === null
        ? undefined
        : asNumber(row.exchangeRateToLimitCurrency),
    occurredAt: asRequiredIso(row.occurredAt),
    note: optional(row.note),
    isFixed: row.isFixed,
    debtId: optional(row.debtId),
  };
}

function mapCreditCard(row: typeof creditCards.$inferSelect): CreditCard {
  return {
    id: row.id,
    name: row.name,
    issuer: row.issuer,
    lastFour: row.lastFour,
    creditLimit: asNumber(row.creditLimit),
    limitCurrency: row.limitCurrency as CreditCard["limitCurrency"],
    closingDay: row.closingDay,
    dueDay: row.dueDay,
    color: row.color,
    icon: row.icon,
    isActive: row.isActive && row.deletedAt === null,
    note: optional(row.note),
  };
}

function mapCreditCardPayment(
  row: typeof creditCardPayments.$inferSelect,
): CreditCardPayment {
  return {
    id: row.id,
    creditCardId: row.creditCardId,
    idempotencyKey: optional(row.idempotencyKey),
    statementId: optional(row.statementId),
    amount: asNumber(row.amount),
    currency: row.currency as CreditCardPayment["currency"],
    amountInLimitCurrency: asNumber(row.amountInLimitCurrency),
    accountId: optional(row.accountId),
    accountAmount:
      row.accountAmount === null ? undefined : asNumber(row.accountAmount),
    occurredAt: asRequiredIso(row.occurredAt),
    note: optional(row.note),
  };
}

function mapCreditCardRecord(
  row: typeof creditCardRecords.$inferSelect,
): CreditCardRecord {
  return {
    id: row.id,
    creditCardId: row.creditCardId,
    walletRecordId: optional(row.walletRecordId),
    originalRecordId: optional(row.originalRecordId),
    statementId: optional(row.statementId),
    kind: row.kind as CreditCardRecord["kind"],
    amount: asNumber(row.amount),
    currency: row.currency as CreditCardRecord["currency"],
    amountInLimitCurrency: asNumber(row.amountInLimitCurrency),
    exchangeRateToLimitCurrency: asNumber(row.exchangeRateToLimitCurrency),
    categoryId: row.categoryId,
    counterpartyName: optional(row.counterpartyName),
    note: optional(row.note),
    accountId: optional(row.accountId),
    accountAmount:
      row.accountAmount === null ? undefined : asNumber(row.accountAmount),
    accountImpactAtCreation: row.accountImpactAtCreation,
    occurredAt: asRequiredIso(row.occurredAt),
  };
}

function mapCreditCardStatement(
  row: typeof creditCardStatements.$inferSelect,
): CreditCardStatement {
  return {
    id: row.id,
    creditCardId: row.creditCardId,
    cycleStart: asRequiredIso(row.cycleStart),
    cycleEnd: asRequiredIso(row.cycleEnd),
    dueAt: asRequiredIso(row.dueAt),
    status: row.status as CreditCardStatement["status"],
    closedAt: asRequiredIso(row.closedAt),
    paidAt: asIso(row.paidAt),
  };
}

function mapCreditCardPaymentAllocation(
  row: typeof creditCardPaymentAllocations.$inferSelect,
): CreditCardPaymentAllocation {
  return {
    id: row.id,
    paymentId: row.paymentId,
    creditCardRecordId: row.creditCardRecordId,
    amount: asNumber(row.amount),
    amountInLimitCurrency: asNumber(row.amountInLimitCurrency),
  };
}

function mapGoal(
  row: typeof goals.$inferSelect,
  tagIds: string[] = [],
): Goal {
  return {
    id: row.id,
    name: row.name,
    targetAmount: asNumber(row.targetAmount),
    currency: row.currency as Goal["currency"],
    color: row.color,
    icon: row.icon,
    isVisible: row.isVisible,
    deadline: asIso(row.deadline),
    status: row.status,
    tagIds,
    accountId: optional(row.accountId),
    autoCaptureEnabled: row.autoCaptureEnabled,
    autoCaptureStart: optional(row.autoCaptureStart),
    autoCaptureEnd: optional(row.autoCaptureEnd),
    autoReservationAccountId: optional(row.autoReservationAccountId),
    note: optional(row.note),
  };
}

function mapGoalReservationMovement(
  row: typeof goalReservationMovements.$inferSelect,
): GoalReservationMovement {
  return {
    id: row.id,
    goalId: row.goalId,
    accountId: row.accountId,
    type: row.type as GoalReservationMovement["type"],
    amount: asNumber(row.amount),
    currency: row.currency as GoalReservationMovement["currency"],
    recordId: optional(row.recordId),
    reversesMovementId: optional(row.reversesMovementId),
    note: optional(row.note),
    createdAt: asRequiredIso(row.createdAt),
  };
}

function deriveGoalReservations(
  movementRows: Array<typeof goalReservationMovements.$inferSelect>,
): GoalReservation[] {
  const balances = new Map<string, GoalReservation>();
  for (const row of movementRows) {
    const key = `${row.goalId}:${row.accountId}:${row.currency}`;
    const current = balances.get(key) ?? {
      id: row.id,
      goalId: row.goalId,
      accountId: row.accountId,
      amount: 0,
      currency: row.currency as GoalReservation["currency"],
      createdAt: asRequiredIso(row.createdAt),
      note: "Saldo reservado",
    };
    const direction = row.type === "reserve" || row.type === "restore" ? 1 : -1;
    current.amount += direction * asNumber(row.amount);
    balances.set(key, current);
  }
  return [...balances.values()].filter((reservation) => reservation.amount > 0.005);
}

function groupGoalAssociations(rows: Array<typeof recordGoals.$inferSelect>) {
  return rows.reduce<Record<string, RecordGoalAssociation[]>>((groups, row) => {
    groups[row.recordId] = [...(groups[row.recordId] ?? []), {
      goalId: row.goalId,
      assignmentSource: row.assignmentSource as RecordGoalAssociation["assignmentSource"],
      useReserved: row.useReserved,
      reserveIncome: row.reserveIncome,
      allocatedAmount: row.allocatedAmount === null ? undefined : asNumber(row.allocatedAmount),
    }];
    return groups;
  }, {});
}

function mapBudget(row: typeof budgets.$inferSelect): Budget {
  return {
    id: row.id,
    name: row.name,
    limitAmount: asNumber(row.limitAmount),
    currency: row.currency as Budget["currency"],
    period: "monthly",
    categoryId: optional(row.categoryId),
    tagId: optional(row.tagId),
    accountId: optional(row.accountId),
    goalId: optional(row.goalId),
    color: row.color,
    isActive: row.isActive,
  };
}

function mapExchangeRate(row: typeof exchangeRates.$inferSelect): ExchangeRate {
  return {
    id: row.id,
    fromCurrency: row.fromCurrency as ExchangeRate["fromCurrency"],
    toCurrency: row.toCurrency as ExchangeRate["toCurrency"],
    rate: asNumber(row.rate),
    date: asRequiredIso(row.date),
    source: row.source,
  };
}

function mapInvestment(row: typeof investments.$inferSelect): Investment {
  return {
    id: row.id,
    name: row.name,
    type: row.type as Investment["type"],
    amountInvested: asNumber(row.amountInvested),
    currentValue: asNumber(row.currentValue),
    currency: row.currency as Investment["currency"],
    isVisible: row.isVisible,
    startedAt: asRequiredIso(row.startedAt),
    note: optional(row.note),
  };
}

function mapDebt(row: typeof debts.$inferSelect): Debt {
  return {
    id: row.id,
    name: row.name,
    direction: row.direction as Debt["direction"],
    originalAmount:
      row.originalAmount === null ? undefined : asNumber(row.originalAmount),
    pendingAmount:
      row.pendingAmount === null ? undefined : asNumber(row.pendingAmount),
    currency: row.currency as Debt["currency"],
    counterpartyName: row.counterpartyName,
    accountId: optional(row.accountId),
    categoryId: row.categoryId,
    status: row.status,
    isVisible: row.isVisible,
    startedAt: asRequiredIso(row.startedAt),
    dueAt: asIso(row.dueAt),
    note: optional(row.note),
    recurringDebtId: optional(row.recurringDebtId),
    recurringMonth: optional(row.recurringMonth),
  };
}

function mapRecurringDebt(
  row: typeof recurringDebts.$inferSelect,
): RecurringDebt {
  return {
    id: row.id,
    name: row.name,
    direction: row.direction as RecurringDebt["direction"],
    amount: row.amount === null ? undefined : asNumber(row.amount),
    currency: row.currency as RecurringDebt["currency"],
    counterpartyName: row.counterpartyName,
    accountId: optional(row.accountId),
    categoryId: row.categoryId,
    dayOfMonth: asNumber(row.dayOfMonth),
    isActive: row.isActive,
    startedAt: asRequiredIso(row.startedAt),
    note: optional(row.note),
  };
}

function mapInstallmentPlan(
  row: typeof installmentPlans.$inferSelect,
): InstallmentPlan {
  return {
    id: row.id,
    name: row.name,
    totalAmount: asNumber(row.totalAmount),
    currency: row.currency as InstallmentPlan["currency"],
    installmentsTotal: asNumber(row.installmentsTotal),
    installmentsPaid: asNumber(row.installmentsPaid),
    accountId: row.accountId,
    categoryId: row.categoryId,
    nextPaymentAt: asIso(row.nextPaymentAt),
    note: optional(row.note),
  };
}

function mapSettings(
  row: typeof settings.$inferSelect | undefined,
): WalletSettings {
  return {
    primaryCurrency: (row?.primaryCurrency ??
      "UYU") as WalletSettings["primaryCurrency"],
    primaryAccountId: optional(row?.primaryAccountId),
    theme: (row?.theme ?? "light") as WalletSettings["theme"],
    defaultDashboardPreset: (row?.defaultDashboardPreset ??
      "general") as WalletSettings["defaultDashboardPreset"],
    locale: "es-UY",
    includeHiddenAccountsInReports:
      row?.includeHiddenAccountsInReports ?? false,
    defaultAccountId: optional(row?.defaultAccountId ?? row?.primaryAccountId),
    defaultPaymentType: row?.defaultPaymentType ?? "debit",
    defaultCreditCardId: optional(row?.defaultCreditCardId),
    defaultPaymentStatus: row?.defaultPaymentStatus ?? "cleared",
  };
}

export async function getWalletDataset(
  db: Db = createDb(),
  options: { recordsOverride?: WalletRecord[]; includeArchived?: boolean } = {},
): Promise<WalletDataset> {
  if (!options.includeArchived) await ensureCreditCardStatements(db);
  const [
    ,
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
    budgetRows,
    exchangeRateRows,
    investmentRows,
    debtRows,
    recurringDebtRows,
    installmentPlanRows,
    merchantRows,
    merchantAliasRows,
    ingestionRows,
  ] = await db.batch([
    db.execute(sql`SET TRANSACTION ISOLATION LEVEL ${sql.raw(options.includeArchived ? "REPEATABLE READ" : "READ COMMITTED")}`),
    db.select().from(settings).limit(1),
    db.select().from(accounts).where(options.includeArchived ? undefined : isNull(accounts.deletedAt)),
    db.select().from(categories).where(options.includeArchived ? undefined : isNull(categories.deletedAt)),
    db.select().from(tags),
    db.select().from(creditCards).orderBy(desc(creditCards.createdAt)),
    db
      .select()
      .from(creditCardPayments)
      .orderBy(desc(creditCardPayments.occurredAt)),
    db
      .select()
      .from(creditCardRecords)
      .where(options.includeArchived ? undefined : isNull(creditCardRecords.deletedAt))
      .orderBy(desc(creditCardRecords.occurredAt)),
    db
      .select()
      .from(creditCardStatements)
      .orderBy(desc(creditCardStatements.cycleEnd)),
    db.select().from(creditCardPaymentAllocations),
    options.recordsOverride
      ? db.select().from(records).where(sql`false`).limit(0)
      : db
          .select()
          .from(records)
          .where(options.includeArchived ? undefined : isNull(records.deletedAt))
          .orderBy(desc(records.occurredAt), desc(records.id)),
    options.recordsOverride
      ? db.select().from(recordTags).where(sql`false`).limit(0)
      : db.select().from(recordTags),
    options.recordsOverride
      ? db.select().from(recordGoals).where(sql`false`).limit(0)
      : db.select().from(recordGoals),
    db.select().from(goals).where(options.includeArchived ? undefined : isNull(goals.deletedAt)),
    db.select().from(goalTags),
    db
      .select()
      .from(goalReservationMovements)
      .orderBy(desc(goalReservationMovements.createdAt)),
    db.select().from(budgets),
    db.select().from(exchangeRates).orderBy(desc(exchangeRates.date)),
    db.select().from(investments).orderBy(desc(investments.startedAt)),
    db.select().from(debts),
    db.select().from(recurringDebts).orderBy(desc(recurringDebts.startedAt)),
    db.select().from(installmentPlans),
    db.select().from(merchants).where(options.includeArchived ? undefined : sql`false`),
    db.select().from(merchantAliases).where(options.includeArchived ? undefined : sql`false`),
    db.select().from(ingestionEvents).where(options.includeArchived ? undefined : sql`false`),
  ]);

  const tagIdsByRecord = groupIds(recordTagRows, "recordId", "tagId");
  const goalAssociationsByRecord = groupGoalAssociations(recordGoalRows);
  const withMetadata = <T>(mapped: T, row: Record<string, unknown> | undefined): T => {
    if (!options.includeArchived || !row) return mapped;
    const keys = new Set(["deletedAt", "createdAt", "updatedAt", "idempotencyKey", "requestHash"]);
    const metadata = Object.fromEntries(Object.entries(row)
      .filter(([key, value]) => keys.has(key) && value !== null && value !== undefined)
      .map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value]));
    return { ...mapped, ...metadata };
  };

  return {
    ...(options.includeArchived ? {
      merchants: merchantRows.map(row=>withMetadata({id:row.id,name:row.name,categoryId:row.categoryId,priority:row.priority,isActive:row.isActive},row)),
      merchantAliases: merchantAliasRows.map(row=>withMetadata({id:row.id,merchantId:row.merchantId,alias:row.alias,normalizedAlias:row.normalizedAlias},row)),
      ingestionEvents:ingestionRows.map(row=>({
        id:row.id,idempotencyKey:row.idempotencyKey,source:row.source,status:row.status,action:optional(row.action),
        fingerprint:optional(row.fingerprint),targetKey:optional(row.targetKey),merchantNormalized:optional(row.merchantNormalized),
        amount:row.amount===null?undefined:asNumber(row.amount),currency:optional(row.currency) as WalletRecord["currency"]|undefined,
        occurredAt:asIso(row.occurredAt),recordId:optional(row.recordId),creditCardRecordId:optional(row.creditCardRecordId),
        duplicateOfId:optional(row.duplicateOfId),completedAt:asIso(row.completedAt),createdAt:asRequiredIso(row.createdAt),updatedAt:asRequiredIso(row.updatedAt),
      })),
    } : {}),
    settings: withMetadata(mapSettings(settingsRows[0]), settingsRows[0]),
    accounts: accountRows.map((row) => withMetadata(mapAccount(row), row)),
    categories: categoryRows.map((row) => withMetadata(mapCategory(row), row)),
    tags: tagRows.map((row) => withMetadata(mapTag(row), row)),
    creditCards: creditCardRows.map((row) => withMetadata(mapCreditCard(row), row)),
    creditCardRecords: creditCardRecordRows.map((row) => withMetadata(mapCreditCardRecord(row), row)),
    creditCardStatements: creditCardStatementRows.map((row) => withMetadata(mapCreditCardStatement(row), row)),
    creditCardPayments: creditCardPaymentRows.map((row) => withMetadata(mapCreditCardPayment(row), row)),
    creditCardPaymentAllocations: creditCardAllocationRows.map((row) => withMetadata(mapCreditCardPaymentAllocation(row), row)),
    records: options.recordsOverride ?? recordRows.map((record) => withMetadata(mapRecord(record, tagIdsByRecord, goalAssociationsByRecord), record)),
    goals: goalRows.map((goal) => withMetadata(mapGoal(goal, goalTagRows.filter((link) => link.goalId === goal.id).map((link) => link.tagId)), goal)),
    goalReservations: deriveGoalReservations(goalReservationMovementRows),
    goalReservationMovements: goalReservationMovementRows.map((row) => withMetadata(mapGoalReservationMovement(row), row)),
    budgets: budgetRows.map((row) => withMetadata(mapBudget(row), row)),
    exchangeRates: exchangeRateRows.map((row) => withMetadata(mapExchangeRate(row), row)),
    investments: investmentRows.map((row) => withMetadata(mapInvestment(row), row)),
    debts: debtRows.map((row) => withMetadata(mapDebt(row), row)),
    recurringDebts: recurringDebtRows.map((row) => withMetadata(mapRecurringDebt(row), row)),
    installmentPlans: installmentPlanRows.map((row) => withMetadata(mapInstallmentPlan(row), row)),
  };
}

/** Complete, consistent financial history for backup; archived rows stay hidden in ordinary wallet reads. */
export async function getWalletBackup(db: Db = createDb()): Promise<WalletDataset> {
  return getWalletDataset(db, { includeArchived: true });
}

export async function bootstrapWallet(
  input: { recordsLimit: number; recordsCursor?: string | null },
  currentDate = new Date(),
  db: Db = createDb(),
) {
  const generatedDebts = await generateDueRecurringDebts(currentDate, db);
  const recordsPage = await listRecords({
    limit: input.recordsLimit,
    cursor: input.recordsCursor ?? undefined,
  }, db);
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

export async function listAccounts(db: Db = createDb()) {
  const rows = await db
    .select()
    .from(accounts)
    .where(isNull(accounts.deletedAt));
  return rows.map(mapAccount);
}

export async function listCreditCards(db: Db = createDb()) {
  const rows = await db
    .select()
    .from(creditCards)
    .orderBy(desc(creditCards.createdAt));
  return rows.map(mapCreditCard);
}

export async function createCreditCard(
  input: NewCreditCard,
  db: Db = createDb(),
) {
  const [row] = await db
    .insert(creditCards)
    .values({
      ...input,
      creditLimit: decimal(input.creditLimit),
    })
    .returning();
  return mapCreditCard(row);
}

export async function updateCreditCard(
  id: string,
  input: CreditCardPatch,
  db: Db = createDb(),
) {
  const [current] = await db.select().from(creditCards).where(eq(creditCards.id, id)).limit(1);
  if (!current) return null;
  const merged = creditCardSchema.parse({
    ...mapCreditCard(current),
    ...input,
    note: input.note === null ? undefined : (input.note ?? optional(current.note)),
  });
  const values: Partial<typeof creditCards.$inferInsert> = { updatedAt: new Date() };
  for (const key of ["name", "issuer", "lastFour", "limitCurrency", "closingDay", "dueDay", "color", "icon", "isActive"] as const) {
    if (hasOwn(input, key)) values[key] = merged[key] as never;
  }
  if (hasOwn(input, "creditLimit")) values.creditLimit = decimal(merged.creditLimit);
  if (hasOwn(input, "note")) values.note = merged.note ?? null;
  if (hasOwn(input, "isActive")) values.deletedAt = merged.isActive ? null : new Date();
  const [row] = await db
    .update(creditCards)
    .set(values)
    .where(eq(creditCards.id, id))
    .returning();
  return row ? mapCreditCard(row) : null;
}

export async function archiveCreditCard(id: string, db: Db = createDb()) {
  const [row] = await db
    .update(creditCards)
    .set({ isActive: false, deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(creditCards.id, id))
    .returning();
  await db
    .update(settings)
    .set({
      defaultPaymentType: "cash",
      defaultCreditCardId: null,
      updatedAt: new Date(),
    })
    .where(eq(settings.defaultCreditCardId, id));
  return Boolean(row);
}

export async function createCreditCardPayment(
  creditCardId: string,
  input: NewCreditCardPayment,
  db: Db = createDb(),
) {
  if (!input.statementId) throw validationError("Select a statement before making a card payment");
  return payCreditCardStatement(creditCardId, input.statementId, input, db);
}

function lockCreditCard(db: Db, creditCardId: string) {
  return db.update(creditCards).set({ updatedAt: new Date() }).where(eq(creditCards.id, creditCardId));
}

// All card mutations use the same lock and refresh balances in their atomic batch.
function refreshCreditCardStatements(db: Db, creditCardId?: string) {
  return db.execute(sql`
    WITH balances AS (
      SELECT s.id, s.due_at,
        coalesce((SELECT sum(p.amount_in_limit_currency - coalesce((
          SELECT sum(r.amount_in_limit_currency) FROM credit_card_records r
          WHERE r.original_record_id = p.id AND r.kind = 'refund' AND r.deleted_at IS NULL
        ), 0)) FROM credit_card_records p
          WHERE p.statement_id = s.id AND p.kind = 'purchase' AND p.deleted_at IS NULL), 0) AS total,
        coalesce((SELECT sum(amount_in_limit_currency) FROM credit_card_payments WHERE statement_id = s.id), 0) AS paid
      FROM credit_card_statements s ${creditCardId ? sql`WHERE s.credit_card_id = ${creditCardId}` : sql``}
    ) UPDATE credit_card_statements s SET
      status = CASE WHEN b.total - b.paid <= 0 THEN 'paid' WHEN b.due_at < now() THEN 'overdue'
        WHEN b.paid > 0 THEN 'partial' ELSE 'pending' END,
      paid_at = CASE WHEN b.total - b.paid <= 0 THEN coalesce(s.paid_at, now()) ELSE NULL END,
      updated_at = now()
    FROM balances b WHERE s.id = b.id
  `);
}

function creditCardRecordGuard(db: Db, creditCardId: string, input: NewCreditCardRecord, recordId?: string) {
  // A division by zero aborts the entire Neon batch, including any bank refund.
  // Keep comparisons in PostgreSQL numeric and exclude the edited refund itself.
  return db.execute(sql`
    SELECT 1 / CASE WHEN (
      ${input.kind} = 'purchase' AND ${input.originalRecordId ?? null}::uuid IS NULL
      AND round(${decimal(input.amountInLimitCurrency)}::numeric, 2) = round(${decimal(input.amount)}::numeric * ${decimal(input.exchangeRateToLimitCurrency)}::numeric, 2)
      AND NOT EXISTS (SELECT 1 FROM credit_card_records r WHERE r.original_record_id = ${recordId ?? null}::uuid AND r.deleted_at IS NULL
        AND (r.currency <> ${input.currency} OR r.exchange_rate_to_limit_currency <> ${decimal(input.exchangeRateToLimitCurrency)}::numeric))
      AND round(${decimal(input.amountInLimitCurrency)}::numeric, 2) >= coalesce((SELECT sum(r.amount_in_limit_currency) FROM credit_card_records r
        WHERE r.original_record_id = ${recordId ?? null}::uuid AND r.deleted_at IS NULL AND r.kind = 'refund'), 0)
    ) OR (
      ${input.kind} = 'refund' AND EXISTS (
        SELECT 1 FROM credit_card_records p WHERE p.id = ${input.originalRecordId ?? null}::uuid
          AND p.credit_card_id = ${creditCardId}::uuid AND p.kind = 'purchase' AND p.deleted_at IS NULL
          AND p.currency = ${input.currency}
          AND p.exchange_rate_to_limit_currency = ${decimal(input.exchangeRateToLimitCurrency)}::numeric
          AND round(${decimal(input.amountInLimitCurrency)}::numeric, 2) = round(${decimal(input.amount)}::numeric * p.exchange_rate_to_limit_currency, 2)
          AND ${decimal(input.amount)}::numeric <= p.amount - coalesce((SELECT sum(r.amount) FROM credit_card_records r
            WHERE r.original_record_id = p.id AND r.kind = 'refund' AND r.deleted_at IS NULL AND r.id <> coalesce(${recordId ?? null}::uuid, '00000000-0000-0000-0000-000000000000'::uuid)), 0)
          AND round(${decimal(input.amountInLimitCurrency)}::numeric, 2) <= p.amount_in_limit_currency - coalesce((SELECT sum(r.amount_in_limit_currency) FROM credit_card_records r
            WHERE r.original_record_id = p.id AND r.kind = 'refund' AND r.deleted_at IS NULL AND r.id <> coalesce(${recordId ?? null}::uuid, '00000000-0000-0000-0000-000000000000'::uuid)), 0)
      )
    ) THEN 1 ELSE 0 END AS valid
  `);
}

// Bank impact at creation is an unpaid reservation. Refund only that remaining
// reservation; settled money stays on the card and can fund another purchase.
// The last refund returns the remainder so proportional rounding loses no cent.
function creditCardBankRefundAmount(originalId: string, amountInLimitCurrency: number, editedRefundId?: string) {
  return sql`coalesce((
    SELECT CASE WHEN round(${decimal(amountInLimitCurrency)}::numeric, 2) >= b.unpaid_limit THEN b.unpaid_bank
      ELSE least(b.unpaid_bank, round(p.account_amount * round(${decimal(amountInLimitCurrency)}::numeric, 2)
        / nullif(p.amount_in_limit_currency, 0), 2)) END
    FROM credit_card_records p
    CROSS JOIN LATERAL (
      SELECT coalesce((SELECT sum(a.amount_in_limit_currency) FROM credit_card_payment_allocations a WHERE a.credit_card_record_id = p.id), 0) AS paid,
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

function cardMutationError(error: unknown): never {
  const failure = error as { code?: string; cause?: { code?: string } };
  if (failure.code === "22012" || failure.cause?.code === "22012") {
    throw validationError("Refund exceeds its purchase or movement currency/conversion is invalid");
  }
  throw error;
}

async function creditCardCycleQueries(db: Db, creditCardId: string, recordId: string, occurredAt: string) {
  const [card] = await db.select().from(creditCards).where(eq(creditCards.id, creditCardId));
  if (!card) throw validationError("Card not found");
  const cycle = cardCycle(mapCreditCard(card), new Date(occurredAt));
  const sameMovement = and(eq(creditCardRecords.id, recordId), eq(creditCardRecords.occurredAt, new Date(occurredAt)), isNull(creditCardRecords.deletedAt));
  if (cycle.cycleEnd > new Date()) return [db.update(creditCardRecords).set({ statementId: null }).where(sameMovement)];
  return [
    db.insert(creditCardStatements).values({ creditCardId, ...cycle, closedAt: cycle.cycleEnd }).onConflictDoNothing(),
    db.update(creditCardRecords).set({ statementId: sql`(SELECT id FROM credit_card_statements WHERE credit_card_id = ${creditCardId} AND cycle_start = ${cycle.cycleStart.toISOString()}::timestamptz AND cycle_end = ${cycle.cycleEnd.toISOString()}::timestamptz)` }).where(sameMovement),
  ];
}

function dayInMonth(year: number, month: number, day: number) {
  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(day, new Date(Date.UTC(year, month + 1, 0)).getUTCDate()),
      23,
      59,
      59,
      999,
    ),
  );
}

function cardCycle(card: CreditCard, occurredAt: Date) {
  const year = occurredAt.getUTCFullYear();
  const month = occurredAt.getUTCMonth();
  let cycleEnd = dayInMonth(year, month, card.closingDay);
  if (occurredAt > cycleEnd)
    cycleEnd = dayInMonth(year, month + 1, card.closingDay);
  const previousEnd = dayInMonth(
    cycleEnd.getUTCFullYear(),
    cycleEnd.getUTCMonth() - 1,
    card.closingDay,
  );
  const cycleStart = new Date(previousEnd.getTime() + 1);
  const dueMonth =
    card.dueDay > card.closingDay
      ? cycleEnd.getUTCMonth()
      : cycleEnd.getUTCMonth() + 1;
  const dueAt = dayInMonth(cycleEnd.getUTCFullYear(), dueMonth, card.dueDay);
  return { cycleStart, cycleEnd, dueAt };
}

export async function ensureCreditCardStatements(db: Db = createDb()) {
  const [cardRows, movementRows] = await db.batch([
    db.select().from(creditCards),
    db
      .select()
      .from(creditCardRecords)
      .where(
        and(
          isNull(creditCardRecords.deletedAt),
          isNull(creditCardRecords.statementId),
        ),
      ),
  ]);
  for (const movement of movementRows) {
    const card = cardRows.find(card => card.id === movement.creditCardId);
    if (!card || cardCycle(mapCreditCard(card), movement.occurredAt).cycleEnd > new Date()) continue;
    const queries = await creditCardCycleQueries(db, movement.creditCardId, movement.id, movement.occurredAt.toISOString());
    await db.batch([lockCreditCard(db, movement.creditCardId), ...queries, refreshCreditCardStatements(db, movement.creditCardId)]);
  }
  // Status is derived from current balances, including retroactive wallet activity.
  // Serialize this refresh with every card payment and refund.
  for (const card of cardRows) await db.batch([
    lockCreditCard(db, card.id), refreshCreditCardStatements(db, card.id),
  ]);
}

export async function listCreditCardRecords(
  creditCardId: string,
  db: Db = createDb(),
) {
  const rows = await db
    .select()
    .from(creditCardRecords)
    .where(
      and(
        eq(creditCardRecords.creditCardId, creditCardId),
        isNull(creditCardRecords.deletedAt),
      ),
    )
    .orderBy(desc(creditCardRecords.occurredAt));
  return rows.map(mapCreditCardRecord);
}

export async function createCreditCardRecord(
  creditCardId: string,
  input: NewCreditCardRecord,
  db: Db = createDb(),
) {
  let walletRecordId: string | null = null;
  let walletRefundValues: typeof records.$inferInsert | undefined;
  let walletRefundAmount: ReturnType<typeof sql> | undefined;
  let originalMovement: typeof creditCardRecords.$inferSelect | undefined;
  let refundBankRateMissing = false;
  if (input.kind === "refund" && input.originalRecordId) {
    const [[original], previousRefunds] = await db.batch([
      db
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
        .limit(1),
      db
        .select({ amount: creditCardRecords.amountInLimitCurrency })
        .from(creditCardRecords)
        .where(and(
          eq(creditCardRecords.originalRecordId, input.originalRecordId),
          eq(creditCardRecords.kind, "refund"),
          isNull(creditCardRecords.deletedAt),
        )),
    ]);
    if (!original) throw validationError("Original movement not found");
    originalMovement = original;
    walletRefundAmount = creditCardBankRefundAmount(original.id, input.amountInLimitCurrency);
    const alreadyRefunded = previousRefunds.reduce((sum, refund) => sum + asNumber(refund.amount), 0);
    if (
      input.amountInLimitCurrency >
      asNumber(original.amountInLimitCurrency) - alreadyRefunded + 0.005
    ) {
      throw validationError("Refund exceeds original movement");
    }
    if (original.walletRecordId && original.accountId) {
      const [account] = await db
        .select()
        .from(accounts)
        .where(eq(accounts.id, original.accountId))
        .limit(1);
      if (!account || original.accountAmount === null) throw validationError("Original account amount is required for a bank refund");
      const [[walletOriginal], [walletSettings], rateRows] = await db.batch([
        db.select().from(records).where(eq(records.id, original.walletRecordId)).limit(1),
        db.select().from(settings).limit(1),
        db.select().from(exchangeRates).orderBy(desc(exchangeRates.date)),
      ]);
      const primaryCurrency = (walletSettings?.primaryCurrency ?? "UYU") as WalletSettings["primaryCurrency"];
      const refundCurrency = account.currency as CreditCardRecord["currency"];
      const primaryRate = refundCurrency === primaryCurrency ? 1
        : walletOriginal?.currency === refundCurrency ? asNumber(walletOriginal.exchangeRateToPrimary)
        : findExchangeRate(rateRows.map(mapExchangeRate), refundCurrency, primaryCurrency, input.occurredAt);
      refundBankRateMissing = primaryRate === null;
      walletRecordId = randomUUID();
      walletRefundValues = {
        id: walletRecordId,
        type: "income",
        amount: decimal(input.accountAmount ?? input.amount),
        currency: account?.currency ?? input.currency,
        accountId: original.accountId,
        creditCardId,
        categoryId: input.categoryId,
        counterpartyName: input.counterpartyName ?? null,
        paymentType: "credit",
        paymentStatus: "cleared",
        exchangeRateToPrimary: decimal(primaryRate ?? 0),
        amountInLimitCurrency: decimal(input.amountInLimitCurrency),
        exchangeRateToLimitCurrency: decimal(input.exchangeRateToLimitCurrency),
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
    amount: decimal(input.amount),
    currency: input.currency,
    amountInLimitCurrency: decimal(input.amountInLimitCurrency),
    exchangeRateToLimitCurrency: decimal(input.exchangeRateToLimitCurrency),
    categoryId: input.categoryId,
    counterpartyName: input.counterpartyName ?? null,
    note: input.note ?? null,
    accountId: input.accountId ?? null,
    accountAmount:
      input.accountAmount === undefined ? null : decimal(input.accountAmount),
    accountImpactAtCreation: input.accountImpactAtCreation,
    occurredAt: new Date(input.occurredAt),
  };
  const cycleQueries = await creditCardCycleQueries(db, creditCardId, movementValues.id, input.occurredAt);
  const walletRefundInsert = walletRefundValues ? db.execute(sql`
    INSERT INTO records (id, type, amount, currency, account_id, credit_card_id, category_id, counterparty_name,
      payment_type, payment_status, exchange_rate_to_primary, amount_in_limit_currency, exchange_rate_to_limit_currency, occurred_at, note)
    SELECT ${walletRefundValues.id}::uuid, 'income', ${walletRefundAmount!}, ${walletRefundValues.currency},
      ${walletRefundValues.accountId}::uuid, ${creditCardId}::uuid, ${walletRefundValues.categoryId}::uuid, ${walletRefundValues.counterpartyName},
      'credit', 'cleared', ${walletRefundValues.exchangeRateToPrimary}::numeric,
      ${walletRefundValues.amountInLimitCurrency}::numeric, ${walletRefundValues.exchangeRateToLimitCurrency}::numeric,
      ${input.occurredAt}::timestamptz, ${walletRefundValues.note}
    WHERE ${walletRefundAmount!} > 0
  `) : undefined;
  const authoritativeRefund = originalMovement && walletRefundAmount ? {
    walletRecordId: walletRecordId ? sql`CASE WHEN ${walletRefundAmount} > 0 THEN ${walletRecordId}::uuid ELSE NULL END` : null,
    accountId: sql`CASE WHEN ${walletRefundAmount} > 0 THEN ${originalMovement.accountId}::uuid ELSE NULL END`,
    accountAmount: sql`CASE WHEN ${walletRefundAmount} > 0 THEN ${walletRefundAmount} ELSE NULL END`,
    accountImpactAtCreation: sql`${walletRefundAmount} > 0`,
  } : {};
  try {
    await db.batch([
      lockCreditCard(db, creditCardId),
      creditCardRecordGuard(db, creditCardId, input),
      // Bank and FX metadata was read before entering the batch. Reject a stale
      // source rather than crediting the previously observed bank account.
      ...(originalMovement ? [db.execute(sql`SELECT 1 / CASE WHEN EXISTS (
        SELECT 1 FROM credit_card_records p WHERE p.id = ${originalMovement.id}::uuid
          AND p.account_id IS NOT DISTINCT FROM ${originalMovement.accountId}::uuid
          AND p.account_amount IS NOT DISTINCT FROM ${originalMovement.accountAmount}::numeric
          AND p.account_impact_at_creation = ${originalMovement.accountImpactAtCreation}
          AND p.wallet_record_id IS NOT DISTINCT FROM ${originalMovement.walletRecordId}::uuid
      ) THEN 1 ELSE 0 END AS valid`)] : []),
      ...(refundBankRateMissing ? [db.execute(sql`SELECT 1 / CASE WHEN ${walletRefundAmount!} <= 0 THEN 1 ELSE 0 END AS valid`)] : []),
      ...(walletRefundInsert ? [walletRefundInsert] : []),
      db.insert(creditCardRecords).values({ ...movementValues, ...authoritativeRefund }),
      ...cycleQueries,
      refreshCreditCardStatements(db, creditCardId),
    ]);
  } catch (error) {
    const failure = error as { code?: string; cause?: { code?: string } };
    if (refundBankRateMissing && (failure.code === "22012" || failure.cause?.code === "22012")) throw validationError("Exchange rate is required for the bank refund");
    cardMutationError(error);
  }
  const [row] = await db.select().from(creditCardRecords).where(eq(creditCardRecords.id, movementValues.id));
  return mapCreditCardRecord(row);
}

export async function updateCreditCardRecord(
  creditCardId: string,
  id: string,
  input: CreditCardRecordPatch,
  db: Db = createDb(),
) {
  const [current] = await db.select().from(creditCardRecords).where(and(
    eq(creditCardRecords.id, id),
    eq(creditCardRecords.creditCardId, creditCardId),
    isNull(creditCardRecords.walletRecordId), isNull(creditCardRecords.deletedAt),
  )).limit(1);
  if (!current) return null;
  const mapped = mapCreditCardRecord(current);
  const merged = creditCardRecordSchema.parse({
    ...mapped,
    ...input,
    originalRecordId: input.originalRecordId === null ? undefined : (input.originalRecordId ?? mapped.originalRecordId),
    counterpartyName: input.counterpartyName === null ? undefined : (input.counterpartyName ?? mapped.counterpartyName),
    note: input.note === null ? undefined : (input.note ?? mapped.note),
    accountId: input.accountId === null ? undefined : (input.accountId ?? mapped.accountId),
    accountAmount: input.accountAmount === null ? undefined : (input.accountAmount ?? mapped.accountAmount),
  });
  const values: Partial<typeof creditCardRecords.$inferInsert> = { updatedAt: new Date() };
  if (hasOwn(input, "originalRecordId")) values.originalRecordId = merged.originalRecordId ?? null;
  if (hasOwn(input, "kind")) values.kind = merged.kind;
  if (hasOwn(input, "amount")) values.amount = decimal(merged.amount);
  if (hasOwn(input, "currency")) values.currency = merged.currency;
  if (hasOwn(input, "amountInLimitCurrency")) values.amountInLimitCurrency = decimal(merged.amountInLimitCurrency);
  if (hasOwn(input, "exchangeRateToLimitCurrency")) values.exchangeRateToLimitCurrency = decimal(merged.exchangeRateToLimitCurrency);
  if (hasOwn(input, "categoryId")) values.categoryId = merged.categoryId;
  if (hasOwn(input, "counterpartyName")) values.counterpartyName = merged.counterpartyName ?? null;
  if (hasOwn(input, "note")) values.note = merged.note ?? null;
  if (hasOwn(input, "accountId")) values.accountId = merged.accountId ?? null;
  if (hasOwn(input, "accountAmount")) values.accountAmount = merged.accountAmount === undefined ? null : decimal(merged.accountAmount);
  if (hasOwn(input, "accountImpactAtCreation")) values.accountImpactAtCreation = merged.accountImpactAtCreation;
  if (hasOwn(input, "occurredAt")) values.occurredAt = new Date(merged.occurredAt);
  if (merged.kind !== mapped.kind) throw validationError("Movement kind cannot be changed");
  const cycleQueries = await creditCardCycleQueries(db, creditCardId, id, merged.occurredAt);
  const refundBankAmount = merged.kind === "refund" && merged.originalRecordId
    ? creditCardBankRefundAmount(merged.originalRecordId, merged.amountInLimitCurrency, id) : undefined;
  const authoritativeRefund = refundBankAmount ? {
    accountId: sql`CASE WHEN ${refundBankAmount} > 0 THEN (SELECT account_id FROM credit_card_records WHERE id = ${merged.originalRecordId!}::uuid) ELSE NULL END`,
    accountAmount: sql`CASE WHEN ${refundBankAmount} > 0 THEN ${refundBankAmount} ELSE NULL END`,
    accountImpactAtCreation: sql`${refundBankAmount} > 0`,
  } : {};
  try {
    await db.batch([
      lockCreditCard(db, creditCardId), creditCardRecordGuard(db, creditCardId, merged, id),
      db.update(creditCardRecords).set({ ...values, ...authoritativeRefund }).where(and(eq(creditCardRecords.id, id), eq(creditCardRecords.creditCardId, creditCardId), isNull(creditCardRecords.walletRecordId))),
      ...cycleQueries, refreshCreditCardStatements(db, creditCardId),
    ]);
  } catch (error) { cardMutationError(error); }
  const [row] = await db.select().from(creditCardRecords).where(eq(creditCardRecords.id, id));
  return row ? mapCreditCardRecord(row) : null;
}

export async function deleteCreditCardRecord(
  creditCardId: string,
  id: string,
  db: Db = createDb(),
) {
  try {
    const [, , deleted] = await db.batch([
      lockCreditCard(db, creditCardId),
      db.execute(sql`SELECT 1 / CASE WHEN NOT EXISTS (
        SELECT 1 FROM credit_card_records WHERE original_record_id = ${id}::uuid AND deleted_at IS NULL
      ) AND NOT EXISTS (
        SELECT 1 FROM credit_card_payment_allocations WHERE credit_card_record_id = ${id}::uuid
      ) THEN 1 ELSE 0 END AS valid`),
      db.update(creditCardRecords).set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(creditCardRecords.id, id), eq(creditCardRecords.creditCardId, creditCardId), isNull(creditCardRecords.walletRecordId), isNull(creditCardRecords.deletedAt)))
        .returning({ id: creditCardRecords.id }),
      refreshCreditCardStatements(db, creditCardId),
    ]);
    return deleted.length > 0;
  } catch (error) {
    const failure = error as { code?: string; cause?: { code?: string } };
    if (failure.code === "22012" || failure.cause?.code === "22012") throw conflictError("Movement has linked refunds or payments");
    throw error;
  }
}

export async function listCreditCardStatements(
  creditCardId: string,
  db: Db = createDb(),
) {
  await ensureCreditCardStatements(db);
  const rows = await db
    .select()
    .from(creditCardStatements)
    .where(eq(creditCardStatements.creditCardId, creditCardId))
    .orderBy(desc(creditCardStatements.cycleEnd));
  return rows.map(mapCreditCardStatement);
}

export async function payCreditCardStatement(
  creditCardId: string,
  statementId: string,
  input: NewCreditCardPayment,
  db: Db = createDb(),
) {
  const paymentId = randomUUID();
  const idempotencyKey = input.idempotencyKey ?? randomUUID();
  const requestHash = createHash("sha256").update(JSON.stringify({
    creditCardId, statementId, amount: input.amount, currency: input.currency,
    amountInLimitCurrency: input.amountInLimitCurrency, accountId: input.accountId ?? null,
    accountAmount: input.accountAmount ?? null, occurredAt: input.occurredAt, note: input.note ?? null,
  })).digest("hex");
  // The first query acquires the card lock. The following query gets a fresh
  // READ COMMITTED snapshot after any concurrent payment has committed.
  let result;
  try {
    const batch = await db.batch([
      lockCreditCard(db, creditCardId),
      db.execute(sql`SELECT 1 / CASE WHEN NOT EXISTS (
        SELECT 1 FROM credit_card_payments WHERE idempotency_key = ${idempotencyKey} AND request_hash IS DISTINCT FROM ${requestHash}
      ) THEN 1 ELSE 0 END AS valid`),
      db.execute(sql`
      WITH net_purchases AS (
        SELECT p.*, greatest(0, p.amount_in_limit_currency - coalesce((
          SELECT sum(r.amount_in_limit_currency) FROM credit_card_records r
          WHERE r.original_record_id = p.id AND r.kind = 'refund' AND r.deleted_at IS NULL
        ), 0)) AS net
        FROM credit_card_records p
        WHERE p.credit_card_id = ${creditCardId} AND p.statement_id = ${statementId}
          AND p.kind = 'purchase' AND p.deleted_at IS NULL
      ), totals AS (
        SELECT coalesce((SELECT sum(net) FROM net_purchases), 0) AS total,
          coalesce((SELECT sum(amount_in_limit_currency) FROM credit_card_payments
            WHERE credit_card_id = ${creditCardId} AND statement_id = ${statementId}), 0) AS paid
      ), ordered AS (
        SELECT p.*, coalesce(sum(net) OVER (ORDER BY occurred_at, id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS prior
        FROM net_purchases p
      ), drafts AS (
        SELECT p.*, least(net, greatest(0, t.paid + round(${decimal(input.amountInLimitCurrency)}::numeric, 2) - prior))
          - least(net, greatest(0, t.paid - prior)) AS allocated
        FROM ordered p CROSS JOIN totals t
      ), payment AS (
        INSERT INTO credit_card_payments
          (id, credit_card_id, statement_id, amount, currency, amount_in_limit_currency, account_id, account_amount, occurred_at, note, idempotency_key, request_hash)
        SELECT ${paymentId}::uuid, ${creditCardId}::uuid, s.id,
          ${decimal(input.amount)}::numeric, ${input.currency}, round(${decimal(input.amountInLimitCurrency)}::numeric, 2),
          CASE WHEN ${input.accountId ?? null}::uuid IS NOT NULL AND coalesce((SELECT sum(allocated) FROM drafts WHERE NOT account_impact_at_creation), 0) > 0
            THEN ${input.accountId ?? null}::uuid END,
          CASE WHEN ${input.accountId ?? null}::uuid IS NOT NULL AND coalesce((SELECT sum(allocated) FROM drafts WHERE NOT account_impact_at_creation), 0) > 0
            THEN ${input.accountAmount === undefined ? null : decimal(input.accountAmount)}::numeric
              * (SELECT sum(allocated) FROM drafts WHERE NOT account_impact_at_creation)
              / round(${decimal(input.amountInLimitCurrency)}::numeric, 2) END,
          ${input.occurredAt}::timestamptz, ${input.note ?? null}, ${idempotencyKey}, ${requestHash}
        FROM credit_card_statements s CROSS JOIN totals t
        WHERE s.id = ${statementId}::uuid AND s.credit_card_id = ${creditCardId}::uuid
          AND round(${decimal(input.amountInLimitCurrency)}::numeric, 2) > 0
          AND round(${decimal(input.amountInLimitCurrency)}::numeric, 2) <= greatest(0, t.total - t.paid)
          AND NOT EXISTS (SELECT 1 FROM credit_card_payments WHERE idempotency_key = ${idempotencyKey})
        RETURNING id, statement_id
      ), allocations AS (
        INSERT INTO credit_card_payment_allocations
          (payment_id, credit_card_record_id, amount, amount_in_limit_currency)
        SELECT payment.id, d.id, d.allocated / d.exchange_rate_to_limit_currency, d.allocated
        FROM drafts d CROSS JOIN payment WHERE d.allocated > 0 RETURNING id
      ), status_update AS (
        UPDATE credit_card_statements s SET
          status = CASE WHEN t.total - t.paid - round(${decimal(input.amountInLimitCurrency)}::numeric, 2) <= 0 THEN 'paid'
            WHEN s.due_at < now() THEN 'overdue' ELSE 'partial' END,
          paid_at = CASE WHEN t.total - t.paid - round(${decimal(input.amountInLimitCurrency)}::numeric, 2) <= 0 THEN ${input.occurredAt}::timestamptz ELSE NULL END,
          updated_at = now()
        FROM totals t, payment WHERE s.id = payment.statement_id RETURNING s.id
      ) SELECT id FROM payment UNION ALL
        SELECT id FROM credit_card_payments WHERE idempotency_key = ${idempotencyKey} AND request_hash = ${requestHash}
    `),
    ]);
    result = batch[2];
  } catch (error) {
    const failure = error as { code?: string; cause?: { code?: string } };
    if (["22012", "23505"].includes(failure.code ?? failure.cause?.code ?? "")) throw conflictError("Payment key was already used with different details");
    throw error;
  }
  if (!result.rows.length) throw validationError("Payment exceeds statement balance or statement not found");
  const [payment] = await db.select().from(creditCardPayments).where(eq(creditCardPayments.id, String(result.rows[0].id)));
  return mapCreditCardPayment(payment);
}

export async function deleteCreditCardPayment(
  creditCardId: string,
  paymentId: string,
  db: Db = createDb(),
) {
  const [payment] = await db
    .select()
    .from(creditCardPayments)
    .where(
      and(
        eq(creditCardPayments.id, paymentId),
        eq(creditCardPayments.creditCardId, creditCardId),
      ),
    )
    .limit(1);
  if (!payment) return false;
  const [, deleted] = await db.batch([
    lockCreditCard(db, creditCardId),
    db.delete(creditCardPayments).where(and(eq(creditCardPayments.id, paymentId), eq(creditCardPayments.creditCardId, creditCardId))).returning({ id: creditCardPayments.id }),
    refreshCreditCardStatements(db, creditCardId),
  ]);
  if (!deleted.length) return false;
  return true;
}

export async function createAccount(input: NewAccount, db: Db = createDb()) {
  const [row] = await db
    .insert(accounts)
    .values({
      ...input,
      initialBalance: decimal(input.initialBalance),
    })
    .returning();
  return mapAccount(row);
}

export async function updateAccount(
  id: string,
  input: AccountPatch,
  db: Db = createDb(),
) {
  const [current] = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
  if (!current) return null;
  const merged = accountSchema.parse({
    ...mapAccount(current),
    ...input,
    note: input.note === null ? undefined : (input.note ?? optional(current.note)),
  });
  const values: Partial<typeof accounts.$inferInsert> = { updatedAt: new Date() };
  for (const key of ["name", "type", "currency", "color", "icon", "isVisible", "isActive"] as const) {
    if (hasOwn(input, key)) values[key] = merged[key] as never;
  }
  if (hasOwn(input, "initialBalance")) values.initialBalance = decimal(merged.initialBalance);
  if (hasOwn(input, "note")) values.note = merged.note ?? null;
  const [row] = await db
    .update(accounts)
    .set(values)
    .where(eq(accounts.id, id))
    .returning();
  return row ? mapAccount(row) : null;
}

export async function deleteAccount(id: string, db: Db = createDb()) {
  const [current] = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
  if (!current) return false;
  if (current.deletedAt) return true;
  const [replacement] = await db.select().from(accounts).where(and(isNull(accounts.deletedAt), ne(accounts.id, id))).orderBy(accounts.createdAt).limit(1);
  const now = new Date();
  await db.batch([
    db.update(accounts).set({ isActive: false, isVisible: false, deletedAt: now, updatedAt: now }).where(eq(accounts.id, id)),
    db.update(recurringDebts).set({ isActive: false, updatedAt: now }).where(eq(recurringDebts.accountId, id)),
    db.update(budgets).set({ isActive: false, updatedAt: now }).where(eq(budgets.accountId, id)),
    db.update(goals).set({ status: "paused", updatedAt: now }).where(and(eq(goals.accountId, id), eq(goals.status, "active"))),
    db.update(settings).set({ primaryAccountId: replacement?.id ?? null, updatedAt: now }).where(eq(settings.primaryAccountId, id)),
    db.update(settings).set({ defaultAccountId: replacement?.id ?? null, updatedAt: now }).where(eq(settings.defaultAccountId, id)),
  ]);
  return true;
}

export async function listCategories(db: Db = createDb()) {
  const rows = await db.select().from(categories).where(isNull(categories.deletedAt));
  return rows.map(mapCategory);
}

export async function createCategory(input: NewCategory, db: Db = createDb()) {
  const [row] = await db
    .insert(categories)
    .values({
      ...input,
      parentId: input.parentId ?? null,
    })
    .returning();
  return mapCategory(row);
}

export async function updateCategory(
  id: string,
  input: CategoryPatch,
  db: Db = createDb(),
) {
  const [current] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  if (!current) return null;
  if (input.parentId === id) throw validationError("A category cannot be its own parent");
  if (current.systemKey && hasOwn(input, "parentId") && (input.parentId ?? null) !== current.parentId) {
    throw conflictError("System categories cannot be moved");
  }
  if (input.parentId) {
    const [parent] = await db.select({ id: categories.id }).from(categories).where(and(
      eq(categories.id, input.parentId),
      isNull(categories.deletedAt),
    )).limit(1);
    if (!parent) throw validationError("Parent category does not exist");
    const descendants = await categoryTreeIds(id, db);
    if (descendants.includes(input.parentId)) {
      throw validationError("A category cannot be moved below one of its descendants");
    }
  }
  const merged = categorySchema.parse({
    ...mapCategory(current),
    ...input,
    parentId: input.parentId === null ? undefined : (input.parentId ?? optional(current.parentId)),
  });
  const values: Partial<typeof categories.$inferInsert> = { updatedAt: new Date() };
  for (const key of ["name", "color", "icon"] as const) {
    if (hasOwn(input, key)) values[key] = merged[key];
  }
  if (hasOwn(input, "parentId")) values.parentId = merged.parentId ?? null;
  const [row] = await db
    .update(categories)
    .set(values)
    .where(eq(categories.id, id))
    .returning();
  return row ? mapCategory(row) : null;
}

async function categoryTreeIds(id: string, db: Db) {
  const rows = await db.select().from(categories).where(isNull(categories.deletedAt));
  if (!rows.some((row) => row.id === id)) return [];
  const ids = new Set([id]);
  let didAdd = true;

  while (didAdd) {
    didAdd = false;
    rows.forEach((row) => {
      if (row.parentId && ids.has(row.parentId) && !ids.has(row.id)) {
        ids.add(row.id);
        didAdd = true;
      }
    });
  }

  return [...ids];
}

export async function deleteCategory(id: string, db: Db = createDb()) {
  const ids = await categoryTreeIds(id, db);
  if (ids.length === 0) return { deleted: false as const, reason: "not_found" as const };
  const protectedRows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(inArray(categories.id, ids), isNotNull(categories.systemKey)));
  if (protectedRows.length > 0) return { deleted: false as const, reason: "protected" as const };
  const [fallback] = await db.select().from(categories).where(and(
    eq(categories.systemKey, "category_eliminated"),
    isNull(categories.deletedAt),
  )).limit(1);
  if (!fallback) throw new Error("Category eliminated fallback is not configured");
  const now = new Date();
  const results = await db.batch([
    db.update(records).set({ categoryId: fallback.id, updatedAt: now }).where(inArray(records.categoryId, ids)).returning({ id: records.id }),
    db.update(creditCardRecords).set({ categoryId: fallback.id, updatedAt: now }).where(inArray(creditCardRecords.categoryId, ids)).returning({ id: creditCardRecords.id }),
    db.update(budgets).set({ categoryId: fallback.id, updatedAt: now }).where(inArray(budgets.categoryId, ids)).returning({ id: budgets.id }),
    db.update(debts).set({ categoryId: fallback.id }).where(inArray(debts.categoryId, ids)).returning({ id: debts.id }),
    db.update(recurringDebts).set({ categoryId: fallback.id, updatedAt: now }).where(inArray(recurringDebts.categoryId, ids)).returning({ id: recurringDebts.id }),
    db.update(installmentPlans).set({ categoryId: fallback.id }).where(inArray(installmentPlans.categoryId, ids)).returning({ id: installmentPlans.id }),
    db.update(merchants).set({ categoryId: fallback.id, updatedAt: now }).where(inArray(merchants.categoryId, ids)).returning({ id: merchants.id }),
    db.update(categories).set({ deletedAt: now, updatedAt: now }).where(inArray(categories.id, ids)).returning({ id: categories.id }),
  ]);
  return {
    deleted: true as const,
    fallbackCategoryId: fallback.id,
    archivedCategoryIds: ids,
    reassigned: {
      records: results[0].length,
      creditCardRecords: results[1].length,
      budgets: results[2].length,
      debts: results[3].length,
      recurringDebts: results[4].length,
      installmentPlans: results[5].length,
      merchants: results[6].length,
    },
  };
}

export async function listTags(db: Db = createDb()) {
  const rows = await db.select().from(tags);
  return rows.map(mapTag);
}

export async function createTag(input: NewTag, db: Db = createDb()) {
  const [row] = await db.insert(tags).values(input).returning();
  return mapTag(row);
}

export async function updateTag(
  id: string,
  input: TagPatch,
  db: Db = createDb(),
) {
  const [current] = await db.select().from(tags).where(eq(tags.id, id)).limit(1);
  if (!current) return null;
  const merged = tagSchema.parse({ ...mapTag(current), ...input });
  const values: Partial<typeof tags.$inferInsert> = { updatedAt: new Date() };
  if (hasOwn(input, "name")) values.name = merged.name;
  if (hasOwn(input, "color")) values.color = merged.color;
  if (hasOwn(input, "isActive")) values.isActive = merged.isActive;
  const [row] = await db
    .update(tags)
    .set(values)
    .where(eq(tags.id, id))
    .returning();
  return row ? mapTag(row) : null;
}

export async function deleteTag(id: string, db: Db = createDb()) {
  const results = await db.batch([
    db.delete(recordTags).where(eq(recordTags.tagId, id)),
    db.delete(goalTags).where(eq(goalTags.tagId, id)),
    db.update(budgets).set({ tagId: null, updatedAt: new Date() }).where(eq(budgets.tagId, id)),
    db.delete(tags).where(eq(tags.id, id)).returning(),
  ]);
  const rows = results[3];
  return rows.length > 0;
}

export async function listRecords(
  filters: {
    type?: string;
    accountId?: string;
    creditCardId?: string;
    categoryId?: string;
    tagId?: string;
    goalId?: string;
    search?: string;
    paymentStatus?: string;
    from?: string;
    to?: string;
    limit?: number;
    cursor?: string;
  } = {},
  db: Db = createDb(),
) {
  const clauses = [isNull(records.deletedAt)];
  if (filters.type && filters.type !== "all") {
    clauses.push(eq(records.type, filters.type as WalletRecord["type"]));
  }
  if (filters.accountId) clauses.push(eq(records.accountId, filters.accountId));
  if (filters.creditCardId)
    clauses.push(eq(records.creditCardId, filters.creditCardId));
  if (filters.categoryId)
    clauses.push(eq(records.categoryId, filters.categoryId));
  if (filters.tagId) clauses.push(inArray(records.id, db.select({ id: recordTags.recordId }).from(recordTags).where(eq(recordTags.tagId, filters.tagId))));
  if (filters.goalId) clauses.push(inArray(records.id, db.select({ id: recordGoals.recordId }).from(recordGoals).where(eq(recordGoals.goalId, filters.goalId))));
  if (filters.paymentStatus && filters.paymentStatus !== "all") clauses.push(eq(records.paymentStatus, filters.paymentStatus as WalletRecord["paymentStatus"]));
  if (filters.search) {
    const pattern = `%${filters.search.replace(/[%_]/g, "\\$&")}%`;
    clauses.push(or(ilike(records.counterpartyName, pattern), ilike(records.note, pattern))!);
  }
  if (filters.from) clauses.push(gte(records.occurredAt, new Date(`${filters.from}T00:00:00.000Z`)));
  if (filters.to) {
    const exclusiveEnd = new Date(`${filters.to}T00:00:00.000Z`);
    exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
    clauses.push(lt(records.occurredAt, exclusiveEnd));
  }
  if (filters.cursor) {
    const cursor = decodeRecordCursor(filters.cursor);
    const occurredAt = new Date(cursor.occurredAt);
    clauses.push(or(
      lt(records.occurredAt, occurredAt),
      and(eq(records.occurredAt, occurredAt), lt(records.id, cursor.id)),
    )!);
  }

  const limit = filters.limit ?? 100;
  const rows = await db
    .select()
    .from(records)
    .where(and(...clauses))
    .orderBy(desc(records.occurredAt), desc(records.id))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const recordTagRows = pageRows.length > 0
    ? await db.select().from(recordTags).where(inArray(recordTags.recordId, pageRows.map((row) => row.id)))
    : [];
  const recordGoalRows = pageRows.length > 0
    ? await db.select().from(recordGoals).where(inArray(recordGoals.recordId, pageRows.map((row) => row.id)))
    : [];
  const tagIdsByRecord = groupIds(recordTagRows, "recordId", "tagId");
  const goalAssociationsByRecord = groupGoalAssociations(recordGoalRows);
  const last = pageRows.length ? pageRows[pageRows.length - 1] : undefined;

  return {
    items: pageRows.map((record) => mapRecord(record, tagIdsByRecord, goalAssociationsByRecord)),
    hasMore,
    nextCursor: hasMore && last
      ? encodeRecordCursor({ occurredAt: last.occurredAt.toISOString(), id: last.id })
      : null,
  };
}

function requestedGoalAssociations(input: NewRecord): RecordGoalAssociation[] {
  const explicit = input.goalAssociations ?? [];
  if (explicit.length) return explicit;
  return (input.goalIds ?? []).map((goalId) => ({
    goalId,
    assignmentSource: "manual" as const,
    useReserved: true,
    reserveIncome: true,
  }));
}

function recordGoalValues(recordId: string, associations: RecordGoalAssociation[]) {
  return associations.map((association) => ({
    recordId,
    goalId: association.goalId,
    assignmentSource: association.assignmentSource,
    useReserved: association.useReserved,
    reserveIncome: association.reserveIncome,
    allocatedAmount: association.allocatedAmount === undefined
      ? null
      : decimal(association.allocatedAmount),
  }));
}

async function resolveGoalAssociations(input: NewRecord, db: Db, preservedGoalIds = new Set<string>(), captureAutomatic = true) {
  const associations = new Map(
    requestedGoalAssociations(input).map((association) => [association.goalId, association]),
  );
  for (const association of associations.values()) {
    if (association.allocatedAmount !== undefined && association.allocatedAmount > input.amount) {
      throw validationError("Goal allocation cannot exceed the record amount");
    }
  }
  if (associations.size) {
    const selectedGoals = await db.select().from(goals).where(inArray(goals.id, [...associations.keys()]));
    if (selectedGoals.length !== associations.size || selectedGoals.some((goal) => !preservedGoalIds.has(goal.id) && (goal.deletedAt || goal.status !== "active"))) {
      throw validationError("New records can only be associated with active goals");
    }
  }
  if (captureAutomatic && input.type === "expense") {
    const date = input.occurredAt.slice(0, 10);
    const automaticGoals = await db.select().from(goals).where(and(
      isNull(goals.deletedAt),
      eq(goals.status, "active"),
      eq(goals.autoCaptureEnabled, true),
      sql`${goals.autoCaptureStart} <= ${date}`,
      sql`${goals.autoCaptureEnd} >= ${date}`,
    ));
    for (const goal of automaticGoals) {
      if (!associations.has(goal.id)) associations.set(goal.id, {
        goalId: goal.id,
        assignmentSource: "date_rule",
        useReserved: true,
        reserveIncome: true,
      });
    }
  }
  return [...associations.values()];
}

async function buildRecordReservationMovements(
  recordId: string,
  input: NewRecord,
  associations: RecordGoalAssociation[],
  db: Db,
) {
  if (!isFinancialRecord(input) || input.type === "transfer" || associations.length === 0) return [];
  const goalRows = await db.select().from(goals).where(inArray(goals.id, associations.map((item) => item.goalId)));
  const accountRows = await db.select().from(accounts);
  const rateRows = await db.select().from(exchangeRates).where(sql`${exchangeRates.date} <= ${new Date(input.occurredAt).toISOString()}`).orderBy(desc(exchangeRates.date));
  const values: ReservationMovementWrite[] = [];
  for (const association of associations) {
    if ((input.type === "expense" && !association.useReserved) || (input.type === "income" && !association.reserveIncome)) continue;
    const goal = goalRows.find((item) => item.id === association.goalId);
    if (!goal || goal.deletedAt) continue;
    const accountId = input.accountId ?? goal.autoReservationAccountId;
    const account = accountRows.find((item) => item.id === accountId);
    if (!accountId || !account) continue;
    const rate = findExchangeRate(rateRows.map(mapExchangeRate), input.currency, account.currency as Account["currency"], input.occurredAt);
    const fullRecordAmount = input.accountId === accountId && input.accountAmount !== undefined
      ? sql`${decimal(input.accountAmount)}::numeric`
      : rate !== null ? sql`(${decimal(input.amount)}::numeric * ${decimal(rate)}::numeric)` : undefined;
    if (fullRecordAmount === undefined) throw validationError("A dated exchange rate is required for the reservation account currency");
    const recordAmount = association.allocatedAmount === undefined
      ? fullRecordAmount
      : sql`(${fullRecordAmount} * ${decimal(association.allocatedAmount)}::numeric / ${decimal(input.amount)}::numeric)`;
    if (input.type === "expense" && association.useReserved) {
      values.push({ goalId: association.goalId, accountId, type: "consume", amount: recordAmount, currency: account.currency, recordId, idempotencyKey: `${recordId}:${association.goalId}:consume`, note: "Consumo de reserva por Record" });
    }
    if (input.type === "income" && association.reserveIncome) {
      values.push({ goalId: association.goalId, accountId, type: "reserve", amount: recordAmount, currency: account.currency, recordId, idempotencyKey: `${recordId}:${association.goalId}:income-reserve`, note: "Ingreso vuelto a reservar" });
    }
  }
  return values;
}

// Neon HTTP has no interactive transactions. Acquire these locks first in the
// same batch as every ledger change; subsequent statements get a fresh snapshot.
export function goalReservationLockQueries(goalIds: string[], db: Db) {
  return [...new Set(goalIds)].sort().map((id) => db.execute(sql`select id from goals where id = ${id}::uuid for update`));
}

function recordCardLockQueries(cardIds: Array<string | undefined | null>, db: Db) {
  return [...new Set(cardIds.filter((id): id is string => Boolean(id)))].sort().map((id) => db.execute(sql`select id from credit_cards where id = ${id}::uuid for update`));
}

function recordCardDependencyGuard(db: Db, walletRecordId: string) {
  return db.execute(sql`SELECT 1 / CASE WHEN NOT EXISTS (
    SELECT 1 FROM credit_card_records p WHERE p.wallet_record_id = ${walletRecordId}::uuid AND p.kind = 'purchase'
      AND (EXISTS (SELECT 1 FROM credit_card_records r WHERE r.original_record_id = p.id AND r.deleted_at IS NULL)
        OR EXISTS (SELECT 1 FROM credit_card_payment_allocations a WHERE a.credit_card_record_id = p.id))
  ) THEN 1 ELSE 0 END AS valid`);
}

// Reads used to prepare a Neon HTTP batch happen before its row locks. Check the
// observed financial state after locking so a concurrent reassignment cannot
// bypass card locks or overwrite a different purchase with an outdated payload.
function recordFinancialSnapshotGuard(
  db: Db,
  observed: typeof records.$inferSelect,
  linked?: typeof creditCardRecords.$inferSelect,
) {
  return db.execute(sql`SELECT 1 / CASE WHEN EXISTS (
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
  ) AND ${linked ? sql`EXISTS (
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
  )` : sql`NOT EXISTS (SELECT 1 FROM credit_card_records p WHERE p.wallet_record_id = ${observed.id}::uuid)`}
  THEN 1 ELSE 0 END AS valid`);
}

function recordCardMutationError(error: unknown): never {
  const failure = error as { code?: string; cause?: { code?: string } };
  if (failure.code === "22012" || failure.cause?.code === "22012") throw conflictError("Record cannot be changed because its financial history would be invalid or changed concurrently");
  throw error;
}

function reservationBalanceSql(goalId: string, accountId: string, currency: string) {
  return sql`coalesce((select sum(case when type in ('reserve', 'restore') then amount else -amount end)
    from goal_reservation_movements where goal_id = ${goalId}::uuid and account_id = ${accountId}::uuid and currency = ${currency}), 0)`;
}

function recordReservationWriteQueries(values: ReservationMovementWrite[], db: Db) {
  return values.map((movement) => {
    const balance = reservationBalanceSql(movement.goalId, movement.accountId, movement.currency);
    const amount = movement.type === "consume"
      ? sql`least(${movement.amount}::numeric, greatest(0, ${balance}))`
      : sql`${movement.amount}::numeric`;
    return db.execute(sql`insert into goal_reservation_movements
      (goal_id, account_id, type, amount, currency, record_id, idempotency_key, note)
      select ${movement.goalId}::uuid, ${movement.accountId}::uuid, ${movement.type}, ${amount},
        ${movement.currency}, ${movement.recordId ?? null}::uuid, ${movement.idempotencyKey ?? null}, ${movement.note ?? null}
      where ${amount} > 0 and exists (select 1 from goals where id = ${movement.goalId}::uuid and deleted_at is null)`);
  });
}

export async function prepareRecordGoalWrites(recordId: string, input: NewRecord, db: Db) {
  const associations = await resolveGoalAssociations(input, db);
  const movements = await buildRecordReservationMovements(recordId, input, associations, db);
  return {
    associations,
    lockQueries: goalReservationLockQueries(associations.map((item) => item.goalId), db),
    queries: [
      ...(associations.length ? [db.insert(recordGoals).values(recordGoalValues(recordId, associations))] : []),
      ...recordReservationWriteQueries(movements, db),
    ],
  };
}

async function buildRecordMovementCompensations(recordId: string, db: Db) {
  const rows = await db.select().from(goalReservationMovements).where(
    eq(goalReservationMovements.recordId, recordId),
  );
  const net = new Map<string, { goalId: string; accountId: string; currency: string }>();
  for (const row of rows) {
    const key = `${row.goalId}:${row.accountId}:${row.currency}`;
    net.set(key, { goalId: row.goalId, accountId: row.accountId, currency: row.currency });
  }
  return {
    goalIds: [...net.values()].map((item) => item.goalId),
    queries: [...net.values()].map((item) => {
      const balance = reservationBalanceSql(item.goalId, item.accountId, item.currency);
      return db.execute(sql`insert into goal_reservation_movements
        (goal_id, account_id, type, amount, currency, record_id, idempotency_key, note)
        select ${item.goalId}::uuid, ${item.accountId}::uuid,
          case when net > 0 then 'release' else 'restore' end,
          case when net > 0 and net > ${balance} then abs(net) / 0::numeric else abs(net) end,
          ${item.currency}, ${recordId}::uuid, ${`${recordId}:reconcile:${randomUUID()}`}, 'Reconciliación de Record'
        from (select coalesce(sum(case when type in ('reserve','restore') then amount else -amount end),0) as net
          from goal_reservation_movements where record_id = ${recordId}::uuid and goal_id = ${item.goalId}::uuid
            and account_id = ${item.accountId}::uuid and currency = ${item.currency}) ledger
        where net <> 0 and exists (select 1 from goals where id = ${item.goalId}::uuid and deleted_at is null)`);
    }),
  };
}

export async function createRecord(input: NewRecord, db: Db = createDb()) {
  if (input.debtId) throw validationError("Debt-linked records must be created through the debt payment action. Restore a complete JSON backup for existing payment history.");
  const recordId = randomUUID();
  const goalWrites = await prepareRecordGoalWrites(recordId, input, db);
  const { associations } = goalWrites;
  const recordValues = {
    id: recordId,
    type: input.type,
    amount: decimal(input.amount),
    currency: input.currency,
    accountId: input.accountId ?? null,
    accountAmount:
      input.accountAmount === undefined ? null : decimal(input.accountAmount),
    creditCardId: input.creditCardId ?? null,
    destinationAccountId: input.destinationAccountId ?? null,
    destinationAmount: input.destinationAmount === undefined ? null : decimal(input.destinationAmount),
    categoryId: input.categoryId ?? null,
    counterpartyName: input.counterpartyName ?? null,
    paymentType: input.paymentType,
    paymentStatus: input.paymentStatus,
    exchangeRateToPrimary: decimal(input.exchangeRateToPrimary),
    amountInLimitCurrency:
      input.amountInLimitCurrency === undefined
        ? null
        : decimal(input.amountInLimitCurrency),
    exchangeRateToLimitCurrency:
      input.exchangeRateToLimitCurrency === undefined
        ? null
        : decimal(input.exchangeRateToLimitCurrency),
    occurredAt: new Date(input.occurredAt),
    note: input.note ?? null,
    isFixed: input.isFixed ?? false,
    debtId: input.debtId ?? null,
  };
  const recordInsert = db.insert(records).values(recordValues).returning();
  const queries: unknown[] = [recordInsert];
  if (input.creditCardId && input.categoryId) queries.push(db.insert(creditCardRecords).values({
    id: randomUUID(), creditCardId: input.creditCardId, walletRecordId: recordId,
    kind: input.type === "income" ? "refund" : "purchase", amount: decimal(input.amount),
    currency: input.currency, amountInLimitCurrency: decimal(input.amountInLimitCurrency ?? input.amount),
    exchangeRateToLimitCurrency: decimal(input.exchangeRateToLimitCurrency ?? 1),
    categoryId: input.categoryId, counterpartyName: input.counterpartyName ?? null,
    note: input.note ?? null, accountId: input.accountId ?? null,
    accountAmount: input.accountId ? decimal(input.accountAmount ?? input.amount) : null,
    accountImpactAtCreation: Boolean(input.accountId), occurredAt: new Date(input.occurredAt),
    deletedAt: input.paymentStatus === "cancelled" || input.paymentStatus === "needs_review" ? new Date() : null,
  }));
  if (input.tagIds.length) queries.push(db.insert(recordTags).values(input.tagIds.map((tagId) => ({ recordId, tagId }))));
  queries.push(...goalWrites.queries);
  const locks = [...recordCardLockQueries([input.creditCardId], db), ...goalWrites.lockQueries];
  const results = await db.batch([...locks, ...queries] as unknown as Parameters<Db["batch"]>[0]);
  const rows = results[locks.length];
  const row = rows[0];
  return mapRecord(row, { [row.id]: input.tagIds }, { [row.id]: associations });
}

export async function createRecordsBulk(inputs: NewRecord[], db: Db = createDb(), importIds?: string[]) {
  if (inputs.some((input) => input.debtId)) throw validationError("Debt-linked records must be created through the debt payment action. Restore a complete JSON backup for existing payment history.");
  const ids = importIds ?? inputs.map(() => randomUUID());
  const associationsByInput = await Promise.all(inputs.map((input) => resolveGoalAssociations(input, db)));
  const queries: unknown[] = [];
  inputs.forEach((input, index) => {
    const id = ids[index];
    queries.push(db.insert(records).values({
      id, type: input.type, amount: decimal(input.amount), currency: input.currency,
      accountId: input.accountId ?? null,
      accountAmount: input.accountAmount === undefined ? null : decimal(input.accountAmount),
      creditCardId: input.creditCardId ?? null, destinationAccountId: input.destinationAccountId ?? null,
      destinationAmount: input.destinationAmount === undefined ? null : decimal(input.destinationAmount),
      categoryId: input.categoryId ?? null, counterpartyName: input.counterpartyName ?? null,
      paymentType: input.paymentType, paymentStatus: input.paymentStatus,
      exchangeRateToPrimary: decimal(input.exchangeRateToPrimary),
      amountInLimitCurrency: input.amountInLimitCurrency === undefined ? null : decimal(input.amountInLimitCurrency),
      exchangeRateToLimitCurrency: input.exchangeRateToLimitCurrency === undefined ? null : decimal(input.exchangeRateToLimitCurrency),
      occurredAt: new Date(input.occurredAt), note: input.note ?? null,
      isFixed: input.isFixed ?? false, debtId: input.debtId ?? null,
    }));
    if (input.creditCardId && input.categoryId) queries.push(db.insert(creditCardRecords).values({
      id: randomUUID(), creditCardId: input.creditCardId, walletRecordId: id,
      kind: input.type === "income" ? "refund" : "purchase", amount: decimal(input.amount), currency: input.currency,
      amountInLimitCurrency: decimal(input.amountInLimitCurrency ?? input.amount),
      exchangeRateToLimitCurrency: decimal(input.exchangeRateToLimitCurrency ?? 1),
      categoryId: input.categoryId, counterpartyName: input.counterpartyName ?? null, note: input.note ?? null,
      accountId: input.accountId ?? null, accountAmount: input.accountId ? decimal(input.accountAmount ?? input.amount) : null,
      accountImpactAtCreation: Boolean(input.accountId), occurredAt: new Date(input.occurredAt),
    deletedAt: input.paymentStatus === "cancelled" || input.paymentStatus === "needs_review" ? new Date() : null,
    }));
    if (input.tagIds.length) queries.push(db.insert(recordTags).values(input.tagIds.map((tagId) => ({ recordId: id, tagId }))));
    const associations = associationsByInput[index];
    if (associations.length) queries.push(db.insert(recordGoals).values(recordGoalValues(id, associations)));
  });
  const movementsByInput = await Promise.all(inputs.map((input, index) => buildRecordReservationMovements(ids[index], input, associationsByInput[index], db)));
  queries.push(...recordReservationWriteQueries(movementsByInput.flat(), db));
  await db.batch([
    ...recordCardLockQueries(inputs.map((input) => input.creditCardId), db),
    ...goalReservationLockQueries(associationsByInput.flat().map((item) => item.goalId), db),
    ...queries,
  ] as unknown as Parameters<Db["batch"]>[0]);
  const [rows, tagRows, goalRows] = await db.batch([
    db.select().from(records).where(inArray(records.id, ids)),
    db.select().from(recordTags).where(inArray(recordTags.recordId, ids)),
    db.select().from(recordGoals).where(inArray(recordGoals.recordId, ids)),
  ]);
  const tagIdsByRecord = groupIds(tagRows, "recordId", "tagId");
  const associationsByRecord = groupGoalAssociations(goalRows);
  const byId = new Map(rows.map((row) => [row.id, mapRecord(row, tagIdsByRecord, associationsByRecord)]));
  return ids.map((id) => byId.get(id)).filter((record): record is WalletRecord => Boolean(record));
}

export async function updateRecord(
  id: string,
  input: RecordPatch,
  db: Db = createDb(),
) {
  const [[linked], [existingRecord], existingTagRows, existingGoalRows] = await Promise.all([
    db
      .select()
      .from(creditCardRecords)
      .where(eq(creditCardRecords.walletRecordId, id))
      .limit(1),
    db.select().from(records).where(eq(records.id, id)).limit(1),
    db.select().from(recordTags).where(eq(recordTags.recordId, id)),
    db.select().from(recordGoals).where(eq(recordGoals.recordId, id)),
  ]);
  if (!existingRecord) return null;
  if (input.debtId !== undefined && (input.debtId ?? null) !== existingRecord.debtId) {
    throw validationError("A record's debt association cannot be added, removed, or changed. Use the debt payment action.");
  }
  const current = mapRecord(
    existingRecord,
    { [id]: existingTagRows.map((item) => item.tagId) },
    { [id]: groupGoalAssociations(existingGoalRows)[id] ?? [] },
  );
  const merged = recordSchema.parse({
    ...current,
    ...input,
    goalAssociations: hasOwn(input, "goalAssociations") ? input.goalAssociations : hasOwn(input, "goalIds") ? [] : current.goalAssociations,
    destinationAccountId: input.destinationAccountId === null ? undefined : (input.destinationAccountId ?? current.destinationAccountId),
    categoryId: input.categoryId === null ? undefined : (input.categoryId ?? current.categoryId),
    counterpartyName: input.counterpartyName === null ? undefined : (input.counterpartyName ?? current.counterpartyName),
    note: input.note === null ? undefined : (input.note ?? current.note),
    debtId: input.debtId === null ? undefined : (input.debtId ?? current.debtId),
  });
  const resolveAsCardOnly = Boolean(
    existingRecord.paymentStatus === "needs_review" &&
    !existingRecord.accountId &&
    merged.creditCardId &&
    !merged.accountId &&
    merged.paymentStatus === "cleared",
  );
  const recordValues: Partial<typeof records.$inferInsert> = { updatedAt: new Date() };
  if (hasOwn(input, "type")) recordValues.type = merged.type;
  if (hasOwn(input, "amount")) recordValues.amount = decimal(merged.amount);
  if (hasOwn(input, "currency")) recordValues.currency = merged.currency;
  if (hasOwn(input, "accountId")) recordValues.accountId = merged.accountId ?? null;
  if (hasOwn(input, "accountAmount")) recordValues.accountAmount = merged.accountAmount === undefined ? null : decimal(merged.accountAmount);
  if (hasOwn(input, "creditCardId")) recordValues.creditCardId = merged.creditCardId ?? null;
  if (hasOwn(input, "destinationAccountId")) recordValues.destinationAccountId = merged.destinationAccountId ?? null;
  if (hasOwn(input, "destinationAmount")) recordValues.destinationAmount = merged.destinationAmount === undefined ? null : decimal(merged.destinationAmount);
  if (hasOwn(input, "categoryId")) recordValues.categoryId = merged.categoryId ?? null;
  if (hasOwn(input, "counterpartyName")) recordValues.counterpartyName = merged.counterpartyName ?? null;
  if (hasOwn(input, "paymentType")) recordValues.paymentType = merged.paymentType;
  if (hasOwn(input, "paymentStatus")) recordValues.paymentStatus = merged.paymentStatus;
  if (hasOwn(input, "exchangeRateToPrimary")) recordValues.exchangeRateToPrimary = decimal(merged.exchangeRateToPrimary);
  if (hasOwn(input, "amountInLimitCurrency")) recordValues.amountInLimitCurrency = merged.amountInLimitCurrency === undefined ? null : decimal(merged.amountInLimitCurrency);
  if (hasOwn(input, "exchangeRateToLimitCurrency")) recordValues.exchangeRateToLimitCurrency = merged.exchangeRateToLimitCurrency === undefined ? null : decimal(merged.exchangeRateToLimitCurrency);
  if (hasOwn(input, "occurredAt")) recordValues.occurredAt = new Date(merged.occurredAt);
  if (hasOwn(input, "note")) recordValues.note = merged.note ?? null;
  if (hasOwn(input, "isFixed")) recordValues.isFixed = merged.isFixed ?? false;
  if (hasOwn(input, "debtId")) recordValues.debtId = merged.debtId ?? null;
  if (resolveAsCardOnly) recordValues.deletedAt = new Date();
  const recordUpdate = db
    .update(records)
    .set(recordValues)
    .where(eq(records.id, id))
    .returning();
  const sideQueries = [];
  if (merged.creditCardId && merged.categoryId) {
    const values = {
      creditCardId: merged.creditCardId,
      walletRecordId: resolveAsCardOnly ? null : id,
      statementId: hasOwn(input, "occurredAt") || hasOwn(input, "creditCardId") ? null : linked?.statementId ?? null,
      kind: merged.type === "income" ? "refund" : "purchase",
      amount: decimal(merged.amount), currency: merged.currency,
      amountInLimitCurrency: decimal(merged.amountInLimitCurrency ?? merged.amount),
      exchangeRateToLimitCurrency: decimal(merged.exchangeRateToLimitCurrency ?? 1),
      categoryId: merged.categoryId, counterpartyName: merged.counterpartyName ?? null,
      note: merged.note ?? null, accountId: merged.accountId ?? null,
      accountAmount: merged.accountId
        ? decimal(merged.accountAmount ?? merged.amount)
        : null,
      accountImpactAtCreation: Boolean(merged.accountId),
      occurredAt: new Date(merged.occurredAt),
      updatedAt: new Date(),
      deletedAt: merged.paymentStatus === "cancelled" || merged.paymentStatus === "needs_review" ? new Date() : null,
    };
    sideQueries.push(linked
      ? db.update(creditCardRecords).set(values).where(eq(creditCardRecords.id, linked.id))
      : db.insert(creditCardRecords).values({ id: randomUUID(), ...values }));
  } else if (linked) {
    sideQueries.push(db.update(creditCardRecords).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(creditCardRecords.id, linked.id)));
  }
  if (hasOwn(input, "tagIds")) {
    sideQueries.push(db.delete(recordTags).where(eq(recordTags.recordId, id)));
    if (merged.tagIds.length) sideQueries.push(db.insert(recordTags).values(merged.tagIds.map((tagId) => ({ recordId: id, tagId }))));
  }
  const currentAssociations = groupGoalAssociations(existingGoalRows)[id] ?? [];
  let requested = hasOwn(input, "goalAssociations")
    ? input.goalAssociations ?? []
    : hasOwn(input, "goalIds")
      ? (input.goalIds ?? []).map((goalId) => ({ goalId, assignmentSource: "manual" as const, useReserved: true, reserveIncome: true }))
      : currentAssociations;
  const refreshDateRules = hasOwn(input, "occurredAt") || hasOwn(input, "type");
  if (refreshDateRules) requested = requested.filter((item) => item.assignmentSource !== "date_rule");
  const existingGoalIds = new Set(existingGoalRows.map((row) => row.goalId));
  const associations = await resolveGoalAssociations({ ...merged, goalIds: [], goalAssociations: requested }, db, existingGoalIds, refreshDateRules);
  if (JSON.stringify(currentAssociations) !== JSON.stringify(associations)) {
    sideQueries.push(db.delete(recordGoals).where(eq(recordGoals.recordId, id)));
    if (associations.length) sideQueries.push(db.insert(recordGoals).values(recordGoalValues(id, associations)));
  }
  const reservationFingerprint = (record: NewRecord, items: RecordGoalAssociation[]) => JSON.stringify({
    type: record.type, amount: record.amount, currency: record.currency,
    accountId: record.accountId, accountAmount: record.accountAmount,
    paymentStatus: record.paymentStatus,
    associations: items.map((item) => ({ goalId: item.goalId, useReserved: item.useReserved, reserveIncome: item.reserveIncome, allocatedAmount: item.allocatedAmount })).sort((a, b) => a.goalId.localeCompare(b.goalId)),
  });
  let compensationGoalIds: string[] = [];
  if (reservationFingerprint(current, currentAssociations) !== reservationFingerprint(merged, associations)) {
    const compensations = await buildRecordMovementCompensations(id, db);
    compensationGoalIds = compensations.goalIds;
    sideQueries.push(...compensations.queries);
    const newMovements = await buildRecordReservationMovements(id, merged, associations, db);
    sideQueries.push(...recordReservationWriteQueries(newMovements.map((movement) => ({ ...movement, idempotencyKey: `${movement.idempotencyKey}:${randomUUID()}` })), db));
  }
  const locks = [
    ...recordCardLockQueries([existingRecord.creditCardId, linked?.creditCardId, merged.creditCardId], db),
    db.execute(sql`select id from records where id = ${id}::uuid for update`),
    ...goalReservationLockQueries([...existingGoalIds, ...associations.map((item) => item.goalId), ...compensationGoalIds], db),
  ];
  const keepsPurchase = Boolean(merged.creditCardId && merged.categoryId && merged.type === "expense"
    && merged.paymentStatus !== "cancelled" && merged.paymentStatus !== "needs_review"
    && (!linked || linked.creditCardId === merged.creditCardId));
  const guards = [
    recordFinancialSnapshotGuard(db, existingRecord, linked),
    ...(!keepsPurchase && linked ? [recordCardDependencyGuard(db, id)] : []),
    ...(keepsPurchase ? [creditCardRecordGuard(db, merged.creditCardId!, {
      kind: "purchase", amount: merged.amount, currency: merged.currency,
      amountInLimitCurrency: merged.amountInLimitCurrency ?? merged.amount,
      exchangeRateToLimitCurrency: merged.exchangeRateToLimitCurrency ?? 1,
      categoryId: merged.categoryId!, accountId: merged.accountId,
      accountAmount: merged.accountId ? merged.accountAmount ?? merged.amount : undefined,
      accountImpactAtCreation: Boolean(merged.accountId), occurredAt: merged.occurredAt,
    }, linked?.id)] : []),
  ];
  let results;
  try {
    results = await db.batch([...locks, ...guards, recordUpdate, ...sideQueries] as unknown as Parameters<Db["batch"]>[0]);
  } catch (error) { recordCardMutationError(error); }
  const rows = results[locks.length + guards.length];
  const row = rows[0];
  return mapRecord(row, { [id]: merged.tagIds }, { [id]: associations });
}

export async function deleteRecord(id: string, db: Db = createDb()) {
  const now = new Date();
  const compensations = await buildRecordMovementCompensations(id, db);
  const [recordRows, linkedRows] = await db.batch([
    db.select().from(records).where(eq(records.id, id)),
    db.select().from(creditCardRecords).where(eq(creditCardRecords.walletRecordId, id)),
  ]);
  if (!recordRows[0]) return false;
  const locks = [
    ...recordCardLockQueries([...recordRows, ...linkedRows].map((row) => row.creditCardId), db),
    db.execute(sql`select id from records where id = ${id}::uuid for update`),
    ...goalReservationLockQueries(compensations.goalIds, db),
  ];
  const guards = [recordFinancialSnapshotGuard(db, recordRows[0], linkedRows[0]), recordCardDependencyGuard(db, id)];
  let results;
  try {
    results = await db.batch([
      ...locks, ...guards,
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
    ] as unknown as Parameters<Db["batch"]>[0]);
  } catch (error) { recordCardMutationError(error); }
  const recordResult = results[locks.length + guards.length] as Array<typeof records.$inferSelect>;
  const row = recordResult[0];
  return Boolean(row);
}

export async function listGoals(db: Db = createDb()) {
  const [rows, links] = await db.batch([db.select().from(goals).where(isNull(goals.deletedAt)), db.select().from(goalTags)]);
  return rows.map((goal) => mapGoal(goal, links.filter((link) => link.goalId === goal.id).map((link) => link.tagId)));
}

async function assertNoAutoCaptureOverlap(input: NewGoal, excludedId: string | undefined, db: Db) {
  if (input.status !== "active" || !input.autoCaptureEnabled || !input.autoCaptureStart || !input.autoCaptureEnd) return;
  const clauses = [
    isNull(goals.deletedAt), eq(goals.status, "active"), eq(goals.autoCaptureEnabled, true),
    sql`${goals.autoCaptureStart} <= ${input.autoCaptureEnd}`,
    sql`${goals.autoCaptureEnd} >= ${input.autoCaptureStart}`,
  ];
  if (excludedId) clauses.push(ne(goals.id, excludedId));
  const [overlap] = await db.select({ id: goals.id }).from(goals).where(and(...clauses)).limit(1);
  if (overlap) throw validationError("Automatic goal date ranges cannot overlap");
}

export async function createGoal(input: NewGoal, db: Db = createDb()) {
  await assertNoAutoCaptureOverlap(input, undefined, db);
  const id = randomUUID();
  const [row] = await db.insert(goals).values({
      id,
      name: input.name,
      targetAmount: decimal(input.targetAmount),
      currency: input.currency,
      color: input.color,
      icon: input.icon,
      isVisible: input.isVisible,
      deadline: toDate(input.deadline),
      status: input.status,
      accountId: input.accountId ?? null,
      autoCaptureEnabled: input.autoCaptureEnabled ?? false,
      autoCaptureStart: input.autoCaptureStart ?? null,
      autoCaptureEnd: input.autoCaptureEnd ?? null,
      autoReservationAccountId: input.autoReservationAccountId ?? null,
      note: input.note ?? null,
    }).returning();
  return mapGoal(row);
}

export async function updateGoal(
  id: string,
  input: GoalPatch,
  db: Db = createDb(),
) {
  const [[current], tagRows] = await db.batch([
    db.select().from(goals).where(and(eq(goals.id, id), isNull(goals.deletedAt))).limit(1),
    db.select().from(goalTags).where(eq(goalTags.goalId, id)),
  ]);
  if (!current) return null;
  const tagIds = tagRows.map((row) => row.tagId);
  const mapped = mapGoal(current, tagIds);
  const merged = goalSchema.parse({
    ...mapped, ...input,
    deadline: input.deadline === null ? undefined : (input.deadline ?? mapped.deadline),
    accountId: input.accountId === null ? undefined : (input.accountId ?? mapped.accountId),
    note: input.note === null ? undefined : (input.note ?? mapped.note),
    autoCaptureStart: input.autoCaptureStart === null ? undefined : (input.autoCaptureStart ?? mapped.autoCaptureStart),
    autoCaptureEnd: input.autoCaptureEnd === null ? undefined : (input.autoCaptureEnd ?? mapped.autoCaptureEnd),
    autoReservationAccountId: input.autoReservationAccountId === null ? undefined : (input.autoReservationAccountId ?? mapped.autoReservationAccountId),
  });
  await assertNoAutoCaptureOverlap(merged, id, db);
  const update = db.update(goals).set({
    name: merged.name, targetAmount: decimal(merged.targetAmount), currency: merged.currency,
    color: merged.color, icon: merged.icon, isVisible: merged.isVisible,
    deadline: toDate(merged.deadline), status: merged.status, accountId: merged.accountId ?? null,
    autoCaptureEnabled: merged.autoCaptureEnabled,
    autoCaptureStart: merged.autoCaptureStart ?? null,
    autoCaptureEnd: merged.autoCaptureEnd ?? null,
    autoReservationAccountId: merged.autoReservationAccountId ?? null,
    note: merged.note ?? null, updatedAt: new Date(),
  }).where(eq(goals.id, id)).returning();
  const [rows] = await db.batch([update]);
  return mapGoal(rows[0], tagIds);
}

export async function deleteGoal(id: string, db: Db = createDb()) {
  const queries: unknown[] = [
    ...goalReservationLockQueries([id], db),
    db.update(budgets).set({ goalId: null, updatedAt: new Date() }).where(eq(budgets.goalId, id)),
    db.update(goals).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(goals.id, id)).returning(),
    db.execute(sql`insert into goal_reservation_movements (goal_id, account_id, type, amount, currency, note)
      select ${id}::uuid, account_id, 'release', sum(case when type in ('reserve','restore') then amount else -amount end), currency, 'Liberación al archivar Goal'
      from goal_reservation_movements where goal_id = ${id}::uuid group by account_id, currency
      having sum(case when type in ('reserve','restore') then amount else -amount end) > 0`),
  ];
  const results = await db.batch(queries as unknown as Parameters<Db["batch"]>[0]);
  const row = results[2][0];
  return Boolean(row);
}

export async function createGoalReservation(
  input: NewGoalReservation,
  db: Db = createDb(),
) {
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw validationError("Reservation amount must be positive");
  const movementId = randomUUID();
  const results = await db.batch([
    ...goalReservationLockQueries([input.goalId], db),
    db.execute(sql`insert into goal_reservation_movements (id,goal_id,account_id,amount,currency,type,created_at,note)
      select ${movementId}::uuid, ${input.goalId}::uuid, ${input.accountId}::uuid, ${decimal(input.amount)}::numeric,
        ${input.currency}, 'reserve', ${new Date(input.createdAt).toISOString()}::timestamptz, ${input.note ?? null}
      where exists (select 1 from goals where id = ${input.goalId}::uuid and deleted_at is null and status = 'active')
        and exists (select 1 from accounts where id = ${input.accountId}::uuid and currency = ${input.currency} and deleted_at is null)`),
    db.select().from(goalReservationMovements).where(eq(goalReservationMovements.id, movementId)),
  ] as unknown as Parameters<Db["batch"]>[0]);
  const row = (results[2] as Array<typeof goalReservationMovements.$inferSelect>)[0];
  if (!row) throw validationError("Reservations require an active goal and the account currency");
  return {
    id: row.id,
    goalId: row.goalId,
    accountId: row.accountId,
    amount: asNumber(row.amount),
    currency: row.currency as GoalReservation["currency"],
    createdAt: asRequiredIso(row.createdAt),
    note: optional(row.note),
  };
}

export async function listGoalReservations(db: Db = createDb()) {
  return deriveGoalReservations(await db.select().from(goalReservationMovements).orderBy(desc(goalReservationMovements.createdAt)));
}

export async function deleteGoalReservation(id: string, db: Db = createDb()) {
  const [movement] = await db.select().from(goalReservationMovements).where(eq(goalReservationMovements.id, id)).limit(1);
  if (!movement) return false;
  const balance = reservationBalanceSql(movement.goalId, movement.accountId, movement.currency);
  const results = await db.batch([
    ...goalReservationLockQueries([movement.goalId], db),
    db.execute(sql`insert into goal_reservation_movements (goal_id,account_id,type,amount,currency,note)
      select ${movement.goalId}::uuid, ${movement.accountId}::uuid, 'release', ${balance}, ${movement.currency}, 'Liberación total'
      where ${balance} > 0 returning id`),
  ] as unknown as Parameters<Db["batch"]>[0]);
  return Boolean((results[1] as { rows: unknown[] }).rows.length);
}

export async function releaseGoalReservation(input: { goalId: string; accountId: string; amount: number; note?: string }, db: Db = createDb()) {
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw validationError("Release amount must be positive");
  const movementId = randomUUID();
  const results = await db.batch([
    ...goalReservationLockQueries([input.goalId], db),
    db.execute(sql`insert into goal_reservation_movements (id,goal_id,account_id,type,amount,currency,note)
      select ${movementId}::uuid, ${input.goalId}::uuid, ${input.accountId}::uuid, 'release', ${decimal(input.amount)}::numeric, currency, ${input.note ?? "Liberación parcial"}
      from goal_reservation_movements where goal_id = ${input.goalId}::uuid and account_id = ${input.accountId}::uuid group by currency
      having sum(case when type in ('reserve','restore') then amount else -amount end) >= ${decimal(input.amount)}::numeric`),
    db.select().from(goalReservationMovements).where(eq(goalReservationMovements.id, movementId)),
  ] as unknown as Parameters<Db["batch"]>[0]);
  const row = (results[2] as Array<typeof goalReservationMovements.$inferSelect>)[0];
  if (!row) throw validationError("Release exceeds the reserved balance");
  return mapGoalReservationMovement(row);
}

export async function listBudgets(db: Db = createDb()) {
  const rows = await db.select().from(budgets).orderBy(desc(budgets.createdAt));
  return rows.map(mapBudget);
}

export async function createBudget(input: NewBudget, db: Db = createDb()) {
  const [row] = await db.insert(budgets).values({
    ...input,
    limitAmount: decimal(input.limitAmount),
    categoryId: input.categoryId ?? null,
    tagId: input.tagId ?? null,
    accountId: input.accountId ?? null,
    goalId: input.goalId ?? null,
  }).returning();
  return mapBudget(row);
}

export async function updateBudget(id: string, input: BudgetPatch, db: Db = createDb()) {
  const [current] = await db.select().from(budgets).where(eq(budgets.id, id)).limit(1);
  if (!current) return null;
  const mapped = mapBudget(current);
  const merged = budgetSchema.parse({
    ...mapped, ...input,
    categoryId: input.categoryId === null ? undefined : (input.categoryId ?? mapped.categoryId),
    tagId: input.tagId === null ? undefined : (input.tagId ?? mapped.tagId),
    accountId: input.accountId === null ? undefined : (input.accountId ?? mapped.accountId),
    goalId: input.goalId === null ? undefined : (input.goalId ?? mapped.goalId),
  });
  const [row] = await db.update(budgets).set({
    name: merged.name, limitAmount: decimal(merged.limitAmount), currency: merged.currency,
    period: merged.period, categoryId: merged.categoryId ?? null, tagId: merged.tagId ?? null,
    accountId: merged.accountId ?? null, goalId: merged.goalId ?? null,
    color: merged.color, isActive: merged.isActive, updatedAt: new Date(),
  }).where(eq(budgets.id, id)).returning();
  return row ? mapBudget(row) : null;
}

export async function deleteBudget(id: string, db: Db = createDb()) {
  return (await db.delete(budgets).where(eq(budgets.id, id)).returning()).length > 0;
}

export async function listInstallmentPlans(db: Db = createDb()) {
  return (await db.select().from(installmentPlans)).map(mapInstallmentPlan);
}

export async function createInstallmentPlan(input: NewInstallmentPlan, db: Db = createDb()) {
  const [row] = await db.insert(installmentPlans).values({
    ...input,
    totalAmount: decimal(input.totalAmount),
    installmentsTotal: decimal(input.installmentsTotal),
    installmentsPaid: decimal(input.installmentsPaid),
    nextPaymentAt: toDate(input.nextPaymentAt),
    note: input.note ?? null,
  }).returning();
  return mapInstallmentPlan(row);
}

export async function updateInstallmentPlan(id: string, input: InstallmentPlanPatch, db: Db = createDb()) {
  const [current] = await db.select().from(installmentPlans).where(eq(installmentPlans.id, id)).limit(1);
  if (!current) return null;
  const mapped = mapInstallmentPlan(current);
  const merged = installmentPlanSchema.parse({
    ...mapped, ...input,
    nextPaymentAt: input.nextPaymentAt === null ? undefined : (input.nextPaymentAt ?? mapped.nextPaymentAt),
    note: input.note === null ? undefined : (input.note ?? mapped.note),
  });
  const [row] = await db.update(installmentPlans).set({
    name: merged.name, totalAmount: decimal(merged.totalAmount), currency: merged.currency,
    installmentsTotal: decimal(merged.installmentsTotal), installmentsPaid: decimal(merged.installmentsPaid),
    accountId: merged.accountId, categoryId: merged.categoryId,
    nextPaymentAt: toDate(merged.nextPaymentAt), note: merged.note ?? null,
  }).where(eq(installmentPlans.id, id)).returning();
  return row ? mapInstallmentPlan(row) : null;
}

export async function deleteInstallmentPlan(id: string, db: Db = createDb()) {
  return (await db.delete(installmentPlans).where(eq(installmentPlans.id, id)).returning()).length > 0;
}

export async function listInvestments(db: Db = createDb()) {
  const rows = await db
    .select()
    .from(investments)
    .orderBy(desc(investments.startedAt));
  return rows.map(mapInvestment);
}

export async function createInvestment(
  input: NewInvestment,
  db: Db = createDb(),
) {
  const [row] = await db
    .insert(investments)
    .values({
      name: input.name,
      type: input.type,
      amountInvested: decimal(input.amountInvested),
      currentValue: decimal(input.currentValue),
      currency: input.currency,
      isVisible: input.isVisible,
      startedAt: new Date(input.startedAt ?? new Date().toISOString()),
      note: input.note ?? null,
    })
    .returning();
  return mapInvestment(row);
}

export async function updateInvestment(
  id: string,
  input: InvestmentPatch,
  db: Db = createDb(),
) {
  const [current] = await db.select().from(investments).where(eq(investments.id, id)).limit(1);
  if (!current) return null;
  const mapped = mapInvestment(current);
  const merged = investmentSchema.parse({
    ...mapped, ...input,
    note: input.note === null ? undefined : (input.note ?? mapped.note),
  });
  const [row] = await db
    .update(investments)
    .set({
      name: merged.name,
      type: merged.type,
      amountInvested: decimal(merged.amountInvested),
      currentValue: decimal(merged.currentValue),
      currency: merged.currency,
      isVisible: merged.isVisible,
      startedAt: new Date(merged.startedAt),
      note: merged.note ?? null,
      updatedAt: new Date(),
    })
    .where(eq(investments.id, id))
    .returning();
  return row ? mapInvestment(row) : null;
}

export async function deleteInvestment(id: string, db: Db = createDb()) {
  const rows = await db
    .delete(investments)
    .where(eq(investments.id, id))
    .returning();
  return rows.length > 0;
}

export async function listDebts(db: Db = createDb()) {
  const rows = await db.select().from(debts).orderBy(desc(debts.startedAt));
  return rows.map(mapDebt);
}

export async function createDebt(input: NewDebt, db: Db = createDb()) {
  const [row] = await db
    .insert(debts)
    .values({
      name: input.name,
      direction: input.direction,
      originalAmount:
        input.originalAmount === undefined
          ? null
          : decimal(input.originalAmount),
      pendingAmount:
        input.pendingAmount === undefined ? null : decimal(input.pendingAmount),
      currency: input.currency,
      counterpartyName: input.counterpartyName,
      accountId: input.accountId ?? null,
      categoryId: input.categoryId,
      status: input.status,
      isVisible: input.isVisible,
      startedAt: new Date(input.startedAt ?? new Date().toISOString()),
      dueAt: toDate(input.dueAt),
      note: input.note ?? null,
      recurringDebtId: input.recurringDebtId ?? null,
      recurringMonth: input.recurringMonth ?? null,
    })
    .returning();
  return mapDebt(row);
}

export async function createDebts(inputs: NewDebt[], db: Db = createDb()) {
  if (inputs.length === 0) return [];

  const rows = await db
    .insert(debts)
    .values(
      inputs.map((input) => ({
        name: input.name,
        direction: input.direction,
        originalAmount:
          input.originalAmount === undefined
            ? null
            : decimal(input.originalAmount),
        pendingAmount:
          input.pendingAmount === undefined
            ? null
            : decimal(input.pendingAmount),
        currency: input.currency,
        counterpartyName: input.counterpartyName,
        accountId: input.accountId ?? null,
        categoryId: input.categoryId,
        status: input.status,
        isVisible: input.isVisible,
        startedAt: new Date(input.startedAt ?? new Date().toISOString()),
        dueAt: toDate(input.dueAt),
        note: input.note ?? null,
        recurringDebtId: input.recurringDebtId ?? null,
        recurringMonth: input.recurringMonth ?? null,
      })),
    )
    .onConflictDoNothing()
    .returning();

  return rows.map(mapDebt);
}

function recurringDueAt(year: number, month: number, dayOfMonth: number) {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(dayOfMonth, lastDay), 12));
}

export async function generateDueRecurringDebts(
  currentDate = new Date(),
  db: Db = createDb(),
) {
  const [rules, generated] = await db.batch([
    db.select().from(recurringDebts).where(and(
      eq(recurringDebts.isActive, true),
      lt(recurringDebts.startedAt, new Date(currentDate.getTime() + 1)),
    )),
    db.select({
      recurringDebtId: debts.recurringDebtId,
      recurringMonth: debts.recurringMonth,
    }).from(debts).where(and(
      isNotNull(debts.recurringDebtId),
      isNotNull(debts.recurringMonth),
    )),
  ]);
  const existing = new Set(generated.map((row) => `${row.recurringDebtId}:${row.recurringMonth}`));
  const due: NewDebt[] = [];

  for (const rule of rules) {
    let year = rule.startedAt.getUTCFullYear();
    let month = rule.startedAt.getUTCMonth();
    const endYear = currentDate.getUTCFullYear();
    const endMonth = currentDate.getUTCMonth();
    while (year < endYear || (year === endYear && month <= endMonth)) {
      const recurringMonth = `${year}-${String(month + 1).padStart(2, "0")}`;
      const dueAt = recurringDueAt(year, month, Number(rule.dayOfMonth));
      const key = `${rule.id}:${recurringMonth}`;
      if (dueAt >= rule.startedAt && dueAt <= currentDate && !existing.has(key)) {
        due.push({
          name: `${rule.name} - ${recurringMonth}`,
          direction: rule.direction as Debt["direction"],
          originalAmount: rule.amount === null ? undefined : asNumber(rule.amount),
          pendingAmount: rule.amount === null ? undefined : asNumber(rule.amount),
          currency: rule.currency as Debt["currency"],
          counterpartyName: rule.counterpartyName,
          accountId: optional(rule.accountId),
          categoryId: rule.categoryId,
          status: "active",
          isVisible: true,
          startedAt: dueAt.toISOString(),
          dueAt: dueAt.toISOString(),
          note: optional(rule.note),
          recurringDebtId: rule.id,
          recurringMonth,
        });
      }
      month += 1;
      if (month === 12) {
        month = 0;
        year += 1;
      }
    }
  }

  return createDebts(due, db);
}

export async function updateDebt(
  id: string,
  input: DebtPatch,
  db: Db = createDb(),
) {
  const [current] = await db.select().from(debts).where(eq(debts.id, id)).limit(1);
  if (!current) return null;
  const mapped = mapDebt(current);
  const merged = debtSchema.parse({
    ...mapped, ...input,
    originalAmount: input.originalAmount === null ? undefined : (input.originalAmount ?? mapped.originalAmount),
    pendingAmount: input.pendingAmount === null ? undefined : (input.pendingAmount ?? mapped.pendingAmount),
    accountId: input.accountId === null ? undefined : (input.accountId ?? mapped.accountId),
    dueAt: input.dueAt === null ? undefined : (input.dueAt ?? mapped.dueAt),
    note: input.note === null ? undefined : (input.note ?? mapped.note),
    recurringDebtId: input.recurringDebtId === null ? undefined : (input.recurringDebtId ?? mapped.recurringDebtId),
    recurringMonth: input.recurringMonth === null ? undefined : (input.recurringMonth ?? mapped.recurringMonth),
  });
  const values: Partial<typeof debts.$inferInsert> = {};
  for (const key of ["name", "direction", "currency", "counterpartyName", "categoryId", "status", "isVisible"] as const) if (hasOwn(input, key)) values[key] = merged[key] as never;
  if (hasOwn(input, "originalAmount")) values.originalAmount = merged.originalAmount === undefined ? null : decimal(merged.originalAmount);
  if (hasOwn(input, "pendingAmount")) values.pendingAmount = merged.pendingAmount === undefined ? null : decimal(merged.pendingAmount);
  if (hasOwn(input, "accountId")) values.accountId = merged.accountId ?? null;
  if (hasOwn(input, "startedAt")) values.startedAt = new Date(merged.startedAt);
  if (hasOwn(input, "dueAt")) values.dueAt = toDate(merged.dueAt);
  if (hasOwn(input, "note")) values.note = merged.note ?? null;
  if (hasOwn(input, "recurringDebtId")) values.recurringDebtId = merged.recurringDebtId ?? null;
  if (hasOwn(input, "recurringMonth")) values.recurringMonth = merged.recurringMonth ?? null;
  const [row] = await db
    .update(debts)
    .set(values)
    .where(eq(debts.id, id))
    .returning();

  return row ? mapDebt(row) : null;
}

export async function deleteDebt(id: string, db: Db = createDb()) {
  const rows = await db.delete(debts).where(eq(debts.id, id)).returning();
  return rows.length > 0;
}

export async function listRecurringDebts(db: Db = createDb()) {
  const rows = await db
    .select()
    .from(recurringDebts)
    .orderBy(desc(recurringDebts.startedAt));
  return rows.map(mapRecurringDebt);
}

export async function createRecurringDebt(
  input: NewRecurringDebt,
  db: Db = createDb(),
) {
  const [row] = await db
    .insert(recurringDebts)
    .values({
      name: input.name,
      direction: input.direction,
      amount: input.amount === undefined ? null : decimal(input.amount),
      currency: input.currency,
      counterpartyName: input.counterpartyName,
      accountId: input.accountId ?? null,
      categoryId: input.categoryId,
      dayOfMonth: decimal(input.dayOfMonth),
      isActive: input.isActive,
      startedAt: new Date(input.startedAt ?? new Date().toISOString()),
      note: input.note ?? null,
    })
    .returning();
  return mapRecurringDebt(row);
}

export async function updateRecurringDebt(
  id: string,
  input: RecurringDebtPatch,
  db: Db = createDb(),
) {
  const [current] = await db.select().from(recurringDebts).where(eq(recurringDebts.id, id)).limit(1);
  if (!current) return null;
  const mapped = mapRecurringDebt(current);
  const merged = recurringDebtSchema.parse({
    ...mapped, ...input,
    amount: input.amount === null ? undefined : (input.amount ?? mapped.amount),
    accountId: input.accountId === null ? undefined : (input.accountId ?? mapped.accountId),
    note: input.note === null ? undefined : (input.note ?? mapped.note),
  });
  const values: Partial<typeof recurringDebts.$inferInsert> = { updatedAt: new Date() };
  for (const key of ["name", "direction", "currency", "counterpartyName", "categoryId", "isActive"] as const) if (hasOwn(input, key)) values[key] = merged[key] as never;
  if (hasOwn(input, "amount")) values.amount = merged.amount === undefined ? null : decimal(merged.amount);
  if (hasOwn(input, "accountId")) values.accountId = merged.accountId ?? null;
  if (hasOwn(input, "dayOfMonth")) values.dayOfMonth = decimal(merged.dayOfMonth);
  if (hasOwn(input, "startedAt")) values.startedAt = new Date(merged.startedAt);
  if (hasOwn(input, "note")) values.note = merged.note ?? null;
  const [row] = await db
    .update(recurringDebts)
    .set(values)
    .where(eq(recurringDebts.id, id))
    .returning();

  return row ? mapRecurringDebt(row) : null;
}

export async function deleteRecurringDebt(id: string, db: Db = createDb()) {
  const rows = await db
    .delete(recurringDebts)
    .where(eq(recurringDebts.id, id))
    .returning();
  return rows.length > 0;
}

interface DebtPaymentInput {
  amount: number;
  accountAmount?: number;
  accountId: string;
  occurredAt: string;
  note?: string;
  saveAccountToDebt?: boolean;
  idempotencyKey?: string;
}

export async function recordDebtPayment(
  id: string,
  input: DebtPaymentInput,
  db: Db = createDb(),
) {
  const idempotencyKey = input.idempotencyKey ?? randomUUID();
  const requestHash = createHash("sha256").update(JSON.stringify({
    debtId: id, amount: input.amount, accountId: input.accountId, accountAmount: input.accountAmount ?? null,
    occurredAt: input.occurredAt, note: input.note ?? null,
    saveAccountToDebt: Boolean(input.saveAccountToDebt),
  })).digest("hex");
  const [existing] = await db.select().from(records).where(eq(records.idempotencyKey, idempotencyKey)).limit(1);
  if (existing) {
    if (existing.requestHash !== requestHash) throw conflictError("Idempotency key was already used with another payment");
    const [debtRow] = await db.select().from(debts).where(eq(debts.id, id)).limit(1);
    return debtRow ? { debt: mapDebt(debtRow), record: mapRecord(existing, { [existing.id]: [] }) } : null;
  }
  const [[debtRow], [accountRow], rateRows, [settingsRow]] = await Promise.all([
    db.select().from(debts).where(eq(debts.id, id)).limit(1),
    db.select().from(accounts).where(and(eq(accounts.id, input.accountId), isNull(accounts.deletedAt), eq(accounts.isActive, true))).limit(1),
    db.select().from(exchangeRates),
    db.select().from(settings).limit(1),
  ]);
  if (!debtRow) return null;
  if (!accountRow) throw validationError("Select an active payment account");
  const rates = rateRows.map(mapExchangeRate);
  const currency = debtRow.currency as WalletRecord["currency"];
  const accountRate = findExchangeRate(rates, currency, accountRow.currency as WalletRecord["currency"], input.occurredAt);
  const primaryRate = findExchangeRate(rates, currency, (settingsRow?.primaryCurrency ?? "UYU") as WalletRecord["currency"], input.occurredAt);
  if (primaryRate === null || (accountRate === null && input.accountAmount === undefined)) throw validationError("A historical exchange rate or explicit account amount is required");
  const accountAmount = input.accountAmount === undefined
    ? sql`round(${decimal(input.amount)}::numeric * ${String(accountRate)}::numeric, 2)`
    : sql`${decimal(input.accountAmount)}::numeric`;
  const recordId = randomUUID();
  try {
    await db.execute(sql`
      WITH updated_debt AS (
        UPDATE ${debts}
        SET pending_amount = pending_amount - ${decimal(input.amount)}::numeric,
            status = CASE WHEN pending_amount - ${decimal(input.amount)}::numeric = 0 THEN 'paid'::debt_status ELSE status END,
            account_id = CASE WHEN ${Boolean(input.saveAccountToDebt)} THEN ${input.accountId}::uuid ELSE account_id END
        WHERE id = ${id}::uuid
          AND pending_amount IS NOT NULL
          AND pending_amount >= ${decimal(input.amount)}::numeric
          AND status <> 'paid'::debt_status
        RETURNING *
      )
      INSERT INTO ${records} (
        id, type, amount, currency, account_id, account_amount, category_id, counterparty_name,
        payment_type, payment_status, exchange_rate_to_primary, occurred_at, note,
        is_fixed, debt_id, idempotency_key, request_hash
      )
      SELECT ${recordId}::uuid,
        CASE WHEN direction = 'receivable' THEN 'income'::record_type ELSE 'expense'::record_type END,
        ${decimal(input.amount)}::numeric, currency, ${input.accountId}::uuid, ${accountAmount}, category_id, counterparty_name,
        'transfer'::payment_type, 'cleared'::payment_status, ${decimal(primaryRate)}, ${new Date(input.occurredAt)},
        COALESCE(${input.note ?? null}, 'Debt payment: ' || name), false, id, ${idempotencyKey}, ${requestHash}
      FROM updated_debt
    `);
  } catch (error) {
    const [raced] = await db.select().from(records).where(eq(records.idempotencyKey, idempotencyKey)).limit(1);
    if (!raced) throw error;
    if (raced.requestHash !== requestHash) throw conflictError("Idempotency key was already used with another payment");
  }
  const [[updatedDebtRow], [recordRow]] = await Promise.all([
    db.select().from(debts).where(eq(debts.id, id)).limit(1),
    db.select().from(records).where(eq(records.idempotencyKey, idempotencyKey)).limit(1),
  ]);
  if (!updatedDebtRow) return null;
  if (!recordRow) throw validationError("Payment amount is invalid for this debt");
  return { debt: mapDebt(updatedDebtRow), record: mapRecord(recordRow, { [recordRow.id]: [] }) };
}

export async function getSettings(db: Db = createDb()) {
  const rows = await db.select().from(settings).limit(1);
  return mapSettings(rows[0]);
}

export async function upsertSettings(
  input: WalletSettings,
  db: Db = createDb(),
) {
  const existing = await db.select().from(settings).limit(1);
  if (existing[0] && input.primaryCurrency !== existing[0].primaryCurrency) {
    const [history] = await db.select({ id: records.id }).from(records).limit(1);
    if (history) throw validationError("La moneda principal no puede cambiar mientras exista historial financiero. Exportá tus datos antes de crear una billetera con otra moneda.");
  }
  const values = {
    primaryCurrency: input.primaryCurrency,
    primaryAccountId: input.primaryAccountId ?? null,
    theme: input.theme,
    defaultDashboardPreset: input.defaultDashboardPreset,
    locale: input.locale,
    includeHiddenAccountsInReports: input.includeHiddenAccountsInReports,
    defaultAccountId: input.defaultAccountId ?? null,
    defaultPaymentType: input.defaultPaymentType,
    defaultCreditCardId: input.defaultCreditCardId ?? null,
    defaultPaymentStatus: input.defaultPaymentStatus,
    updatedAt: new Date(),
  };

  const [row] =
    existing.length > 0
      ? await db
          .update(settings)
          .set(values)
          .where(eq(settings.id, existing[0].id))
          .returning()
      : await db.insert(settings).values(values).returning();

  return mapSettings(row);
}

export async function patchSettings(input: SettingsPatch, db: Db = createDb()) {
  const [current] = await db.select().from(settings).limit(1);
  if (!current) {
    const merged = settingsSchema.parse({
      ...mapSettings(undefined),
      ...input,
      primaryAccountId: input.primaryAccountId === null ? undefined : input.primaryAccountId,
      defaultAccountId: input.defaultAccountId === null ? undefined : input.defaultAccountId,
      defaultCreditCardId: input.defaultCreditCardId === null ? undefined : input.defaultCreditCardId,
    });
    return upsertSettings(merged, db);
  }
  const values: Partial<typeof settings.$inferInsert> = { updatedAt: new Date() };
  for (const key of ["primaryCurrency", "theme", "defaultDashboardPreset", "locale", "includeHiddenAccountsInReports", "defaultPaymentType", "defaultPaymentStatus"] as const) {
    if (hasOwn(input, key)) values[key] = input[key] as never;
  }
  if (hasOwn(input, "primaryAccountId")) values.primaryAccountId = input.primaryAccountId ?? null;
  if (hasOwn(input, "defaultAccountId")) values.defaultAccountId = input.defaultAccountId ?? null;
  if (hasOwn(input, "defaultCreditCardId")) {
    values.defaultCreditCardId = input.defaultCreditCardId ?? null;
    if (input.defaultCreditCardId) values.defaultPaymentType = "credit";
  }
  const [row] = await db.update(settings).set(values).where(eq(settings.id, current.id)).returning();
  return mapSettings(row);
}

