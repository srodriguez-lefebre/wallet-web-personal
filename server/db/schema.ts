import {
  boolean,
  type AnyPgColumn,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
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
  "needs_review",
  "cancelled",
]);

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
  initialBalance: numeric("initial_balance", {
    precision: 14,
    scale: 2,
  }).notNull(),
  color: text("color").notNull(),
  icon: text("icon").notNull(),
  isVisible: boolean("is_visible").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  parentId: uuid("parent_id").references((): AnyPgColumn => categories.id),
  color: text("color").notNull(),
  icon: text("icon").notNull(),
  systemKey: text("system_key").unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const merchants = pgTable(
  "merchants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id),
    priority: integer("priority").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({ nameIdx: uniqueIndex("merchants_name_idx").on(table.name) }),
);

export const merchantAliases = pgTable(
  "merchant_aliases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    normalizedAlias: text("normalized_alias").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    normalizedIdx: uniqueIndex("merchant_aliases_normalized_idx").on(
      table.normalizedAlias,
    ),
    merchantIdx: index("merchant_aliases_merchant_idx").on(table.merchantId),
  }),
);

export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  color: text("color").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const creditCards = pgTable("credit_cards", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  issuer: text("issuer").notNull(),
  lastFour: text("last_four").notNull(),
  creditLimit: numeric("credit_limit", { precision: 14, scale: 2 }).notNull(),
  limitCurrency: text("limit_currency").notNull(),
  closingDay: integer("closing_day").notNull(),
  dueDay: integer("due_day").notNull(),
  color: text("color").notNull(),
  icon: text("icon").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const records = pgTable(
  "records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: recordTypeEnum("type").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    accountId: uuid("account_id").references(() => accounts.id),
    accountAmount: numeric("account_amount", { precision: 14, scale: 2 }),
    creditCardId: uuid("credit_card_id").references(() => creditCards.id),
    destinationAccountId: uuid("destination_account_id").references(
      () => accounts.id,
    ),
    categoryId: uuid("category_id").references(() => categories.id),
    counterpartyName: text("counterparty_name"),
    paymentType: paymentTypeEnum("payment_type").notNull(),
    paymentStatus: paymentStatusEnum("payment_status").notNull(),
    exchangeRateToPrimary: numeric("exchange_rate_to_primary", {
      precision: 14,
      scale: 6,
    })
      .notNull()
      .default("1"),
    amountInLimitCurrency: numeric("amount_in_limit_currency", {
      precision: 14,
      scale: 2,
    }),
    exchangeRateToLimitCurrency: numeric("exchange_rate_to_limit_currency", {
      precision: 14,
      scale: 6,
    }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    note: text("note"),
    isFixed: boolean("is_fixed").notNull().default(false),
    debtId: uuid("debt_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    accountIdx: index("records_account_idx").on(table.accountId),
    creditCardIdx: index("records_credit_card_idx").on(table.creditCardId),
    occurredAtIdx: index("records_occurred_at_idx").on(table.occurredAt),
    typeIdx: index("records_type_idx").on(table.type),
  }),
);

export const creditCardPayments = pgTable(
  "credit_card_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    creditCardId: uuid("credit_card_id")
      .notNull()
      .references(() => creditCards.id),
    statementId: uuid("statement_id").references(
      (): AnyPgColumn => creditCardStatements.id,
    ),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    amountInLimitCurrency: numeric("amount_in_limit_currency", {
      precision: 14,
      scale: 2,
    }).notNull(),
    accountId: uuid("account_id").references(() => accounts.id),
    accountAmount: numeric("account_amount", { precision: 14, scale: 2 }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    cardIdx: index("credit_card_payments_card_idx").on(table.creditCardId),
    accountIdx: index("credit_card_payments_account_idx").on(table.accountId),
    occurredAtIdx: index("credit_card_payments_occurred_at_idx").on(
      table.occurredAt,
    ),
  }),
);

export const creditCardStatements = pgTable(
  "credit_card_statements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    creditCardId: uuid("credit_card_id")
      .notNull()
      .references(() => creditCards.id),
    cycleStart: timestamp("cycle_start", { withTimezone: true }).notNull(),
    cycleEnd: timestamp("cycle_end", { withTimezone: true }).notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("pending"),
    closedAt: timestamp("closed_at", { withTimezone: true }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    cardCycleIdx: uniqueIndex("credit_card_statements_card_cycle_idx").on(
      table.creditCardId,
      table.cycleStart,
      table.cycleEnd,
    ),
  }),
);

export const creditCardRecords = pgTable(
  "credit_card_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    creditCardId: uuid("credit_card_id")
      .notNull()
      .references(() => creditCards.id),
    walletRecordId: uuid("wallet_record_id")
      .unique()
      .references(() => records.id),
    originalRecordId: uuid("original_record_id").references(
      (): AnyPgColumn => creditCardRecords.id,
    ),
    statementId: uuid("statement_id").references(() => creditCardStatements.id),
    kind: text("kind").notNull().default("purchase"),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    amountInLimitCurrency: numeric("amount_in_limit_currency", {
      precision: 14,
      scale: 2,
    }).notNull(),
    exchangeRateToLimitCurrency: numeric("exchange_rate_to_limit_currency", {
      precision: 14,
      scale: 6,
    }).notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id),
    counterpartyName: text("counterparty_name"),
    note: text("note"),
    accountId: uuid("account_id").references(() => accounts.id),
    accountAmount: numeric("account_amount", { precision: 14, scale: 2 }),
    accountImpactAtCreation: boolean("account_impact_at_creation")
      .notNull()
      .default(false),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    cardIdx: index("credit_card_records_card_idx").on(table.creditCardId),
    statementIdx: index("credit_card_records_statement_idx").on(
      table.statementId,
    ),
    occurredAtIdx: index("credit_card_records_occurred_at_idx").on(
      table.occurredAt,
    ),
  }),
);

