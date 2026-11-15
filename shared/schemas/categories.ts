import { z } from "zod";

import { uuidSchema, nonEmptyPatch } from "./common.js";

export const categorySchema = z.object({
  name: z.string().min(1),
  parentId: uuidSchema.optional(),
  color: z.string().min(1),
  icon: z.string().min(1),
});

export const categoryPatchSchema = nonEmptyPatch({
  name: z.string().min(1).optional(),
  parentId: uuidSchema.nullable().optional(),
  color: z.string().min(1).optional(),
  icon: z.string().min(1).optional(),
});

export type CategoryPatch = z.infer<typeof categoryPatchSchema>;

export const categoryEntitySchema = categorySchema.extend({
  id: uuidSchema,
  systemKey: z.string().optional(),
  createdAt: z.iso.datetime().optional(),
});
export const categoryDetailsSchema = categoryEntitySchema.extend({
  archivedAt: z.iso.datetime().nullable(),
  isSystem: z.boolean(),
  isSelectable: z.boolean(),
});

const count = z.number().int().nonnegative();
export const categoryUsageSchema = z.object({
  records: count,
  cardRecords: count,
  budgets: count,
  debts: count,
  recurringDebts: count,
  installmentPlans: count,
  templates: count,
  merchants: count,
  lastUsedAt: z.iso.datetime().nullable(),
});
export type CategoryUsage = z.infer<typeof categoryUsageSchema>;

export const categoryUsageQuerySchema = z.object({
  ids: z
    .string()
    .refine(
      (value) => value.split(",").every((id) => uuidSchema.safeParse(id).success),
      "Use comma-separated category IDs",
    )
    .optional(),
});

export const categoryMergeInputSchema = z.object({ targetId: uuidSchema });
export const categoryMergeResultSchema = z.object({
  targetId: uuidSchema,
  archivedCategoryIds: z.array(uuidSchema),
  reassigned: categoryUsageSchema.omit({ lastUsedAt: true }),
});
