import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfDay,
  endOfMonth,
  format,
  isAfter,
  isBefore,
  parseISO,
  startOfDay,
} from "date-fns";
import type {
  Account,
  AccountBalance,
  AnalyticsSummary,
  Budget,
  BudgetProgress,
  Category,
  CreditCard,
  CreditCardCategoryUsage,
  CreditCardCurrencyAmount,
  CreditCardStatement,
  CreditCardSummary,
  CurrencyCode,
  DateRange,
  Debt,
  GoalProgress,
  RecurringDebt,
  VisibleDebtSummary,
  WalletDataset,
  WalletRecord,
} from "./types.js";

export function toPrimaryCurrency(amount: number, recordRate = 1) {
  return amount * recordRate;
}

export function formatMoney(
  amount: number,
  currency: CurrencyCode,
  locale = "es-UY",
) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function monthKey(date: string | Date) {
  return format(typeof date === "string" ? parseISO(date) : date, "yyyy-MM");
}

export function dateKey(date: string | Date) {
  return format(typeof date === "string" ? parseISO(date) : date, "yyyy-MM-dd");
}

export function dateRangeForMonth(month: string): DateRange {
  const date = parseISO(`${month}-15T12:00:00.000Z`);

  return {
    from: format(date, "yyyy-MM-01"),
    to: format(endOfMonth(date), "yyyy-MM-dd"),
  };
}

export function availableMonthKeys(records: WalletRecord[]) {
  return [
    ...new Set(records.map((record) => monthKey(record.occurredAt))),
  ].sort((a, b) => b.localeCompare(a));
}

export function recentMonthKeys(
  records: WalletRecord[],
  fallbackMonth: string,
  limit = 6,
) {
  const months = availableMonthKeys(records);
  return (months.length > 0 ? months : [fallbackMonth]).slice(0, limit);
}

export function relativeMonthKeys(month: string, count = 3) {
  const start = parseISO(`${month}-15T12:00:00.000Z`);

  return Array.from({ length: count }, (_, index) =>
    format(addMonths(start, index - count + 1), "yyyy-MM"),
  );
}

export function relativeDateRanges(range: DateRange, count = 3): DateRange[] {
  const from = parseISO(`${range.from}T12:00:00.000Z`);
  const to = parseISO(`${range.to}T12:00:00.000Z`);
  const days = Math.max(1, differenceInCalendarDays(to, from) + 1);

  return Array.from({ length: count }, (_, index) => {
    const offset = (index - count + 1) * days;

    return {
      from: format(addDays(from, offset), "yyyy-MM-dd"),
      to: format(addDays(to, offset), "yyyy-MM-dd"),
    };
  });
}

export function recordsForMonth(records: WalletRecord[], month: string) {
  return records.filter((record) => monthKey(record.occurredAt) === month);
}

export function recordsForDateRange(records: WalletRecord[], range: DateRange) {
  const from = startOfDay(parseISO(`${range.from}T12:00:00.000Z`));
  const to = endOfDay(parseISO(`${range.to}T12:00:00.000Z`));

  return records.filter((record) => {
    const date = parseISO(record.occurredAt);
    return !isBefore(date, from) && !isAfter(date, to);
  });
}

export function dateKeysForRange(range: DateRange) {
  const from = parseISO(`${range.from}T12:00:00.000Z`);
  const to = parseISO(`${range.to}T12:00:00.000Z`);
  const days = Math.max(1, differenceInCalendarDays(to, from) + 1);

  return Array.from({ length: days }, (_, index) =>
    format(addDays(from, index), "yyyy-MM-dd"),
  );
}

export function isRecordInRange(
  record: WalletRecord,
  from?: string,
  to?: string,
) {
  const date = parseISO(record.occurredAt);
  const afterFrom = from ? !isBefore(date, parseISO(from)) : true;
  const beforeTo = to ? !isAfter(date, parseISO(to)) : true;
  return afterFrom && beforeTo;
}

