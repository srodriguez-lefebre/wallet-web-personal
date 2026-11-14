import { z } from "zod";

import { budgetSchema, currencySchema, uuidSchema } from "./schemas.js";
export const analyticsQuerySchema = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
    accountId: uuidSchema.optional(),
    timeZone: z
      .string()
      .max(100)
      .default("America/Montevideo")
      .refine((value) => {
        if (/^[+-]/.test(value)) return false;
        try {
          new Intl.DateTimeFormat("en", { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }, "Invalid IANA time zone"),
  })
  .refine((value) => value.from <= value.to, {
    message: "from must not be after to",
    path: ["from"],
  });
const totals = { income: z.number(), expenses: z.number(), cashFlow: z.number() };
export const analyticsSummarySchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  timeZone: z.string(),
  primaryCurrency: currencySchema,
  ...totals,
  unresolvedRecords: z.number().int().nonnegative(),
  categories: z.array(
    z.object({
      id: uuidSchema,
      name: z.string(),
      color: z.string(),
      icon: z.string(),
      parentId: uuidSchema.nullable(),
      income: z.number(),
      expenses: z.number(),
    }),
  ),
  monthlySeries: z.array(z.object({ month: z.string(), ...totals })),
  budgets: z.array(
    z.object({
      budget: budgetSchema.extend({ id: uuidSchema }),
      spent: z.number().nullable(),
      remaining: z.number().nullable(),
      percentage: z.number().nullable(),
      status: z.enum(["ok", "warning", "exceeded"]),
      unresolvedRecords: z.number().int().nonnegative(),
    }),
  ),
});
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
export type AnalyticsResult = z.infer<typeof analyticsSummarySchema>;
