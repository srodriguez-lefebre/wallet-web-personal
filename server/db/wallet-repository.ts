import { and, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
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
import { creditCardStatementStatusAfterPaymentChange } from "../../shared/calculations.js";

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
    tagIds: [],
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
  options: { recordsOverride?: WalletRecord[] } = {},
): Promise<WalletDataset> {
  await ensureCreditCardStatements(db);
  const [
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
    goalReservationMovementRows,
    budgetRows,
    exchangeRateRows,
    investmentRows,
    debtRows,
    recurringDebtRows,
    installmentPlanRows,
  ] = await db.batch([
    db.select().from(settings).limit(1),
    db.select().from(accounts).where(isNull(accounts.deletedAt)),
    db.select().from(categories).where(isNull(categories.deletedAt)),
    db.select().from(tags),
    db.select().from(creditCards).orderBy(desc(creditCards.createdAt)),
    db
      .select()
      .from(creditCardPayments)
      .orderBy(desc(creditCardPayments.occurredAt)),
    db
      .select()
      .from(creditCardRecords)
      .where(isNull(creditCardRecords.deletedAt))
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
          .where(isNull(records.deletedAt))
          .orderBy(desc(records.occurredAt), desc(records.id)),
    options.recordsOverride
      ? db.select().from(recordTags).where(sql`false`).limit(0)
      : db.select().from(recordTags),
    options.recordsOverride
      ? db.select().from(recordGoals).where(sql`false`).limit(0)
      : db.select().from(recordGoals),
    db.select().from(goals).where(isNull(goals.deletedAt)),
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
  ]);

  const tagIdsByRecord = groupIds(recordTagRows, "recordId", "tagId");
  const goalAssociationsByRecord = groupGoalAssociations(recordGoalRows);

  return {
    settings: mapSettings(settingsRows[0]),
    accounts: accountRows.map(mapAccount),
    categories: categoryRows.map(mapCategory),
    tags: tagRows.map(mapTag),
    creditCards: creditCardRows.map(mapCreditCard),
    creditCardRecords: creditCardRecordRows.map(mapCreditCardRecord),
    creditCardStatements: creditCardStatementRows.map(mapCreditCardStatement),
    creditCardPayments: creditCardPaymentRows.map(mapCreditCardPayment),
    creditCardPaymentAllocations: creditCardAllocationRows.map(
      mapCreditCardPaymentAllocation,
    ),
    records: options.recordsOverride ?? recordRows.map((record) => mapRecord(record, tagIdsByRecord, goalAssociationsByRecord)),
    goals: goalRows.map((goal) => mapGoal(goal)),
    goalReservations: deriveGoalReservations(goalReservationMovementRows),
    goalReservationMovements: goalReservationMovementRows.map(mapGoalReservationMovement),
    budgets: budgetRows.map(mapBudget),
    exchangeRates: exchangeRateRows.map(mapExchangeRate),
    investments: investmentRows.map(mapInvestment),
    debts: debtRows.map(mapDebt),
    recurringDebts: recurringDebtRows.map(mapRecurringDebt),
    installmentPlans: installmentPlanRows.map(mapInstallmentPlan),
  };
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
  const [row] = await db
    .insert(creditCardPayments)
    .values({
      creditCardId,
      amount: decimal(input.amount),
      currency: input.currency,
      amountInLimitCurrency: decimal(input.amountInLimitCurrency),
      accountId: input.accountId ?? null,
      accountAmount:
        input.accountAmount === undefined ? null : decimal(input.accountAmount),
      occurredAt: new Date(input.occurredAt),
      note: input.note ?? null,
    })
    .returning();
  return mapCreditCardPayment(row);
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
  const now = new Date();
  for (const movement of movementRows) {
    const card = cardRows.find((item) => item.id === movement.creditCardId);
    if (!card) continue;
    const cycle = cardCycle(mapCreditCard(card), movement.occurredAt);
    if (cycle.cycleEnd > now) continue;
    let [statement] = await db
      .select()
      .from(creditCardStatements)
      .where(
        and(
          eq(creditCardStatements.creditCardId, card.id),
          eq(creditCardStatements.cycleStart, cycle.cycleStart),
          eq(creditCardStatements.cycleEnd, cycle.cycleEnd),
        ),
      )
      .limit(1);
    if (!statement) {
      [statement] = await db
        .insert(creditCardStatements)
        .values({
          creditCardId: card.id,
          ...cycle,
          closedAt: cycle.cycleEnd,
        })
        .returning();
    }
    await db
      .update(creditCardRecords)
      .set({ statementId: statement.id, updatedAt: now })
      .where(
        and(
          eq(creditCardRecords.creditCardId, card.id),
          isNull(creditCardRecords.statementId),
          // Records are assigned individually so a future movement never leaks into this statement.
          eq(creditCardRecords.id, movement.id),
        ),
      );
  }
  await db
    .update(creditCardStatements)
    .set({ status: "overdue", updatedAt: now })
    .where(
      and(
        lt(creditCardStatements.dueAt, now),
        eq(creditCardStatements.status, "pending"),
      ),
    );
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
        exchangeRateToPrimary: "1",
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
  const row = walletRefundValues
    ? (
        await db.batch([
          db.insert(records).values(walletRefundValues),
          db.insert(creditCardRecords).values(movementValues).returning(),
        ])
      )[1][0]
    : (
        await db.insert(creditCardRecords).values(movementValues).returning()
      )[0];
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
    isNull(creditCardRecords.walletRecordId),
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
  const [row] = await db
    .update(creditCardRecords)
    .set(values)
    .where(
      and(
        eq(creditCardRecords.id, id),
        eq(creditCardRecords.creditCardId, creditCardId),
        isNull(creditCardRecords.walletRecordId),
      ),
    )
    .returning();
  return row ? mapCreditCardRecord(row) : null;
}

