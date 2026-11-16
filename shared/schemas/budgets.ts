import { z } from "zod";

import { positiveMoneySchema, currencySchema, uuidSchema, nonEmptyPatch } from "./common.js";

export const budgetSchema = z.object({
  name: z.string().min(1),
  limitAmount: positiveMoneySchema,
  currency: currencySchema,
  period: z.literal("monthly"),
  categoryId: uuidSchema.optional(),
  tagId: uuidSchema.optional(),
  accountId: uuidSchema.optional(),
  goalId: uuidSchema.optional(),
  color: z.string().min(1),
  isActive: z.boolean().default(true),
});

export const budgetPatchSchema = nonEmptyPatch({
  name: z.string().min(1).optional(),
  limitAmount: positiveMoneySchema.optional(),
  currency: currencySchema.optional(),
  period: z.literal("monthly").optional(),
  categoryId: uuidSchema.nullable().optional(),
  tagId: uuidSchema.nullable().optional(),
  accountId: uuidSchema.nullable().optional(),
  goalId: uuidSchema.nullable().optional(),
  color: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

export type BudgetPatch = z.infer<typeof budgetPatchSchema>;
