/** Synthetic fixtures only; no owner data. */
export const id = "00000000-0000-4000-8000-000000000001";
export const record = {
  id,
  type: "expense",
  amount: 10,
  currency: "UYU",
  accountId: id,
  categoryId: id,
  tagIds: [],
  goalIds: [],
  goalAssociations: [],
  paymentType: "debit",
  paymentStatus: "cleared",
  exchangeRateToPrimary: 1,
  occurredAt: "2026-11-01T12:00:00.000Z",
};
export const reference = {
  settings: {
    primaryCurrency: "UYU",
    theme: "system",
    defaultDashboardPreset: "monthly-review",
    locale: "es-UY",
    includeHiddenAccountsInReports: false,
    defaultPaymentType: "debit",
    defaultPaymentStatus: "cleared",
  },
  accounts: [],
  categories: [],
  tags: [],
  creditCards: [],
  goals: [],
  goalReservations: [],
  budgets: [],
  exchangeRates: [],
  investments: [],
  debts: [],
  recurringDebts: [],
  installmentPlans: [],
  recordTemplates: [],
  recordSummary: {
    from: "2026-11-01",
    to: "2026-11-01",
    months: ["2026-11"],
    total: 1,
    review: 0,
    newReviews: 0,
    latestReviewAt: null,
  },
};
export const page = { items: [record], nextCursor: null, hasMore: false };
export const boot = { reference, recordsPage: page, generatedDebts: [], serverDate: "2026-11-14" };