export async function deleteCreditCardRecord(
  creditCardId: string,
  id: string,
  db: Db = createDb(),
) {
  const [row] = await db
    .update(creditCardRecords)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(creditCardRecords.id, id),
        eq(creditCardRecords.creditCardId, creditCardId),
        isNull(creditCardRecords.walletRecordId),
      ),
    )
    .returning();
  return Boolean(row);
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
  const purchases = await db
    .select()
    .from(creditCardRecords)
    .where(
      and(
        eq(creditCardRecords.creditCardId, creditCardId),
        eq(creditCardRecords.statementId, statementId),
        eq(creditCardRecords.kind, "purchase"),
        isNull(creditCardRecords.deletedAt),
      ),
    )
    .orderBy(creditCardRecords.occurredAt);
  const existing = await db
    .select({
      recordId: creditCardPaymentAllocations.creditCardRecordId,
      amount: creditCardPaymentAllocations.amountInLimitCurrency,
    })
    .from(creditCardPaymentAllocations)
    .innerJoin(
      creditCardPayments,
      eq(creditCardPayments.id, creditCardPaymentAllocations.paymentId),
    )
    .where(eq(creditCardPayments.statementId, statementId));
  const paidByRecord = new Map<string, number>();
  existing.forEach((item) =>
    paidByRecord.set(
      item.recordId,
      (paidByRecord.get(item.recordId) ?? 0) + asNumber(item.amount),
    ),
  );
  const refunds = await db
    .select()
    .from(creditCardRecords)
    .where(
      and(
        eq(creditCardRecords.creditCardId, creditCardId),
        eq(creditCardRecords.kind, "refund"),
        isNull(creditCardRecords.deletedAt),
      ),
    );
  const refundedByRecord = new Map<string, number>();
  refunds.forEach((item) => {
    if (item.originalRecordId)
      refundedByRecord.set(
        item.originalRecordId,
        (refundedByRecord.get(item.originalRecordId) ?? 0) +
          asNumber(item.amountInLimitCurrency),
      );
  });
  const availableFor = (row: (typeof purchases)[number]) =>
    Math.max(
      0,
      asNumber(row.amountInLimitCurrency) -
        (paidByRecord.get(row.id) ?? 0) -
        (refundedByRecord.get(row.id) ?? 0),
    );
  const outstanding = purchases.reduce(
    (sum, row) => sum + availableFor(row),
    0,
  );
  if (input.amountInLimitCurrency > outstanding + 0.005)
    throw validationError("Payment exceeds statement balance");
  let remaining = input.amountInLimitCurrency;
  const drafts: Array<{
    purchase: (typeof purchases)[number];
    allocated: number;
  }> = [];
  for (const purchase of purchases) {
    const allocated = Math.min(availableFor(purchase), remaining);
    if (allocated > 0) drafts.push({ purchase, allocated });
    remaining -= allocated;
    if (remaining <= 0.005) break;
  }
  const unaccountedLimitAmount = drafts
    .filter(({ purchase }) => !purchase.accountImpactAtCreation)
    .reduce((sum, item) => sum + item.allocated, 0);
  const accountRatio =
    input.amountInLimitCurrency > 0
      ? unaccountedLimitAmount / input.amountInLimitCurrency
      : 0;
  const effectiveAccountAmount =
    input.accountId && input.accountAmount !== undefined && accountRatio > 0
      ? input.accountAmount * accountRatio
      : undefined;
  const paymentId = randomUUID();
  const paymentValues = {
    id: paymentId,
    creditCardId,
    statementId,
    amount: decimal(input.amount),
    currency: input.currency,
    amountInLimitCurrency: decimal(input.amountInLimitCurrency),
    accountId: effectiveAccountAmount === undefined ? null : input.accountId,
    accountAmount:
      effectiveAccountAmount === undefined
        ? null
        : decimal(effectiveAccountAmount),
    occurredAt: new Date(input.occurredAt),
    note: input.note ?? null,
  };
  const allocations = drafts.map(({ purchase, allocated }) => ({
    paymentId,
    creditCardRecordId: purchase.id,
    amount: decimal(allocated / asNumber(purchase.exchangeRateToLimitCurrency)),
    amountInLimitCurrency: decimal(allocated),
  }));
  const nextStatus =
    input.amountInLimitCurrency >= outstanding - 0.005 ? "paid" : "partial";
  const statementUpdate = db
    .update(creditCardStatements)
    .set({
      status: nextStatus,
      paidAt: nextStatus === "paid" ? new Date(input.occurredAt) : null,
      updatedAt: new Date(),
    })
    .where(eq(creditCardStatements.id, statementId));
  const payment = allocations.length
    ? (
        await db.batch([
          db.insert(creditCardPayments).values(paymentValues).returning(),
          db.insert(creditCardPaymentAllocations).values(allocations),
          statementUpdate,
        ])
      )[0][0]
    : (
        await db.batch([
          db.insert(creditCardPayments).values(paymentValues).returning(),
          statementUpdate,
        ])
      )[0][0];
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
  if (payment.statementId) {
    const [purchaseRows, refundRows, remainingAllocationRows, [statement]] = await db.batch([
      db.select({ id: creditCardRecords.id, amount: creditCardRecords.amountInLimitCurrency })
        .from(creditCardRecords)
        .where(and(eq(creditCardRecords.statementId, payment.statementId), eq(creditCardRecords.kind, "purchase"), isNull(creditCardRecords.deletedAt))),
      db.select({ originalRecordId: creditCardRecords.originalRecordId, amount: creditCardRecords.amountInLimitCurrency })
        .from(creditCardRecords)
        .where(and(eq(creditCardRecords.creditCardId, creditCardId), eq(creditCardRecords.kind, "refund"), isNull(creditCardRecords.deletedAt))),
      db.select({ amount: creditCardPaymentAllocations.amountInLimitCurrency })
        .from(creditCardPaymentAllocations)
        .innerJoin(creditCardPayments, eq(creditCardPayments.id, creditCardPaymentAllocations.paymentId))
        .where(and(eq(creditCardPayments.statementId, payment.statementId), ne(creditCardPayments.id, paymentId))),
      db.select().from(creditCardStatements).where(eq(creditCardStatements.id, payment.statementId)).limit(1),
    ]);
    const purchaseIds = new Set(purchaseRows.map((row) => row.id));
    const total = purchaseRows.reduce((sum, row) => sum + asNumber(row.amount), 0) - refundRows
      .filter((row) => row.originalRecordId && purchaseIds.has(row.originalRecordId))
      .reduce((sum, row) => sum + asNumber(row.amount), 0);
    const paid = remainingAllocationRows.reduce((sum, row) => sum + asNumber(row.amount), 0);
    const status = creditCardStatementStatusAfterPaymentChange(
      total,
      paid,
      statement?.dueAt ?? new Date(),
    );
    await db.batch([
      db.delete(creditCardPayments).where(eq(creditCardPayments.id, paymentId)),
      db
        .update(creditCardStatements)
        .set({ status, paidAt: status === "paid" ? statement?.paidAt ?? new Date() : null, updatedAt: new Date() })
        .where(eq(creditCardStatements.id, payment.statementId)),
    ]);
  } else
    await db
      .delete(creditCardPayments)
      .where(eq(creditCardPayments.id, paymentId));
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

