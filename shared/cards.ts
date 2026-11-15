import { isAfter, parseISO, isBefore } from "date-fns";

import { proportionalMoneyCents, moneyTolerance } from "./money.js";
import { isFinancialRecord } from "./record-status.js";
import { dateKey } from "./dates.js";
import { isCategoryOrDescendant } from "./categories.js";

import type {
  CurrencyCode,
  CreditCardCurrencyAmount,
  CreditCard,
  WalletDataset,
  CreditCardSummary,
  CreditCardStatement,
  CreditCardCategoryUsage,
} from "./types.js";

export function cardCycleDate(year: number, month: number, day: number) {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay), 23, 59, 59, 999));
}

export function aggregateCurrencyAmounts(
  values: Array<{ currency: CurrencyCode; amount: number }>,
): CreditCardCurrencyAmount[] {
  const totals = new Map<CurrencyCode, number>();
  values.forEach(({ currency, amount }) => {
    totals.set(currency, (totals.get(currency) ?? 0) + amount);
  });
  return [...totals.entries()]
    .map(([currency, amount]) => ({ currency, amount: Math.max(0, amount) }))
    .filter((item) => item.amount > 0.000001)
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

export function creditCardCycleDates(card: CreditCard, asOf: Date) {
  const year = asOf.getUTCFullYear();
  const month = asOf.getUTCMonth();
  const closeThisMonth = cardCycleDate(year, month, card.closingDay);
  const currentCycleEnd =
    asOf <= closeThisMonth
      ? closeThisMonth
      : cardCycleDate(
          new Date(Date.UTC(year, month + 1, 1)).getUTCFullYear(),
          new Date(Date.UTC(year, month + 1, 1)).getUTCMonth(),
          card.closingDay,
        );
  const lastClosingDate =
    asOf <= closeThisMonth
      ? cardCycleDate(
          new Date(Date.UTC(year, month - 1, 1)).getUTCFullYear(),
          new Date(Date.UTC(year, month - 1, 1)).getUTCMonth(),
          card.closingDay,
        )
      : closeThisMonth;
  const currentCycleStart = new Date(lastClosingDate.getTime() + 1);
  const dueMonthOffset = card.dueDay > card.closingDay ? 0 : 1;
  const dueMonth = new Date(
    Date.UTC(lastClosingDate.getUTCFullYear(), lastClosingDate.getUTCMonth() + dueMonthOffset, 1),
  );
  const dueDate = cardCycleDate(dueMonth.getUTCFullYear(), dueMonth.getUTCMonth(), card.dueDay);

  return { currentCycleStart, currentCycleEnd, lastClosingDate, dueDate };
}

// Refunds release payment credit for the other purchases on the same statement.
// Reapply the statement's payment pool to net purchases in stable FIFO order.
function creditCardRemainingPurchases(
  movements: Array<{
    id: string;
    kind: "purchase" | "refund";
    originalRecordId?: string;
    statementId?: string;
    amount: number;
    amountInLimitCurrency: number;
    exchangeRateToLimitCurrency: number;
    currency: CurrencyCode;
    occurredAt: string;
  }>,
  payments: WalletDataset["creditCardPayments"],
  allocations: WalletDataset["creditCardPaymentAllocations"],
) {
  const refunds = new Map<string, number>();
  for (const movement of movements)
    if (movement.kind === "refund" && movement.originalRecordId) {
      refunds.set(
        movement.originalRecordId,
        (refunds.get(movement.originalRecordId) ?? 0) + movement.amountInLimitCurrency,
      );
    }
  const pools = new Map<string | undefined, number>();
  for (const payment of payments) {
    const allocated = allocations.filter((allocation) => allocation.paymentId === payment.id);
    const paid =
      allocated.length > 0
        ? allocated.reduce((sum, allocation) => sum + allocation.amountInLimitCurrency, 0)
        : payment.amountInLimitCurrency;
    pools.set(payment.statementId, (pools.get(payment.statementId) ?? 0) + paid);
  }
  return movements
    .filter((movement) => movement.kind === "purchase")
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id))
    .map((purchase) => {
      const net = Math.max(0, purchase.amountInLimitCurrency - (refunds.get(purchase.id) ?? 0));
      const pool = pools.get(purchase.statementId) ?? 0;
      const used = Math.min(net, pool);
      pools.set(purchase.statementId, pool - used);
      return {
        ...purchase,
        paidInLimitCurrency: used,
        remaining: Math.max(0, net - used) / purchase.exchangeRateToLimitCurrency,
      };
    });
}

