import { and, desc, eq, inArray, isNotNull, isNull, lt, ne, sql } from "drizzle-orm";
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
  goalReservations,
  goalTags,
  goals,
  installmentPlans,
  investments,
  merchants,
  records,
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
  categorySchema,
  creditCardRecordSchema,
  creditCardSchema,
  debtSchema,
  recordSchema,
  recurringDebtSchema,
  settingsSchema,
  type AccountPatch,
  type CategoryPatch,
  type CreditCardPatch,
  type CreditCardRecordPatch,
  type DebtPatch,
  type RecordPatch,
  type RecurringDebtPatch,
  type SettingsPatch,
} from "../../shared/schemas.js";
import { conflictError, validationError } from "../api/errors.js";

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
type NewGoal = Omit<Goal, "id">;
type NewGoalReservation = Omit<GoalReservation, "id">;
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
): WalletRecord {
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
  tagIdsByGoal: Record<string, string[]>,
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
    tagIds: tagIdsByGoal[row.id] ?? [],
    accountId: optional(row.accountId),
    note: optional(row.note),
  };
}

function mapGoalReservation(
  row: typeof goalReservations.$inferSelect,
): GoalReservation {
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
    goalRows,
    goalTagRows,
    goalReservationRows,
    budgetRows,
    exchangeRateRows,
    investmentRows,
    debtRows,
    recurringDebtRows,
    installmentPlanRows,
  ] = await Promise.all([
    db.select().from(settings).limit(1),
    db.select().from(accounts).where(isNull(accounts.deletedAt)),
    db.select().from(categories),
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
    db
      .select()
      .from(records)
      .where(isNull(records.deletedAt))
      .orderBy(desc(records.occurredAt)),
    db.select().from(recordTags),
    db.select().from(goals).where(isNull(goals.deletedAt)),
    db.select().from(goalTags),
    db
      .select()
      .from(goalReservations)
      .orderBy(desc(goalReservations.createdAt)),
    db.select().from(budgets),
    db.select().from(exchangeRates).orderBy(desc(exchangeRates.date)),
    db.select().from(investments).orderBy(desc(investments.startedAt)),
    db.select().from(debts),
    db.select().from(recurringDebts).orderBy(desc(recurringDebts.startedAt)),
    db.select().from(installmentPlans),
  ]);

  const tagIdsByRecord = groupIds(recordTagRows, "recordId", "tagId");
  const tagIdsByGoal = groupIds(goalTagRows, "goalId", "tagId");

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
    records: recordRows.map((record) => mapRecord(record, tagIdsByRecord)),
    goals: goalRows.map((goal) => mapGoal(goal, tagIdsByGoal)),
    goalReservations: goalReservationRows.map(mapGoalReservation),
    budgets: budgetRows.map(mapBudget),
    exchangeRates: exchangeRateRows.map(mapExchangeRate),
    investments: investmentRows.map(mapInvestment),
    debts: debtRows.map(mapDebt),
    recurringDebts: recurringDebtRows.map(mapRecurringDebt),
    installmentPlans: installmentPlanRows.map(mapInstallmentPlan),
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
  const cardRows = await db.select().from(creditCards);
  const movementRows = await db
    .select()
    .from(creditCardRecords)
    .where(
      and(
        isNull(creditCardRecords.deletedAt),
        isNull(creditCardRecords.statementId),
      ),
    );
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
    const [original] = await db
      .select()
      .from(creditCardRecords)
      .where(
        and(
          eq(creditCardRecords.id, input.originalRecordId),
          eq(creditCardRecords.creditCardId, creditCardId),
        ),
      )
      .limit(1);
    if (!original) throw new Error("Original movement not found");
    if (
      input.amountInLimitCurrency >
      asNumber(original.amountInLimitCurrency) + 0.005
    ) {
      throw new Error("Refund exceeds original movement");
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
    throw new Error("Payment exceeds statement balance");
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
  if (payment.statementId)
    await db.batch([
      db.delete(creditCardPayments).where(eq(creditCardPayments.id, paymentId)),
      db
        .update(creditCardStatements)
        .set({ status: "partial", paidAt: null, updatedAt: new Date() })
        .where(eq(creditCardStatements.id, payment.statementId)),
    ]);
  else
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
  input: NewTag,
  db: Db = createDb(),
) {
  const [row] = await db
    .update(tags)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(eq(tags.id, id))
    .returning();
  return row ? mapTag(row) : null;
}

export async function deleteTag(id: string, db: Db = createDb()) {
  await db.delete(recordTags).where(eq(recordTags.tagId, id));
  await db.delete(goalTags).where(eq(goalTags.tagId, id));
  await db.update(budgets).set({ tagId: null }).where(eq(budgets.tagId, id));
  const rows = await db.delete(tags).where(eq(tags.id, id)).returning();
  return rows.length > 0;
}