export function calculateAccountBalances(
  dataset: WalletDataset,
): AccountBalance[] {
  return dataset.accounts.map((account) => {
    const recordBalance = dataset.records.reduce((total, record) => {
      if (record.paymentStatus === "cancelled") return total;

      if (record.type === "income" && record.accountId === account.id) {
        return total + (record.accountAmount ?? record.amount);
      }

      if (record.type === "expense" && record.accountId === account.id) {
        return total - (record.accountAmount ?? record.amount);
      }

      if (record.type === "transfer") {
        if (record.accountId === account.id) return total - record.amount;
        if (record.destinationAccountId === account.id)
          return total + record.amount;
      }

      return total;
    }, account.initialBalance);

    const directCardBalance = dataset.creditCardRecords.reduce((total, movement) => {
      if (movement.walletRecordId || !movement.accountImpactAtCreation || movement.accountId !== account.id || movement.accountAmount === undefined) return total;
      return total + (movement.kind === "refund" ? movement.accountAmount : -movement.accountAmount);
    }, recordBalance);

    const totalBalance = dataset.creditCardPayments.reduce((total, payment) => {
      if (
        payment.accountId !== account.id ||
        payment.accountAmount === undefined
      ) {
        return total;
      }
      return total - payment.accountAmount;
    }, directCardBalance);

    const reserved = dataset.goalReservations
      .filter((reservation) => reservation.accountId === account.id)
      .reduce((total, reservation) => total + reservation.amount, 0);
    const freeBalance = totalBalance - reserved;

    const balanceInPrimary = convertAccountBalanceToPrimary(
      account,
      freeBalance,
      dataset,
    );
    const totalBalanceInPrimary = convertAccountBalanceToPrimary(
      account,
      totalBalance,
      dataset,
    );

    return {
      account,
      balance: freeBalance,
      totalBalance,
      balanceInPrimary,
      totalBalanceInPrimary,
      reserved,
      freeBalance,
    };
  });
}

export function calculateSavingsRate(income: number, expenses: number) {
  if (income <= 0) return 0;
  return ((income - expenses) / income) * 100;
}

export function calculateEmergencyRunway(
  dataset: WalletDataset,
  referenceMonth: string,
  averagingMonths = 3,
) {
  const expenseMonths = relativeMonthKeys(
    referenceMonth,
    averagingMonths + 1,
  ).slice(0, averagingMonths);
  const averageMonthlyExpenses =
    expenseMonths.reduce(
      (total, month) => total + calculateSummary(dataset, month).expenses,
      0,
    ) / averagingMonths;
  const freeBalance = calculateAccountBalances(dataset)
    .filter(({ account }) => account.isActive && account.isVisible)
    .reduce(
      (total, item) =>
        total +
        convertAccountBalanceToPrimary(item.account, item.freeBalance, dataset),
      0,
    );

  return {
    averageMonthlyExpenses,
    freeBalance,
    months:
      averageMonthlyExpenses > 0
        ? Math.max(0, freeBalance) / averageMonthlyExpenses
        : 0,
    expenseMonths,
  };
}

export function calculateAccountBalanceAtMonthEnd(
  dataset: WalletDataset,
  accountId: string,
  month: string,
) {
  return calculateAccountBalanceAtCutoff(
    dataset,
    accountId,
    endOfMonth(parseISO(`${month}-15T12:00:00.000Z`)),
  );
}

export function calculateAccountBalanceAtDate(
  dataset: WalletDataset,
  accountId: string,
  date: string,
) {
  return calculateAccountBalanceAtCutoff(
    dataset,
    accountId,
    endOfDay(parseISO(`${date}T12:00:00.000Z`)),
  );
}