// Paid refund credit can settle another purchase whose bank debit was reserved
// at creation. Release that purchase's duplicate reserve in its own account.
export function creditCardBankReservationRelease(
  dataset: WalletDataset,
  accountId: string,
  cutoff?: Date,
) {
  const movements = dataset.creditCardRecords.filter(
    (movement) => !cutoff || !isAfter(parseISO(movement.occurredAt), cutoff),
  );
  const payments = dataset.creditCardPayments.filter(
    (payment) => !cutoff || !isAfter(parseISO(payment.occurredAt), cutoff),
  );
  const paymentIds = new Set(payments.map((payment) => payment.id));
  const allocations = dataset.creditCardPaymentAllocations.filter((allocation) =>
    paymentIds.has(allocation.paymentId),
  );
  const historicalPaid = new Map<string, number>();
  for (const allocation of allocations)
    historicalPaid.set(
      allocation.creditCardRecordId,
      (historicalPaid.get(allocation.creditCardRecordId) ?? 0) + allocation.amountInLimitCurrency,
    );
  let released = 0;
  for (const cardId of new Set(movements.map((movement) => movement.creditCardId))) {
    const purchases = creditCardRemainingPurchases(
      movements.filter((movement) => movement.creditCardId === cardId),
      payments.filter((payment) => payment.creditCardId === cardId),
      allocations,
    );
    for (const purchase of purchases) {
      const original = movements.find((movement) => movement.id === purchase.id)!;
      if (
        !original.accountImpactAtCreation ||
        original.accountId !== accountId ||
        original.accountAmount === undefined ||
        original.amountInLimitCurrency <= 0
      )
        continue;
      const bankCents = (limitAmount: number) =>
        proportionalMoneyCents(
          original.accountAmount!,
          limitAmount,
          original.amountInLimitCurrency,
        );
      // Difference of rounded totals preserves the last cent of a partial reserve.
      released +=
        Math.max(
          0,
          bankCents(purchase.paidInLimitCurrency) - bankCents(historicalPaid.get(purchase.id) ?? 0),
        ) / 100;
    }
  }
  return released;
}

export function legacyCardFinancialRecords(dataset: WalletDataset, card: CreditCard) {
  return dataset.records.filter(
    (record) =>
      record.creditCardId === card.id &&
      isFinancialRecord(record) &&
      (record.currency === card.limitCurrency ||
        (record.amountInLimitCurrency !== undefined &&
          Number.isFinite(record.amountInLimitCurrency) &&
          record.amountInLimitCurrency > 0) ||
        (record.exchangeRateToLimitCurrency !== undefined &&
          Number.isFinite(record.exchangeRateToLimitCurrency) &&
          record.exchangeRateToLimitCurrency > 0)),
  );
}

export function cardFinancialMovements(dataset: WalletDataset, card: CreditCard) {
  const linkedWalletIds = new Set(
    dataset.creditCardRecords
      .filter((record) => record.creditCardId === card.id)
      .map((record) => record.walletRecordId),
  );
  const unlinked = legacyCardFinancialRecords(dataset, card)
    .filter((record) => !linkedWalletIds.has(record.id))
    .map((record) => ({
      ...record,
      kind: record.type === "income" ? ("refund" as const) : ("purchase" as const),
      amountInLimitCurrency:
        record.amountInLimitCurrency ?? record.amount * (record.exchangeRateToLimitCurrency ?? 1),
      exchangeRateToLimitCurrency: record.exchangeRateToLimitCurrency ?? 1,
      categoryId: record.categoryId ?? "",
      accountImpactAtCreation: Boolean(record.accountId),
    }));
  return [
    ...dataset.creditCardRecords.filter((record) => record.creditCardId === card.id),
    ...unlinked,
  ];
}

