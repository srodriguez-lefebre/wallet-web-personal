/** Legacy formulas are retained here as unit-test oracles while views consume server read models. */
import { useEffect } from "react";
import {
  availableMonthKeys,
  buildExpenseComparisonSeries,
  buildExpenseSequenceComparisonSeries,
  calculateAccountBalanceAtDate,
  calculateAccountBalances,
  calculateBudgetProgress,
  calculateBudgetProgressForDateRange,
  calculateCreditCardCategoryUsage,
  calculateCreditCardSummaries,
  calculateCreditCardSummary,
  calculateEmergencyRunway,
  calculateGoalProgress,
  calculateMonthlySeries,
  calculateSavingsRate,
  calculateSummary,
  calculateSummaryForDateRange,
  dateKey,
  dateKeysForRange,
  dateRangeForMonth,
  isCategoryOrDescendant,
  monthKey,
  recentMonthKeys,
  recordsForDateRange,
  relativeDateRanges,
  relativeMonthKeys,
} from "@shared/calculations";
import { calculateMerchantSpending } from "@shared/merchant-analytics";
import { countNewReviews, getMerchantCorrections, recordReviewDate } from "@shared/record-review";
import { isPrimaryReportingRecord } from "@shared/record-status";
import {
  buildSavingsRecommendations,
  calculateAllowedDailySpend,
  calculateEndOfMonthProjection,
} from "@shared/simulations";

import type { WalletDataset } from "@shared/types";
import type { RecordQueryFilters } from "@/services/wallet-queries";
import type { ClientInput } from "@/services/api-client";

import { formatCategoryName } from "@/lib/category-options";
import { normalizeGlobalSearch } from "@/lib/global-search";
import { reportDataset } from "@/lib/preferences";
import { selectPendingCardStatements } from "@/lib/cards-presentation";

