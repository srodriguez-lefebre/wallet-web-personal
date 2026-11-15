import { randomUUID } from "node:crypto";

import { and, eq, isNull, ne, sql } from "drizzle-orm";

import { lockCategoryReferences } from "./category-references.js";
import {
  type AccountPatch,
  accountSchema,
  type RecordTemplatePatch,
  recordTemplatePatchSchema,
  recordTemplateSchema,
  type TagPatch,
  tagSchema,
} from "../../shared/schemas.js";
import { conflictError, referenceNotFoundError, translateDatabaseError } from "../api/errors.js";
import { mapAccount, mapRecordTemplate, mapTag, toNumeric } from "./mappers.js";
import { hasOwn, mergePatch } from "./patch.js";
import {
  accounts,
  budgets,
  categories,
  creditCards,
  goals,
  goalTags,
  recordTags,
  recordTemplates,
  recurringDebts,
  settings,
  tags,
} from "./schema.js";

import type { RecordTemplate } from "../../shared/types.js";
import type { Db, NewAccount, NewTag } from "./input-types.js";

/** Validate the prospective row inside its mutation statement, including untouched references on patches. */
export function templateReferenceConditions(
  values: Partial<RecordTemplate> | RecordTemplatePatch,
  useCurrent = false,
) {
  const value = (
    key: "accountId" | "destinationAccountId" | "creditCardId" | "categoryId" | "tagId",
  ) =>
    hasOwn(values, key)
      ? sql`${values[key] ?? null}::uuid`
      : useCurrent
        ? sql`${recordTemplates[key]}`
        : sql`NULL::uuid`;
  return and(
    ...(["accountId", "destinationAccountId"] as const).map(
      (key) =>
        sql`(${value(key)} IS NULL OR EXISTS (SELECT 1 FROM ${accounts} WHERE ${accounts.id} = ${value(key)} AND ${accounts.isActive} AND ${accounts.deletedAt} IS NULL))`,
    ),
    sql`(${value("creditCardId")} IS NULL OR EXISTS (SELECT 1 FROM ${creditCards} WHERE ${creditCards.id} = ${value("creditCardId")} AND ${creditCards.isActive}))`,
    sql`(${value("categoryId")} IS NULL OR EXISTS (SELECT 1 FROM ${categories} WHERE ${categories.id} = ${value("categoryId")} AND ${categories.deletedAt} IS NULL))`,
    sql`(${value("tagId")} IS NULL OR EXISTS (SELECT 1 FROM ${tags} WHERE ${tags.id} = ${value("tagId")} AND ${tags.isActive}))`,
  )!;
}

export async function listRecordTemplates(db: Db) {
  return (
    await db.select().from(recordTemplates).orderBy(recordTemplates.name, recordTemplates.id)
  ).map(mapRecordTemplate);
}

export async function saveRecordTemplate<T>(write: PromiseLike<T>): Promise<T> {
  try {
    return await write;
  } catch (error) {
    if (translateDatabaseError(error)?.status === 409)
      throw conflictError("A template with this name already exists");
    throw error;
  }
}

export async function createRecordTemplate(db: Db, value: Omit<RecordTemplate, "id">) {
  const input = recordTemplateSchema.parse(value);
  const id = randomUUID();
  const [, , result] = await saveRecordTemplate(
    db.batch([
      lockCategoryReferences(db),
      // A separate statement obtains the lock before the insertion's READ COMMITTED snapshot.
      db.execute(sql`SELECT pg_advisory_xact_lock(1791000018)`),
      db.execute(sql`INSERT INTO ${recordTemplates} (id,name,type,amount,currency,account_id,credit_card_id,destination_account_id,category_id,tag_id,counterparty_name,note,payment_type)
      SELECT ${id}::uuid,${input.name},${input.type}::record_type,${toNumeric(input.amount)}::numeric,${input.currency},${input.accountId ?? null}::uuid,${input.creditCardId ?? null}::uuid,${input.destinationAccountId ?? null}::uuid,${input.categoryId ?? null}::uuid,${input.tagId ?? null}::uuid,${input.counterpartyName ?? null},${input.note ?? null},${input.paymentType}::payment_type
      WHERE (SELECT count(*) FROM ${recordTemplates}) < 100 AND ${templateReferenceConditions(input)} RETURNING id`),
    ]),
  );
  if (!result.rows.length) {
    const [countRow] = await db.select({ count: sql<number>`count(*)::int` }).from(recordTemplates);
    if ((countRow?.count ?? 0) >= 100)
      throw conflictError("The template library is limited to 100 templates");
    throw referenceNotFoundError("Choose active references for this template");
  }
  const [row] = await db.select().from(recordTemplates).where(eq(recordTemplates.id, id));
  return mapRecordTemplate(row);
}

export async function updateRecordTemplate(db: Db, id: string, value: RecordTemplatePatch) {
  const input = recordTemplatePatchSchema.parse(value);
  const { amount, ...fields } = input;
  const [, [row]] = await saveRecordTemplate(
    db.batch([
      lockCategoryReferences(db),
      db
        .update(recordTemplates)
        .set({ ...fields, ...(amount === undefined ? {} : { amount: toNumeric(amount) }) })
        .where(and(eq(recordTemplates.id, id), templateReferenceConditions(input, true)))
        .returning(),
    ]),
  );
  if (row) return mapRecordTemplate(row);
  const [existing] = await db
    .select({ id: recordTemplates.id })
    .from(recordTemplates)
    .where(eq(recordTemplates.id, id));
  if (existing) throw referenceNotFoundError("Choose active references for this template");
  return null;
}

