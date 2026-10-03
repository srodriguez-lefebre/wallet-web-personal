import { isOpenDebt } from "./calculations.js";
import type { CurrencyCode, Debt, GoalProgress, Investment } from "./types.js";

// Entity dates represent calendar dates. Clock hours must not change urgency.
function calendarDay(value: string | Date): number | null {
  const key =
    value instanceof Date
      ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`
      : value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const parsed = new Date(`${key}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== key
  )
    return null;
  return parsed.getTime() / 86_400_000;
}

function daysUntil(value: string | undefined, asOf: Date) {
  const target = value ? calendarDay(value) : null;
  const today = calendarDay(asOf);
  return target === null || today === null ? null : target - today;
}

export interface GoalFundingPlan {
  status:
    | "ready"
    | "funded"
    | "missing_rate"
    | "inactive"
    | "no_deadline"
    | "overdue";
  remaining: number | null;
  daysRemaining: number | null;
  dailyContribution: number | null;
  weeklyContribution: number | null;
}

export function calculateGoalFundingPlan(
  progress: GoalProgress,
  asOf = new Date(),
): GoalFundingPlan {
  const daysRemaining = daysUntil(progress.goal.deadline, asOf);
  const remaining =
    progress.hasMissingExchangeRate || !Number.isFinite(progress.remaining)
      ? null
      : Math.max(0, progress.remaining);
  const base = {
    remaining,
    daysRemaining,
    dailyContribution: null,
    weeklyContribution: null,
  };
  if (remaining === null) return { ...base, status: "missing_rate" };
  if (progress.goal.status !== "active") return { ...base, status: "inactive" };
  if (remaining === 0)
    return {
      ...base,
      status: "funded",
      dailyContribution: 0,
      weeklyContribution: 0,
    };
  if (daysRemaining === null) return { ...base, status: "no_deadline" };
  if (daysRemaining < 0) return { ...base, status: "overdue" };
  const contributionDays = daysRemaining + 1;
  const centsCeiling = (amount: number) => Math.ceil(amount * 100) / 100;
  return {
    ...base,
    status: "ready",
    dailyContribution: centsCeiling(remaining / contributionDays),
    weeklyContribution: Math.min(
      remaining,
      centsCeiling(
        (remaining * Math.min(7, contributionDays)) / contributionDays,
      ),
    ),
  };
}

export type DebtDueWindow = "all" | "overdue" | "next7" | "next30";
export interface DebtDueState {
  kind: "overdue" | "today" | "upcoming" | "undated" | "settled";
  days: number | null;
}
export function debtDueState(debt: Debt, asOf = new Date()): DebtDueState {
  const days = daysUntil(debt.dueAt, asOf);
  if (!isOpenDebt(debt)) return { kind: "settled", days };
  if (days === null) return { kind: "undated", days };
  return {
    kind: days < 0 ? "overdue" : days === 0 ? "today" : "upcoming",
    days,
  };
}

export function selectDebtsByDueDate(
  debts: Debt[],
  {
    window = "all",
    asOf = new Date(),
  }: { window?: DebtDueWindow; asOf?: Date } = {},
): Debt[] {
  return debts
    .filter(isOpenDebt)
    .filter((debt) => {
      const state = debtDueState(debt, asOf);
      if (window === "all") return true;
      if (window === "overdue") return state.kind === "overdue";
      return (
        state.days !== null &&
        state.days >= 0 &&
        state.days <= (window === "next7" ? 7 : 30)
      );
    })
    .sort((a, b) => {
      const first = daysUntil(a.dueAt, asOf),
        second = daysUntil(b.dueAt, asOf);
      if (first === null && second !== null) return 1;
      if (second === null && first !== null) return -1;
      return (first ?? 0) - (second ?? 0) || a.id.localeCompare(b.id);
    });
}

export interface InvestmentCurrencySummary {
  currency: CurrencyCode;
  count: number;
  invested: number;
  currentValue: number;
  gain: number;
  returnPercentage: number | null;
}
export function summarizeInvestmentsByCurrency(
  investments: Investment[],
): InvestmentCurrencySummary[] {
  const totals = new Map<
    CurrencyCode,
    { invested: number; currentValue: number; count: number }
  >();
  for (const investment of investments) {
    const total = totals.get(investment.currency) ?? {
      invested: 0,
      currentValue: 0,
      count: 0,
    };
    total.invested += investment.amountInvested;
    total.currentValue += investment.currentValue;
    total.count += 1;
    totals.set(investment.currency, total);
  }
  return [...totals]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, total]) => {
      const gain = total.currentValue - total.invested;
      return {
        currency,
        ...total,
        gain,
        returnPercentage:
          total.invested > 0 ? (gain / total.invested) * 100 : null,
      };
    });
}
