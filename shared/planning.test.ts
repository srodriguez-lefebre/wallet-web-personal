import { expect, test } from "vitest";
import type { Debt, GoalProgress, Investment } from "./types.js";
import {
  calculateGoalFundingPlan,
  debtDueState,
  selectDebtsByDueDate,
  summarizeInvestmentsByCurrency,
} from "./planning.js";

const now = new Date(2026, 5, 21, 23, 59);
function progress(overrides: Partial<GoalProgress> = {}): GoalProgress {
  return {
    goal: {
      id: "g",
      name: "Goal",
      targetAmount: 100,
      currency: "UYU",
      color: "blue",
      icon: "flag",
      status: "active",
      isVisible: true,
      tagIds: [],
      deadline: "2026-06-30",
    },
    remaining: 100,
    reserved: 0,
    spent: 0,
    committed: 0,
    percentage: 0,
    overTarget: 0,
    hasMissingExchangeRate: false,
    ...overrides,
  };
}
function debt(id: string, dueAt?: string, overrides: Partial<Debt> = {}): Debt {
  return {
    id,
    name: id,
    direction: "payable",
    originalAmount: 100,
    pendingAmount: 100,
    currency: "UYU",
    counterpartyName: "Party",
    categoryId: "c",
    status: "active",
    isVisible: true,
    startedAt: "2026-06-01",
    dueAt,
    ...overrides,
  };
}
test("goal plan uses the remaining amount and includes today's contribution", () => {
  expect(
    calculateGoalFundingPlan(progress({ remaining: 80 }), now),
  ).toMatchObject({
    status: "ready",
    remaining: 80,
    daysRemaining: 9,
    dailyContribution: 8,
    weeklyContribution: 56,
  });
});
test("today's deadline uses a single contribution and caps the weekly amount", () => {
  const item = progress();
  item.goal.deadline = "2026-06-21";
  expect(calculateGoalFundingPlan(item, now)).toMatchObject({
    dailyContribution: 100,
    weeklyContribution: 100,
    daysRemaining: 0,
  });
});
test("missing FX never creates a zero remaining balance or a contribution", () => {
  expect(
    calculateGoalFundingPlan(
      progress({ hasMissingExchangeRate: true, remaining: Number.NaN }),
      now,
    ),
  ).toMatchObject({
    status: "missing_rate",
    remaining: null,
    dailyContribution: null,
    weeklyContribution: null,
  });
});
test.each(["paused", "completed", "cancelled"] as const)(
  "%s goals do not get new contribution recommendations",
  (status) => {
    const item = progress();
    item.goal.status = status;
    expect(calculateGoalFundingPlan(item, now)).toMatchObject({
      status: "inactive",
      dailyContribution: null,
    });
  },
);
test("a fully funded goal needs zero even after its deadline", () => {
  const item = progress({ remaining: 0 });
  item.goal.deadline = "2026-06-01";
  expect(calculateGoalFundingPlan(item, now)).toMatchObject({
    status: "funded",
    dailyContribution: 0,
    weeklyContribution: 0,
  });
});
test.each([
  [undefined, "no_deadline"],
  ["invalid", "no_deadline"],
  ["2026-06-20", "overdue"],
] as const)(
  "unavailable deadline %s does not invent a plan",
  (deadline, status) => {
    const item = progress();
    item.goal.deadline = deadline;
    expect(calculateGoalFundingPlan(item, now)).toMatchObject({
      status,
      dailyContribution: null,
    });
  },
);
test("calendar days ignore stored time offsets and local clock hours", () => {
  expect(
    debtDueState(debt("today", "2026-06-21T00:00:00.000Z"), now),
  ).toMatchObject({ kind: "today", days: 0 });
  expect(
    debtDueState(debt("tomorrow", "2026-06-22T12:00:00.000Z"), now),
  ).toMatchObject({ kind: "upcoming", days: 1 });
});
test("open debts sort dated first and undated last, preserving unknown balances", () => {
  const debts = [
    debt("unknown", undefined, {
      originalAmount: undefined,
      pendingAmount: undefined,
    }),
    debt("paid", "2026-06-01", { status: "paid" }),
    debt("later", "2026-06-30"),
    debt("earlier", "2026-06-20"),
  ];
  const result = selectDebtsByDueDate(debts, { window: "all", asOf: now });
  expect(result.map((item) => item.id)).toEqual([
    "earlier",
    "later",
    "unknown",
  ]);
  expect(result[2].pendingAmount).toBeUndefined();
  expect(debts[0].id).toBe("unknown");
});
test("next seven days includes today and day seven, excluding overdue and day eight", () => {
  const debts = [
    debt("overdue", "2026-06-20"),
    debt("today", "2026-06-21"),
    debt("seven", "2026-06-28"),
    debt("eight", "2026-06-29"),
    debt("unknown"),
  ];
  expect(
    selectDebtsByDueDate(debts, { window: "next7", asOf: now }).map(
      (item) => item.id,
    ),
  ).toEqual(["today", "seven"]);
  expect(
    selectDebtsByDueDate(debts, { window: "overdue", asOf: now }).map(
      (item) => item.id,
    ),
  ).toEqual(["overdue"]);
});
test("next thirty days retains paused debts and unknown balances without including day thirty-one", () => {
  const debts = [
    debt("thirty", "2026-07-21", {
      status: "paused",
      pendingAmount: undefined,
    }),
    debt("thirtyone", "2026-07-22"),
  ];
  expect(
    selectDebtsByDueDate(debts, { window: "next30", asOf: now }).map(
      (item) => item.id,
    ),
  ).toEqual(["thirty"]);
});
test("settled debt does not display an overdue badge", () => {
  expect(
    debtDueState(
      debt("paid", "2026-01-01", { pendingAmount: 0, status: "paid" }),
      now,
    ).kind,
  ).toBe("settled");
});
test("calendar urgency remains one day across daylight-saving weekends", () => {
  expect(
    debtDueState(debt("spring", "2026-03-08"), new Date(2026, 2, 7, 23, 59))
      .days,
  ).toBe(1);
  expect(
    debtDueState(debt("autumn", "2026-11-01"), new Date(2026, 9, 31, 23, 59))
      .days,
  ).toBe(1);
});
test("an invalid calendar date is treated as undated instead of inventing urgency", () => {
  expect(debtDueState(debt("invalid", "2026-02-30"), now).kind).toBe("undated");
});
test("currency portfolios keep unlike currencies separate and support complete losses", () => {
  const investments = [
    { currency: "UYU", amountInvested: 100, currentValue: 120 },
    { currency: "USD", amountInvested: 10, currentValue: 0 },
    { currency: "UYU", amountInvested: 50, currentValue: 60 },
  ] as Investment[];
  expect(summarizeInvestmentsByCurrency(investments)).toEqual([
    {
      currency: "USD",
      count: 1,
      invested: 10,
      currentValue: 0,
      gain: -10,
      returnPercentage: -100,
    },
    {
      currency: "UYU",
      count: 2,
      invested: 150,
      currentValue: 180,
      gain: 30,
      returnPercentage: 20,
    },
  ]);
});
test("legacy zero cost never produces infinite percentage", () => {
  expect(
    summarizeInvestmentsByCurrency([
      { currency: "USD", amountInvested: 0, currentValue: 10 } as Investment,
    ])[0].returnPercentage,
  ).toBeNull();
});