async function resolveGoalAssociations(input: NewRecord, db: Db) {
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
    if (selectedGoals.length !== associations.size || selectedGoals.some((goal) => goal.deletedAt || goal.status !== "active")) {
      throw validationError("New records can only be associated with active goals");
    }
  }
  if (input.type === "expense") {
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
  if (input.paymentStatus === "cancelled" || input.type === "transfer" || associations.length === 0) return [];
  const goalRows = await db.select().from(goals).where(inArray(goals.id, associations.map((item) => item.goalId)));
  const accountRows = await db.select().from(accounts);
  const movementRows = await db.select().from(goalReservationMovements).where(
    inArray(goalReservationMovements.goalId, associations.map((item) => item.goalId)),
  );
  const available = new Map<string, number>();
  for (const movement of movementRows) {
    if (movement.recordId === recordId) continue;
    const key = `${movement.goalId}:${movement.accountId}`;
    const direction = movement.type === "reserve" || movement.type === "restore" ? 1 : -1;
    available.set(key, (available.get(key) ?? 0) + direction * asNumber(movement.amount));
  }
  const values: Array<typeof goalReservationMovements.$inferInsert> = [];
  for (const association of associations) {
    const goal = goalRows.find((item) => item.id === association.goalId);
    if (!goal) continue;
    const accountId = input.accountId ?? goal.autoReservationAccountId;
    const account = accountRows.find((item) => item.id === accountId);
    if (!accountId || !account) continue;
    const fullRecordAmount = input.accountId === accountId
      ? (input.accountAmount ?? input.amount)
      : input.currency === account.currency
        ? input.amount
        : input.amount * input.exchangeRateToPrimary;
    const allocationRatio = association.allocatedAmount === undefined
      ? 1
      : Math.min(1, association.allocatedAmount / input.amount);
    const recordAmount = fullRecordAmount * allocationRatio;
    if (input.type === "expense" && association.useReserved) {
      const key = `${association.goalId}:${accountId}`;
      const amount = Math.min(Math.max(0, available.get(key) ?? 0), recordAmount);
      if (amount > 0) {
        values.push({ goalId: association.goalId, accountId, type: "consume", amount: decimal(amount), currency: account.currency, recordId, idempotencyKey: `${recordId}:${association.goalId}:consume`, note: "Consumo de reserva por Record" });
        available.set(key, (available.get(key) ?? 0) - amount);
      }
    }
    if (input.type === "income" && association.reserveIncome) {
      values.push({ goalId: association.goalId, accountId, type: "reserve", amount: decimal(recordAmount), currency: account.currency, recordId, idempotencyKey: `${recordId}:${association.goalId}:income-reserve`, note: "Ingreso vuelto a reservar" });
    }
  }
  return values;
}

