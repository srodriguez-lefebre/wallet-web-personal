import { z } from "zod";

import { analyticsQuerySchema } from "./analytics-contract.js";
import {
  debtSchema,
  uuidSchema,
  walletDatasetSchema,
  walletRecordResponseSchema,
} from "./schemas.js";

export const referenceQuerySchema = z.object({ timeZone: analyticsQuerySchema.shape.timeZone });
export const walletReferenceSchema = walletDatasetSchema
  .pick({
    recordTemplates: true,
    settings: true,
    accounts: true,
    categories: true,
    tags: true,
    creditCards: true,
    goals: true,
    goalReservations: true,
    budgets: true,
    exchangeRates: true,
    investments: true,
    debts: true,
    recurringDebts: true,
    installmentPlans: true,
  })
  .extend({
    recordSummary: z.object({
      from: z.iso.date().nullable(),
      to: z.iso.date().nullable(),
      months: z.array(z.string().regex(/^\d{4}-\d{2}$/)),
      total: z.number().int().nonnegative(),
      review: z.number().int().nonnegative(),
      newReviews: z.number().int().nonnegative(),
      latestReviewAt: z.iso.datetime().nullable(),
    }),
  });
export const recordsPageSchema = z.object({
  items: z.array(walletRecordResponseSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
export const referenceBootstrapInputSchema = referenceQuerySchema.extend({
  recordsLimit: z.number().int().min(1).max(500).default(100),
  recordsCursor: z.string().nullable().optional(),
});
export const referenceBootstrapSchema = z.object({
  reference: walletReferenceSchema,
  recordsPage: recordsPageSchema,
  generatedDebts: z.array(debtSchema.safeExtend({ id: uuidSchema })),
  serverDate: z.iso.date(),
});
export type WalletReference = z.infer<typeof walletReferenceSchema>;
export type ReferenceQuery = z.infer<typeof referenceQuerySchema>;
export type ReferenceBootstrap = z.infer<typeof referenceBootstrapSchema>;