export function calculateCreditCardSummary(
  dataset: WalletDataset,
  card: CreditCard,
  asOf: Date,
): CreditCardSummary {
  const dates = creditCardCycleDates(card, asOf);
  const movements = cardFinancialMovements(dataset, card).filter(
    (record) => record.creditCardId === card.id && !isAfter(parseISO(record.occurredAt), asOf),
  );
  const payments = dataset.creditCardPayments.filter(
    (payment) => payment.creditCardId === card.id && !isAfter(parseISO(payment.occurredAt), asOf),
  );
  const remainingPurchases = creditCardRemainingPurchases(
    movements,
    payments,
    dataset.creditCardPaymentAllocations,
  );
  const unlinkedRefunds = movements.filter(
    (record) =>
      record.kind === "refund" && !("originalRecordId" in record && record.originalRecordId),
  );
  const outstanding = aggregateCurrencyAmounts([
    ...remainingPurchases.map((record) => ({
      currency: record.currency,
      amount: record.remaining,
    })),
    ...unlinkedRefunds.map((record) => ({ currency: record.currency, amount: -record.amount })),
  ]);
  const currentCycle = aggregateCurrencyAmounts(
    movements
      .filter((record) => {
        const occurredAt = parseISO(record.occurredAt);
        return (
          !isBefore(occurredAt, dates.currentCycleStart) &&
          !isAfter(occurredAt, dates.currentCycleEnd)
        );
      })
      .map((record) => ({
        currency: record.currency,
        amount: record.kind === "refund" ? -record.amount : record.amount,
      })),
  );
  const statementDue = aggregateCurrencyAmounts(
    remainingPurchases
      .filter((record) => !isAfter(parseISO(record.occurredAt), dates.lastClosingDate))
      .map((record) => ({ currency: record.currency, amount: record.remaining })),
  );
  const purchaseLimitAmount = movements.reduce(
    (total, record) => total + (record.kind === "refund" ? -1 : 1) * record.amountInLimitCurrency,
    0,
  );
  const paidLimitAmount = payments.reduce(
    (total, payment) => total + payment.amountInLimitCurrency,
    0,
  );
  const usedLimit = Math.max(0, purchaseLimitAmount - paidLimitAmount);
  const availableLimit = card.creditLimit - usedLimit;
  const statementTotal = statementDue.reduce((total, item) => total + item.amount, 0);
  const hasPayments = payments.length > 0;
  const status =
    usedLimit > card.creditLimit
      ? "over_limit"
      : statementTotal > 0 && asOf > dates.dueDate
        ? "overdue"
        : statementTotal > 0 && hasPayments
          ? "partial"
          : "ok";

  return {
    card,
    usedLimit,
    availableLimit,
    utilizationPercent: card.creditLimit > 0 ? (usedLimit / card.creditLimit) * 100 : 0,
    currentCycleStart: dates.currentCycleStart.toISOString().slice(0, 10),
    currentCycleEnd: dateKey(dates.currentCycleEnd),
    lastClosingDate: dateKey(dates.lastClosingDate),
    dueDate: dateKey(dates.dueDate),
    currentCycle,
    outstanding,
    statementDue,
    status,
  };
}

export function calculateCreditCardSummaries(dataset: WalletDataset, asOf: Date) {
  return dataset.creditCards.map((card) => calculateCreditCardSummary(dataset, card, asOf));
}