export async function deleteRecordTemplate(db: Db, id: string) {
  return Boolean(
    (
      await db
        .delete(recordTemplates)
        .where(eq(recordTemplates.id, id))
        .returning({ id: recordTemplates.id })
    ).length,
  );
}

export async function listAccounts(db: Db) {
  const rows = await db.select().from(accounts).where(isNull(accounts.deletedAt));
  return rows.map(mapAccount);
}

export async function createAccount(db: Db, input: NewAccount) {
  const [row] = await db
    .insert(accounts)
    .values({
      ...input,
      initialBalance: toNumeric(input.initialBalance),
    })
    .returning();
  return mapAccount(row);
}

export async function updateAccount(db: Db, id: string, input: AccountPatch) {
  const [current] = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
  if (!current) return null;
  const merged = mergePatch(accountSchema, mapAccount(current), input, ["note"]);
  const values: Partial<typeof accounts.$inferInsert> = { updatedAt: new Date() };
  for (const key of [
    "name",
    "type",
    "currency",
    "color",
    "icon",
    "isVisible",
    "isActive",
  ] as const) {
    if (hasOwn(input, key)) values[key] = merged[key] as never;
  }
  if (hasOwn(input, "initialBalance")) values.initialBalance = toNumeric(merged.initialBalance);
  if (hasOwn(input, "note")) values.note = merged.note ?? null;
  const [row] = await db.update(accounts).set(values).where(eq(accounts.id, id)).returning();
  return row ? mapAccount(row) : null;
}

export async function deleteAccount(db: Db, id: string) {
  const [current] = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
  if (!current) return false;
  if (current.deletedAt) return true;
  const [replacement] = await db
    .select()
    .from(accounts)
    .where(and(isNull(accounts.deletedAt), ne(accounts.id, id)))
    .orderBy(accounts.createdAt)
    .limit(1);
  const now = new Date();
  await db.batch([
    db
      .update(accounts)
      .set({ isActive: false, isVisible: false, deletedAt: now, updatedAt: now })
      .where(eq(accounts.id, id)),
    db
      .update(recurringDebts)
      .set({ isActive: false, updatedAt: now })
      .where(eq(recurringDebts.accountId, id)),
    db.update(budgets).set({ isActive: false, updatedAt: now }).where(eq(budgets.accountId, id)),
    db.update(recordTemplates).set({ accountId: null }).where(eq(recordTemplates.accountId, id)),
    db
      .update(recordTemplates)
      .set({ destinationAccountId: null })
      .where(eq(recordTemplates.destinationAccountId, id)),
    db
      .update(goals)
      .set({ autoReservationAccountId: null, autoCaptureEnabled: false, updatedAt: now })
      .where(eq(goals.autoReservationAccountId, id)),
    db
      .update(goals)
      .set({ status: "paused", updatedAt: now })
      .where(and(eq(goals.accountId, id), eq(goals.status, "active"))),
    db
      .update(settings)
      .set({ primaryAccountId: replacement?.id ?? null, updatedAt: now })
      .where(eq(settings.primaryAccountId, id)),
    db
      .update(settings)
      .set({ defaultAccountId: replacement?.id ?? null, updatedAt: now })
      .where(eq(settings.defaultAccountId, id)),
  ]);
  return true;
}

export async function listTags(db: Db) {
  const rows = await db.select().from(tags).where(isNull(tags.deletedAt));
  return rows.map(mapTag);
}

export async function createTag(db: Db, input: NewTag) {
  const [row] = await db.insert(tags).values(input).returning();
  return mapTag(row);
}

export async function updateTag(db: Db, id: string, input: TagPatch) {
  const [current] = await db
    .select()
    .from(tags)
    .where(and(eq(tags.id, id), isNull(tags.deletedAt)))
    .limit(1);
  if (!current) return null;
  const merged = mergePatch(tagSchema, mapTag(current), input, []);
  const values: Partial<typeof tags.$inferInsert> = { updatedAt: new Date() };
  if (hasOwn(input, "name")) values.name = merged.name;
  if (hasOwn(input, "color")) values.color = merged.color;
  if (hasOwn(input, "isActive")) values.isActive = merged.isActive;
  const [row] = await db
    .update(tags)
    .set(values)
    .where(and(eq(tags.id, id), isNull(tags.deletedAt)))
    .returning();
  return row ? mapTag(row) : null;
}

export async function deleteTag(db: Db, id: string) {
  const [current] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.id, id), isNull(tags.deletedAt)))
    .limit(1);
  if (!current) return false;
  const results = await db.batch([
    db.delete(recordTags).where(eq(recordTags.tagId, id)),
    db.delete(goalTags).where(eq(goalTags.tagId, id)),
    db.update(budgets).set({ tagId: null, updatedAt: new Date() }).where(eq(budgets.tagId, id)),
    db
      .delete(tags)
      .where(and(eq(tags.id, id), isNull(tags.deletedAt)))
      .returning(),
  ]);
  const rows = results[3];
  return rows.length > 0;
}
