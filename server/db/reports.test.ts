import { randomUUID } from "node:crypto";

import { neonConfig } from "@neondatabase/serverless";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

import { createPostgresTestDatabase } from "../../scripts/sandbox/postgres-test.js";
import {
  buildExpenseComparisonSeries,
  buildExpenseSequenceComparisonSeries,
  calculateMonthlySeries,
  calculateSummary,
  calculateSummaryForDateRange,
  calculateEmergencyRunway,
  calculateCategoryExpenses,
  calculateCategoryExpensesForDateRange,
} from "../../shared/analytics.js";
import { calculateBudgetProgress } from "../../shared/budgets.js";
import {
  dateRangeForMonth,
  recentMonthKeys,
  relativeDateRanges,
  relativeMonthKeys,
} from "../../shared/dates.js";
import { calculateMerchantSpending } from "../../shared/merchant-analytics.js";
import {
  buildSavingsRecommendations,
  calculateAllowedDailySpend,
  calculateEndOfMonthProjection,
} from "../../shared/simulations.js";
import { buildReportViewModel, categoryBreakdown } from "../../src/lib/wallet-read-model.js";
import { getAccountBalanceMetrics } from "./balances.js";
import { getWalletReference } from "./reference.js";
import { getAnalyticsSummary } from "./analytics.js";
import { createDb } from "./client.js";
import { getWalletDataset } from "./dataset.js";
import { getReportDetails } from "./reports.js";

let fixture: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
const bank = randomUUID(),
  hidden = randomUUID(),
  category = randomUUID();
