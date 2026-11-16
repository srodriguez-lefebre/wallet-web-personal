import { z } from "zod";

import { timeZoneSchema } from "../time-zone.js";
import {
  positiveMoneySchema,
  uuidSchema,
  recordTypeSchema,
  currencySchema,
  paymentTypeSchema,
  paymentStatusSchema,
  nonEmptyPatch,
  dateOnlySchema,
  id,
} from "./common.js";

export const recordGoalAssociationSchema = z.object({
  goalId: uuidSchema,
  assignmentSource: z.enum(["manual", "date_rule"]).default("manual"),
  useReserved: z.boolean().default(true),
  reserveIncome: z.boolean().default(true),
  allocatedAmount: positiveMoneySchema.optional(),
});

export const recordSchema = z
  .object({
    type: recordTypeSchema,
    amount: positiveMoneySchema,
    currency: currencySchema,
    accountId: uuidSchema.optional(),
    accountAmount: positiveMoneySchema.optional(),
    creditCardId: uuidSchema.optional(),
    destinationAccountId: uuidSchema.optional(),
    destinationAmount: positiveMoneySchema.optional(),
    categoryId: uuidSchema.optional(),
    counterpartyName: z.string().optional(),
    tagIds: z.array(uuidSchema).max(1).default([]),
    goalIds: z.array(uuidSchema).default([]),
    goalAssociations: z.array(recordGoalAssociationSchema).default([]),
    paymentType: paymentTypeSchema,
    paymentStatus: paymentStatusSchema,
    exchangeRateToPrimary: z.number().nonnegative().default(1),
    amountInLimitCurrency: positiveMoneySchema.optional(),
    exchangeRateToLimitCurrency: z.number().positive().optional(),
    occurredAt: z.iso.datetime(),
    note: z.string().optional(),
    isFixed: z.boolean().optional(),
    debtId: uuidSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.exchangeRateToPrimary === 0 &&
      value.paymentStatus !== "needs_review" &&
      value.paymentStatus !== "cancelled"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["exchangeRateToPrimary"],
        message: "An unresolved primary conversion requires review",
      });
    }
    for (const [index, association] of value.goalAssociations.entries()) {
      if (association.allocatedAmount !== undefined && association.allocatedAmount > value.amount) {
        ctx.addIssue({
          code: "custom",
          path: ["goalAssociations", index, "allocatedAmount"],
          message: "Goal allocation cannot exceed the record amount",
        });
      }
    }
    // Cancellation preserves incomplete review history without requiring a
    // financial assignment or an invented conversion to remove its impact.
    if (value.paymentStatus === "cancelled") return;
    if (value.type !== "transfer") {
      if (!value.accountId && !value.creditCardId && value.paymentStatus !== "needs_review") {
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
    if (value.type !== "transfer" && !value.categoryId && value.paymentStatus !== "needs_review") {
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

// Creation is narrower than durable history: refunds require their original
// purchase and are created by the dedicated Cards action.
export const recordCreateSchema = recordSchema.superRefine((value, context) => {
  if (value.creditCardId && value.type !== "expense")
    context.addIssue({
      code: "custom",
      path: ["creditCardId"],
      message: "Use the Cards refund action for a credit-card refund; transfers cannot use a card.",
    });
});

export const merchantCorrectionSchema = z.object({
  savedAt: z.iso.datetime(),
  autoApply: z.boolean(),
});

export const recordPatchSchema = nonEmptyPatch({
  type: recordTypeSchema.optional(),
  amount: positiveMoneySchema.optional(),
  currency: currencySchema.optional(),
  accountId: uuidSchema.optional(),
  accountAmount: positiveMoneySchema.optional(),
  creditCardId: uuidSchema.nullable().optional(),
  destinationAccountId: uuidSchema.nullable().optional(),
  categoryId: uuidSchema.nullable().optional(),
  destinationAmount: positiveMoneySchema.optional(),
  counterpartyName: z.string().nullable().optional(),
  tagIds: z.array(uuidSchema).max(1).optional(),
  goalIds: z.array(uuidSchema).optional(),
  goalAssociations: z.array(recordGoalAssociationSchema).optional(),
  paymentType: paymentTypeSchema.optional(),
  paymentStatus: paymentStatusSchema.optional(),
  exchangeRateToPrimary: z.number().nonnegative().optional(),
  amountInLimitCurrency: positiveMoneySchema.optional(),
  exchangeRateToLimitCurrency: z.number().positive().optional(),
  occurredAt: z.iso.datetime().optional(),
  note: z.string().nullable().optional(),
  isFixed: z.boolean().optional(),
  debtId: uuidSchema.nullable().optional(),
  expectedUpdatedAt: z.iso.datetime().optional(),
  merchantAutoApply: z.boolean().optional(),
  restoreMerchantCorrection: merchantCorrectionSchema.nullable().optional(),
}).refine(
  (value) => value.restoreMerchantCorrection === undefined || Boolean(value.expectedUpdatedAt),
  { message: "Restoring a merchant correction requires the saved record version" },
);

export type RecordPatch = z.infer<typeof recordPatchSchema>;

export const recordFiltersSchema = z
  .object({
    type: z.enum(["all", "expense", "income", "transfer"]).optional(),
    accountId: uuidSchema.optional(),
    creditCardId: uuidSchema.optional(),
    categoryId: uuidSchema.optional(),
    tagId: uuidSchema.optional(),
    goalId: uuidSchema.optional(),
    search: z.string().trim().min(1).max(100).optional(),
    searchMode: z.enum(["legacy", "wallet"]).optional(),
    note: z.string().trim().min(1).max(1000).optional(),
    categoryMode: z.enum(["exact", "descendants"]).optional(),
    timeZone: timeZoneSchema.optional(),
    paymentStatus: z.enum(["all", "cleared", "pending", "needs_review", "cancelled"]).optional(),
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100),
    cursor: z.string().min(1).max(500).optional(),
  })
  .superRefine((value, context) => {
    if (value.from && value.to && value.from > value.to) {
      context.addIssue({
        code: "custom",
        path: ["to"],
        message: "End date must be on or after start date",
      });
    }
  });

export const recordImportSchema = z
  .object({
    records: z.array(recordCreateSchema).min(1).max(200),
  })
  .strict();

// Read contracts preserve legacy history, including uncategorized records. Creation rules remain stricter.
export const walletRecordResponseSchema = z.object({
  ...recordSchema.shape,
  ...id,
  createdAt: z.iso.datetime().optional(),
  updatedAt: z.iso.datetime().optional(),
  importMerchant: z.string().optional(),
  importHistory: z.array(z.string()).optional(),
  suggestedCategoryId: uuidSchema.optional(),
  merchantCorrection: merchantCorrectionSchema.optional(),
  linkedCardRecordKind: z.enum(["purchase", "refund"]).optional(),
});

export const recordReviewBaselineSchema = walletRecordResponseSchema.pick({
  id: true,
  type: true,
  paymentType: true,
  paymentStatus: true,
  categoryId: true,
  importMerchant: true,
  merchantCorrection: true,
  updatedAt: true,
  counterpartyName: true,
});
