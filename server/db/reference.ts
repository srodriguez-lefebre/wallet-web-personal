import { and, desc, isNotNull, isNull, sql } from "drizzle-orm";

import { selectMerchantCorrections } from "../../shared/record-review.js";
import { walletReferenceSchema } from "../../shared/reference-contract.js";
import { recordReviewBaselineSchema } from "../../shared/schemas.js";
import { namedBatch } from "./batch.js";
import { generateDueRecurringDebts } from "./debts.js";
import { goalReservationBalancesQuery, mapGoalReservationBalance } from "./goals/ledger.js";
import {
  asIso,
  asNumber,
  mapAccount,
  mapBudget,
  mapCategory,
  mapCreditCard,
  mapDebt,
  mapExchangeRate,
  mapGoal,
  mapInstallmentPlan,
  mapInvestment,
  mapRecordTemplate,
  mapRecurringDebt,
  mapSettings,
  mapTag,
  nullToUndefined,
} from "./mappers.js";
import { listRecords } from "./records/list.js";
import {
  accounts,
  budgets,
  categories,
  creditCards,
  debts,
  exchangeRates,
  goals,
  goalTags,
  installmentPlans,
  investments,
  records,
  recordTemplates,
  recurringDebts,
  settings,
  tags,
} from "./schema.js";

import type { ReferenceQuery, WalletReference } from "../../shared/reference-contract.js";
import type { Db } from "./input-types.js";

