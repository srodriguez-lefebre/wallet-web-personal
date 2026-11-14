import { splitImportNote } from "../../shared/record-review.js";
import {
  accounts,
  budgets,
  categories,
  creditCardPaymentAllocations,
  creditCardPayments,
  creditCardRecords,
  creditCardStatements,
  creditCards,
  debts,
  exchangeRates,
  goalReservationMovements,
  goals,
  installmentPlans,
  investments,
  recordGoals,
  recordTemplates,
  records,
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
  GoalReservationMovement,
  InstallmentPlan,
  Investment,
  RecordGoalAssociation,
  RecordTemplate,
  RecurringDebt,
  Tag,
  WalletRecord,
  WalletSettings,
} from "../../shared/types.js";

export function asNumber(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

export function nullToUndefined<T>(value: T | null | undefined) {
  return value ?? undefined;
}

export function asIso(value: Date | string | null | undefined) {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function asRequiredIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function toDate(value: string | undefined) {
  return value ? new Date(value) : null;
}

export function toNumeric(value: number) {
  return String(value);
}

export function groupIds<
  T extends {
    [key: string]: string;
  },
>(rows: T[], key: keyof T, value: keyof T) {
  return rows.reduce<Record<string, string[]>>((groups, row) => {
    const groupKey = row[key];
    const groupValue = row[value];
    if (groupKey === undefined || groupValue === undefined) throw new Error("Missing relation key");
    groups[groupKey] = [...(groups[groupKey] ?? []), groupValue];
    return groups;
  }, {});
}

export function mapAccount(row: typeof accounts.$inferSelect | undefined): Account {
  if (!row) throw new Error("Database mutation returned no row");
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
    note: nullToUndefined(row.note),
  };
}

export function mapCategory(row: typeof categories.$inferSelect | undefined): Category {
  if (!row) throw new Error("Database mutation returned no row");
  return {
    id: row.id,
    name: row.name,
    parentId: nullToUndefined(row.parentId),
    color: row.color,
    icon: row.icon,
    systemKey: nullToUndefined(row.systemKey),
  };
}

export function mapTag(row: typeof tags.$inferSelect | undefined): Tag {
  if (!row) throw new Error("Database mutation returned no row");
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    isActive: row.isActive,
  };
}

export function mapRecordTemplate(
  row: typeof recordTemplates.$inferSelect | undefined,
): RecordTemplate {
  if (!row) throw new Error("Database mutation returned no row");
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    amount: asNumber(row.amount),
    currency: row.currency as RecordTemplate["currency"],
    paymentType: row.paymentType,
    accountId: nullToUndefined(row.accountId),
    creditCardId: nullToUndefined(row.creditCardId),
    destinationAccountId: nullToUndefined(row.destinationAccountId),
    categoryId: nullToUndefined(row.categoryId),
    tagId: nullToUndefined(row.tagId),
    counterpartyName: nullToUndefined(row.counterpartyName),
    note: nullToUndefined(row.note),
  };
}

export function mapRecord(
  row: typeof records.$inferSelect | undefined,
  tagIdsByRecord: Record<string, string[]>,
  goalAssociationsByRecord: Record<string, RecordGoalAssociation[]> = {},
): WalletRecord {
  if (!row) throw new Error("Database mutation returned no row");
  const goalAssociations = goalAssociationsByRecord[row.id] ?? [];
  const legacy = splitImportNote(nullToUndefined(row.note));
  const importHistory = [...new Set([...(row.importHistory ?? []), ...legacy.history])];
  return {
    id: row.id,
    type: row.type,
    amount: asNumber(row.amount),
    currency: row.currency as WalletRecord["currency"],
    accountId: nullToUndefined(row.accountId),
    accountAmount: row.accountAmount === null ? undefined : asNumber(row.accountAmount),
    creditCardId: nullToUndefined(row.creditCardId),
    destinationAccountId: nullToUndefined(row.destinationAccountId),
    destinationAmount: row.destinationAmount === null ? undefined : asNumber(row.destinationAmount),
    categoryId: nullToUndefined(row.categoryId),
    counterpartyName: nullToUndefined(row.counterpartyName),
    tagIds: tagIdsByRecord[row.id] ?? [],
    goalIds: goalAssociations.map((association) => association.goalId),
    goalAssociations,
    paymentType: row.paymentType,
    paymentStatus: row.paymentStatus,
    exchangeRateToPrimary: asNumber(row.exchangeRateToPrimary),
    amountInLimitCurrency:
      row.amountInLimitCurrency === null ? undefined : asNumber(row.amountInLimitCurrency),
    exchangeRateToLimitCurrency:
      row.exchangeRateToLimitCurrency === null
        ? undefined
        : asNumber(row.exchangeRateToLimitCurrency),
    occurredAt: asRequiredIso(row.occurredAt),
    note: legacy.note,
    createdAt: asIso(row.createdAt),
    updatedAt: asIso(row.updatedAt),
    importMerchant: nullToUndefined(row.importMerchant),
    importHistory: importHistory.length ? importHistory : undefined,
    merchantCorrection: nullToUndefined(row.merchantCorrection),
    isFixed: row.isFixed,
    debtId: nullToUndefined(row.debtId),
  };
}