async function buildRecordMovementCompensations(recordId: string, db: Db) {
  const rows = await db.select().from(goalReservationMovements).where(
    eq(goalReservationMovements.recordId, recordId),
  );
  const net = new Map<string, { goalId: string; accountId: string; currency: string; amount: number }>();
  for (const row of rows) {
    const key = `${row.goalId}:${row.accountId}:${row.currency}`;
    const current = net.get(key) ?? { goalId: row.goalId, accountId: row.accountId, currency: row.currency, amount: 0 };
    const direction = row.type === "reserve" || row.type === "restore" ? 1 : -1;
    current.amount += direction * asNumber(row.amount);
    net.set(key, current);
  }
  return [...net.values()].filter((item) => Math.abs(item.amount) > 0.005).map((item) => ({
    goalId: item.goalId,
    accountId: item.accountId,
    type: item.amount > 0 ? "release" : "restore",
    amount: decimal(Math.abs(item.amount)),
    currency: item.currency,
    recordId,
    idempotencyKey: `${recordId}:reconcile:${randomUUID()}`,
    note: "Reconciliación de Record",
  } satisfies typeof goalReservationMovements.$inferInsert));
}

export async function createRecord(input: NewRecord, db: Db = createDb()) {
  const recordId = randomUUID();
  const associations = await resolveGoalAssociations(input, db);
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
  }));
  if (input.tagIds.length) queries.push(db.insert(recordTags).values(input.tagIds.map((tagId) => ({ recordId, tagId }))));
  if (associations.length) queries.push(db.insert(recordGoals).values(recordGoalValues(recordId, associations)));
  const movementValues = await buildRecordReservationMovements(recordId, input, associations, db);
  if (movementValues.length) queries.push(db.insert(goalReservationMovements).values(movementValues));
  const [rows] = await db.batch(queries as unknown as Parameters<Db["batch"]>[0]);
  const row = rows[0];
  return mapRecord(row, { [row.id]: input.tagIds }, { [row.id]: associations });
}

