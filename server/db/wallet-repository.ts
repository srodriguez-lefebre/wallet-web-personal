import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { createDb, type DbClient } from "./client";
import {
  accounts,
  budgets,
  categories,
  debts,
  exchangeRates,
  goalReservations,
  goalTags,
  goals,
  installmentPlans,
  investments,
  records,
  recordTags,
  settings,
  tags,
} from "./schema";
import type {
  Account,
  Budget,
  Category,
  Debt,
  ExchangeRate,
  Goal,
  GoalReservation,
  InstallmentPlan,
  Investment,
  Tag,
  WalletDataset,
  WalletRecord,
  WalletSettings,
} from "@shared/types";

type Db = DbClient;
type NewAccount = Omit<Account, "id">;
type NewCategory = Omit<Category, "id">;
type NewTag = Omit<Tag, "id">;
type NewRecord = Omit<WalletRecord, "id">;
type NewGoal = Omit<Goal, "id">;
type NewGoalReservation = Omit<GoalReservation, "id">;
type NewInvestment = Omit<Investment, "id">;

function asNumber(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

function optional<T>(value: T | null | undefined) {
  return value ?? undefined;
}

function asIso(value: Date | string | null | undefined) {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function asRequiredIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toDate(value: string | undefined) {
  return value ? new Date(value) : null;
}

function decimal(value: number) {
  return String(value);
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
    accountId: row.accountId,
    destinationAccountId: optional(row.destinationAccountId),
    categoryId: optional(row.categoryId),
    counterpartyName: optional(row.counterpartyName),
    tagIds: tagIdsByRecord[row.id] ?? [],
    paymentType: row.paymentType,
    paymentStatus: row.paymentStatus,
    exchangeRateToPrimary: asNumber(row.exchangeRateToPrimary),
    occurredAt: asRequiredIso(row.occurredAt),
    note: optional(row.note),
    isFixed: row.isFixed,
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
    originalAmount: asNumber(row.originalAmount),
    pendingAmount: asNumber(row.pendingAmount),
    currency: row.currency as Debt["currency"],
    counterpartyName: optional(row.counterpartyName),
    accountId: optional(row.accountId),
    status: row.status,
    startedAt: asRequiredIso(row.startedAt),
    dueAt: asIso(row.dueAt),
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

function mapSettings(row: typeof settings.$inferSelect | undefined): WalletSettings {
  return {
    primaryCurrency: (row?.primaryCurrency ?? "UYU") as WalletSettings["primaryCurrency"],
    primaryAccountId: optional(row?.primaryAccountId),
    theme: (row?.theme ?? "light") as WalletSettings["theme"],
    defaultDashboardPreset: (row?.defaultDashboardPreset ??
      "general") as WalletSettings["defaultDashboardPreset"],
    locale: "es-UY",
    includeHiddenAccountsInReports: row?.includeHiddenAccountsInReports ?? false,
  };
}

export async function getWalletDataset(db: Db = createDb()): Promise<WalletDataset> {
  const [
    settingsRows,
    accountRows,
    categoryRows,
    tagRows,
    recordRows,
    recordTagRows,
    goalRows,
    goalTagRows,
    goalReservationRows,
    budgetRows,
    exchangeRateRows,
    investmentRows,
    debtRows,
    installmentPlanRows,
  ] = await Promise.all([
    db.select().from(settings).limit(1),
    db.select().from(accounts).where(isNull(accounts.deletedAt)),
    db.select().from(categories),
    db.select().from(tags),
    db
      .select()
      .from(records)
      .where(isNull(records.deletedAt))
      .orderBy(desc(records.occurredAt)),
    db.select().from(recordTags),
    db.select().from(goals).where(isNull(goals.deletedAt)),
    db.select().from(goalTags),
    db.select().from(goalReservations).orderBy(desc(goalReservations.createdAt)),
    db.select().from(budgets),
    db.select().from(exchangeRates).orderBy(desc(exchangeRates.date)),
    db.select().from(investments).orderBy(desc(investments.startedAt)),
    db.select().from(debts),
    db.select().from(installmentPlans),
  ]);

  const tagIdsByRecord = groupIds(recordTagRows, "recordId", "tagId");
  const tagIdsByGoal = groupIds(goalTagRows, "goalId", "tagId");

  return {
    settings: mapSettings(settingsRows[0]),
    accounts: accountRows.map(mapAccount),
    categories: categoryRows.map(mapCategory),
    tags: tagRows.map(mapTag),
    records: recordRows.map((record) => mapRecord(record, tagIdsByRecord)),
    goals: goalRows.map((goal) => mapGoal(goal, tagIdsByGoal)),
    goalReservations: goalReservationRows.map(mapGoalReservation),
    budgets: budgetRows.map(mapBudget),
    exchangeRates: exchangeRateRows.map(mapExchangeRate),
    investments: investmentRows.map(mapInvestment),
    debts: debtRows.map(mapDebt),
    installmentPlans: installmentPlanRows.map(mapInstallmentPlan),
  };
}

export async function listAccounts(db: Db = createDb()) {
  const rows = await db.select().from(accounts).where(isNull(accounts.deletedAt));
  return rows.map(mapAccount);
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
  input: NewAccount,
  db: Db = createDb(),
) {
  const [row] = await db
    .update(accounts)
    .set({
      ...input,
      initialBalance: decimal(input.initialBalance),
      updatedAt: new Date(),
    })
    .where(eq(accounts.id, id))
    .returning();
  return row ? mapAccount(row) : null;
}

export async function deleteAccount(id: string, db: Db = createDb()) {
  await db
    .update(records)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        isNull(records.deletedAt),
        or(eq(records.accountId, id), eq(records.destinationAccountId, id)),
      ),
    );
  await db.update(goals).set({ accountId: null }).where(eq(goals.accountId, id));
  await db.update(budgets).set({ accountId: null }).where(eq(budgets.accountId, id));
  await db.update(debts).set({ accountId: null }).where(eq(debts.accountId, id));
  await db.delete(goalReservations).where(eq(goalReservations.accountId, id));
  await db.delete(installmentPlans).where(eq(installmentPlans.accountId, id));

  const [row] = await db
    .update(accounts)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(accounts.id, id))
    .returning();
  return Boolean(row);
}