function calculateAccountBalanceAtCutoff(
  dataset: WalletDataset,
  accountId: string,
  cutoff: Date,
) {
  const account = dataset.accounts.find((item) => item.id === accountId);
  if (!account) return 0;

  const recordBalance = dataset.records.reduce((total, record) => {
    if (record.paymentStatus === "cancelled") return total;
    if (isAfter(parseISO(record.occurredAt), cutoff)) return total;

    if (record.type === "income" && record.accountId === account.id) {
      return total + (record.accountAmount ?? record.amount);
    }

    if (record.type === "expense" && record.accountId === account.id) {
      return total - (record.accountAmount ?? record.amount);
    }

    if (record.type === "transfer") {
      if (record.accountId === account.id) return total - record.amount;
      if (record.destinationAccountId === account.id)
        return total + record.amount;
    }

    return total;
  }, account.initialBalance);

  const directCardBalance = dataset.creditCardRecords.reduce((total, movement) => {
    if (movement.walletRecordId || !movement.accountImpactAtCreation || movement.accountId !== account.id || movement.accountAmount === undefined) return total;
    if (isAfter(parseISO(movement.occurredAt), cutoff)) return total;
    return total + (movement.kind === "refund" ? movement.accountAmount : -movement.accountAmount);
  }, recordBalance);

  const totalBalance = dataset.creditCardPayments.reduce((total, payment) => {
    if (
      payment.accountId !== account.id ||
      payment.accountAmount === undefined
    ) {
      return total;
    }
    if (isAfter(parseISO(payment.occurredAt), cutoff)) return total;
    return total - payment.accountAmount;
  }, directCardBalance);

  const movements = dataset.goalReservationMovements ?? [];
  const reservedAtCutoff = movements.length
    ? movements.reduce((total, movement) => {
        if (movement.accountId !== account.id) return total;
        if (isAfter(parseISO(movement.createdAt), cutoff)) return total;
        const direction =
          movement.type === "reserve" || movement.type === "restore" ? 1 : -1;
        return total + direction * movement.amount;
      }, 0)
    : dataset.goalReservations.reduce((total, reservation) => {
        if (reservation.accountId !== account.id) return total;
        if (isAfter(parseISO(reservation.createdAt), cutoff)) return total;
        return total + reservation.amount;
      }, 0);

  return totalBalance - reservedAtCutoff;
}

function cardCycleDate(year: number, month: number, day: number) {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(year, month, Math.min(day, lastDay), 23, 59, 59, 999),
  );
}