export async function createRecordsBulk(inputs: NewRecord[], db: Db = createDb()) {
  const ids = inputs.map(() => randomUUID());
  const associationsByInput = await Promise.all(inputs.map((input) => resolveGoalAssociations(input, db)));
  const queries: unknown[] = [];
  inputs.forEach((input, index) => {
    const id = ids[index];
    queries.push(db.insert(records).values({
      id, type: input.type, amount: decimal(input.amount), currency: input.currency,
      accountId: input.accountId ?? null,
      accountAmount: input.accountAmount === undefined ? null : decimal(input.accountAmount),
      creditCardId: input.creditCardId ?? null, destinationAccountId: input.destinationAccountId ?? null,
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
    }));
    if (input.tagIds.length) queries.push(db.insert(recordTags).values(input.tagIds.map((tagId) => ({ recordId: id, tagId }))));
    const associations = associationsByInput[index];
    if (associations.length) queries.push(db.insert(recordGoals).values(recordGoalValues(id, associations)));
  });
  const movementsByInput = await Promise.all(inputs.map((input, index) => buildRecordReservationMovements(ids[index], input, associationsByInput[index], db)));
  const existingMovementRows = await db.select().from(goalReservationMovements);
  const runningBalances = new Map<string, number>();
  for (const movement of existingMovementRows) {
    const key = `${movement.goalId}:${movement.accountId}`;
    const direction = movement.type === "reserve" || movement.type === "restore" ? 1 : -1;
    runningBalances.set(key, (runningBalances.get(key) ?? 0) + direction * asNumber(movement.amount));
  }
  const movementValues = movementsByInput.flat().flatMap((movement) => {
    const key = `${movement.goalId}:${movement.accountId}`;
    if (movement.type === "consume") {
      const amount = Math.min(asNumber(movement.amount), Math.max(0, runningBalances.get(key) ?? 0));
      runningBalances.set(key, (runningBalances.get(key) ?? 0) - amount);
      return amount > 0 ? [{ ...movement, amount: decimal(amount) }] : [];
    }
    if (movement.type === "reserve" || movement.type === "restore") runningBalances.set(key, (runningBalances.get(key) ?? 0) + asNumber(movement.amount));
    return [movement];
  });
  if (movementValues.length) queries.push(db.insert(goalReservationMovements).values(movementValues));
  await db.batch(queries as unknown as Parameters<Db["batch"]>[0]);
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
  const current = mapRecord(
    existingRecord,
    { [id]: existingTagRows.map((item) => item.tagId) },
    { [id]: groupGoalAssociations(existingGoalRows)[id] ?? [] },
  );
  const merged = recordSchema.parse({
    ...current,
    ...input,
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
      deletedAt: null,
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
  const associations = merged.goalAssociations.length
    ? merged.goalAssociations
    : merged.goalIds.map((goalId) => ({ goalId, assignmentSource: "manual" as const, useReserved: true, reserveIncome: true }));
  const existingGoalIds = new Set(existingGoalRows.map((row) => row.goalId));
  const addedGoalIds = associations.map((association) => association.goalId).filter((goalId) => !existingGoalIds.has(goalId));
  if (addedGoalIds.length) {
    const addedGoals = await db.select().from(goals).where(inArray(goals.id, addedGoalIds));
    if (addedGoals.length !== addedGoalIds.length || addedGoals.some((goal) => goal.deletedAt || goal.status !== "active")) throw validationError("New records can only be associated with active goals");
  }
  if (hasOwn(input, "goalIds") || hasOwn(input, "goalAssociations")) {
    sideQueries.push(db.delete(recordGoals).where(eq(recordGoals.recordId, id)));
    if (associations.length) sideQueries.push(db.insert(recordGoals).values(recordGoalValues(id, associations)));
  }
  const reservationFingerprint = (record: NewRecord, items: RecordGoalAssociation[]) => JSON.stringify({
    type: record.type, amount: record.amount, currency: record.currency,
    accountId: record.accountId, accountAmount: record.accountAmount,
    paymentStatus: record.paymentStatus,
    associations: items.map((item) => ({ goalId: item.goalId, useReserved: item.useReserved, reserveIncome: item.reserveIncome, allocatedAmount: item.allocatedAmount })).sort((a, b) => a.goalId.localeCompare(b.goalId)),
  });
  const currentAssociations = groupGoalAssociations(existingGoalRows)[id] ?? [];
  if (reservationFingerprint(current, currentAssociations) !== reservationFingerprint(merged, associations)) {
    const compensations = await buildRecordMovementCompensations(id, db);
    if (compensations.length) sideQueries.push(db.insert(goalReservationMovements).values(compensations));
    const newMovements = await buildRecordReservationMovements(id, merged, associations, db);
    if (newMovements.length) sideQueries.push(db.insert(goalReservationMovements).values(newMovements.map((movement) => ({ ...movement, idempotencyKey: `${movement.idempotencyKey}:${randomUUID()}` }))));
  }
  const [rows] = sideQueries.length
    ? await db.batch([recordUpdate, ...sideQueries] as unknown as Parameters<Db["batch"]>[0])
    : await db.batch([recordUpdate]);
  const row = rows[0];
  return mapRecord(row, { [id]: merged.tagIds }, { [id]: associations });
}

export async function deleteRecord(id: string, db: Db = createDb()) {
  const now = new Date();
  const compensations = await buildRecordMovementCompensations(id, db);
  const [recordResult] = await db.batch([
    db
      .update(records)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(records.id, id))
      .returning(),
    db
      .update(creditCardRecords)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(creditCardRecords.walletRecordId, id)),
    ...(compensations.length ? [db.insert(goalReservationMovements).values(compensations)] : []),
  ]);
  const row = recordResult[0];
  return Boolean(row);
}

