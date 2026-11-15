import type { z } from "zod";
import type * as models from "./read-models.js";

export type CurrencyCode = z.infer<typeof models.currencyCodeModelSchema>;
export type WalletBackup = z.infer<typeof import("./schemas.js").walletBackupSchema>;
export type RecordType = z.infer<typeof models.recordTypeModelSchema>;
export type AccountType = z.infer<typeof models.accountTypeModelSchema>;
export type PaymentType = z.infer<typeof models.paymentTypeModelSchema>;
export type PaymentStatus = z.infer<typeof models.paymentStatusModelSchema>;
export type GoalStatus = z.infer<typeof models.goalStatusModelSchema>;
export type BudgetStatus = z.infer<typeof models.budgetStatusModelSchema>;
export type DebtStatus = z.infer<typeof models.debtStatusModelSchema>;
export type DebtDirection = z.infer<typeof models.debtDirectionModelSchema>;
export type Money = z.infer<typeof models.moneyModelSchema>;
export type DateRange = z.infer<typeof models.dateRangeModelSchema>;
export type Account = z.infer<typeof models.accountModelSchema>;
export type Category = z.infer<typeof models.categoryModelSchema>;
export type Tag = z.infer<typeof models.tagModelSchema>;
export type RecordGoalAssociation = z.infer<typeof models.recordGoalAssociationModelSchema>;
export type WalletRecord = z.infer<typeof models.walletRecordModelSchema>;
export type MerchantCorrection = z.infer<typeof models.merchantCorrectionModelSchema>;
export type RecordTemplate = z.infer<typeof models.recordTemplateModelSchema>;
export type CreditCard = z.infer<typeof models.creditCardModelSchema>;
export type CreditCardPayment = z.infer<typeof models.creditCardPaymentModelSchema>;
export type CreditCardRecordKind = z.infer<typeof models.creditCardRecordKindModelSchema>;
export type CreditCardRecord = z.infer<typeof models.creditCardRecordModelSchema>;
export type CreditCardStatement = z.infer<typeof models.creditCardStatementModelSchema>;
export type CreditCardPaymentAllocation = z.infer<
  typeof models.creditCardPaymentAllocationModelSchema
>;
export type CreditCardCurrencyAmount = z.infer<typeof models.creditCardCurrencyAmountModelSchema>;
export type CreditCardSummary = z.infer<typeof models.creditCardSummaryModelSchema>;
export type CreditCardCategoryUsage = z.infer<typeof models.creditCardCategoryUsageModelSchema>;
export type Goal = z.infer<typeof models.goalModelSchema>;
export type GoalReservation = z.infer<typeof models.goalReservationModelSchema>;
export type GoalReservationMovementType = z.infer<
  typeof models.goalReservationMovementTypeModelSchema
>;
export type GoalReservationMovement = z.infer<typeof models.goalReservationMovementModelSchema>;
export type Budget = z.infer<typeof models.budgetModelSchema>;
export type ExchangeRate = z.infer<typeof models.exchangeRateModelSchema>;
export type MailIngestionResult = z.infer<typeof models.mailIngestionResultModelSchema>;
export type Investment = z.infer<typeof models.investmentModelSchema>;
export type Debt = z.infer<typeof models.debtModelSchema>;
export type RecurringDebt = z.infer<typeof models.recurringDebtModelSchema>;
export type InstallmentPlan = z.infer<typeof models.installmentPlanModelSchema>;
export type WalletSettings = z.infer<typeof models.walletSettingsModelSchema>;
export type WalletDataset = z.infer<typeof models.walletDatasetModelSchema>;
export type RecordPage = z.infer<typeof models.recordPageModelSchema>;
export type WalletBootstrap = z.infer<typeof models.walletBootstrapModelSchema>;
export type RecordFilters = z.infer<typeof models.recordFiltersModelSchema>;
export type AccountBalance = z.infer<typeof models.accountBalanceModelSchema>;
export type GoalProgress = z.infer<typeof models.goalProgressModelSchema>;
export type BudgetProgress = z.infer<typeof models.budgetProgressModelSchema>;
export type AnalyticsSummary = z.infer<typeof models.analyticsSummaryModelSchema>;
export type VisibleDebtSummary = z.infer<typeof models.visibleDebtSummaryModelSchema>;
