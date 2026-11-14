import { z } from "zod";

import { analyticsQuerySchema } from "./analytics-contract.js";
import { uuidSchema } from "./schemas.js";

export const reportQuerySchema = analyticsQuerySchema.safeExtend({
  selectedMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  periodMode: z.enum(["month", "custom", "all"]),
});
const totals = z.object({ income: z.number(), expenses: z.number(), cashFlow: z.number() });
const comparison = {
  previousPrevious: z.number().nullable(),
  previous: z.number().nullable(),
  current: z.number().nullable(),
};
export const balanceTrendQuerySchema = reportQuerySchema.safeExtend({ accountId: uuidSchema });
export const balanceTrendSchema = z.array(z.object({ day: z.string(), ...comparison }));
export type BalanceTrendQuery = z.infer<typeof balanceTrendQuerySchema>;
export const reportDetailsSchema = z.object({
  monthlySeries: z.array(totals.extend({ month: z.string() })),
  expenseTrend: balanceTrendSchema,
  expenseSequenceTrend: z.array(z.object({ expense: z.string(), ...comparison })),
  previousTotals: totals,
  currentMonthTotals: totals,
  averageMonthlyExpenses: z.number(),
  expenseMonths: z.array(z.string()),
  merchants: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      purchases: z.number().int(),
      total: z.number(),
      average: z.number(),
    }),
  ),
});
export type ReportQuery = z.infer<typeof reportQuerySchema>;
export type ReportDetails = z.infer<typeof reportDetailsSchema>;