function aggregateCurrencyAmounts(
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

export function creditCardCycleDates(
  card: CreditCard,
  asOf: Date = new Date(),
) {
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
  const currentCycleStart = addDays(lastClosingDate, 1);
  const dueMonthOffset = card.dueDay > card.closingDay ? 0 : 1;
  const dueMonth = new Date(
    Date.UTC(
      lastClosingDate.getUTCFullYear(),
      lastClosingDate.getUTCMonth() + dueMonthOffset,
      1,
    ),
  );
  const dueDate = cardCycleDate(
    dueMonth.getUTCFullYear(),
    dueMonth.getUTCMonth(),
    card.dueDay,
  );

  return { currentCycleStart, currentCycleEnd, lastClosingDate, dueDate };
}

export function calculateCreditCardSummary(
  dataset: WalletDataset,
  card: CreditCard,
  asOf: Date = new Date(),
): CreditCardSummary {
  const dates = creditCardCycleDates(card, asOf);
  const movements = (dataset.creditCardRecords.length > 0
    ? dataset.creditCardRecords
    : dataset.records.filter((record) => record.creditCardId).map((record) => ({
        ...record,
        kind: record.type === "income" ? "refund" as const : "purchase" as const,
        amountInLimitCurrency: record.amountInLimitCurrency ?? record.amount * (record.exchangeRateToLimitCurrency ?? 1),
        exchangeRateToLimitCurrency: record.exchangeRateToLimitCurrency ?? 1,
        categoryId: record.categoryId ?? "",
        accountImpactAtCreation: Boolean(record.accountId),
      })))
    .filter((record) => record.creditCardId === card.id && !isAfter(parseISO(record.occurredAt), asOf));
  const payments = dataset.creditCardPayments.filter(
    (payment) =>
      payment.creditCardId === card.id &&
      !isAfter(parseISO(payment.occurredAt), asOf),
  );
  const paymentByCurrency = payments.map((payment) => ({
    currency: payment.currency,
    amount: -payment.amount,
  }));
  const outstanding = aggregateCurrencyAmounts([
    ...movements.map((record) => ({
      currency: record.currency,
      amount: record.kind === "refund" ? -record.amount : record.amount,
    })),
    ...paymentByCurrency,
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
      .map((record) => ({ currency: record.currency, amount: record.kind === "refund" ? -record.amount : record.amount })),
  );
  const statementDue = aggregateCurrencyAmounts([
    ...movements
      .filter(
        (record) =>
          !isAfter(parseISO(record.occurredAt), dates.lastClosingDate),
      )
      .map((record) => ({ currency: record.currency, amount: record.kind === "refund" ? -record.amount : record.amount })),
    ...paymentByCurrency,
  ]);
  const purchaseLimitAmount = movements.reduce(
    (total, record) =>
      total +
      (record.kind === "refund" ? -1 : 1) * record.amountInLimitCurrency,
    0,
  );
  const paidLimitAmount = payments.reduce(
    (total, payment) => total + payment.amountInLimitCurrency,
    0,
  );
  const usedLimit = Math.max(0, purchaseLimitAmount - paidLimitAmount);
  const availableLimit = card.creditLimit - usedLimit;
  const statementTotal = statementDue.reduce(
    (total, item) => total + item.amount,
    0,
  );
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
    utilizationPercent:
      card.creditLimit > 0 ? (usedLimit / card.creditLimit) * 100 : 0,
    currentCycleStart: dateKey(dates.currentCycleStart),
    currentCycleEnd: dateKey(dates.currentCycleEnd),
    lastClosingDate: dateKey(dates.lastClosingDate),
    dueDate: dateKey(dates.dueDate),
    currentCycle,
    outstanding,
    statementDue,
    status,
  };
}

export function calculateCreditCardSummaries(
  dataset: WalletDataset,
  asOf: Date = new Date(),
) {
  return dataset.creditCards.map((card) =>
    calculateCreditCardSummary(dataset, card, asOf),
  );
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
      payment.creditCardId === statement.creditCardId &&
      payment.statementId === statement.id,
  );
  const statementPaymentIds = new Set(
    statementPayments.map((payment) => payment.id),
  );
  const allocations = dataset.creditCardPaymentAllocations.filter(
    (allocation) =>
      statementPaymentIds.has(allocation.paymentId) &&
      purchaseIds.has(allocation.creditCardRecordId),
  );
  const refundsByPurchase = new Map<string, CreditCardCurrencyAmount[]>();
  refunds.forEach((refund) => {
    const id = refund.originalRecordId;
    if (!id) return;
    refundsByPurchase.set(id, [
      ...(refundsByPurchase.get(id) ?? []),
      { currency: refund.currency, amount: refund.amount },
    ]);
  });
  const allocationsByPurchase = new Map<string, number>();
  allocations.forEach((allocation) => {
    allocationsByPurchase.set(
      allocation.creditCardRecordId,
      (allocationsByPurchase.get(allocation.creditCardRecordId) ?? 0) +
        allocation.amount,
    );
  });

  const purchaseTotal = purchases.reduce(
    (total, record) => total + record.amountInLimitCurrency,
    0,
  );
  const refundTotal = refunds.reduce(
    (total, record) => total + record.amountInLimitCurrency,
    0,
  );
  const paidAmountInLimitCurrency = statementPayments.reduce(
    (total, payment) => total + payment.amountInLimitCurrency,
    0,
  );
  const totalAmountInLimitCurrency = Math.max(0, purchaseTotal - refundTotal);

  const currencyBreakdown = aggregateCurrencyAmounts(
    purchases.map((purchase) => {
      const refunded = (refundsByPurchase.get(purchase.id) ?? [])
        .filter((refund) => refund.currency === purchase.currency)
        .reduce((total, refund) => total + refund.amount, 0);
      const allocated = allocationsByPurchase.get(purchase.id) ?? 0;
      return {
        currency: purchase.currency,
        amount: purchase.amount - refunded - allocated,
      };
    }),
  );

  return {
    totalAmountInLimitCurrency,
    paidAmountInLimitCurrency,
    dueAmountInLimitCurrency: Math.max(
      0,
      totalAmountInLimitCurrency - paidAmountInLimitCurrency,
    ),
    currencyBreakdown,
  };
}