export async function listCategories(db: Db = createDb()) {
  const rows = await db.select().from(categories);
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
  input: NewCategory,
  db: Db = createDb(),
) {
  const [row] = await db
    .update(categories)
    .set({
      ...input,
      parentId: input.parentId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(categories.id, id))
    .returning();
  return row ? mapCategory(row) : null;
}

async function categoryTreeIds(id: string, db: Db) {
  const rows = await db.select().from(categories);
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
  await db.update(records).set({ categoryId: null }).where(inArray(records.categoryId, ids));
  await db.update(budgets).set({ categoryId: null }).where(inArray(budgets.categoryId, ids));
  await db.delete(installmentPlans).where(inArray(installmentPlans.categoryId, ids));

  for (const categoryId of ids.reverse()) {
    await db.delete(categories).where(eq(categories.id, categoryId));
  }

  return true;
}

export async function listTags(db: Db = createDb()) {
  const rows = await db.select().from(tags);
  return rows.map(mapTag);
}

export async function createTag(input: NewTag, db: Db = createDb()) {
  const [row] = await db.insert(tags).values(input).returning();
  return mapTag(row);
}

export async function updateTag(id: string, input: NewTag, db: Db = createDb()) {
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
  filters: { type?: string; accountId?: string; categoryId?: string } = {},
  db: Db = createDb(),
) {
  const clauses = [isNull(records.deletedAt)];
  if (filters.type && filters.type !== "all") {
    clauses.push(eq(records.type, filters.type as WalletRecord["type"]));
  }
  if (filters.accountId) clauses.push(eq(records.accountId, filters.accountId));
  if (filters.categoryId) clauses.push(eq(records.categoryId, filters.categoryId));

  const rows = await db
    .select()
    .from(records)
    .where(and(...clauses))
    .orderBy(desc(records.occurredAt));
  const recordTagRows = await db.select().from(recordTags);
  const tagIdsByRecord = groupIds(recordTagRows, "recordId", "tagId");

  return rows.map((record) => mapRecord(record, tagIdsByRecord));
}

async function replaceRecordTags(recordId: string, tagIds: string[], db: Db) {
  await db.delete(recordTags).where(eq(recordTags.recordId, recordId));
  if (tagIds.length > 0) {
    await db.insert(recordTags).values(
      tagIds.map((tagId) => ({
        recordId,
        tagId,
      })),
    );
  }
}

export async function createRecord(input: NewRecord, db: Db = createDb()) {
  const [row] = await db
    .insert(records)
    .values({
      type: input.type,
      amount: decimal(input.amount),
      currency: input.currency,
      accountId: input.accountId,
      destinationAccountId: input.destinationAccountId ?? null,
      categoryId: input.categoryId ?? null,
      counterpartyName: input.counterpartyName ?? null,
      paymentType: input.paymentType,
      paymentStatus: input.paymentStatus,
      exchangeRateToPrimary: decimal(input.exchangeRateToPrimary),
      occurredAt: new Date(input.occurredAt),
      note: input.note ?? null,
      isFixed: input.isFixed ?? false,
    })
    .returning();
  await replaceRecordTags(row.id, input.tagIds, db);
  return mapRecord(row, { [row.id]: input.tagIds });
}

export async function updateRecord(
  id: string,
  input: NewRecord,
  db: Db = createDb(),
) {
  const [row] = await db
    .update(records)
    .set({
      type: input.type,
      amount: decimal(input.amount),
      currency: input.currency,
      accountId: input.accountId,
      destinationAccountId: input.destinationAccountId ?? null,
      categoryId: input.categoryId ?? null,
      counterpartyName: input.counterpartyName ?? null,
      paymentType: input.paymentType,
      paymentStatus: input.paymentStatus,
      exchangeRateToPrimary: decimal(input.exchangeRateToPrimary),
      occurredAt: new Date(input.occurredAt),
      note: input.note ?? null,
      isFixed: input.isFixed ?? false,
      updatedAt: new Date(),
    })
    .where(eq(records.id, id))
    .returning();

  if (!row) return null;
  await replaceRecordTags(id, input.tagIds, db);
  return mapRecord(row, { [id]: input.tagIds });
}

export async function deleteRecord(id: string, db: Db = createDb()) {
  const [row] = await db
    .update(records)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(records.id, id))
    .returning();
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

export async function updateGoal(id: string, input: NewGoal, db: Db = createDb()) {
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
  const rows = await db.select().from(investments).orderBy(desc(investments.startedAt));
  return rows.map(mapInvestment);
}

export async function createInvestment(input: NewInvestment, db: Db = createDb()) {
  const [row] = await db
    .insert(investments)
    .values({
      name: input.name,
      type: input.type,
      amountInvested: decimal(input.amountInvested),
      currentValue: decimal(input.currentValue),
      currency: input.currency,
      isVisible: input.isVisible,
      startedAt: new Date(input.startedAt),
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
      startedAt: new Date(input.startedAt),
      note: input.note ?? null,
      updatedAt: new Date(),
    })
    .where(eq(investments.id, id))
    .returning();
  return row ? mapInvestment(row) : null;
}

export async function deleteInvestment(id: string, db: Db = createDb()) {
  const rows = await db.delete(investments).where(eq(investments.id, id)).returning();
  return rows.length > 0;
}

export async function getSettings(db: Db = createDb()) {
  const rows = await db.select().from(settings).limit(1);
  return mapSettings(rows[0]);
}

export async function upsertSettings(input: WalletSettings, db: Db = createDb()) {
  const existing = await db.select().from(settings).limit(1);
  const values = {
    primaryCurrency: input.primaryCurrency,
    primaryAccountId: input.primaryAccountId ?? null,
    theme: input.theme,
    defaultDashboardPreset: input.defaultDashboardPreset,
    locale: input.locale,
    includeHiddenAccountsInReports: input.includeHiddenAccountsInReports,
    updatedAt: new Date(),
  };

  const [row] =
    existing.length > 0
      ? await db.update(settings).set(values).where(eq(settings.id, existing[0].id)).returning()
      : await db.insert(settings).values(values).returning();

  return mapSettings(row);
}