export async function listRecords(
  filters: {
    type?: string;
    accountId?: string;
    creditCardId?: string;
    categoryId?: string;
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

  const rows = await db
    .select()
    .from(records)
    .where(and(...clauses))
    .orderBy(desc(records.occurredAt));
  const recordTagRows = await db.select().from(recordTags);
  const tagIdsByRecord = groupIds(recordTagRows, "recordId", "tagId");

  return rows.map((record) => mapRecord(record, tagIdsByRecord));
}

export async function createRecord(input: NewRecord, db: Db = createDb()) {
  const recordId = randomUUID();
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
  if (input.creditCardId && input.categoryId) {
    const recordInsert = db.insert(records).values(recordValues).returning();
    const cardInsert = db.insert(creditCardRecords).values({
        id: randomUUID(),
        creditCardId: input.creditCardId,
        walletRecordId: recordId,
        kind: input.type === "income" ? "refund" : "purchase",
        amount: decimal(input.amount),
        currency: input.currency,
        amountInLimitCurrency: decimal(
          input.amountInLimitCurrency ?? input.amount,
        ),
        exchangeRateToLimitCurrency: decimal(
          input.exchangeRateToLimitCurrency ?? 1,
        ),
        categoryId: input.categoryId,
        counterpartyName: input.counterpartyName ?? null,
        note: input.note ?? null,
        accountId: input.accountId ?? null,
        accountAmount: input.accountId
          ? decimal(input.accountAmount ?? input.amount)
          : null,
        accountImpactAtCreation: Boolean(input.accountId),
        occurredAt: new Date(input.occurredAt),
      });
    const [recordResult] = input.tagIds.length
      ? await db.batch([recordInsert, cardInsert, db.insert(recordTags).values(input.tagIds.map((tagId) => ({ recordId, tagId })))])
      : await db.batch([recordInsert, cardInsert]);
    const row = recordResult[0];
    return mapRecord(row, { [row.id]: input.tagIds });
  }
  const recordInsert = db.insert(records).values(recordValues).returning();
  const [rows] = input.tagIds.length
    ? await db.batch([recordInsert, db.insert(recordTags).values(input.tagIds.map((tagId) => ({ recordId, tagId })))])
    : await db.batch([recordInsert]);
  const row = rows[0];
  return mapRecord(row, { [row.id]: input.tagIds });
}

export async function updateRecord(
  id: string,
  input: RecordPatch,
  db: Db = createDb(),
) {
  const [[linked], [existingRecord], existingTagRows] = await Promise.all([
    db
      .select()
      .from(creditCardRecords)
      .where(eq(creditCardRecords.walletRecordId, id))
      .limit(1),
    db.select().from(records).where(eq(records.id, id)).limit(1),
    db.select().from(recordTags).where(eq(recordTags.recordId, id)),
  ]);
  if (!existingRecord) return null;
  const current = mapRecord(existingRecord, { [id]: existingTagRows.map((item) => item.tagId) });
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
  const [rows] = sideQueries.length
    ? await db.batch([recordUpdate, ...sideQueries] as unknown as Parameters<Db["batch"]>[0])
    : await db.batch([recordUpdate]);
  const row = rows[0];
  return mapRecord(row, { [id]: merged.tagIds });
}

export async function deleteRecord(id: string, db: Db = createDb()) {
  const now = new Date();
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
  ]);
  const row = recordResult[0];
  return Boolean(row);
}

async function replaceGoalTags(goalId: string, tagIds: string[], db: Db) {
  await db.delete(goalTags).where(eq(goalTags.goalId, goalId));
  if (tagIds.length > 0) {
    await db.insert(goalTags).values(
      tagIds.map((tagId) => ({
        goalId,
        tagId,
      })),
    );
  }
}

export async function listGoals(db: Db = createDb()) {
  const rows = await db.select().from(goals).where(isNull(goals.deletedAt));
  const goalTagRows = await db.select().from(goalTags);
  const tagIdsByGoal = groupIds(goalTagRows, "goalId", "tagId");
  return rows.map((goal) => mapGoal(goal, tagIdsByGoal));
}

export async function createGoal(input: NewGoal, db: Db = createDb()) {
  const [row] = await db
    .insert(goals)
    .values({
      name: input.name,
      targetAmount: decimal(input.targetAmount),
      currency: input.currency,
      color: input.color,
      icon: input.icon,
      isVisible: input.isVisible,
      deadline: toDate(input.deadline),
      status: input.status,
      accountId: input.accountId ?? null,
      note: input.note ?? null,
    })
    .returning();
  await replaceGoalTags(row.id, input.tagIds, db);
  return mapGoal(row, { [row.id]: input.tagIds });
}

export async function updateGoal(
  id: string,
  input: NewGoal,
  db: Db = createDb(),
) {
  const [row] = await db
    .update(goals)
    .set({
      name: input.name,
      targetAmount: decimal(input.targetAmount),
      currency: input.currency,
      color: input.color,
      icon: input.icon,
      isVisible: input.isVisible,
      deadline: toDate(input.deadline),
      status: input.status,
      accountId: input.accountId ?? null,
      note: input.note ?? null,
      updatedAt: new Date(),
    })
    .where(eq(goals.id, id))
    .returning();

  if (!row) return null;
  await replaceGoalTags(id, input.tagIds, db);
  return mapGoal(row, { [id]: input.tagIds });
}

export async function deleteGoal(id: string, db: Db = createDb()) {
  await db.delete(goalTags).where(eq(goalTags.goalId, id));
  await db.delete(goalReservations).where(eq(goalReservations.goalId, id));
  await db.update(budgets).set({ goalId: null }).where(eq(budgets.goalId, id));
  const [row] = await db
    .update(goals)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(goals.id, id))
    .returning();
  return Boolean(row);
}

export async function createGoalReservation(
  input: NewGoalReservation,
  db: Db = createDb(),
) {
  const [row] = await db
    .insert(goalReservations)
    .values({
      goalId: input.goalId,
      accountId: input.accountId,
      amount: decimal(input.amount),
      currency: input.currency,
      createdAt: new Date(input.createdAt),
      note: input.note ?? null,
    })
    .returning();
  return mapGoalReservation(row);
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
  input: NewInvestment,
  db: Db = createDb(),
) {
  const [row] = await db
    .update(investments)
    .set({
      name: input.name,
      type: input.type,
      amountInvested: decimal(input.amountInvested),
      currentValue: decimal(input.currentValue),
      currency: input.currency,
      isVisible: input.isVisible,
      startedAt: new Date(input.startedAt ?? new Date().toISOString()),
      note: input.note ?? null,
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