export function calculateCreditCardCategoryUsage(
  dataset: WalletDataset,
  card: CreditCard,
  asOf: Date = new Date(),
): CreditCardCategoryUsage[] {
  const purchases = (dataset.creditCardRecords.length > 0
    ? dataset.creditCardRecords
    : dataset.records.filter((record) => record.creditCardId).map((record) => ({
        ...record, kind: "purchase" as const,
        amountInLimitCurrency: record.amountInLimitCurrency ?? record.amount * (record.exchangeRateToLimitCurrency ?? 1),
        exchangeRateToLimitCurrency: record.exchangeRateToLimitCurrency ?? 1,
        categoryId: record.categoryId ?? "", accountImpactAtCreation: Boolean(record.accountId),
      }))).filter(
    (record) =>
      record.creditCardId === card.id &&
      record.kind === "purchase" &&
      !isAfter(parseISO(record.occurredAt), asOf),
  );
  const summary = calculateCreditCardSummary(dataset, card, asOf);
  const rootCategories = dataset.categories.filter(
    (category) => !category.parentId,
  );
  const usage = rootCategories.map((category) => ({
    id: category.id,
    name: category.name,
    color: category.color,
    amount: purchases
      .filter(
        (record) =>
          record.categoryId &&
          isCategoryOrDescendant(
            dataset.categories,
            record.categoryId,
            category.id,
          ),
      )
      .reduce(
        (total, record) =>
          total +
          record.amountInLimitCurrency,
        0,
      ),
  }));
  const categorizedRecordIds = new Set(
    purchases
      .filter((record) =>
        rootCategories.some(
          (category) =>
            record.categoryId &&
            isCategoryOrDescendant(
              dataset.categories,
              record.categoryId,
              category.id,
            ),
        ),
      )
      .map((record) => record.id),
  );
  const uncategorizedAmount = purchases
    .filter((record) => !categorizedRecordIds.has(record.id))
    .reduce(
      (total, record) =>
        total +
          record.amountInLimitCurrency,
      0,
    );
  const grossAmount =
    usage.reduce((total, item) => total + item.amount, 0) + uncategorizedAmount;
  const outstandingShare =
    grossAmount > 0 ? summary.usedLimit / grossAmount : 0;
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

  return adjustedUsage
    .filter((item) => item.amount > 0.000001)
    .sort((a, b) => b.amount - a.amount);
}

function convertAccountBalanceToPrimary(
  account: Account,
  balance: number,
  dataset: WalletDataset,
) {
  if (account.currency === dataset.settings.primaryCurrency) return balance;

  const rate = dataset.exchangeRates.find(
    (item) =>
      item.fromCurrency === account.currency &&
      item.toCurrency === dataset.settings.primaryCurrency,
  );

  return balance * (rate?.rate ?? 1);
}

export function calculateVisibleBalance(dataset: WalletDataset) {
  return calculateAccountBalances(dataset)
    .filter(({ account }) => account.isVisible)
    .reduce((total, item) => total + item.balanceInPrimary, 0);
}

export function isOpenDebt(debt: Debt) {
  return (
    debt.status !== "paid" &&
    (debt.pendingAmount === undefined || debt.pendingAmount > 0)
  );
}

export function calculateVisibleDebtSummary(
  dataset: WalletDataset,
): VisibleDebtSummary {
  return dataset.debts
    .filter((debt) => debt.isVisible && isOpenDebt(debt))
    .reduce<VisibleDebtSummary>(
      (summary, debt) => {
        const pendingAmount = debt.pendingAmount;

        if (pendingAmount === undefined) {
          return {
            ...summary,
            openCount: summary.openCount + 1,
            amountPendingCount: summary.amountPendingCount + 1,
          };
        }

        const toCollect =
          debt.direction === "receivable"
            ? summary.toCollect + pendingAmount
            : summary.toCollect;
        const toPay =
          debt.direction === "payable"
            ? summary.toPay + pendingAmount
            : summary.toPay;

        return {
          toCollect,
          toPay,
          net: toCollect - toPay,
          openCount: summary.openCount + 1,
          amountPendingCount: summary.amountPendingCount,
        };
      },
      {
        toCollect: 0,
        toPay: 0,
        net: 0,
        openCount: 0,
        amountPendingCount: 0,
      },
    );
}

export function applyDebtPayment(debt: Debt, amount: number): Debt {
  if (amount <= 0 || debt.pendingAmount === undefined) return debt;

  const pendingAmount = Math.max(0, debt.pendingAmount - amount);
  return {
    ...debt,
    pendingAmount,
    status: pendingAmount === 0 ? "paid" : debt.status,
  };
}

export function creditCardStatementStatusAfterPaymentChange(
  total: number,
  paid: number,
  dueAt: string | Date,
  now = new Date(),
) {
  const remaining = Math.max(0, total - paid);
  if (remaining <= 0.005) return "paid" as const;
  if (paid > 0.005) return "partial" as const;
  return new Date(dueAt) < now ? "overdue" as const : "pending" as const;
}

function recurringDebtDueDate(rule: RecurringDebt, month: string) {
  const monthStart = parseISO(`${month}-01T12:00:00.000Z`);
  const lastDay = endOfMonth(monthStart).getDate();
  return parseISO(
    `${month}-${String(Math.min(rule.dayOfMonth, lastDay)).padStart(2, "0")}T12:00:00.000Z`,
  );
}

