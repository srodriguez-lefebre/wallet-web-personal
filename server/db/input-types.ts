import { type SQL } from "drizzle-orm";

import { type DbClient } from "./client.js";
import { goalReservationMovements } from "./schema.js";

import type {
  Account,
  Budget,
  Category,
  CreditCard,
  CreditCardPayment,
  CreditCardRecord,
  Debt,
  Goal,
  GoalReservation,
  InstallmentPlan,
  Investment,
  RecurringDebt,
  Tag,
  WalletRecord,
} from "../../shared/types.js";

export type Db = DbClient;

export type NewAccount = Omit<Account, "id">;

export type NewCategory = Omit<Category, "id">;

export type NewTag = Omit<Tag, "id">;

export type NewRecord = Omit<WalletRecord, "id">;

export type NewCreditCard = Omit<CreditCard, "id">;

export type NewCreditCardPayment = Omit<CreditCardPayment, "id" | "creditCardId">;

export type NewCreditCardRecord = Omit<
  CreditCardRecord,
  "id" | "creditCardId" | "walletRecordId" | "statementId"
>;

export type NewGoal = Omit<Goal, "id" | "tagIds">;

export type NewGoalReservation = Omit<GoalReservation, "id">;

export type ReservationMovementWrite = Omit<
  typeof goalReservationMovements.$inferInsert,
  "amount"
> & {
  amount: string | SQL;
};

export type NewBudget = Omit<Budget, "id">;

export type NewInstallmentPlan = Omit<InstallmentPlan, "id">;

export type NewInvestment = Omit<Investment, "id" | "startedAt"> & {
  startedAt?: string;
};

export type NewDebt = Omit<Debt, "id" | "startedAt"> & {
  startedAt?: string;
};

export type NewRecurringDebt = Omit<RecurringDebt, "id" | "startedAt"> & {
  startedAt?: string;
};

export interface DebtPaymentInput {
  amount: number;
  accountAmount?: number;
  accountId: string;
  occurredAt: string;
  note?: string;
  saveAccountToDebt?: boolean;
  idempotencyKey?: string;
}
