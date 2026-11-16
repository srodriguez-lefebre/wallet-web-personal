import { z } from "zod";

import { positiveMoneySchema, currencySchema, uuidSchema, nonEmptyPatch } from "./common.js";

export const installmentPlanSchema = z
  .object({
    name: z.string().min(1),
    totalAmount: positiveMoneySchema,
    currency: currencySchema,
    installmentsTotal: z.number().int().positive(),
    installmentsPaid: z.number().int().nonnegative(),
    accountId: uuidSchema,
    categoryId: uuidSchema,
    nextPaymentAt: z.iso.datetime().or(z.iso.date()).optional(),
    note: z.string().optional(),
  })
  .refine((value) => value.installmentsPaid <= value.installmentsTotal, {
    path: ["installmentsPaid"],
    message: "Paid installments cannot exceed the total",
  });

export const installmentPlanPatchSchema = nonEmptyPatch({
  name: z.string().min(1).optional(),
  totalAmount: positiveMoneySchema.optional(),
  currency: currencySchema.optional(),
  installmentsTotal: z.number().int().positive().optional(),
  installmentsPaid: z.number().int().nonnegative().optional(),
  accountId: uuidSchema.optional(),
  categoryId: uuidSchema.optional(),
  nextPaymentAt: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

export type InstallmentPlanPatch = z.infer<typeof installmentPlanPatchSchema>;