export function buildDueRecurringDebtInstances(
  dataset: WalletDataset,
  currentDate = new Date(),
): Array<Omit<Debt, "id">> {
  const currentMonth = monthKey(currentDate);
  const generatedKeys = new Set(
    dataset.debts
      .filter((debt) => debt.recurringDebtId && debt.recurringMonth)
      .map((debt) => `${debt.recurringDebtId}:${debt.recurringMonth}`),
  );

  return dataset.recurringDebts.flatMap((rule) => {
    if (!rule.isActive) return [];

    const startMonth = monthKey(rule.startedAt);
    const instances: Array<Omit<Debt, "id">> = [];
    let cursor = parseISO(`${startMonth}-15T12:00:00.000Z`);
    const end = parseISO(`${currentMonth}-15T12:00:00.000Z`);

    while (!isAfter(cursor, end)) {
      const recurringMonth = format(cursor, "yyyy-MM");
      const dueDate = recurringDebtDueDate(rule, recurringMonth);
      const key = `${rule.id}:${recurringMonth}`;

      if (!isAfter(dueDate, currentDate) && !generatedKeys.has(key)) {
        instances.push({
          name: `${rule.name} - ${recurringMonth}`,
          direction: rule.direction,
          originalAmount: rule.amount,
          pendingAmount: rule.amount,
          currency: rule.currency,
          counterpartyName: rule.counterpartyName,
          accountId: rule.accountId,
          categoryId: rule.categoryId,
          status: "active",
          isVisible: true,
          startedAt: dueDate.toISOString(),
          dueAt: dueDate.toISOString(),
          note: rule.note,
          recurringDebtId: rule.id,
          recurringMonth,
        });
      }

      cursor = addMonths(cursor, 1);
    }

    return instances;
  });
}

export function calculateSummary(
  dataset: WalletDataset,
  month = monthKey(new Date()),
): AnalyticsSummary {
  const records = recordsForMonth(dataset.records, month).filter(
    (record) => record.paymentStatus !== "cancelled",
  );

  const now = new Date();
  const monthEnd = endOfMonth(now);
  const dayOfMonth = Math.max(1, now.getDate());
  const remainingDays = Math.max(1, monthEnd.getDate() - now.getDate() + 1);

  return calculateSummaryFromRecords(
    dataset,
    records,
    dayOfMonth,
    remainingDays,
  );
}

export function calculateSummaryForDateRange(
  dataset: WalletDataset,
  range: DateRange,
): AnalyticsSummary {
  const records = recordsForDateRange(dataset.records, range).filter(
    (record) => record.paymentStatus !== "cancelled",
  );
  const from = parseISO(`${range.from}T12:00:00.000Z`);
  const to = parseISO(`${range.to}T12:00:00.000Z`);
  const now = new Date();
  const dayCount = Math.max(1, differenceInCalendarDays(to, from) + 1);
  const remainingDays =
    isBefore(now, from) || isAfter(now, to)
      ? 1
      : Math.max(1, differenceInCalendarDays(to, now) + 1);

  return calculateSummaryFromRecords(dataset, records, dayCount, remainingDays);
}

function calculateSummaryFromRecords(
  dataset: WalletDataset,
  records: WalletRecord[],
  dayCount: number,
  remainingDays: number,
): AnalyticsSummary {
  const income = records
    .filter((record) => record.type === "income")
    .reduce(
      (total, record) =>
        total + toPrimaryCurrency(record.amount, record.exchangeRateToPrimary),
      0,
    );

  const expenses = records
    .filter((record) => record.type === "expense")
    .reduce(
      (total, record) =>
        total + toPrimaryCurrency(record.amount, record.exchangeRateToPrimary),
      0,
    );

  const balance = calculateVisibleBalance(dataset);
  const dailyAverageExpense = expenses / dayCount;
  const availableDaily = balance / remainingDays;

  return {
    income,
    expenses,
    cashFlow: income - expenses,
    balance,
    spending: expenses,
    dailyAverageExpense,
    availableDaily,
  };
}

export function calculateCategoryExpenses(
  dataset: WalletDataset,
  month = monthKey(new Date()),
  parentId?: string,
) {
  const records = recordsForMonth(dataset.records, month).filter(
    (record) =>
      record.type === "expense" && record.paymentStatus !== "cancelled",
  );

  return calculateCategoryBreakdownFromRecords(dataset, records, parentId);
}

