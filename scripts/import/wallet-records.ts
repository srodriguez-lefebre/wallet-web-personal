import { randomUUID } from "node:crypto";

import { getTableName, sql } from "drizzle-orm";

import { roundMoney } from "../../shared/money.js";
import { currencySchema, paymentTypeSchema, recordTypeSchema } from "../../shared/schemas.js";
import * as schema from "../../server/db/schema.js";
import { walletImportCategories } from "./categories.js";
import { importedCategoryKeys } from "./category-keys.js";
import { parseCsv } from "./csv.js";

import type { DbClient } from "../../server/db/client.js";

export function prepareWalletImport(csv: string) {
  const rows = parseCsv(csv);
  if (!rows.length) throw new Error("The CSV contains no records");
  const accountId = randomUUID();
  const categories = walletImportCategories.map((category) => ({
    ...category,
    id: randomUUID(),
    systemKey: importedCategoryKeys[category.name],
  }));
  const categoryByName = new Map(categories.map((category) => [category.name, category]));
  const tags = [
    ...new Set(
      rows.flatMap((row) =>
        (row.labels ?? "")
          .split(",")
          .map((label) => label.trim())
          .filter(Boolean),
      ),
    ),
  ]
    .sort()
    .map((name, index) => ({
      id: randomUUID(),
      name,
      color: ["#2563EB", "#16A34A", "#DC2626", "#7C3AED", "#EA580C", "#0891B2"][index % 6]!,
      isActive: true,
    }));
  const tagByName = new Map(tags.map((tag) => [tag.name, tag.id]));
  const recordTags: { recordId: string; tagId: string }[] = [];
  const records = rows.map((row) => {
    const category = categoryByName.get((row.category ?? "").trim());
    const occurredAt = new Date(row.date ?? "");
    const amount = roundMoney(Number(row.amount));
    const currency = currencySchema.parse((row.currency ?? "").trim().toUpperCase());
    const type = recordTypeSchema.parse((row.type ?? "").trim().toLowerCase());
    if (
      !category ||
      !Number.isFinite(occurredAt.getTime()) ||
      !Number.isFinite(amount) ||
      amount <= 0
    )
      throw new Error("Invalid record amount, date or category");
    if (type === "transfer")
      throw new Error(
        "CSV transfers require explicit source and destination mapping; use the supported record import API",
      );
    const referenceAmount = roundMoney(Number(row.ref_currency_amount));
    if (
      currency !== "UYU" &&
      (!Number.isFinite(referenceAmount) ||
        referenceAmount <= 0 ||
        (row.ref_currency && row.ref_currency.trim().toUpperCase() !== "UYU"))
    )
      throw new Error("A foreign record requires a valid UYU reference amount");
    const rate = currency === "UYU" ? 1 : referenceAmount / amount;
    const payment = (row.payment_type ?? "").trim().toLowerCase().replace(" card", "");
    const paymentType = paymentTypeSchema.safeParse(payment);
    const id = randomUUID();
    for (const label of new Set(
      (row.labels ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    ))
      recordTags.push({ recordId: id, tagId: tagByName.get(label)! });
    return {
      id,
      type,
      amount: amount.toFixed(2),
      currency,
      accountId,
      accountAmount: (currency === "UYU" ? amount : referenceAmount).toFixed(2),
      categoryId: category.id,
      counterpartyName: row.payee?.trim() || null,
      paymentType: paymentType.success ? paymentType.data : ("other" as const),
      paymentStatus: "cleared" as const,
      exchangeRateToPrimary: rate.toFixed(6),
      occurredAt,
      note: row.note?.trim() || null,
      isFixed: false,
    };
  });
  return {
    account: {
      id: accountId,
      name: "Banco",
      type: "bank" as const,
      currency: "UYU",
      initialBalance: "0",
      color: "#2563EB",
      icon: "landmark",
      isVisible: true,
      isActive: true,
      note: "Cuenta unica importada desde CSV",
    },
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      color: category.color,
      icon: category.icon,
      systemKey: category.systemKey ?? null,
      parentId: category.parent ? categoryByName.get(category.parent)!.id : null,
    })),
    tags,
    records,
    recordTags,
    settings: {
      primaryCurrency: "UYU",
      primaryAccountId: accountId,
      defaultAccountId: null,
      defaultCreditCardId: null,
      theme: "light" as const,
      defaultDashboardPreset: "general" as const,
      locale: "es-UY",
      includeHiddenAccountsInReports: false,
    },
    counts: {
      accounts: 1,
      categories: categories.length,
      tags: tags.length,
      records: records.length,
    },
  };
}

/** A reset and all dependent writes form one Neon HTTP batch; preparation never connects. */
export async function importWalletRecords(
  db: DbClient,
  prepared: ReturnType<typeof prepareWalletImport>,
) {
  const resetTables = [
    schema.recordTags,
    schema.goalTags,
    schema.goalReservations,
    schema.installmentPlans,
    schema.budgets,
    schema.records,
    schema.goals,
    schema.investments,
    schema.debts,
    schema.exchangeRates,
    schema.tags,
    schema.categories,
    schema.accounts,
  ];
  const queries: [...Parameters<DbClient["batch"]>[0]] = [
    db.execute(
      sql`LOCK TABLE ${sql.join(
        [...resetTables, schema.settings].map((table) => sql.identifier(getTableName(table))),
        sql`, `,
      )} IN ACCESS EXCLUSIVE MODE`,
    ),
    db
      .update(schema.settings)
      .set({ primaryAccountId: null, defaultAccountId: null, defaultCreditCardId: null }),
  ];
  for (const table of resetTables) queries.push(db.delete(table));
  queries.push(
    db.insert(schema.accounts).values(prepared.account),
    // List the existing columns explicitly so imports work on either side of 0024.
    db.execute(sql`INSERT INTO ${schema.categories} (id, name, parent_id, color, icon, system_key)
      SELECT id, name, "parentId", color, icon, "systemKey"
      FROM jsonb_to_recordset(${JSON.stringify(prepared.categories)}::jsonb)
        AS category(id uuid, name text, "parentId" uuid, color text, icon text, "systemKey" text)`),
  );
  if (prepared.tags.length) queries.push(db.insert(schema.tags).values(prepared.tags));
  queries.push(db.insert(schema.records).values(prepared.records));
  if (prepared.recordTags.length)
    queries.push(db.insert(schema.recordTags).values(prepared.recordTags));
  queries.push(
    db
      .insert(schema.settings)
      .values(prepared.settings)
      .onConflictDoUpdate({ target: schema.settings.singleton, set: prepared.settings }),
  );
  await db.batch(queries);
}
