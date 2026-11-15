import { z } from "zod";

import { walletDatasetSchema, walletBackupSchema } from "./schemas/dataset.js";
import { accountSchema } from "./schemas/accounts.js";
import { budgetSchema } from "./schemas/budgets.js";
import {
  creditCardSchema,
  creditCardRecordSchema,
  cardStatementResponseSchema,
  cardPaymentResponseSchema,
  cardRecordResponseSchema,
  paymentAllocationResponseSchema,
} from "./schemas/cards.js";
import { categorySchema } from "./schemas/categories.js";
import {
  currencySchema,
  uuidSchema,
  recordTypeSchema,
  paymentTypeSchema,
  paymentStatusSchema,
  debtDirectionSchema,
  debtStatusSchema,
} from "./schemas/common.js";
import { debtSchema, recurringDebtSchema } from "./schemas/debts.js";
import {
  goalSchema,
  goalReservationSchema,
  reservationMovementResponseSchema,
  goalResponseSchema,
} from "./schemas/goals.js";
import { installmentPlanSchema } from "./schemas/installments.js";
import { investmentSchema } from "./schemas/investments.js";
import { exchangeRateResponseSchema } from "./schemas/rates.js";
import {
  recordGoalAssociationSchema,
  merchantCorrectionSchema,
  walletRecordResponseSchema,
} from "./schemas/records.js";
import { settingsSchema } from "./schemas/settings.js";
import { tagSchema } from "./schemas/tags.js";
import { recordTemplateSchema } from "./schemas/templates.js";