/** Reference dictionaries and small history metadata, with no movements or hidden writes. */
export async function getWalletReference(
  db: Db,
  query: ReferenceQuery = { timeZone: "America/Montevideo" },
): Promise<WalletReference> {
  const rows = await namedBatch(db, {
    isolation: db.execute(sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`),
    settings: db.select().from(settings).limit(1),
    accounts: db.select().from(accounts).where(isNull(accounts.deletedAt)),
    categories: db.select().from(categories).where(isNull(categories.deletedAt)),
    tags: db.select().from(tags).where(isNull(tags.deletedAt)),
    cards: db.select().from(creditCards).orderBy(desc(creditCards.createdAt)),
    goals: db.select().from(goals).where(isNull(goals.deletedAt)),
    goalTags: db.select().from(goalTags),
    reservations: goalReservationBalancesQuery(db),
    budgets: db.select().from(budgets).where(isNull(budgets.deletedAt)),
    rates: db.select().from(exchangeRates).orderBy(desc(exchangeRates.date)),
    investments: db
      .select()
      .from(investments)
      .where(isNull(investments.deletedAt))
      .orderBy(desc(investments.startedAt)),
    debts: db.select().from(debts).where(isNull(debts.deletedAt)),
    recurring: db
      .select()
      .from(recurringDebts)
      .where(isNull(recurringDebts.deletedAt))
      .orderBy(desc(recurringDebts.startedAt)),
    plans: db.select().from(installmentPlans).where(isNull(installmentPlans.deletedAt)),
    templates: db.select().from(recordTemplates).orderBy(recordTemplates.name, recordTemplates.id),
    corrections: db
      .select({
        id: records.id,
        type: records.type,
        paymentType: records.paymentType,
        paymentStatus: records.paymentStatus,
        categoryId: records.categoryId,
        importMerchant: records.importMerchant,
        merchantCorrection: records.merchantCorrection,
        updatedAt: records.updatedAt,
        counterpartyName: records.counterpartyName,
      })
      .from(records)
      .where(
        and(
          isNull(records.deletedAt),
          isNotNull(records.importMerchant),
          isNotNull(records.merchantCorrection),
        ),
      )
      .orderBy(desc(records.occurredAt), desc(records.id)),
    debtCounts: db.execute<{ debtId: string; count: string }>(
      sql`SELECT debt_id AS "debtId", count(*)::text AS count FROM records WHERE deleted_at IS NULL AND debt_id IS NOT NULL GROUP BY debt_id`,
    ),
    metadata:
      db.execute(sql`WITH local_records AS (SELECT *, (occurred_at AT TIME ZONE ${query.timeZone})::date AS local_date FROM records WHERE deleted_at IS NULL)
      SELECT min(local_date)::text AS "from", max(local_date)::text AS "to",
      coalesce(jsonb_agg(DISTINCT to_char(local_date,'YYYY-MM') ORDER BY to_char(local_date,'YYYY-MM') DESC),'[]'::jsonb) AS months,
      count(*)::int AS total, count(*) FILTER(WHERE payment_status='needs_review')::int AS review,
      count(*) FILTER(WHERE payment_status='needs_review' AND coalesce(created_at,occurred_at) > coalesce((SELECT review_seen_through FROM settings LIMIT 1),'epoch'::timestamptz))::int AS "newReviews",
      max(coalesce(created_at,occurred_at)) FILTER(WHERE payment_status='needs_review')::text AS "latestReviewAt"
      FROM local_records`),
  });
  const metadata = rows.metadata.rows[0] as {
    from: string | null;
    to: string | null;
    months: string[];
    total: number | string;
    review: number | string;
    newReviews: number | string;
    latestReviewAt: string | null;
  };
  const categoryModels = rows.categories.map(mapCategory);
  const correctionBaselines = rows.corrections.map((row) =>
    recordReviewBaselineSchema.parse({
      ...row,
      categoryId: nullToUndefined(row.categoryId),
      importMerchant: nullToUndefined(row.importMerchant),
      merchantCorrection: nullToUndefined(row.merchantCorrection),
      counterpartyName: nullToUndefined(row.counterpartyName),
      updatedAt: asIso(row.updatedAt),
    }),
  );
  return walletReferenceSchema.parse({
    settings: mapSettings(rows.settings[0]),
    accounts: rows.accounts.map(mapAccount),
    categories: categoryModels,
    merchantCorrections: Array.from(
      selectMerchantCorrections(correctionBaselines, categoryModels).values(),
      ({ record }) => record,
    ),
    debtRecordCounts: Object.fromEntries(
      rows.debtCounts.rows.map((row) => [row.debtId, asNumber(row.count)]),
    ),
    tags: rows.tags.map(mapTag),
    creditCards: rows.cards.map(mapCreditCard),
    goals: rows.goals.map((goal) =>
      mapGoal(
        goal,
        rows.goalTags.filter((link) => link.goalId === goal.id).map((link) => link.tagId),
      ),
    ),
    goalReservations: rows.reservations.map(mapGoalReservationBalance),
    budgets: rows.budgets.map(mapBudget),
    exchangeRates: rows.rates.map(mapExchangeRate),
    investments: rows.investments.map(mapInvestment),
    debts: rows.debts.map(mapDebt),
    recurringDebts: rows.recurring.map(mapRecurringDebt),
    installmentPlans: rows.plans.map(mapInstallmentPlan),
    recordTemplates: rows.templates.map(mapRecordTemplate),
    recordSummary: {
      from: metadata.from,
      to: metadata.to,
      months: metadata.months,
      total: asNumber(metadata.total),
      review: asNumber(metadata.review),
      newReviews: asNumber(metadata.newReviews),
      latestReviewAt: asIso(metadata.latestReviewAt) ?? null,
    },
  });
}

export async function bootstrapWalletReference(
  db: Db,
  input: { recordsLimit: number; recordsCursor?: string | null; timeZone?: string },
  now = new Date(),
) {
  const generatedDebts = await generateDueRecurringDebts(db, now);
  const recordsPage = await listRecords(db, {
    limit: input.recordsLimit,
    cursor: input.recordsCursor ?? undefined,
  });
  const reference = await getWalletReference(db, {
    timeZone: input.timeZone ?? "America/Montevideo",
  });
  return { reference, recordsPage, generatedDebts, serverDate: now.toISOString().slice(0, 10) };
}