export function calculateCategoryExpensesForDateRange(
  dataset: WalletDataset,
  range: DateRange,
  parentId?: string,
) {
  const records = recordsForDateRange(dataset.records, range).filter(
    (record) =>
      record.type === "expense" && record.paymentStatus !== "cancelled",
  );

  return calculateCategoryBreakdownFromRecords(dataset, records, parentId);
}

export function calculateCategoryIncome(
  dataset: WalletDataset,
  month = monthKey(new Date()),
  parentId?: string,
) {
  const records = recordsForMonth(dataset.records, month).filter(
    (record) =>
      record.type === "income" && record.paymentStatus !== "cancelled",
  );

  return calculateCategoryBreakdownFromRecords(dataset, records, parentId);
}

export function calculateCategoryIncomeForDateRange(
  dataset: WalletDataset,
  range: DateRange,
  parentId?: string,
) {
  const records = recordsForDateRange(dataset.records, range).filter(
    (record) =>
      record.type === "income" && record.paymentStatus !== "cancelled",
  );

  return calculateCategoryBreakdownFromRecords(dataset, records, parentId);
}

function calculateCategoryBreakdownFromRecords(
  dataset: WalletDataset,
  records: WalletRecord[],
  parentId?: string,
) {
  return dataset.categories
    .filter((category) => parentId ? category.parentId === parentId : !category.parentId)
    .map((category) => {
      const value = records
        .filter(
          (record) =>
            record.categoryId &&
            isCategoryOrDescendant(
              dataset.categories,
              record.categoryId,
              category.id,
            ),
        )
        .reduce(
          (total, record) =>
            total +
            toPrimaryCurrency(record.amount, record.exchangeRateToPrimary),
          0,
        );

      return {
        id: category.id,
        name: category.name,
        color: category.color,
        icon: category.icon,
        value,
      };
    })
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);
}

export function isCategoryOrDescendant(
  categories: Category[],
  categoryId: string,
  selectedCategoryId: string,
) {
  if (categoryId === selectedCategoryId) return true;

  let current = categories.find((category) => category.id === categoryId);
  while (current?.parentId) {
    if (current.parentId === selectedCategoryId) return true;
    current = categories.find((category) => category.id === current?.parentId);
  }

  return false;
}

export function calculateGoalProgress(dataset: WalletDataset): GoalProgress[] {
  return dataset.goals.map((goal) => {
    const convert = (amount: number, currency: CurrencyCode, recordRate?: number) => {
      if (currency === goal.currency) return amount;
      const primary = dataset.settings.primaryCurrency;
      const toPrimary = currency === primary
        ? amount
        : amount * (recordRate ?? dataset.exchangeRates.find((rate) => rate.fromCurrency === currency && rate.toCurrency === primary)?.rate ?? 1);
      if (goal.currency === primary) return toPrimary;
      const goalToPrimary = dataset.exchangeRates.find((rate) => rate.fromCurrency === goal.currency && rate.toCurrency === primary)?.rate ?? 1;
      return toPrimary / goalToPrimary;
    };
    const reserved = dataset.goalReservations
      .filter((reservation) => reservation.goalId === goal.id)
      .reduce((total, reservation) => total + convert(reservation.amount, reservation.currency), 0);

    const netSpent = dataset.records
      .filter(
        (record) =>
          (record.type === "expense" || record.type === "income") &&
          record.paymentStatus !== "cancelled" &&
          (record.goalIds ?? []).includes(goal.id),
      )
      .reduce(
        (total, record) => {
          const association = (record.goalAssociations ?? []).find(
            (item) => item.goalId === goal.id,
          );
          const amount = association?.allocatedAmount ?? record.amount;
          return total + (record.type === "expense" ? 1 : -1) *
            convert(amount, record.currency, record.exchangeRateToPrimary);
        },
        0,
      );
    const spent = Math.max(0, netSpent);

    const committed = reserved + spent;
    const remaining = Math.max(0, goal.targetAmount - committed);
    const overTarget = Math.max(0, committed - goal.targetAmount);
    const percentage = (committed / goal.targetAmount) * 100;

    return {
      goal,
      reserved,
      spent,
      committed,
      remaining,
      overTarget,
      percentage,
    };
  });
}

