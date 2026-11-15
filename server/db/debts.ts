import { createHash, randomUUID } from "node:crypto";

import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { lockCategoryReferences, writeCategoryReferences } from "./category-references.js";
import {
  type DebtPatch,
  debtSchema,
  type RecurringDebtPatch,
  recurringDebtSchema,
} from "../../shared/schemas.js";
import { conflictError, validationError } from "../api/errors.js";
import { getExchangeRate } from "./fx.js";
import { mapDebt, mapRecord, mapRecurringDebt, toDate, toNumeric } from "./mappers.js";
import { hasOwn, mergePatch } from "./patch.js";
import { accounts, debts, records, recurringDebts, settings } from "./schema.js";

import type { WalletRecord } from "../../shared/types.js";
import type { Db, DebtPaymentInput, NewDebt, NewRecurringDebt } from "./input-types.js";

export async function listDebts(db: Db) {
  const rows = await db
    .select()
    .from(debts)
    .where(isNull(debts.deletedAt))
    .orderBy(desc(debts.startedAt));
  return rows.map(mapDebt);
}

function debtInsertValues(input: NewDebt) {
  return {
    name: input.name,
    direction: input.direction,
    originalAmount: input.originalAmount === undefined ? null : toNumeric(input.originalAmount),
    pendingAmount: input.pendingAmount === undefined ? null : toNumeric(input.pendingAmount),
    currency: input.currency,
    counterpartyName: input.counterpartyName,
    accountId: input.accountId ?? null,
    categoryId: input.categoryId,
    status: input.status,
    isVisible: input.isVisible,
    startedAt: new Date(input.startedAt ?? new Date().toISOString()),
    dueAt: toDate(input.dueAt),
    note: input.note ?? null,
    recurringDebtId: input.recurringDebtId ?? null,
    recurringMonth: input.recurringMonth ?? null,
  };
}

export async function createDebt(db: Db, input: NewDebt) {
  const [debt] = await createDebts(db, [input], { ignoreConflicts: false });
  if (!debt) throw new Error("Database mutation returned no debt");
  return debt;
}

export async function createDebts(db: Db, inputs: NewDebt[], options = { ignoreConflicts: true }) {
  if (!inputs.length) return [];
  const insert = db.insert(debts).values(inputs.map(debtInsertValues));
  const rows = await writeCategoryReferences(
    db,
    inputs.map((input) => input.categoryId),
    (options.ignoreConflicts ? insert.onConflictDoNothing() : insert).returning(),
  );
  return rows.map(mapDebt);
}

export async function generateDueRecurringDebts(db: Db, currentDate = new Date()) {
  const month = sql`generated.month_start`;
  const dueAt = sql<Date>`(((${month}::date + (LEAST(${recurringDebts.dayOfMonth}::int,
    EXTRACT(day FROM ${month} + interval '1 month' - interval '1 day')::int) - 1))::timestamp
    + interval '12 hours') AT TIME ZONE 'UTC')`;
  const monthKey = sql<string>`to_char(${month}, 'YYYY-MM')`;
  const [, rows] = await db.batch([
    lockCategoryReferences(db),
    db
      .insert(debts)
      .select(
        db
          .select({
            createdAt: sql<Date>`now()`.as("created_at"),
            updatedAt: sql<Date>`now()`.as("updated_at"),
            deletedAt: sql<Date | null>`NULL::timestamptz`.as("deleted_at"),
            id: sql<string>`gen_random_uuid()`.as("id"),
            name: sql<string>`${recurringDebts.name} || ' - ' || ${monthKey}`.as("name"),
            direction: recurringDebts.direction,
            originalAmount: recurringDebts.amount,
            pendingAmount: recurringDebts.amount,
            currency: recurringDebts.currency,
            counterpartyName: recurringDebts.counterpartyName,
            accountId: recurringDebts.accountId,
            categoryId: recurringDebts.categoryId,
            status: sql<"active">`'active'::debt_status`.as("status"),
            isVisible: sql<boolean>`true`.as("is_visible"),
            startedAt: dueAt.as("started_at"),
            dueAt: dueAt.as("due_at"),
            note: recurringDebts.note,
            recurringDebtId: recurringDebts.id,
            recurringMonth: monthKey.as("recurring_month"),
          })
          .from(recurringDebts)
          .innerJoin(
            sql`LATERAL generate_series(
    date_trunc('month', ${recurringDebts.startedAt} AT TIME ZONE 'UTC'),
    date_trunc('month', ${currentDate.toISOString()}::timestamptz AT TIME ZONE 'UTC'),
    interval '1 month') AS generated(month_start)`,
            sql`true`,
          )
          .where(sql`${recurringDebts.isActive} = true AND ${recurringDebts.deletedAt} IS NULL AND ${dueAt} >= ${recurringDebts.startedAt}
      AND ${dueAt} <= ${currentDate.toISOString()}::timestamptz`),
      )
      .onConflictDoNothing({ target: [debts.recurringDebtId, debts.recurringMonth] })
      .returning(),
  ]);
  return rows.map(mapDebt);
}