export async function listGoals(db: Db = createDb()) {
  const rows = await db.select().from(goals).where(isNull(goals.deletedAt));
  return rows.map((goal) => mapGoal(goal));
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
  const [[current]] = await db.batch([
    db.select().from(goals).where(and(eq(goals.id, id), isNull(goals.deletedAt))).limit(1),
  ]);
  if (!current) return null;
  const mapped = mapGoal(current);
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
  return mapGoal(rows[0]);
}

export async function deleteGoal(id: string, db: Db = createDb()) {
  const movementRows = await db.select().from(goalReservationMovements).where(eq(goalReservationMovements.goalId, id));
  const balances = deriveGoalReservations(movementRows);
  const queries: unknown[] = [
    db.update(budgets).set({ goalId: null, updatedAt: new Date() }).where(eq(budgets.goalId, id)),
    db.update(goals).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(goals.id, id)).returning(),
  ];
  if (balances.length) queries.push(db.insert(goalReservationMovements).values(balances.map((balance) => ({ goalId: balance.goalId, accountId: balance.accountId, type: "release", amount: decimal(balance.amount), currency: balance.currency, note: "Liberación al archivar Goal" }))));
  const results = await db.batch(queries as unknown as Parameters<Db["batch"]>[0]);
  const row = results[1][0];
  return Boolean(row);
}