export function buildExpenseComparisonSeries(
  dataset: WalletDataset,
  ranges: DateRange[],
) {
  const [twoPeriodsAgo, previous, current] = ranges.map((range) =>
    dateKeysForRange(range).map((date) =>
      recordsForDateRange(dataset.records, { from: range.from, to: date })
        .filter((record) => record.type === "expense" && record.paymentStatus !== "cancelled")
        .reduce((total, record) => total + toPrimaryCurrency(record.amount, record.exchangeRateToPrimary), 0),
    ),
  );
  const maxDays = Math.max(twoPeriodsAgo?.length ?? 0, previous?.length ?? 0, current?.length ?? 0);
  return Array.from({ length: maxDays }, (_, index) => ({
    day: `Day ${index + 1}`,
    previousPrevious: twoPeriodsAgo?.[index] ?? null,
    previous: previous?.[index] ?? null,
    current: current?.[index] ?? null,
  }));
}

export function buildExpenseSequenceComparisonSeries(
  dataset: WalletDataset,
  ranges: DateRange[],
) {
  const [twoPeriodsAgo, previous, current] = ranges.map((range) => {
    let cumulative = 0;
    return recordsForDateRange(dataset.records, range)
      .filter((record) => record.type === "expense" && record.paymentStatus !== "cancelled")
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id))
      .map((record) => {
        cumulative += toPrimaryCurrency(record.amount, record.exchangeRateToPrimary);
        return cumulative;
      });
  });
  const maxExpenses = Math.max(twoPeriodsAgo.length, previous.length, current.length);
  return Array.from({ length: maxExpenses }, (_, index) => ({
    expense: `Expense ${index + 1}`,
    previousPrevious: twoPeriodsAgo[index] ?? null,
    previous: previous[index] ?? null,
    current: current[index] ?? null,
  }));
}

export function calculateBudgetProgress(
  dataset: WalletDataset,
  month = monthKey(new Date()),
): BudgetProgress[] {
  return calculateBudgetProgressFromRecords(
    dataset,
    recordsForMonth(dataset.records, month),
  );
}

export function calculateBudgetProgressForDateRange(
  dataset: WalletDataset,
  range: DateRange,
): BudgetProgress[] {
  return calculateBudgetProgressFromRecords(
    dataset,
    recordsForDateRange(dataset.records, range),
  );
}

function calculateBudgetProgressFromRecords(
  dataset: WalletDataset,
  records: WalletRecord[],
): BudgetProgress[] {
  return dataset.budgets
    .filter((budget) => budget.isActive)
    .map((budget) => {
      const spent = matchingBudgetRecords(
        records,
        budget,
        dataset.categories,
      ).reduce(
        (total, record) =>
          total +
          toPrimaryCurrency(record.amount, record.exchangeRateToPrimary),
        0,
      );
      const percentage = Math.min(999, (spent / budget.limitAmount) * 100);
      const remaining = budget.limitAmount - spent;
      const status =
        percentage >= 100 ? "exceeded" : percentage >= 80 ? "warning" : "ok";

      return {
        budget,
        spent,
        remaining,
        percentage,
        status,
      };
    });
}

function matchingBudgetRecords(
  records: WalletRecord[],
  budget: Budget,
  categories: Category[],
) {
  return records.filter((record) => {
    if (record.type !== "expense" || record.paymentStatus === "cancelled") {
      return false;
    }

    if (
      budget.categoryId &&
      (!record.categoryId ||
        !isCategoryOrDescendant(
          categories,
          record.categoryId,
          budget.categoryId,
        ))
    ) {
      return false;
    }

    if (budget.tagId && !record.tagIds.includes(budget.tagId)) {
      return false;
    }

    if (budget.accountId && record.accountId !== budget.accountId) {
      return false;
    }

    return true;
  });
}

export function groupRecordsByDay(records: WalletRecord[]) {
  return records.reduce<Record<string, WalletRecord[]>>((groups, record) => {
    const key = format(parseISO(record.occurredAt), "yyyy-MM-dd");
    groups[key] = groups[key] ?? [];
    groups[key].push(record);
    return groups;
  }, {});
}

export function calculateMonthlySeries(
  dataset: WalletDataset,
  months: string[],
) {
  return months.map((month) => {
    const summary = calculateSummary(dataset, month);
    return {
      month,
      income: summary.income,
      expenses: summary.expenses,
      cashFlow: summary.cashFlow,
    };
  });
}
