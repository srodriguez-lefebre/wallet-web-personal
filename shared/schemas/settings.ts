import { z } from "zod";

import {
  currencySchema,
  uuidSchema,
  paymentTypeSchema,
  paymentStatusSchema,
  nonEmptyPatch,
} from "./common.js";

export const settingsSchema = z.object({
  primaryCurrency: currencySchema,
  primaryAccountId: uuidSchema.optional(),
  theme: z.enum(["light", "dark", "system"]),
  defaultDashboardPreset: z.enum([
    "general",
    "spending",
    "cash-flow",
    "goals",
    "accounts",
    "monthly-review",
  ]),
  locale: z.literal("es-UY"),
  includeHiddenAccountsInReports: z.boolean(),
  defaultAccountId: uuidSchema.optional(),
  defaultPaymentType: paymentTypeSchema,
  defaultCreditCardId: uuidSchema.optional(),
  defaultPaymentStatus: paymentStatusSchema,
  reviewSeenThrough: z.iso.datetime().optional(),
});

export const settingsPatchSchema = nonEmptyPatch({
  reviewSeenThrough: z.iso.datetime().optional(),
  primaryCurrency: currencySchema.optional(),
  primaryAccountId: uuidSchema.nullable().optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
  defaultDashboardPreset: settingsSchema.shape.defaultDashboardPreset.optional(),
  locale: z.literal("es-UY").optional(),
  includeHiddenAccountsInReports: z.boolean().optional(),
  defaultAccountId: uuidSchema.nullable().optional(),
  defaultPaymentType: paymentTypeSchema.optional(),
  defaultCreditCardId: uuidSchema.nullable().optional(),
  defaultPaymentStatus: paymentStatusSchema.optional(),
});

export type SettingsPatch = z.infer<typeof settingsPatchSchema>;
