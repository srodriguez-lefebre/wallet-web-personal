import { z } from "zod";

import {
  positiveMoneySchema,
  nonnegativeMoneySchema,
  debtDirectionSchema,
  currencySchema,
  uuidSchema,
  debtStatusSchema,
  nonEmptyPatch,
} from "./common.js";

export const debtSchema = z
  .object({
    name: z.string().min(1),
    direction: debtDirectionSchema,
    originalAmount: positiveMoneySchema.optional(),
    pendingAmount: nonnegativeMoneySchema.optional(),
    currency: currencySchema,
    counterpartyName: z.string().min(1),
    accountId: uuidSchema.optional(),
    categoryId: uuidSchema,
    status: debtStatusSchema.default("active"),
    isVisible: z.boolean().default(true),
    startedAt: z.iso.datetime().or(z.iso.date()),
    dueAt: z.iso.datetime().or(z.iso.date()).optional(),
    note: z.string().optional(),
    recurringDebtId: uuidSchema.optional(),
    recurringMonth: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.originalAmount !== undefined &&
      value.pendingAmount !== undefined &&
      value.pendingAmount > value.originalAmount
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["pendingAmount"],
        message: "Pending amount cannot be greater than original amount",
      });
    }
  });

export const recurringDebtSchema = z.object({
  name: z.string().min(1),
  direction: debtDirectionSchema,
  amount: positiveMoneySchema.optional(),
  currency: currencySchema,
  counterpartyName: z.string().min(1),
  accountId: uuidSchema.optional(),
  categoryId: uuidSchema,
  dayOfMonth: z.number().int().min(1).max(31),
  isActive: z.boolean().default(true),
  startedAt: z.iso.datetime().or(z.iso.date()),
  note: z.string().optional(),
});

export const debtPaymentSchema = z.object({
  amount: z.number().positive(),
  accountAmount: z.number().positive().optional(),
  accountId: uuidSchema,
  occurredAt: z.iso.datetime(),
  note: z.string().optional(),
  saveAccountToDebt: z.boolean().optional(),
  idempotencyKey: uuidSchema.optional(),
});

export const debtPatchSchema = nonEmptyPatch({
  name: z.string().min(1).optional(),
  direction: debtDirectionSchema.optional(),
  originalAmount: positiveMoneySchema.nullable().optional(),
  pendingAmount: nonnegativeMoneySchema.nullable().optional(),
  currency: currencySchema.optional(),
  counterpartyName: z.string().min(1).optional(),
  accountId: uuidSchema.nullable().optional(),
  categoryId: uuidSchema.optional(),
  status: debtStatusSchema.optional(),
  isVisible: z.boolean().optional(),
  startedAt: z.iso.datetime().or(z.iso.date()).optional(),
  dueAt: z.iso.datetime().or(z.iso.date()).nullable().optional(),
  note: z.string().nullable().optional(),
  recurringDebtId: uuidSchema.nullable().optional(),
  recurringMonth: z.string().nullable().optional(),
});

export const recurringDebtPatchSchema = nonEmptyPatch({
  name: z.string().min(1).optional(),
  direction: debtDirectionSchema.optional(),
  amount: positiveMoneySchema.nullable().optional(),
  currency: currencySchema.optional(),
  counterpartyName: z.string().min(1).optional(),
  accountId: uuidSchema.nullable().optional(),
  categoryId: uuidSchema.optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  isActive: z.boolean().optional(),
  startedAt: z.iso.datetime().or(z.iso.date()).optional(),
  note: z.string().nullable().optional(),
});

export type DebtPatch = z.infer<typeof debtPatchSchema>;

export type RecurringDebtPatch = z.infer<typeof recurringDebtPatchSchema>;
