import { z } from "zod";

export const currencySchema = z.enum(["UYU", "USD", "EUR", "BRL", "ARS"]);

export const recordTypeSchema = z.enum(["expense", "income", "transfer"]);

export const paymentTypeSchema = z.enum([
  "cash",
  "debit",
  "credit",
  "transfer",
  "other",
]);

export const paymentStatusSchema = z.enum(["cleared", "pending", "cancelled"]);

export const debtDirectionSchema = z.enum(["payable", "receivable"]);

export const debtStatusSchema = z.enum(["active", "paid", "paused"]);

export const accountSchema = z.object({
  name: z.string().min(1),
  type: z.enum([
    "cash",
    "bank",
    "credit_card",
    "savings",
    "recurring",
    "investment",
    "custom",
  ]),
  currency: currencySchema,
  initialBalance: z.number(),
  color: z.string().min(1),
  icon: z.string().min(1),
  isVisible: z.boolean(),
  isActive: z.boolean(),
  note: z.string().optional(),
});

export const categorySchema = z.object({
  name: z.string().min(1),
  parentId: z.string().optional(),
  color: z.string().min(1),
  icon: z.string().min(1),
});

export const tagSchema = z.object({
  name: z.string().min(1),
  color: z.string().min(1),
  isActive: z.boolean().default(true),
});

export const recordSchema = z
  .object({
    type: recordTypeSchema,
    amount: z.number().positive(),
    currency: currencySchema,
    accountId: z.string().min(1).optional(),
    accountAmount: z.number().positive().optional(),
    creditCardId: z.string().min(1).optional(),
    destinationAccountId: z.string().optional(),
    categoryId: z.string().optional(),
    counterpartyName: z.string().optional(),
    tagIds: z.array(z.string()).default([]),
    paymentType: paymentTypeSchema,
    paymentStatus: paymentStatusSchema,
    exchangeRateToPrimary: z.number().positive().default(1),
    amountInLimitCurrency: z.number().positive().optional(),
    exchangeRateToLimitCurrency: z.number().positive().optional(),
    occurredAt: z.string().datetime(),
    note: z.string().optional(),
    isFixed: z.boolean().optional(),
    debtId: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type !== "transfer") {
      if (!value.accountId) {
        ctx.addIssue({
          code: "custom",
          path: ["accountId"],
          message: "An account is required",
        });
      }
    }

    if (value.creditCardId && value.paymentType !== "credit") {
      ctx.addIssue({
        code: "custom",
        path: ["paymentType"],
        message: "Credit card records must use credit as payment type",
      });
    }

    if (value.creditCardId && value.amountInLimitCurrency === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["amountInLimitCurrency"],
        message: "Amount in the card limit currency is required",
      });
    }

    if (value.creditCardId && value.exchangeRateToLimitCurrency === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["exchangeRateToLimitCurrency"],
        message: "Exchange rate to the card limit currency is required",
      });
    }
    if (value.type !== "transfer" && !value.categoryId) {
      ctx.addIssue({
        code: "custom",
        path: ["categoryId"],
        message: "Category is required for income and expense records",
      });
    }

    if (value.type === "transfer") {
      if (!value.accountId) {
        ctx.addIssue({
          code: "custom",
          path: ["accountId"],
          message: "Source account is required for transfers",
        });
      }
      if (!value.destinationAccountId) {
        ctx.addIssue({
          code: "custom",
          path: ["destinationAccountId"],
          message: "Destination account is required for transfers",
        });
      }

      if (value.destinationAccountId === value.accountId) {
        ctx.addIssue({
          code: "custom",
          path: ["destinationAccountId"],
          message: "Destination account must be different",
        });
      }
    }
  });

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
    amount: z.number().positive(),
    currency: currencySchema,
    amountInLimitCurrency: z.number().positive(),
    accountId: z.string().min(1).optional(),
    accountAmount: z.number().positive().optional(),
    occurredAt: z.string().datetime(),
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
    originalRecordId: z.string().min(1).optional(),
    amount: z.number().positive(),
    currency: currencySchema,
    amountInLimitCurrency: z.number().positive(),
    exchangeRateToLimitCurrency: z.number().positive(),
    categoryId: z.string().min(1),
    counterpartyName: z.string().optional(),
    note: z.string().optional(),
    accountId: z.string().min(1).optional(),
    accountAmount: z.number().positive().optional(),
    accountImpactAtCreation: z.boolean().default(false),
    occurredAt: z.string().datetime(),
  })
  .superRefine((value, ctx) => {
    if (value.accountImpactAtCreation && !value.accountId) {
      ctx.addIssue({ code: "custom", path: ["accountId"], message: "Account is required" });
    }
    if (value.accountId && value.accountAmount === undefined) {
      ctx.addIssue({ code: "custom", path: ["accountAmount"], message: "Account amount is required" });
    }
    if (value.kind === "refund" && !value.originalRecordId) {
      ctx.addIssue({ code: "custom", path: ["originalRecordId"], message: "Original movement is required" });
    }
  });

