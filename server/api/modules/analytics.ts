import { getAnalyticsSummary } from "../../db/analytics.js";

import type { HandlerMap } from "../handler-types.js";
export const analyticsHandlers = {
  "analytics.summary": (ctx, { query }) => getAnalyticsSummary(ctx.db, query),
} satisfies Pick<HandlerMap, "analytics.summary">;
