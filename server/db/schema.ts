import {
  boolean,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const accountTypeEnum = pgEnum("account_type", [
  "cash",
  "bank",
  "credit_card",
  "savings",
  "recurring",
  "investment",
  "custom",
]);

export const recordTypeEnum = pgEnum("record_type", [
  "expense",
  "income",
  "transfer",
]);

export const paymentTypeEnum = pgEnum("payment_type", [
  "cash",
  "debit",
  "credit",
  "transfer",
  "other",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "cleared",
  "pending",
  "cancelled",
]);

export const categoryTypeEnum = pgEnum("category_type", ["expense", "income"]);

export const goalStatusEnum = pgEnum("goal_status", [
  "active",
  "completed",
  "paused",
  "cancelled",
]);

export const debtStatusEnum = pgEnum("debt_status", [
  "active",
  "paid",
  "paused",
]);

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: accountTypeEnum("type").notNull(),
  currency: text("currency").notNull(),
  initialBalance: numeric("initial_balance", { precision: 14, scale: 2 }).notNull(),
  color: text("color").notNull(),
  icon: text("icon").notNull(),
  isVisible: boolean("is_visible").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: categoryTypeEnum("type").notNull(),
  color: text("color").notNull(),
  icon: text("icon").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  color: text("color").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const counterparties = pgTable("counterparties", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  color: text("color"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const records = pgTable(
  "records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: recordTypeEnum("type").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    destinationAccountId: uuid("destination_account_id").references(() => accounts.id),
    categoryId: uuid("category_id").references(() => categories.id),
    counterpartyId: uuid("counterparty_id").references(() => counterparties.id),
    paymentType: paymentTypeEnum("payment_type").notNull(),
    paymentStatus: paymentStatusEnum("payment_status").notNull(),
    exchangeRateToPrimary: numeric("exchange_rate_to_primary", {
      precision: 14,
      scale: 6,
    })
      .notNull()
      .default("1"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    note: text("note"),
    isFixed: boolean("is_fixed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    accountIdx: index("records_account_idx").on(table.accountId),
    occurredAtIdx: index("records_occurred_at_idx").on(table.occurredAt),
    typeIdx: index("records_type_idx").on(table.type),
  }),
);

export const recordTags = pgTable(
  "record_tags",
  {
    recordId: uuid("record_id")
      .notNull()
      .references(() => records.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => ({
    recordIdx: index("record_tags_record_idx").on(table.recordId),
    tagIdx: index("record_tags_tag_idx").on(table.tagId),
  }),
);

export const goals = pgTable("goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  targetAmount: numeric("target_amount", { precision: 14, scale: 2 }).notNull(),
  currency: text("currency").notNull(),
  color: text("color").notNull(),
  icon: text("icon").notNull(),
  deadline: timestamp("deadline", { withTimezone: true }),
  status: goalStatusEnum("status").notNull().default("active"),
  accountId: uuid("account_id").references(() => accounts.id),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const goalTags = pgTable(
  "goal_tags",
  {
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => ({
    goalIdx: index("goal_tags_goal_idx").on(table.goalId),
    tagIdx: index("goal_tags_tag_idx").on(table.tagId),
  }),
);

export const goalReservations = pgTable("goal_reservations", {
  id: uuid("id").primaryKey().defaultRandom(),
  goalId: uuid("goal_id")
    .notNull()
    .references(() => goals.id),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  currency: text("currency").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  note: text("note"),
});

export const budgets = pgTable("budgets", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  limitAmount: numeric("limit_amount", { precision: 14, scale: 2 }).notNull(),
  currency: text("currency").notNull(),
  period: text("period").notNull().default("monthly"),
  categoryId: uuid("category_id").references(() => categories.id),
  tagId: uuid("tag_id").references(() => tags.id),
  accountId: uuid("account_id").references(() => accounts.id),
  goalId: uuid("goal_id").references(() => goals.id),
  color: text("color").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const settings = pgTable("settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  primaryCurrency: text("primary_currency").notNull().default("UYU"),
  theme: text("theme").notNull().default("light"),
  defaultDashboardPreset: text("default_dashboard_preset")
    .notNull()
    .default("general"),
  locale: text("locale").notNull().default("es-UY"),
  includeHiddenAccountsInReports: boolean("include_hidden_accounts_in_reports")
    .notNull()
    .default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const exchangeRates = pgTable("exchange_rates", {
  id: uuid("id").primaryKey().defaultRandom(),
  fromCurrency: text("from_currency").notNull(),
  toCurrency: text("to_currency").notNull(),
  rate: numeric("rate", { precision: 14, scale: 6 }).notNull(),
  date: timestamp("date", { withTimezone: true }).notNull(),
});

export const investments = pgTable("investments", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  amountInvested: numeric("amount_invested", { precision: 14, scale: 2 }).notNull(),
  currentValue: numeric("current_value", { precision: 14, scale: 2 }).notNull(),
  currency: text("currency").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const debts = pgTable("debts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  originalAmount: numeric("original_amount", { precision: 14, scale: 2 }).notNull(),
  pendingAmount: numeric("pending_amount", { precision: 14, scale: 2 }).notNull(),
  currency: text("currency").notNull(),
  counterpartyId: uuid("counterparty_id").references(() => counterparties.id),
  accountId: uuid("account_id").references(() => accounts.id),
  status: debtStatusEnum("status").notNull().default("active"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }),
  note: text("note"),
});

export const installmentPlans = pgTable("installment_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull(),
  currency: text("currency").notNull(),
  installmentsTotal: numeric("installments_total", {
    precision: 4,
    scale: 0,
  }).notNull(),
  installmentsPaid: numeric("installments_paid", {
    precision: 4,
    scale: 0,
  }).notNull(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => categories.id),
  nextPaymentAt: timestamp("next_payment_at", { withTimezone: true }),
  note: text("note"),
});