export async function updateDebt(db: Db, id: string, input: DebtPatch) {
  const [current] = await db
    .select()
    .from(debts)
    .where(and(eq(debts.id, id), isNull(debts.deletedAt)))
    .limit(1);
  if (!current) return null;
  const mapped = mapDebt(current);
  const merged = mergePatch(debtSchema, mapped, input, [
    "originalAmount",
    "pendingAmount",
    "accountId",
    "dueAt",
    "note",
    "recurringDebtId",
    "recurringMonth",
  ]);
  const values: Partial<typeof debts.$inferInsert> = { updatedAt: new Date() };
  for (const key of [
    "name",
    "direction",
    "currency",
    "counterpartyName",
    "categoryId",
    "status",
    "isVisible",
  ] as const)
    if (hasOwn(input, key)) values[key] = merged[key] as never;
  if (hasOwn(input, "originalAmount"))
    values.originalAmount =
      merged.originalAmount === undefined ? null : toNumeric(merged.originalAmount);
  if (hasOwn(input, "pendingAmount"))
    values.pendingAmount =
      merged.pendingAmount === undefined ? null : toNumeric(merged.pendingAmount);
  if (hasOwn(input, "accountId")) values.accountId = merged.accountId ?? null;
  if (hasOwn(input, "startedAt")) values.startedAt = new Date(merged.startedAt);
  if (hasOwn(input, "dueAt")) values.dueAt = toDate(merged.dueAt);
  if (hasOwn(input, "note")) values.note = merged.note ?? null;
  if (hasOwn(input, "recurringDebtId")) values.recurringDebtId = merged.recurringDebtId ?? null;
  if (hasOwn(input, "recurringMonth")) values.recurringMonth = merged.recurringMonth ?? null;
  const [row] = await writeCategoryReferences(
    db,
    [input.categoryId],
    db
      .update(debts)
      .set(values)
      .where(and(eq(debts.id, id), isNull(debts.deletedAt)))
      .returning(),
  );
  return row ? mapDebt(row) : null;
}

export async function deleteDebt(db: Db, id: string) {
  const rows = await db
    .delete(debts)
    .where(and(eq(debts.id, id), isNull(debts.deletedAt)))
    .returning();
  return rows.length > 0;
}

export async function listRecurringDebts(db: Db) {
  const rows = await db
    .select()
    .from(recurringDebts)
    .where(isNull(recurringDebts.deletedAt))
    .orderBy(desc(recurringDebts.startedAt));
  return rows.map(mapRecurringDebt);
}

export async function createRecurringDebt(db: Db, input: NewRecurringDebt) {
  const [row] = await writeCategoryReferences(
    db,
    [input.categoryId],
    db
      .insert(recurringDebts)
      .values({
        name: input.name,
        direction: input.direction,
        amount: input.amount === undefined ? null : toNumeric(input.amount),
        currency: input.currency,
        counterpartyName: input.counterpartyName,
        accountId: input.accountId ?? null,
        categoryId: input.categoryId,
        dayOfMonth: toNumeric(input.dayOfMonth),
        isActive: input.isActive,
        startedAt: new Date(input.startedAt ?? new Date().toISOString()),
        note: input.note ?? null,
      })
      .returning(),
  );
  return mapRecurringDebt(row);
}

export async function updateRecurringDebt(db: Db, id: string, input: RecurringDebtPatch) {
  const [current] = await db
    .select()
    .from(recurringDebts)
    .where(and(eq(recurringDebts.id, id), isNull(recurringDebts.deletedAt)))
    .limit(1);
  if (!current) return null;
  const mapped = mapRecurringDebt(current);
  const merged = mergePatch(recurringDebtSchema, mapped, input, ["amount", "accountId", "note"]);
  const values: Partial<typeof recurringDebts.$inferInsert> = { updatedAt: new Date() };
  for (const key of [
    "name",
    "direction",
    "currency",
    "counterpartyName",
    "categoryId",
    "isActive",
  ] as const)
    if (hasOwn(input, key)) values[key] = merged[key] as never;
  if (hasOwn(input, "amount"))
    values.amount = merged.amount === undefined ? null : toNumeric(merged.amount);
  if (hasOwn(input, "accountId")) values.accountId = merged.accountId ?? null;
  if (hasOwn(input, "dayOfMonth")) values.dayOfMonth = toNumeric(merged.dayOfMonth);
  if (hasOwn(input, "startedAt")) values.startedAt = new Date(merged.startedAt);
  if (hasOwn(input, "note")) values.note = merged.note ?? null;
  const [row] = await writeCategoryReferences(
    db,
    [input.categoryId],
    db
      .update(recurringDebts)
      .set(values)
      .where(and(eq(recurringDebts.id, id), isNull(recurringDebts.deletedAt)))
      .returning(),
  );
  return row ? mapRecurringDebt(row) : null;
}

export async function deleteRecurringDebt(db: Db, id: string) {
  const rows = await db
    .delete(recurringDebts)
    .where(and(eq(recurringDebts.id, id), isNull(recurringDebts.deletedAt)))
    .returning();
  return rows.length > 0;
}