export const goalSchema = z.object({
  name: z.string().min(1),
  targetAmount: z.number().positive(),
  currency: currencySchema,
  color: z.string().min(1),
  icon: z.string().min(1),
  isVisible: z.boolean().default(true),
  deadline: z.string().optional(),
  status: z.enum(["active", "completed", "paused", "cancelled"]).default("active"),
  tagIds: z.array(z.string()).default([]),
  accountId: z.string().optional(),
  note: z.string().optional(),
});

export const goalReservationSchema = z.object({
  goalId: z.string().min(1),
  accountId: z.string().min(1),
  amount: z.number().positive(),
  currency: currencySchema,
  createdAt: z.string().datetime(),
  note: z.string().optional(),
});

export const investmentSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["stock", "fund", "crypto", "deposit", "other"]),
  amountInvested: z.number().positive(),
  currentValue: z.number().positive(),
  currency: currencySchema,
  isVisible: z.boolean().default(true),
  startedAt: z.string().datetime().or(z.string().date()),
  note: z.string().optional(),
});

export const debtSchema = z
  .object({
    name: z.string().min(1),
    direction: debtDirectionSchema,
    originalAmount: z.number().positive().optional(),
    pendingAmount: z.number().nonnegative().optional(),
    currency: currencySchema,
    counterpartyName: z.string().min(1),
    accountId: z.string().optional(),
    categoryId: z.string().min(1),
    status: debtStatusSchema.default("active"),
    isVisible: z.boolean().default(true),
    startedAt: z.string().datetime().or(z.string().date()),
    dueAt: z.string().datetime().or(z.string().date()).optional(),
    note: z.string().optional(),
    recurringDebtId: z.string().optional(),
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
  amount: z.number().positive().optional(),
  currency: currencySchema,
  counterpartyName: z.string().min(1),
  accountId: z.string().optional(),
  categoryId: z.string().min(1),
  dayOfMonth: z.number().int().min(1).max(31),
  isActive: z.boolean().default(true),
  startedAt: z.string().datetime().or(z.string().date()),
  note: z.string().optional(),
});

export const debtPaymentSchema = z.object({
  amount: z.number().positive(),
  accountId: z.string().min(1),
  occurredAt: z.string().datetime(),
  note: z.string().optional(),
  saveAccountToDebt: z.boolean().optional(),
});

export const budgetSchema = z.object({
  name: z.string().min(1),
  limitAmount: z.number().positive(),
  currency: currencySchema,
  period: z.literal("monthly"),
  categoryId: z.string().optional(),
  tagId: z.string().optional(),
  accountId: z.string().optional(),
  goalId: z.string().optional(),
  color: z.string().min(1),
  isActive: z.boolean().default(true),
});

export const settingsSchema = z.object({
  primaryCurrency: currencySchema,
  primaryAccountId: z.string().optional(),
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
  defaultAccountId: z.string().optional(),
  defaultPaymentType: paymentTypeSchema,
  defaultCreditCardId: z.string().optional(),
  defaultPaymentStatus: paymentStatusSchema,
});

export const unlockSchema = z.object({
  token: z.string().min(1),
});