export function mapCreditCard(row: typeof creditCards.$inferSelect | undefined): CreditCard {
  if (!row) throw new Error("Database mutation returned no row");
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
    note: nullToUndefined(row.note),
  };
}

export function mapCreditCardPayment(
  row: typeof creditCardPayments.$inferSelect | undefined,
): CreditCardPayment {
  if (!row) throw new Error("Database mutation returned no row");
  return {
    id: row.id,
    creditCardId: row.creditCardId,
    idempotencyKey: nullToUndefined(row.idempotencyKey),
    statementId: nullToUndefined(row.statementId),
    amount: asNumber(row.amount),
    currency: row.currency as CreditCardPayment["currency"],
    amountInLimitCurrency: asNumber(row.amountInLimitCurrency),
    accountId: nullToUndefined(row.accountId),
    accountAmount: row.accountAmount === null ? undefined : asNumber(row.accountAmount),
    occurredAt: asRequiredIso(row.occurredAt),
    note: nullToUndefined(row.note),
  };
}

export function mapCreditCardRecord(
  row: typeof creditCardRecords.$inferSelect | undefined,
): CreditCardRecord {
  if (!row) throw new Error("Database mutation returned no row");
  return {
    id: row.id,
    creditCardId: row.creditCardId,
    walletRecordId: nullToUndefined(row.walletRecordId),
    originalRecordId: nullToUndefined(row.originalRecordId),
    statementId: nullToUndefined(row.statementId),
    kind: row.kind as CreditCardRecord["kind"],
    amount: asNumber(row.amount),
    currency: row.currency as CreditCardRecord["currency"],
    amountInLimitCurrency: asNumber(row.amountInLimitCurrency),
    exchangeRateToLimitCurrency: asNumber(row.exchangeRateToLimitCurrency),
    categoryId: row.categoryId,
    counterpartyName: nullToUndefined(row.counterpartyName),
    note: nullToUndefined(row.note),
    accountId: nullToUndefined(row.accountId),
    accountAmount: row.accountAmount === null ? undefined : asNumber(row.accountAmount),
    accountImpactAtCreation: row.accountImpactAtCreation,
    occurredAt: asRequiredIso(row.occurredAt),
  };
}

