import { getAnalyticsSummary } from "../../db/analytics.js";
import { getAccountBalanceMetrics } from "../../db/balances.js";
import { getGoalProgressMetrics } from "../../db/goals/progress.js";

import type { HandlerMap } from "../handler-types.js";
export const analyticsHandlers = {
  "analytics.accountBalances": (ctx, { query }) => getAccountBalanceMetrics(ctx.db, query, ctx.now),
  "analytics.goalProgress": (ctx) => getGoalProgressMetrics(ctx.db, ctx.now),
  "analytics.summary": (ctx, { query }) => getAnalyticsSummary(ctx.db, query),
} satisfies Pick<
  HandlerMap,
  "analytics.summary" | "analytics.accountBalances" | "analytics.goalProgress"
>;
