import { getAnalyticsSummary } from "../../db/analytics.js";
import { getAccountBalanceMetrics } from "../../db/balances.js";
import { getBalanceTrend } from "../../db/balance-trend.js";
import { getGoalProgressMetrics } from "../../db/goals/progress.js";
import { getReportDetails } from "../../db/reports.js";

import type { HandlerMap } from "../handler-types.js";
export const analyticsHandlers = {
  "analytics.balanceTrend": (ctx, { query }) => getBalanceTrend(ctx.db, query, ctx.now),
  "analytics.details": (ctx, { query }) => getReportDetails(ctx.db, query, ctx.now),
  "analytics.accountBalances": (ctx, { query }) => getAccountBalanceMetrics(ctx.db, query, ctx.now),
  "analytics.goalProgress": (ctx) => getGoalProgressMetrics(ctx.db, ctx.now),
  "analytics.summary": (ctx, { query }) => getAnalyticsSummary(ctx.db, query),
} satisfies Pick<
  HandlerMap,
  | "analytics.summary"
  | "analytics.accountBalances"
  | "analytics.goalProgress"
  | "analytics.details"
  | "analytics.balanceTrend"
>;