export function calculateCreditCardStatementBalance(
  dataset: WalletDataset,
  statement: CreditCardStatement,
) {
  const purchases = dataset.creditCardRecords.filter(
    (record) =>
      record.creditCardId === statement.creditCardId &&
      record.statementId === statement.id &&
      record.kind === "purchase",
  );
  const purchaseIds = new Set(purchases.map((record) => record.id));
  const refunds = dataset.creditCardRecords.filter(
    (record) =>
      record.creditCardId === statement.creditCardId &&
      record.kind === "refund" &&
      record.originalRecordId &&
      purchaseIds.has(record.originalRecordId),
  );
  const statementPayments = dataset.creditCardPayments.filter(
    (payment) =>
      payment.creditCardId === statement.creditCardId && payment.statementId === statement.id,
  );
  const purchaseTotal = purchases.reduce(
    (total, record) => total + record.amountInLimitCurrency,
    0,
  );
  const refundTotal = refunds.reduce((total, record) => total + record.amountInLimitCurrency, 0);
  const paidAmountInLimitCurrency = statementPayments.reduce(
    (total, payment) => total + payment.amountInLimitCurrency,
    0,
  );
  const totalAmountInLimitCurrency = Math.max(0, purchaseTotal - refundTotal);

  const currencyBreakdown = aggregateCurrencyAmounts(
    creditCardRemainingPurchases(
      [...purchases, ...refunds],
      statementPayments,
      dataset.creditCardPaymentAllocations,
    ).map((purchase) => ({ currency: purchase.currency, amount: purchase.remaining })),
  );

  return {
    totalAmountInLimitCurrency,
    paidAmountInLimitCurrency,
    dueAmountInLimitCurrency: Math.max(0, totalAmountInLimitCurrency - paidAmountInLimitCurrency),
    currencyBreakdown,
  };
}

export function calculateCreditCardCategoryUsage(
  dataset: WalletDataset,
  card: CreditCard,
  asOf: Date,
): CreditCardCategoryUsage[] {
  const purchases = cardFinancialMovements(dataset, card).filter(
    (record) =>
      record.creditCardId === card.id &&
      record.kind === "purchase" &&
      !isAfter(parseISO(record.occurredAt), asOf),
  );
  const summary = calculateCreditCardSummary(dataset, card, asOf);
  const rootCategories = dataset.categories.filter((category) => !category.parentId);
  const usage = rootCategories.map((category) => ({
    id: category.id,
    name: category.name,
    color: category.color,
    amount: purchases
      .filter(
        (record) =>
          record.categoryId &&
          isCategoryOrDescendant(dataset.categories, record.categoryId, category.id),
      )
      .reduce((total, record) => total + record.amountInLimitCurrency, 0),
  }));
  const categorizedRecordIds = new Set(
    purchases
      .filter((record) =>
        rootCategories.some(
          (category) =>
            record.categoryId &&
            isCategoryOrDescendant(dataset.categories, record.categoryId, category.id),
        ),
      )
      .map((record) => record.id),
  );
  const uncategorizedAmount = purchases
    .filter((record) => !categorizedRecordIds.has(record.id))
    .reduce((total, record) => total + record.amountInLimitCurrency, 0);
  const grossAmount = usage.reduce((total, item) => total + item.amount, 0) + uncategorizedAmount;
  const outstandingShare = grossAmount > 0 ? summary.usedLimit / grossAmount : 0;
  const adjustedUsage = usage.map((item) => ({
    ...item,
    amount: item.amount * outstandingShare,
  }));

  if (uncategorizedAmount > 0) {
    adjustedUsage.push({
      id: "uncategorized",
      name: "Uncategorized",
      color: "#94A3B8",
      amount: uncategorizedAmount * outstandingShare,
    });
  }

  return adjustedUsage.filter((item) => item.amount > 0.000001).sort((a, b) => b.amount - a.amount);
}

export function creditCardStatementStatusAfterPaymentChange(
  total: number,
  paid: number,
  dueAt: string | Date,
  now: Date,
) {
  const remaining = Math.max(0, total - paid);
  if (remaining <= moneyTolerance) return "paid" as const;
  if (new Date(dueAt) < now) return "overdue" as const;
  return paid > moneyTolerance ? ("partial" as const) : ("pending" as const);
}