export function mapCreditCardStatement(
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

export function mapCreditCardPaymentAllocation(
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

export function mapGoal(row: typeof goals.$inferSelect | undefined, tagIds: string[] = []): Goal {
  if (!row) throw new Error("Database mutation returned no row");
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
    accountId: nullToUndefined(row.accountId),
    autoCaptureEnabled: row.autoCaptureEnabled,
    autoCaptureStart: nullToUndefined(row.autoCaptureStart),
    autoCaptureEnd: nullToUndefined(row.autoCaptureEnd),
    autoReservationAccountId: nullToUndefined(row.autoReservationAccountId),
    note: nullToUndefined(row.note),
  };
}

export function mapGoalReservationMovement(
  row: typeof goalReservationMovements.$inferSelect,
): GoalReservationMovement {
  return {
    id: row.id,
    goalId: row.goalId,
    accountId: row.accountId,
    type: row.type as GoalReservationMovement["type"],
    amount: asNumber(row.amount),
    currency: row.currency as GoalReservationMovement["currency"],
    recordId: nullToUndefined(row.recordId),
    reversesMovementId: nullToUndefined(row.reversesMovementId),
    note: nullToUndefined(row.note),
    createdAt: asRequiredIso(row.createdAt),
  };
}

export function groupGoalAssociations(rows: Array<typeof recordGoals.$inferSelect>) {
  return rows.reduce<Record<string, RecordGoalAssociation[]>>((groups, row) => {
    groups[row.recordId] = [
      ...(groups[row.recordId] ?? []),
      {
        goalId: row.goalId,
        assignmentSource: row.assignmentSource as RecordGoalAssociation["assignmentSource"],
        useReserved: row.useReserved,
        reserveIncome: row.reserveIncome,
        allocatedAmount: row.allocatedAmount === null ? undefined : asNumber(row.allocatedAmount),
      },
    ];
    return groups;
  }, {});
}

export function mapBudget(row: typeof budgets.$inferSelect | undefined): Budget {
  if (!row) throw new Error("Database mutation returned no row");
  return {
    id: row.id,
    name: row.name,
    limitAmount: asNumber(row.limitAmount),
    currency: row.currency as Budget["currency"],
    period: "monthly",
    categoryId: nullToUndefined(row.categoryId),
    tagId: nullToUndefined(row.tagId),
    accountId: nullToUndefined(row.accountId),
    goalId: nullToUndefined(row.goalId),
    color: row.color,
    isActive: row.isActive,
  };
}

export function mapExchangeRate(row: typeof exchangeRates.$inferSelect | undefined): ExchangeRate {
  if (!row) throw new Error("Database mutation returned no row");
  return {
    id: row.id,
    fromCurrency: row.fromCurrency as ExchangeRate["fromCurrency"],
    toCurrency: row.toCurrency as ExchangeRate["toCurrency"],
    rate: asNumber(row.rate),
    date: asRequiredIso(row.date),
    source: row.source,
  };
}

export function mapInvestment(row: typeof investments.$inferSelect | undefined): Investment {
  if (!row) throw new Error("Database mutation returned no row");
  return {
    id: row.id,
    name: row.name,
    type: row.type as Investment["type"],
    amountInvested: asNumber(row.amountInvested),
    currentValue: asNumber(row.currentValue),
    currency: row.currency as Investment["currency"],
    isVisible: row.isVisible,
    startedAt: asRequiredIso(row.startedAt),
    note: nullToUndefined(row.note),
  };
}

export function mapDebt(row: typeof debts.$inferSelect | undefined): Debt {
  if (!row) throw new Error("Database mutation returned no row");
  return {
    id: row.id,
    name: row.name,
    direction: row.direction as Debt["direction"],
    originalAmount: row.originalAmount === null ? undefined : asNumber(row.originalAmount),
    pendingAmount: row.pendingAmount === null ? undefined : asNumber(row.pendingAmount),
    currency: row.currency as Debt["currency"],
    counterpartyName: row.counterpartyName,
    accountId: nullToUndefined(row.accountId),
    categoryId: row.categoryId,
    status: row.status,
    isVisible: row.isVisible,
    startedAt: asRequiredIso(row.startedAt),
    dueAt: asIso(row.dueAt),
    note: nullToUndefined(row.note),
    recurringDebtId: nullToUndefined(row.recurringDebtId),
    recurringMonth: nullToUndefined(row.recurringMonth),
  };
}

export function mapRecurringDebt(
  row: typeof recurringDebts.$inferSelect | undefined,
): RecurringDebt {
  if (!row) throw new Error("Database mutation returned no row");
  return {
    id: row.id,
    name: row.name,
    direction: row.direction as RecurringDebt["direction"],
    amount: row.amount === null ? undefined : asNumber(row.amount),
    currency: row.currency as RecurringDebt["currency"],
    counterpartyName: row.counterpartyName,
    accountId: nullToUndefined(row.accountId),
    categoryId: row.categoryId,
    dayOfMonth: asNumber(row.dayOfMonth),
    isActive: row.isActive,
    startedAt: asRequiredIso(row.startedAt),
    note: nullToUndefined(row.note),
  };
}

export function mapInstallmentPlan(
  row: typeof installmentPlans.$inferSelect | undefined,
): InstallmentPlan {
  if (!row) throw new Error("Database mutation returned no row");
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
    note: nullToUndefined(row.note),
  };
}

export function mapSettings(row: typeof settings.$inferSelect | undefined): WalletSettings {
  return {
    primaryCurrency: (row?.primaryCurrency ?? "UYU") as WalletSettings["primaryCurrency"],
    primaryAccountId: nullToUndefined(row?.primaryAccountId),
    theme: (row?.theme ?? "light") as WalletSettings["theme"],
    defaultDashboardPreset: (row?.defaultDashboardPreset ??
      "general") as WalletSettings["defaultDashboardPreset"],
    locale: "es-UY",
    includeHiddenAccountsInReports: row?.includeHiddenAccountsInReports ?? false,
    defaultAccountId: nullToUndefined(row?.defaultAccountId ?? row?.primaryAccountId),
    defaultPaymentType: row?.defaultPaymentType ?? "debit",
    defaultCreditCardId: nullToUndefined(row?.defaultCreditCardId),
    defaultPaymentStatus: row?.defaultPaymentStatus ?? "cleared",
    reviewSeenThrough: asIso(row?.reviewSeenThrough),
  };
}
