import { z } from "zod";

export const currencySchema = z.enum(["UYU", "USD", "EUR", "BRL", "ARS"]);
export const uuidSchema = z.string().uuid("Invalid UUID");

export const recordTypeSchema = z.enum(["expense", "income", "transfer"]);

export const paymentTypeSchema = z.enum([
  "cash",
  "debit",
  "credit",
  "transfer",
  "other",
]);

export const paymentStatusSchema = z.enum([
  "cleared",
  "pending",
  "needs_review",
  "cancelled",
]);

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
  parentId: uuidSchema.optional(),
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
    accountId: uuidSchema.optional(),
    accountAmount: z.number().positive().optional(),
    creditCardId: uuidSchema.optional(),
    destinationAccountId: uuidSchema.optional(),
    categoryId: uuidSchema.optional(),
    counterpartyName: z.string().optional(),
    tagIds: z.array(uuidSchema).default([]),
    paymentType: paymentTypeSchema,
    paymentStatus: paymentStatusSchema,
    exchangeRateToPrimary: z.number().positive().default(1),
    amountInLimitCurrency: z.number().positive().optional(),
    exchangeRateToLimitCurrency: z.number().positive().optional(),
    occurredAt: z.string().datetime(),
    note: z.string().optional(),
    isFixed: z.boolean().optional(),
    debtId: uuidSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type !== "transfer") {
      if (
        !value.accountId &&
        !value.creditCardId &&
        value.paymentStatus !== "needs_review"
      ) {
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
  lastFour: z
    .string()
    .regex(/^\d{4}$/, "Last four must contain exactly four digits"),
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
    accountId: uuidSchema.optional(),
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
    occurredAt: z.string().datetime(),
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

export const goalSchema = z.object({
  name: z.string().min(1),
  targetAmount: z.number().positive(),
  currency: currencySchema,
  color: z.string().min(1),
  icon: z.string().min(1),
  isVisible: z.boolean().default(true),
  deadline: z.string().optional(),
  status: z
    .enum(["active", "completed", "paused", "cancelled"])
    .default("active"),
  tagIds: z.array(uuidSchema).default([]),
  accountId: uuidSchema.optional(),
  note: z.string().optional(),
});

export const goalReservationSchema = z.object({
  goalId: uuidSchema,
  accountId: uuidSchema,
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
    accountId: uuidSchema.optional(),
    categoryId: uuidSchema,
    status: debtStatusSchema.default("active"),
    isVisible: z.boolean().default(true),
    startedAt: z.string().datetime().or(z.string().date()),
    dueAt: z.string().datetime().or(z.string().date()).optional(),
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
  amount: z.number().positive().optional(),
  currency: currencySchema,
  counterpartyName: z.string().min(1),
  accountId: uuidSchema.optional(),
  categoryId: uuidSchema,
  dayOfMonth: z.number().int().min(1).max(31),
  isActive: z.boolean().default(true),
  startedAt: z.string().datetime().or(z.string().date()),
  note: z.string().optional(),
});

export const debtPaymentSchema = z.object({
  amount: z.number().positive(),
  accountId: uuidSchema,
  occurredAt: z.string().datetime(),
  note: z.string().optional(),
  saveAccountToDebt: z.boolean().optional(),
  idempotencyKey: uuidSchema.optional(),
});

export const budgetSchema = z.object({
  name: z.string().min(1),
  limitAmount: z.number().positive(),
  currency: currencySchema,
  period: z.literal("monthly"),
  categoryId: uuidSchema.optional(),
  tagId: uuidSchema.optional(),
  accountId: uuidSchema.optional(),
  goalId: uuidSchema.optional(),
  color: z.string().min(1),
  isActive: z.boolean().default(true),
});

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
});

export const unlockSchema = z.object({
  token: z.string().min(1),
});

function nonEmptyPatch<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).strict().refine((value) => Object.keys(value).length > 0, {
    message: "Patch must contain at least one field",
  });
}

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

export const categoryPatchSchema = nonEmptyPatch({
  name: z.string().min(1).optional(),
  parentId: uuidSchema.nullable().optional(),
  color: z.string().min(1).optional(),
  icon: z.string().min(1).optional(),
});

export const recordPatchSchema = nonEmptyPatch({
  type: recordTypeSchema.optional(), amount: z.number().positive().optional(),
  currency: currencySchema.optional(), accountId: uuidSchema.optional(),
  accountAmount: z.number().positive().optional(), creditCardId: uuidSchema.optional(),
  destinationAccountId: uuidSchema.nullable().optional(), categoryId: uuidSchema.nullable().optional(),
  counterpartyName: z.string().nullable().optional(), tagIds: z.array(uuidSchema).optional(),
  paymentType: paymentTypeSchema.optional(), paymentStatus: paymentStatusSchema.optional(),
  exchangeRateToPrimary: z.number().positive().optional(), amountInLimitCurrency: z.number().positive().optional(),
  exchangeRateToLimitCurrency: z.number().positive().optional(), occurredAt: z.string().datetime().optional(),
  note: z.string().nullable().optional(), isFixed: z.boolean().optional(), debtId: uuidSchema.nullable().optional(),
});

export const creditCardPatchSchema = nonEmptyPatch({
  name: z.string().min(1).optional(), issuer: z.string().min(1).optional(),
  lastFour: z.string().regex(/^\d{4}$/).optional(), creditLimit: z.number().positive().optional(),
  limitCurrency: currencySchema.optional(), closingDay: z.number().int().min(1).max(31).optional(),
  dueDay: z.number().int().min(1).max(31).optional(), color: z.string().min(1).optional(),
  icon: z.string().min(1).optional(), isActive: z.boolean().optional(), note: z.string().nullable().optional(),
});