export const creditCardPaymentAllocations = pgTable(
  "credit_card_payment_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => creditCardPayments.id, { onDelete: "cascade" }),
    creditCardRecordId: uuid("credit_card_record_id")
      .notNull()
      .references(() => creditCardRecords.id),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    amountInLimitCurrency: numeric("amount_in_limit_currency", {
      precision: 14,
      scale: 2,
    }).notNull(),
  },
  (table) => ({
    paymentIdx: index("credit_card_payment_allocations_payment_idx").on(
      table.paymentId,
    ),
    recordIdx: index("credit_card_payment_allocations_record_idx").on(
      table.creditCardRecordId,
    ),
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
  isVisible: boolean("is_visible").notNull().default(true),
  deadline: timestamp("deadline", { withTimezone: true }),
  status: goalStatusEnum("status").notNull().default("active"),
  accountId: uuid("account_id").references(() => accounts.id),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
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
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
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
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const settings = pgTable("settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  primaryCurrency: text("primary_currency").notNull().default("UYU"),
  primaryAccountId: uuid("primary_account_id").references(() => accounts.id),
  theme: text("theme").notNull().default("light"),
  defaultDashboardPreset: text("default_dashboard_preset")
    .notNull()
    .default("general"),
  locale: text("locale").notNull().default("es-UY"),
  includeHiddenAccountsInReports: boolean("include_hidden_accounts_in_reports")
    .notNull()
    .default(false),
  defaultAccountId: uuid("default_account_id").references(() => accounts.id),
  defaultPaymentType: paymentTypeEnum("default_payment_type")
    .notNull()
    .default("debit"),
  defaultCreditCardId: uuid("default_credit_card_id").references(
    () => creditCards.id,
  ),
  defaultPaymentStatus: paymentStatusEnum("default_payment_status")
    .notNull()
    .default("cleared"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const exchangeRates = pgTable(
  "exchange_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromCurrency: text("from_currency").notNull(),
    toCurrency: text("to_currency").notNull(),
    rate: numeric("rate", { precision: 14, scale: 6 }).notNull(),
    date: timestamp("date", { withTimezone: true }).notNull(),
    source: text("source").notNull().default("manual"),
  },
  (table) => ({
    pairDateIdx: uniqueIndex("exchange_rates_pair_date_idx").on(
      table.fromCurrency,
      table.toCurrency,
      table.date,
    ),
  }),
);

export const ingestionEvents = pgTable(
  "ingestion_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    idempotencyKey: text("idempotency_key").notNull(),
    source: text("source").notNull(),
    status: text("status").notNull().default("processing"),
    action: text("action"),
    fingerprint: text("fingerprint"),
    targetKey: text("target_key"),
    merchantNormalized: text("merchant_normalized"),
    amount: numeric("amount", { precision: 14, scale: 2 }),
    currency: text("currency"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    recordId: uuid("record_id").references(() => records.id),
    creditCardRecordId: uuid("credit_card_record_id").references(
      () => creditCardRecords.id,
    ),
    duplicateOfId: uuid("duplicate_of_id").references(
      (): AnyPgColumn => ingestionEvents.id,
    ),
    emailMessageId: text("email_message_id"),
    emailThreadId: text("email_thread_id"),
    emailSubject: text("email_subject"),
    emailFrom: text("email_from"),
    sanitizedPayload: jsonb("sanitized_payload"),
    metadataExpiresAt: timestamp("metadata_expires_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idempotencyIdx: uniqueIndex("ingestion_events_idempotency_idx").on(
      table.idempotencyKey,
    ),
    fingerprintIdx: index("ingestion_events_fingerprint_idx").on(
      table.fingerprint,
      table.occurredAt,
    ),
    expiryIdx: index("ingestion_events_expiry_idx").on(table.metadataExpiresAt),
  }),
);

export const investments = pgTable("investments", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  amountInvested: numeric("amount_invested", {
    precision: 14,
    scale: 2,
  }).notNull(),
  currentValue: numeric("current_value", { precision: 14, scale: 2 }).notNull(),
  currency: text("currency").notNull(),
  isVisible: boolean("is_visible").notNull().default(true),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const debts = pgTable(
  "debts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    direction: text("direction").notNull().default("payable"),
    originalAmount: numeric("original_amount", { precision: 14, scale: 2 }),
    pendingAmount: numeric("pending_amount", { precision: 14, scale: 2 }),
    currency: text("currency").notNull(),
    counterpartyName: text("counterparty_name")
      .notNull()
      .default("Counterparty"),
    accountId: uuid("account_id").references(() => accounts.id),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id),
    status: debtStatusEnum("status").notNull().default("active"),
    isVisible: boolean("is_visible").notNull().default(true),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    note: text("note"),
    recurringDebtId: uuid("recurring_debt_id"),
    recurringMonth: text("recurring_month"),
  },
  (table) => ({
    recurringGeneratedIdx: uniqueIndex("debts_recurring_generated_idx").on(
      table.recurringDebtId,
      table.recurringMonth,
    ),
  }),
);

export const recurringDebts = pgTable("recurring_debts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  direction: text("direction").notNull().default("payable"),
  amount: numeric("amount", { precision: 14, scale: 2 }),
  currency: text("currency").notNull(),
  counterpartyName: text("counterparty_name").notNull(),
  accountId: uuid("account_id").references(() => accounts.id),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => categories.id),
  dayOfMonth: numeric("day_of_month", { precision: 2, scale: 0 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
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