export async function recordDebtPayment(db: Db, id: string, input: DebtPaymentInput) {
  const idempotencyKey = input.idempotencyKey ?? randomUUID();
  const requestHash = createHash("sha256")
    .update(
      JSON.stringify({
        debtId: id,
        amount: input.amount,
        accountId: input.accountId,
        accountAmount: input.accountAmount ?? null,
        occurredAt: input.occurredAt,
        note: input.note ?? null,
        saveAccountToDebt: Boolean(input.saveAccountToDebt),
      }),
    )
    .digest("hex");
  const [existing] = await db
    .select()
    .from(records)
    .where(eq(records.idempotencyKey, idempotencyKey))
    .limit(1);
  if (existing) {
    if (existing.requestHash !== requestHash)
      throw conflictError("Idempotency key was already used with another payment");
    const [debtRow] = await db.select().from(debts).where(eq(debts.id, id)).limit(1);
    return debtRow
      ? { debt: mapDebt(debtRow), record: mapRecord(existing, { [existing.id]: [] }) }
      : null;
  }
  const [[debtRow], [accountRow], [settingsRow]] = await Promise.all([
    db
      .select()
      .from(debts)
      .where(and(eq(debts.id, id), isNull(debts.deletedAt)))
      .limit(1),
    db
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.id, input.accountId),
          isNull(accounts.deletedAt),
          eq(accounts.isActive, true),
        ),
      )
      .limit(1),
    db.select().from(settings).limit(1),
  ]);
  if (!debtRow) return null;
  if (!accountRow) throw validationError("Select an active payment account");
  const currency = debtRow.currency as WalletRecord["currency"];
  const accountRate = await getExchangeRate(
    db,
    currency,
    accountRow.currency as WalletRecord["currency"],
    input.occurredAt,
  );
  const primaryRate = await getExchangeRate(
    db,
    currency,
    (settingsRow?.primaryCurrency ?? "UYU") as WalletRecord["currency"],
    input.occurredAt,
  );
  if (primaryRate === null || (accountRate === null && input.accountAmount === undefined))
    throw validationError("A historical exchange rate or explicit account amount is required");
  const accountAmount =
    input.accountAmount === undefined
      ? sql`round(${toNumeric(input.amount)}::numeric * ${String(accountRate)}::numeric, 2)`
      : sql`${toNumeric(input.accountAmount)}::numeric`;
  const recordId = randomUUID();
  try {
    await db.batch([
      lockCategoryReferences(db),
      db.execute(sql`
      WITH updated_debt AS (
        UPDATE ${debts}
        SET updated_at=now(), pending_amount = pending_amount - ${toNumeric(input.amount)}::numeric,
            status = CASE WHEN pending_amount - ${toNumeric(input.amount)}::numeric = 0 THEN 'paid'::debt_status ELSE status END,
            account_id = CASE WHEN ${Boolean(input.saveAccountToDebt)} THEN ${input.accountId}::uuid ELSE account_id END
        WHERE id = ${id}::uuid AND deleted_at IS NULL
          AND pending_amount IS NOT NULL
          AND pending_amount >= ${toNumeric(input.amount)}::numeric
          AND status <> 'paid'::debt_status
        RETURNING *
      )
      INSERT INTO ${records} (
        id, type, amount, currency, account_id, account_amount, category_id, counterparty_name,
        payment_type, payment_status, exchange_rate_to_primary, occurred_at, note,
        is_fixed, debt_id, idempotency_key, request_hash
      )
      SELECT ${recordId}::uuid,
        CASE WHEN direction = 'receivable' THEN 'income'::record_type ELSE 'expense'::record_type END,
        ${toNumeric(input.amount)}::numeric, currency, ${input.accountId}::uuid, ${accountAmount}, category_id, counterparty_name,
        'transfer'::payment_type, 'cleared'::payment_status, ${toNumeric(primaryRate)}, ${new Date(input.occurredAt)},
        COALESCE(${input.note ?? null}, 'Debt payment: ' || name), false, id, ${idempotencyKey}, ${requestHash}
      FROM updated_debt
    `),
    ]);
  } catch (error) {
    const [raced] = await db
      .select()
      .from(records)
      .where(eq(records.idempotencyKey, idempotencyKey))
      .limit(1);
    if (!raced) throw error;
    if (raced.requestHash !== requestHash)
      throw conflictError("Idempotency key was already used with another payment");
  }
  const [[updatedDebtRow], [recordRow]] = await Promise.all([
    db
      .select()
      .from(debts)
      .where(and(eq(debts.id, id), isNull(debts.deletedAt)))
      .limit(1),
    db.select().from(records).where(eq(records.idempotencyKey, idempotencyKey)).limit(1),
  ]);
  if (!updatedDebtRow) return null;
  if (!recordRow) throw validationError("Payment amount is invalid for this debt");
  return { debt: mapDebt(updatedDebtRow), record: mapRecord(recordRow, { [recordRow.id]: [] }) };
}
