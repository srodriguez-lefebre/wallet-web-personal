import { z } from "zod";

import { currencySchema, nonEmptyPatch } from "./common.js";

export const accountSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["cash", "bank", "credit_card", "savings", "recurring", "investment", "custom"]),
  currency: currencySchema,
  initialBalance: z.number(),
  color: z.string().min(1),
  icon: z.string().min(1),
  isVisible: z.boolean(),
  isActive: z.boolean(),
  note: z.string().optional(),
});

export const accountPatchSchema = nonEmptyPatch({
  name: z.string().min(1).optional(),
  type: accountSchema.shape.type.optional(),
  currency: currencySchema.optional(),
  initialBalance: z.number().optional(),
  color: z.string().min(1).optional(),
  icon: z.string().min(1).optional(),
  isVisible: z.boolean().optional(),
  isActive: z.boolean().optional(),
  note: z.string().nullable().optional(),
});

export type AccountPatch = z.infer<typeof accountPatchSchema>;