export async function createGoalReservation(
  input: NewGoalReservation,
  db: Db = createDb(),
) {
  const [row] = await db
    .insert(goalReservationMovements)
    .values({
      goalId: input.goalId,
      accountId: input.accountId,
      amount: decimal(input.amount),
      currency: input.currency,
      type: "reserve",
      createdAt: new Date(input.createdAt),
      note: input.note ?? null,
    })
    .returning();
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
  const balances = deriveGoalReservations(await db.select().from(goalReservationMovements).where(and(eq(goalReservationMovements.goalId, movement.goalId), eq(goalReservationMovements.accountId, movement.accountId))));
  const balance = balances[0];
  if (!balance) return false;
  await db.insert(goalReservationMovements).values({ goalId: balance.goalId, accountId: balance.accountId, type: "release", amount: decimal(balance.amount), currency: balance.currency, note: "Liberación total" });
  return true;
}

export async function releaseGoalReservation(input: { goalId: string; accountId: string; amount: number; note?: string }, db: Db = createDb()) {
  const movements = await db.select().from(goalReservationMovements).where(and(eq(goalReservationMovements.goalId, input.goalId), eq(goalReservationMovements.accountId, input.accountId)));
  const balance = deriveGoalReservations(movements)[0];
  if (!balance || input.amount > balance.amount + 0.005) throw validationError("Release exceeds the reserved balance");
  const [row] = await db.insert(goalReservationMovements).values({ goalId: input.goalId, accountId: input.accountId, type: "release", amount: decimal(input.amount), currency: balance.currency, note: input.note ?? "Liberación parcial" }).returning();
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
      if (dueAt <= currentDate && !existing.has(key)) {
        due.push({
          name: `${rule.name} - ${recurringMonth}`,
          direction: rule.direction as Debt["direction"],
          originalAmount: asNumber(rule.amount),
          pendingAmount: asNumber(rule.amount),
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
    debtId: id, amount: input.amount, accountId: input.accountId,
    occurredAt: input.occurredAt, note: input.note ?? null,
    saveAccountToDebt: Boolean(input.saveAccountToDebt),
  })).digest("hex");
  const [existing] = await db.select().from(records).where(eq(records.idempotencyKey, idempotencyKey)).limit(1);
  if (existing) {
    if (existing.requestHash !== requestHash) throw conflictError("Idempotency key was already used with another payment");
    const [debtRow] = await db.select().from(debts).where(eq(debts.id, id)).limit(1);
    return debtRow ? { debt: mapDebt(debtRow), record: mapRecord(existing, { [existing.id]: [] }) } : null;
  }
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
        id, type, amount, currency, account_id, category_id, counterparty_name,
        payment_type, payment_status, exchange_rate_to_primary, occurred_at, note,
        is_fixed, debt_id, idempotency_key, request_hash
      )
      SELECT ${recordId}::uuid,
        CASE WHEN direction = 'receivable' THEN 'income'::record_type ELSE 'expense'::record_type END,
        ${decimal(input.amount)}::numeric, currency, ${input.accountId}::uuid, category_id, counterparty_name,
        'transfer'::payment_type, 'cleared'::payment_status, 1, ${new Date(input.occurredAt)},
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
  const values = {
    primaryCurrency: input.primaryCurrency,
    primaryAccountId: input.primaryAccountId ?? null,
    theme: input.theme,
    defaultDashboardPreset: input.defaultDashboardPreset,
    locale: input.locale,
    includeHiddenAccountsInReports: input.includeHiddenAccountsInReports,
    defaultAccountId: input.defaultAccountId ?? null,
    defaultPaymentType: input.defaultCreditCardId
      ? "credit"
      : input.defaultPaymentType,
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
