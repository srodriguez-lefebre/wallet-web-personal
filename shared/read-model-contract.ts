import { z } from "zod";

import { referenceQuerySchema } from "./reference-contract.js";
import { uuidSchema } from "./schemas.js";

export const accountBalanceQuerySchema = referenceQuerySchema.extend({
  cutoff: z.iso.date().optional(),
});
export const accountBalanceMetricSchema = z.object({
  accountId: uuidSchema,
  balance: z.number(),
  totalBalance: z.number(),
  reserved: z.number(),
  freeBalance: z.number(),
  balanceInPrimary: z.number().nullable(),
  totalBalanceInPrimary: z.number().nullable(),
});
export const accountBalanceMetricsSchema = z.array(accountBalanceMetricSchema);
export const goalProgressMetricSchema = z.object({
  goalId: uuidSchema,
  hasMissingExchangeRate: z.boolean(),
  reserved: z.number().nullable(),
  spent: z.number().nullable(),
  committed: z.number().nullable(),
  remaining: z.number().nullable(),
  overTarget: z.number().nullable(),
  percentage: z.number().nullable(),
});
export const goalProgressMetricsSchema = z.array(goalProgressMetricSchema);
export type AccountBalanceQuery = z.infer<typeof accountBalanceQuerySchema>;
export type AccountBalanceMetric = z.infer<typeof accountBalanceMetricSchema>;
export type GoalProgressMetric = z.infer<typeof goalProgressMetricSchema>;