const now = new Date("2026-04-15T12:00:00Z");
beforeAll(async () => {
  vi.stubEnv("TZ", "America/Montevideo");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  fixture = await createPostgresTestDatabase();
  await fixture.pool.query("INSERT INTO settings(primary_currency) VALUES('UYU')");
  await fixture.pool.query(
    "INSERT INTO accounts(id,name,type,currency,initial_balance,color,icon,is_visible) VALUES($1,'Visible','bank','UYU',0,'blue','bank',true),($2,'Hidden','bank','UYU',0,'blue','bank',false)",
    [bank, hidden],
  );
  await fixture.pool.query(
    "INSERT INTO categories(id,name,color,icon) VALUES($1,'Synthetic category','blue','tag')",
    [category],
  );
  await fixture.pool.query(
    "INSERT INTO exchange_rates(from_currency,to_currency,rate,date) VALUES('USD','UYU',40,'2026-01-01'),('EUR','USD',2,'2026-01-01')",
  );
  const rows = [
    ["expense", 2, "USD", "2026-02-05T12:00:00Z", 40, "cleared", bank, "Shop", null],
    ["expense", 10, "UYU", "2026-03-01T12:00:00Z", 1, "cleared", bank, "Shop", null],
    ["expense", 20, "UYU", "2026-03-14T12:00:00Z", 1, "cleared", bank, "Other", null],
    ["expense", 10, "UYU", "2026-04-01T01:00:00Z", 1, "cleared", bank, "Shop", null],
    ["expense", 10, "UYU", "2026-04-01T12:00:00Z", 1, "cleared", bank, "  SHOP  ", null],
    ["expense", 2, "USD", "2026-04-05T12:00:00Z", 40, "needs_review", bank, "shop", null],
    ["expense", 20, "UYU", "2026-04-06T12:00:00Z", 1, "cleared", bank, "Other", null],
    ["expense", 7, "UYU", "2026-04-07T12:00:00Z", 1, "cleared", null, "", null],
    ["expense", 5, "USD", "2026-04-08T12:00:00Z", 0, "needs_review", bank, "Unknown FX", null],
    ["income", 1000, "UYU", "2026-04-09T12:00:00Z", 1, "cleared", bank, "Income", null],
    ["expense", 999, "UYU", "2026-04-10T12:00:00Z", 1, "cancelled", bank, "Cancelled", null],
    ["expense", 888, "UYU", "2026-04-11T12:00:00Z", 1, "cleared", bank, "Deleted", now],
    ["expense", 100, "UYU", "2026-04-12T12:00:00Z", 1, "cleared", hidden, "Hidden", null],
    ["expense", 3, "UYU", "2026-07-01T12:00:00Z", 1, "cleared", bank, "Future", null],
  ];
  for (const row of rows)
    await fixture.pool.query(
      "INSERT INTO records(type,amount,currency,occurred_at,exchange_rate_to_primary,payment_status,account_id,counterparty_name,deleted_at,category_id,payment_type,account_amount) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'debit',5)",
      [...row, category],
    );
  await fixture.pool.query(
    "INSERT INTO budgets(name,limit_amount,currency,color) VALUES('Primary',1000,'UYU','blue'),('Bridge FX',100,'EUR','blue')",
  );
}, 60_000);
afterAll(async () => {
  await fixture?.close();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function scoped(accountId?: string) {
  const data = await getWalletDataset(createDb());
  const accounts = data.accounts.filter((a) => (accountId ? a.id === accountId : a.isVisible));
  const ids = new Set(accounts.map((a) => a.id));
  return {
    ...data,
    accounts,
    records: data.records.filter(
      (r) =>
        (!accountId && !r.accountId && !r.destinationAccountId) ||
        (r.accountId && ids.has(r.accountId)) ||
        (r.destinationAccountId && ids.has(r.destinationAccountId)),
    ),
  };
}

test.each([undefined, bank, hidden])(
  "report charts preserve frozen FX, local boundaries and account scope: %s",
  async (accountId) => {
    const data = await scoped(accountId);
    const periods = relativeMonthKeys("2026-04", 3).map(dateRangeForMonth);
    const result = await getReportDetails(
      createDb(),
      {
        from: "2026-04-01",
        to: "2026-04-30",
        timeZone: "America/Montevideo",
        selectedMonth: "2026-04",
        periodMode: "month",
        accountId,
      },
      now,
    );
    expect(result.expenseTrend).toEqual(buildExpenseComparisonSeries(data, periods));
    expect(result.expenseSequenceTrend).toEqual(
      buildExpenseSequenceComparisonSeries(data, periods),
    );
    expect(result.monthlySeries).toEqual(
      calculateMonthlySeries(
        data,
        recentMonthKeys(data.records, "2026-04", 6).reverse(),
        new Date(),
      ),
    );
    expect(result.merchants).toEqual(
      calculateMerchantSpending(data.records, dateRangeForMonth("2026-04")),
    );
    expect(result.previousTotals).toMatchObject({
      income: 0,
      expenses: calculateSummary(data, "2026-03", new Date()).expenses,
    });
    expect(result.currentMonthTotals).toMatchObject({
      income: calculateSummary(data, "2026-04", new Date()).income,
      expenses: calculateSummary(data, "2026-04", new Date()).expenses,
    });
    expect(result.averageMonthlyExpenses).toBeCloseTo(
      (calculateSummary(data, "2026-01", new Date()).expenses +
        calculateSummary(data, "2026-02", new Date()).expenses +
        calculateSummary(data, "2026-03", new Date()).expenses) /
        3,
    );
    expect(result).not.toHaveProperty("records");
  },
);
test("custom periods retain three equal calendar ranges and cumulative expense order", async () => {
  const data = await scoped();
  const range = { from: "2026-03-29", to: "2026-04-07" };
  const result = await getReportDetails(
    createDb(),
    { ...range, timeZone: "America/Montevideo", selectedMonth: "2026-04", periodMode: "custom" },
    now,
  );
  expect(result.expenseTrend).toEqual(
    buildExpenseComparisonSeries(data, relativeDateRanges(range, 3)),
  );
  expect(result.expenseSequenceTrend).toEqual(
    buildExpenseSequenceComparisonSeries(data, relativeDateRanges(range, 3)),
  );
  expect(result.merchants).toEqual(calculateMerchantSpending(data.records, range));
});
test("budget conversions preserve historical bridge rates and unresolved frozen primary values", async () => {
  const data = await scoped();
  const expected = calculateBudgetProgress(data, "2026-04", new Date());
  const result = await getAnalyticsSummary(createDb(), {
    from: "2026-04-01",
    to: "2026-04-30",
    timeZone: "America/Montevideo",
  });
  for (const budget of result.budgets) {
    const legacy = expected.find((b) => b.budget.id === budget.budget.id);
    expect(legacy).toBeDefined();
    if (legacy && Number.isFinite(legacy.spent)) expect(budget.spent).toBeCloseTo(legacy.spent);
    else expect(budget.spent).toBeNull();
  }
});

test("empty scopes retain calendar charts and the all-history fallback month in one read", async () => {
  let calls = 0;
  const previous = neonConfig.fetchFunction!;
  neonConfig.fetchFunction = (input: string, init: RequestInit) => {
    calls++;
    return previous(input, init);
  };
  try {
    const data = await getReportDetails(
      createDb(),
      {
        from: "2020-01-01",
        to: "2026-04-30",
        selectedMonth: "2026-02",
        periodMode: "all",
        accountId: randomUUID(),
        timeZone: "America/Montevideo",
      },
      now,
    );
    expect(calls).toBe(1);
    expect(data.monthlySeries).toEqual([{ month: "2026-04", income: 0, expenses: 0, cashFlow: 0 }]);
    expect(data.expenseTrend).toHaveLength(31);
    expect(data.expenseTrend[30]).toEqual({
      day: "Day 31",
      previousPrevious: 0,
      previous: 0,
      current: null,
    });
    expect(data.expenseSequenceTrend).toEqual([]);
    expect(data.merchants).toEqual([]);
  } finally {
    neonConfig.fetchFunction = previous;
  }
});

test("the reporting preference includes hidden activity without overriding explicit accounts", async () => {
  await fixture.pool.query("UPDATE settings SET include_hidden_accounts_in_reports=true");
  try {
    const query = {
      from: "2026-04-01",
      to: "2026-04-30",
      selectedMonth: "2026-04",
      periodMode: "month" as const,
      timeZone: "America/Montevideo",
    };
    expect((await getReportDetails(createDb(), query, now)).currentMonthTotals.expenses).toBe(217);
    expect(
      (await getReportDetails(createDb(), { ...query, accountId: hidden }, now)).currentMonthTotals
        .expenses,
    ).toBe(100);
  } finally {
    await fixture.pool.query("UPDATE settings SET include_hidden_accounts_in_reports=false");
  }
});

test("an explicit card report includes hidden bank activity and preserves frozen trend totals", async () => {
  const card = randomUUID(),
    ids = Array.from({ length: 3 }, () => randomUUID());
  await fixture.pool.query(
    "INSERT INTO credit_cards(id,name,issuer,last_four,credit_limit,limit_currency,closing_day,due_day,color,icon) VALUES($1,'Synthetic scoped card','Synthetic bank','1234',5000,'UYU',20,5,'blue','card')",
    [card],
  );
  try {
    await fixture.pool.query(
      "INSERT INTO records(id,type,amount,currency,account_id,category_id,credit_card_id,payment_type,payment_status,exchange_rate_to_primary,occurred_at) VALUES($1,'expense',30,'UYU',$4,$6,$7,'credit','cleared',1,'2026-04-02T12:00:00Z'),($2,'expense',2,'USD',$5,$6,$7,'credit','needs_review',40,'2026-03-02T12:00:00Z'),($3,'expense',999,'UYU',$4,$6,$7,'credit','cancelled',1,'2026-04-03T12:00:00Z')",
      [...ids, hidden, bank, category, card],
    );
    const dataset = await getWalletDataset(createDb());
    const cardDataset = {
      ...dataset,
      records: dataset.records.filter((row) => row.creditCardId === card),
    };
    const query = {
      from: "2026-04-01",
      to: "2026-04-30",
      selectedMonth: "2026-04",
      periodMode: "month" as const,
      timeZone: "America/Montevideo",
      creditCardId: card,
    };
    const data = await getReportDetails(createDb(), query, now);
    expect(data.expenseTrend).toEqual(
      buildExpenseComparisonSeries(
        cardDataset,
        relativeMonthKeys("2026-04", 3).map(dateRangeForMonth),
      ),
    );
    expect(data.previousTotals.expenses).toBe(80);
    expect(data.currentMonthTotals.expenses).toBe(30);
    const visibleOnly = await getReportDetails(createDb(), { ...query, accountId: bank }, now);
    expect(visibleOnly.currentMonthTotals.expenses).toBe(0);
    expect(visibleOnly.previousTotals.expenses).toBe(80);
  } finally {
    await fixture.pool.query("DELETE FROM records WHERE id=ANY($1::uuid[])", [ids]);
    await fixture.pool.query("DELETE FROM credit_cards WHERE id=$1", [card]);
  }
});

test.each([undefined, bank, hidden])(
  "view models consume SQL totals without history and preserve period formulas: %s",
  async (accountId) => {
    const dataset = await scoped(accountId);
    const reference = await getWalletReference(createDb());
    const balances = await getAccountBalanceMetrics(
      createDb(),
      { timeZone: "America/Montevideo" },
      now,
    );
    for (const selection of [
      { from: "2026-04-01", to: "2026-04-30", periodMode: "month" as const },
      { from: "2026-03-29", to: "2026-04-07", periodMode: "custom" as const },
      { from: "2026-02-05", to: "2026-07-01", periodMode: "all" as const },
    ]) {
      const query = {
        ...selection,
        accountId,
        timeZone: "America/Montevideo",
        selectedMonth: "2026-04",
      };
      const totals = await getAnalyticsSummary(createDb(), query);
      const details = await getReportDetails(createDb(), query, now);
      const view = buildReportViewModel(reference, balances, totals, details, query, now);
      const expected =
        selection.periodMode === "month"
          ? calculateSummary(dataset, "2026-04", new Date())
          : calculateSummaryForDateRange(dataset, selection, new Date());
      expect(view.summary).toEqual(expected);
      expect(view.emergencyRunway).toEqual(
        calculateEmergencyRunway(
          dataset,
          selection.periodMode === "month" ? "2026-04" : selection.to.slice(0, 7),
          undefined,
          new Date(),
        ),
      );
      expect(view.allowedDaily).toBe(calculateAllowedDailySpend(dataset, new Date()));
      expect(view.projection).toBe(
        calculateEndOfMonthProjection(dataset, expected.dailyAverageExpense, new Date()),
      );
      expect(view.recommendations).toEqual(buildSavingsRecommendations(dataset, new Date()));
      expect(categoryBreakdown(totals, "expense")).toEqual(
        selection.periodMode === "month"
          ? calculateCategoryExpenses(dataset, "2026-04", undefined, new Date())
          : calculateCategoryExpensesForDateRange(dataset, selection),
      );
      expect(view).not.toHaveProperty("records");
    }
  },
);