export const creditCardRecordPatchSchema = nonEmptyPatch({
  kind: z.enum(["purchase", "refund"]).optional(), originalRecordId: uuidSchema.nullable().optional(),
  amount: z.number().positive().optional(), currency: currencySchema.optional(),
  amountInLimitCurrency: z.number().positive().optional(), exchangeRateToLimitCurrency: z.number().positive().optional(),
  categoryId: uuidSchema.optional(), counterpartyName: z.string().nullable().optional(), note: z.string().nullable().optional(),
  accountId: uuidSchema.nullable().optional(), accountAmount: z.number().positive().nullable().optional(),
  accountImpactAtCreation: z.boolean().optional(), occurredAt: z.string().datetime().optional(),
});

export const debtPatchSchema = nonEmptyPatch({
  name: z.string().min(1).optional(), direction: debtDirectionSchema.optional(),
  originalAmount: z.number().positive().nullable().optional(), pendingAmount: z.number().nonnegative().nullable().optional(),
  currency: currencySchema.optional(), counterpartyName: z.string().min(1).optional(),
  accountId: uuidSchema.nullable().optional(), categoryId: uuidSchema.optional(), status: debtStatusSchema.optional(),
  isVisible: z.boolean().optional(), startedAt: z.string().datetime().or(z.string().date()).optional(),
  dueAt: z.string().datetime().or(z.string().date()).nullable().optional(), note: z.string().nullable().optional(),
  recurringDebtId: uuidSchema.nullable().optional(), recurringMonth: z.string().nullable().optional(),
});

export const recurringDebtPatchSchema = nonEmptyPatch({
  name: z.string().min(1).optional(), direction: debtDirectionSchema.optional(), amount: z.number().positive().nullable().optional(),
  currency: currencySchema.optional(), counterpartyName: z.string().min(1).optional(), accountId: uuidSchema.nullable().optional(),
  categoryId: uuidSchema.optional(), dayOfMonth: z.number().int().min(1).max(31).optional(), isActive: z.boolean().optional(),
  startedAt: z.string().datetime().or(z.string().date()).optional(), note: z.string().nullable().optional(),
});

export const settingsPatchSchema = nonEmptyPatch({
  primaryCurrency: currencySchema.optional(), primaryAccountId: uuidSchema.nullable().optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
  defaultDashboardPreset: settingsSchema.shape.defaultDashboardPreset.optional(), locale: z.literal("es-UY").optional(),
  includeHiddenAccountsInReports: z.boolean().optional(), defaultAccountId: uuidSchema.nullable().optional(),
  defaultPaymentType: paymentTypeSchema.optional(), defaultCreditCardId: uuidSchema.nullable().optional(),
  defaultPaymentStatus: paymentStatusSchema.optional(),
});

export type AccountPatch = z.infer<typeof accountPatchSchema>;
export type CategoryPatch = z.infer<typeof categoryPatchSchema>;
export type RecordPatch = z.infer<typeof recordPatchSchema>;
export type CreditCardPatch = z.infer<typeof creditCardPatchSchema>;
export type CreditCardRecordPatch = z.infer<typeof creditCardRecordPatchSchema>;
export type DebtPatch = z.infer<typeof debtPatchSchema>;
export type RecurringDebtPatch = z.infer<typeof recurringDebtPatchSchema>;
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

const dateOnlySchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Invalid calendar date");

export const recordFiltersSchema = z.object({
  type: z.enum(["all", "expense", "income", "transfer"]).optional(),
  accountId: uuidSchema.optional(),
  creditCardId: uuidSchema.optional(),
  categoryId: uuidSchema.optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  cursor: z.string().min(1).max(500).optional(),
}).superRefine((value, context) => {
  if (value.from && value.to && value.from > value.to) {
    context.addIssue({ code: "custom", path: ["to"], message: "End date must be on or after start date" });
  }
});

export const walletBootstrapSchema = z.object({
  recordsLimit: z.number().int().min(1).max(500).default(200),
  recordsCursor: z.string().min(1).max(500).nullable().default(null),
}).strict();

const optionalUuidSchema = uuidSchema.optional();

export const mailIngestionSchema = z.object({
  idempotencyKey: z.string().min(8).max(300),
  integration: z.object({
    name: z.string().min(1).max(100),
    version: z.string().min(1).max(100),
  }),
  email: z.object({
    provider: z.literal("gmail"),
    messageId: z.string().min(1).max(300),
    threadId: z.string().min(1).max(300),
    subject: z.string().max(500).default(""),
    from: z.string().max(500).default(""),
    date: z.string().datetime(),
  }),
  transaction: z.object({
    source: z.string().min(1).max(100),
    sourceLabel: z.string().max(100).default(""),
    occurredAt: z.string().datetime(),
    amount: z.number().nonnegative(),
    currency: currencySchema,
    merchantRaw: z.string().min(1).max(500),
    cardAlias: z.string().max(200).default(""),
    cardBrand: z.string().max(100).default(""),
    cardNumber: z.string().max(100).default(""),
    paymentType: z.literal("credit_card"),
  }),
  destination: z
    .object({
      accountId: optionalUuidSchema,
      creditCardId: optionalUuidSchema,
    })
    .default({}),
});

export type MailIngestionInput = z.infer<typeof mailIngestionSchema>;