/** Read models share entity validators; legacy optional fields stay optional. */
export const currencyCodeModelSchema = currencySchema;
export const recordTypeModelSchema = recordTypeSchema;
export const accountTypeModelSchema = accountSchema.shape.type;
export const paymentTypeModelSchema = paymentTypeSchema;
export const paymentStatusModelSchema = paymentStatusSchema;
export const goalStatusModelSchema = goalSchema.shape.status;
export const budgetStatusModelSchema = z.union([
  z.literal("ok"),
  z.literal("warning"),
  z.literal("exceeded"),
]);
export const debtStatusModelSchema = debtStatusSchema;
export const debtDirectionModelSchema = debtDirectionSchema;
export const moneyModelSchema = z.object({
  amount: z.number().or(z.nan()),
  currency: currencyCodeModelSchema,
});
export const dateRangeModelSchema = z.object({ from: z.string(), to: z.string() });
export const accountModelSchema = accountSchema.extend({ id: uuidSchema });
export const categoryModelSchema = categorySchema.extend({
  id: uuidSchema,
  systemKey: z.string().optional(),
});
export const tagModelSchema = tagSchema.extend({ id: uuidSchema });
export const recordGoalAssociationModelSchema = recordGoalAssociationSchema;
export const walletRecordModelSchema = walletRecordResponseSchema.partial({
  goalIds: true,
  goalAssociations: true,
  isFixed: true,
});
export const merchantCorrectionModelSchema = merchantCorrectionSchema;
export const recordTemplateModelSchema = recordTemplateSchema.safeExtend({ id: uuidSchema });
export const creditCardModelSchema = creditCardSchema.extend({ id: uuidSchema });
export const creditCardPaymentModelSchema = cardPaymentResponseSchema;
export const creditCardRecordKindModelSchema = creditCardRecordSchema.shape.kind;
export const creditCardRecordModelSchema = cardRecordResponseSchema;
export const creditCardStatementModelSchema = cardStatementResponseSchema;
export const creditCardPaymentAllocationModelSchema = paymentAllocationResponseSchema;
export const creditCardCurrencyAmountModelSchema = z.object({
  currency: currencyCodeModelSchema,
  amount: z.number().or(z.nan()),
});
export const creditCardSummaryModelSchema = z.object({
  card: creditCardModelSchema,
  usedLimit: z.number().or(z.nan()),
  availableLimit: z.number().or(z.nan()),
  utilizationPercent: z.number().or(z.nan()),
  currentCycleStart: z.string(),
  currentCycleEnd: z.string(),
  lastClosingDate: z.string(),
  dueDate: z.string(),
  currentCycle: z.array(creditCardCurrencyAmountModelSchema),
  outstanding: z.array(creditCardCurrencyAmountModelSchema),
  statementDue: z.array(creditCardCurrencyAmountModelSchema),
  status: z.union([
    z.literal("ok"),
    z.literal("partial"),
    z.literal("overdue"),
    z.literal("over_limit"),
  ]),
});
export const creditCardCategoryUsageModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  amount: z.number().or(z.nan()),
});
// Legacy read models can omit auto-capture configuration; creation retains its refinements.
export const goalModelSchema = z.object({
  ...goalResponseSchema.shape,
  autoCaptureEnabled: goalResponseSchema.shape.autoCaptureEnabled.optional(),
});
export const goalReservationModelSchema = goalReservationSchema.extend({
  id: uuidSchema,
  createdAt: z.string(),
});
export const goalReservationMovementTypeModelSchema = reservationMovementResponseSchema.shape.type;
export const goalReservationMovementModelSchema = reservationMovementResponseSchema;
export const budgetModelSchema = budgetSchema.extend({ id: uuidSchema });
export const exchangeRateModelSchema = exchangeRateResponseSchema;
export const mailIngestionResultModelSchema = z.object({
  status: z.union([
    z.literal("created"),
    z.literal("needs_review"),
    z.literal("already_processed"),
    z.literal("duplicate"),
    z.literal("ignored"),
  ]),
  recordId: z.string().optional(),
  creditCardRecordId: z.string().optional(),
  duplicateOfId: z.string().optional(),
  warnings: z.array(z.string()).optional(),
});
export const investmentModelSchema = investmentSchema.extend({ id: uuidSchema });
export const debtModelSchema = debtSchema.safeExtend({ id: uuidSchema });
export const recurringDebtModelSchema = recurringDebtSchema.extend({ id: uuidSchema });
export const installmentPlanModelSchema = installmentPlanSchema.safeExtend({ id: uuidSchema });
export const walletSettingsModelSchema = settingsSchema;
export const walletDatasetModelSchema = walletDatasetSchema.extend({
  records: z.array(walletRecordModelSchema),
  goals: z.array(goalModelSchema),
  recordTemplates: z.array(recordTemplateModelSchema).optional(),
  goalReservations: z.array(goalReservationModelSchema),
  merchantCategoryRules: walletBackupSchema.shape.merchantCategoryRules,
  ingestionEvents: walletBackupSchema.shape.ingestionEvents,
  merchants: z
    .array(walletBackupSchema.shape.merchants.unwrap().element.partial({ matchMode: true }))
    .optional(),
  merchantAliases: walletBackupSchema.shape.merchantAliases,
});
export const recordPageModelSchema = z.object({
  items: z.array(walletRecordModelSchema),
  nextCursor: z.union([z.string(), z.literal(null)]),
  hasMore: z.boolean(),
});
export const walletBootstrapModelSchema = z.object({
  dataset: walletDatasetModelSchema,
  recordsPage: recordPageModelSchema.omit({ items: true }),
  generatedDebts: z.array(debtModelSchema),
  serverDate: z.string(),
});
export const recordFiltersModelSchema = z.object({
  type: z.union([recordTypeModelSchema, z.literal("all")]).optional(),
  accountId: z.string().optional(),
  creditCardId: z.string().optional(),
  categoryId: z.string().optional(),
  tagId: z.string().optional(),
  goalId: z.string().optional(),
  search: z.string().optional(),
  note: z.string().optional(),
  paymentStatus: z.union([paymentStatusModelSchema, z.literal("all")]).optional(),
});
export const accountBalanceModelSchema = z.object({
  account: accountModelSchema,
  balance: z.number().or(z.nan()),
  totalBalance: z.number().or(z.nan()),
  balanceInPrimary: z.number().or(z.nan()),
  totalBalanceInPrimary: z.number().or(z.nan()),
  reserved: z.number().or(z.nan()),
  freeBalance: z.number().or(z.nan()),
});
export const goalProgressModelSchema = z.object({
  goal: goalModelSchema,
  hasMissingExchangeRate: z.boolean(),
  reserved: z.number().or(z.nan()),
  spent: z.number().or(z.nan()),
  committed: z.number().or(z.nan()),
  remaining: z.number().or(z.nan()),
  overTarget: z.number().or(z.nan()),
  percentage: z.number().or(z.nan()),
});
export const budgetProgressModelSchema = z.object({
  budget: budgetModelSchema,
  spent: z.number().or(z.nan()),
  remaining: z.number().or(z.nan()),
  percentage: z.number().or(z.nan()),
  status: budgetStatusModelSchema,
});
export const analyticsSummaryModelSchema = z.object({
  income: z.number().or(z.nan()),
  expenses: z.number().or(z.nan()),
  cashFlow: z.number().or(z.nan()),
  balance: z.number().or(z.nan()),
  spending: z.number().or(z.nan()),
  dailyAverageExpense: z.number().or(z.nan()),
  availableDaily: z.number().or(z.nan()),
});
export const visibleDebtSummaryModelSchema = z.object({
  toCollect: z.number().or(z.nan()),
  toPay: z.number().or(z.nan()),
  net: z.number().or(z.nan()),
  openCount: z.number().or(z.nan()),
  amountPendingCount: z.number().or(z.nan()),
});
