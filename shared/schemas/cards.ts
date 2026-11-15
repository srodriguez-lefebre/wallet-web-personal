import { z } from "zod";

import { currencySchema, uuidSchema, nonEmptyPatch, id } from "./common.js";

export const creditCardSchema = z.object({
  name: z.string().min(1),
  issuer: z.string().min(1),
  lastFour: z.string().regex(/^\d{4}$/, "Last four must contain exactly four digits"),
  creditLimit: z.number().positive(),
  limitCurrency: currencySchema,
  closingDay: z.number().int().min(1).max(31),
  dueDay: z.number().int().min(1).max(31),
  color: z.string().min(1),
  icon: z.string().min(1),
  isActive: z.boolean(),
  note: z.string().optional(),
});

export const creditCardPaymentSchema = z
  .object({
    idempotencyKey: uuidSchema.optional(),
    statementId: uuidSchema.optional(),
    amount: z.number().positive(),
    currency: currencySchema,
    amountInLimitCurrency: z.number().positive(),
    accountId: uuidSchema.optional(),
    accountAmount: z.number().positive().optional(),
    occurredAt: z.iso.datetime(),
    note: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.accountId && value.accountAmount === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["accountAmount"],
        message: "Account amount is required when an account is selected",
      });
    }
    if (!value.accountId && value.accountAmount !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["accountAmount"],
        message: "Account amount requires an account",
      });
    }
  });

export const creditCardRecordSchema = z
  .object({
    kind: z.enum(["purchase", "refund"]).default("purchase"),
    originalRecordId: uuidSchema.optional(),
    amount: z.number().positive(),
    currency: currencySchema,
    amountInLimitCurrency: z.number().positive(),
    exchangeRateToLimitCurrency: z.number().positive(),
    categoryId: uuidSchema,
    counterpartyName: z.string().optional(),
    note: z.string().optional(),
    accountId: uuidSchema.optional(),
    accountAmount: z.number().positive().optional(),
    accountImpactAtCreation: z.boolean().default(false),
    occurredAt: z.iso.datetime(),
  })
  .superRefine((value, ctx) => {
    if (value.accountImpactAtCreation && !value.accountId) {
      ctx.addIssue({
        code: "custom",
        path: ["accountId"],
        message: "Account is required",
      });
    }
    if (value.accountId && value.accountAmount === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["accountAmount"],
        message: "Account amount is required",
      });
    }
  });

export const creditCardPatchSchema = nonEmptyPatch({
  name: z.string().min(1).optional(),
  issuer: z.string().min(1).optional(),
  lastFour: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
  creditLimit: z.number().positive().optional(),
  limitCurrency: currencySchema.optional(),
  closingDay: z.number().int().min(1).max(31).optional(),
  dueDay: z.number().int().min(1).max(31).optional(),
  color: z.string().min(1).optional(),
  icon: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  note: z.string().nullable().optional(),
});

export const creditCardRecordPatchSchema = nonEmptyPatch({
  kind: z.enum(["purchase", "refund"]).optional(),
  originalRecordId: uuidSchema.nullable().optional(),
  amount: z.number().positive().optional(),
  currency: currencySchema.optional(),
  amountInLimitCurrency: z.number().positive().optional(),
  exchangeRateToLimitCurrency: z.number().positive().optional(),
  categoryId: uuidSchema.optional(),
  counterpartyName: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  accountId: uuidSchema.nullable().optional(),
  accountAmount: z.number().positive().nullable().optional(),
  accountImpactAtCreation: z.boolean().optional(),
  occurredAt: z.iso.datetime().optional(),
});

export type CreditCardPatch = z.infer<typeof creditCardPatchSchema>;

export type CreditCardRecordPatch = z.infer<typeof creditCardRecordPatchSchema>;

export const cardStatementResponseSchema = z.object({
  ...id,
  creditCardId: uuidSchema,
  cycleStart: z.iso.datetime(),
  cycleEnd: z.iso.datetime(),
  dueAt: z.iso.datetime(),
  status: z.enum(["pending", "partial", "paid", "overdue"]),
  closedAt: z.iso.datetime(),
  paidAt: z.iso.datetime().optional(),
});

export const cardPaymentResponseSchema = creditCardPaymentSchema.safeExtend({
  ...id,
  creditCardId: uuidSchema,
  statementId: uuidSchema.optional(),
});

export const cardRecordResponseSchema = creditCardRecordSchema.safeExtend({
  ...id,
  creditCardId: uuidSchema,
  walletRecordId: uuidSchema.optional(),
  statementId: uuidSchema.optional(),
});

export const paymentAllocationResponseSchema = z.object({
  ...id,
  paymentId: uuidSchema,
  creditCardRecordId: uuidSchema,
  amount: z.number().nonnegative(),
  amountInLimitCurrency: z.number().nonnegative(),
});