type Fixture = {
  dataset?: WalletDataset;
  isAllHistoryComplete?: boolean;
  isLoadingMoreRecords?: boolean;
  recordsPage?: { hasMore?: boolean; nextCursor?: string | null };
  loadMoreRecords?: () => Promise<void>;
  refreshCardStatements?: () => Promise<void>;
  globalReviewCount?: number;
};
type Selection = NonNullable<ClientInput<"analytics.details">["query"]>;
const wire = (value: number) => (Number.isFinite(value) ? value : null);
function datasetFor(fixture: Fixture) {
  if (!fixture.dataset) throw new Error("Synthetic view fixture needs a dataset");
  return fixture.dataset;
}
function metadataFor(fixture: Fixture) {
  const data = datasetFor(fixture);
  const review = data.records.filter((record) => record.paymentStatus === "needs_review");
  const dates = data.records.map((record) => dateKey(record.occurredAt)).sort();
  const latest = review.reduce(
    (value, record) => Math.max(value, Date.parse(recordReviewDate(record)) || 0),
    0,
  );
  return {
    recordSummary: {
      from: dates[0] ?? null,
      to: dates.at(-1) ?? null,
      months: availableMonthKeys(data.records),
      total: data.records.length,
      review: fixture.globalReviewCount ?? review.length,
      newReviews: countNewReviews(data),
      latestReviewAt: latest ? new Date(latest).toISOString() : null,
    },
    merchantCorrections: Array.from(getMerchantCorrections(data).values(), (value) => value.record),
    debtRecordCounts: Object.fromEntries(
      data.debts.map((debt) => [
        debt.id,
        data.records.filter((record) => record.debtId === debt.id).length,
      ]),
    ),
    availableMonths: availableMonthKeys(data.records),
  };
}
export function withWalletMetadata<T extends { dataset: WalletDataset }>(
  wallet: T,
): T & ReturnType<typeof metadataFor>;
export function withWalletMetadata<T extends object>(wallet: T): T;
export function withWalletMetadata<T extends object>(wallet: T) {
  const fixture = wallet as T & Fixture;
  return fixture.dataset ? { ...wallet, ...metadataFor(fixture) } : wallet;
}
function fixtureRecords(data: WalletDataset, filters: RecordQueryFilters) {
  return data.records
    .filter((record) => {
      const day = dateKey(record.occurredAt);
      if ((filters.from && day < filters.from) || (filters.to && day > filters.to)) return false;
      if (filters.type && filters.type !== "all" && record.type !== filters.type) return false;
      if (
        filters.paymentStatus &&
        filters.paymentStatus !== "all" &&
        record.paymentStatus !== filters.paymentStatus
      )
        return false;
      if (
        filters.accountId &&
        record.accountId !== filters.accountId &&
        record.destinationAccountId !== filters.accountId
      )
        return false;
      if (filters.creditCardId && record.creditCardId !== filters.creditCardId) return false;
      if (
        filters.categoryId &&
        (!record.categoryId ||
          !isCategoryOrDescendant(data.categories, record.categoryId, filters.categoryId))
      )
        return false;
      if (filters.tagId && !record.tagIds.includes(filters.tagId)) return false;
      if (filters.goalId && !(record.goalIds ?? []).includes(filters.goalId)) return false;
      if (!(record.note ?? "").toLowerCase().includes((filters.note ?? "").trim().toLowerCase()))
        return false;
      const category = data.categories.find((item) => item.id === record.categoryId);
      const tags = record.tagIds
        .map((id) => data.tags.find((tag) => tag.id === id)?.name ?? "")
        .join(" ");
      return normalizeGlobalSearch(
        `${category ? formatCategoryName(data.categories, category) : ""} ${record.counterpartyName ?? ""} ${record.importMerchant ?? ""} ${tags} ${record.note ?? ""}`,
      ).includes(normalizeGlobalSearch(filters.search ?? ""));
    })
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
}
function accountMetrics(data: WalletDataset) {
  return calculateAccountBalances(data).map(({ account, ...value }) => ({
    ...value,
    accountId: account.id,
    balanceInPrimary: wire(value.balanceInPrimary),
    totalBalanceInPrimary: wire(value.totalBalanceInPrimary),
  }));
}
export function legacyEntityHooks(getWallet: () => Fixture) {
  const query = (data: unknown, pending = false) => ({
    data,
    isPending: pending,
    isFetching: pending,
    isFetchingNextPage: false,
    isError: false,
  });
  return {
    useAccounts: () => {
      const wallet = getWallet(),
        data = datasetFor(wallet),
        complete = wallet.isAllHistoryComplete !== false;
      return {
        balances: complete ? calculateAccountBalances(data) : [],
        metrics: query(complete ? accountMetrics(data) : undefined, !complete),
        isPending: !complete,
        isError: false,
      };
    },
    useGoals: () => {
      const wallet = getWallet(),
        data = datasetFor(wallet),
        complete = wallet.isAllHistoryComplete !== false,
        progress = calculateGoalProgress(data);
      return {
        progress: complete ? progress : [],
        metrics: query(complete ? progress : undefined, !complete),
        isPending: !complete,
        isError: false,
      };
    },
    useRecords: (filters: RecordQueryFilters = {}, enabled = true) => {
      const wallet = getWallet(),
        data = datasetFor(wallet),
        records = enabled ? fixtureRecords(data, filters) : [];
      return {
        records,
        hasMore: wallet.recordsPage?.hasMore ?? false,
        query: {
          ...query({
            pages: [
              {
                items: records,
                nextCursor: wallet.recordsPage?.nextCursor ?? null,
                hasMore: wallet.recordsPage?.hasMore ?? false,
              },
            ],
          }),
          isFetching: wallet.isAllHistoryComplete === false,
          isFetchingNextPage: wallet.isLoadingMoreRecords ?? false,
        },
        loadMore: wallet.loadMoreRecords ?? (async () => {}),
      };
    },
    useAnalytics: (selection: Selection) => {
      const wallet = getWallet(),
        data = reportDataset(datasetFor(wallet), selection.accountId),
        complete = wallet.isAllHistoryComplete !== false;
      const range = { from: selection.from, to: selection.to };
      const summary =
        selection.periodMode === "month"
          ? calculateSummary(data, selection.selectedMonth)
          : calculateSummaryForDateRange(data, range);
      const periods =
        selection.periodMode === "custom"
          ? relativeDateRanges(range, 3)
          : relativeMonthKeys(selection.selectedMonth, 3).map(dateRangeForMonth);
      const previous = calculateSummaryForDateRange(data, periods[1]!);
      const savingsRate = calculateSavingsRate(summary.income, summary.expenses);
      const previousRate = calculateSavingsRate(previous.income, previous.expenses);
      const model = {
        summary,
        budgets:
          selection.periodMode === "month"
            ? calculateBudgetProgress(data, selection.selectedMonth)
            : calculateBudgetProgressForDateRange(data, range),
        monthlySeries: calculateMonthlySeries(
          data,
          recentMonthKeys(
            data.records,
            selection.periodMode === "month" ? selection.selectedMonth : monthKey(selection.to),
            6,
          ).reverse(),
        ),
        expenseTrend: buildExpenseComparisonSeries(data, periods),
        expenseSequenceTrend: buildExpenseSequenceComparisonSeries(data, periods),
        savingsRate,
        savingsRateChange: savingsRate - previousRate,
        emergencyRunway: calculateEmergencyRunway(
          data,
          selection.periodMode === "month" ? selection.selectedMonth : monthKey(selection.to),
        ),
        projection: calculateEndOfMonthProjection(data, summary.dailyAverageExpense),
        allowedDaily: calculateAllowedDailySpend(data),
        recommendations: buildSavingsRecommendations(data),
        merchants: calculateMerchantSpending(data.records, range),
      };
      const records = recordsForDateRange(data.records, range).filter(isPrimaryReportingRecord);
      const categories = data.categories.map((category) => ({
        ...category,
        parentId: category.parentId ?? null,
        income: records
          .filter(
            (record) =>
              record.type === "income" &&
              record.categoryId &&
              isCategoryOrDescendant(data.categories, record.categoryId, category.id),
          )
          .reduce((total, record) => total + record.amount * record.exchangeRateToPrimary, 0),
        expenses: records
          .filter(
            (record) =>
              record.type === "expense" &&
              record.categoryId &&
              isCategoryOrDescendant(data.categories, record.categoryId, category.id),
          )
          .reduce((total, record) => total + record.amount * record.exchangeRateToPrimary, 0),
      }));
      return {
        model: complete ? model : undefined,
        totals: query({ categories }),
        isPending: !complete,
        isError: false,
      };
    },
    useAccountBalanceTrend: (selection: Selection & { accountId: string }, enabled = true) => {
      const data = datasetFor(getWallet()),
        periods =
          selection.periodMode === "custom"
            ? relativeDateRanges(selection, 3)
            : relativeMonthKeys(selection.selectedMonth, 3).map(dateRangeForMonth);
      const values = periods.map((range) =>
        dateKeysForRange(range).map((day) =>
          calculateAccountBalanceAtDate(data, selection.accountId, day),
        ),
      );
      const length = Math.max(...values.map((value) => value.length));
      return query(
        enabled
          ? Array.from({ length }, (_, index) => ({
              day: `Day ${index + 1}`,
              previousPrevious: values[0]?.[index] ?? null,
              previous: values[1]?.[index] ?? null,
              current: values[2]?.[index] ?? null,
            }))
          : undefined,
      );
    },
    useCardAgenda: () => {
      const wallet = getWallet();
      return query(
        wallet.isAllHistoryComplete === false
          ? undefined
          : selectPendingCardStatements(datasetFor(wallet)),
        wallet.isAllHistoryComplete === false,
      );
    },
    useCard: (id: string) => {
      const wallet = getWallet(),
        data = datasetFor(wallet),
        card = data.creditCards.find((card) => card.id === id),
        complete = wallet.isAllHistoryComplete !== false;
      return {
        card,
        summary: query(card ? calculateCreditCardSummary(data, card) : undefined),
        ledger: query(
          complete
            ? {
                creditCardRecords: data.creditCardRecords.filter((row) => row.creditCardId === id),
                creditCardStatements: data.creditCardStatements.filter(
                  (row) => row.creditCardId === id,
                ),
                creditCardPayments: data.creditCardPayments.filter(
                  (row) => row.creditCardId === id,
                ),
                creditCardPaymentAllocations: data.creditCardPaymentAllocations,
              }
            : undefined,
          !complete,
        ),
        isPending: !complete,
        isError: false,
      };
    },
    useCards: (selection?: Selection) => {
      const wallet = getWallet(),
        data = datasetFor(wallet),
        periods =
          selection?.periodMode === "custom"
            ? relativeDateRanges(selection, 3)
            : relativeMonthKeys(selection?.selectedMonth ?? monthKey(new Date()), 3).map(
                dateRangeForMonth,
              );
      return {
        entries: calculateCreditCardSummaries(data).map((summary) => ({
          summary,
          categoryUsage: calculateCreditCardCategoryUsage(data, summary.card),
          expenseTrend: buildExpenseComparisonSeries(
            {
              ...data,
              records: data.records.filter((record) => record.creditCardId === summary.card.id),
            },
            periods,
          ),
        })),
        agenda: query(selectPendingCardStatements(data)),
        isPending: wallet.isAllHistoryComplete === false,
        isError: false,
      };
    },
  };
}
export function legacyCardReads(getWallet: () => Fixture) {
  const hooks = legacyEntityHooks(getWallet);
  return {
    useCardReads: (selection: Selection) => {
      const refresh = getWallet().refreshCardStatements;
      useEffect(() => {
        void refresh?.().catch(() => undefined);
      }, [refresh]);
      return {
        ...hooks.useCards(selection),
        refreshError: "",
        isRefreshing: false,
        retryRefresh: () => void refresh?.(),
      };
    },
  };
}
