import { randomUUID } from "node:crypto";

import { and, eq, isNull, sql, type SQL } from "drizzle-orm";

import { lockCategoryWrites } from "./category-references.js";
import { protectedCategoryKeys, selectableCategory } from "../../shared/categories.js";
import { conflictError, notFoundError, validationError } from "../api/errors.js";
import { mapCategory } from "./mappers.js";
import { hasOwn } from "./patch.js";
import { normalizedSearchSql } from "./records/search.js";
import {
  budgets,
  categories,
  creditCardRecords,
  debts,
  installmentPlans,
  merchants,
  records,
  recordTemplates,
  recurringDebts,
} from "./schema.js";

import type { CategoryPatch } from "../../shared/schemas.js";
import type { CategoryUsage } from "../../shared/schemas/categories.js";
import type { Db, NewCategory } from "./input-types.js";

const protectedKeys = sql.join(
  protectedCategoryKeys.map((key) => sql`${key}`),
  sql`, `,
);

function categoryTree(root: string) {
  return sql`SELECT id FROM ${categories} WHERE id = ${root}::uuid AND deleted_at IS NULL
    UNION SELECT child.id FROM ${categories} child JOIN tree ON child.parent_id = tree.id
    WHERE child.deleted_at IS NULL`;
}

const normalizedName = (name: SQL) => normalizedSearchSql(sql`btrim(${name})`);

function siblingExists(name: SQL, parentId: SQL, id: string) {
  return sql`EXISTS (SELECT 1 FROM ${categories} sibling
    WHERE sibling.deleted_at IS NULL AND sibling.id <> ${id}::uuid
    AND sibling.parent_id IS NOT DISTINCT FROM ${parentId}
    AND ${normalizedName(sql`sibling.name`)} = ${normalizedName(name)})`;
}

function missingParent(parentId: SQL) {
  return sql`${parentId} IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM ${categories} parent WHERE parent.id = ${parentId} AND parent.deleted_at IS NULL)`;
}

function categoryDetails(row: typeof categories.$inferSelect) {
  const category = mapCategory(row);
  return {
    ...category,
    archivedAt: row.deletedAt?.toISOString() ?? null,
    isSystem: protectedCategoryKeys.some((key) => key === category.systemKey),
    isSelectable: row.deletedAt === null && selectableCategory(category),
  };
}

export async function listCategories(db: Db, includeArchived = false) {
  const rows = await db
    .select()
    .from(categories)
    .where(includeArchived ? undefined : isNull(categories.deletedAt));
  return rows.map(categoryDetails);
}

export async function createCategory(db: Db, input: NewCategory) {
  const id = randomUUID();
  const parentId = sql`${input.parentId ?? null}::uuid`;
  const [, validation, result, rows] = await db.batch([
    lockCategoryWrites(db),
    db.execute<{ missing: boolean }>(sql`SELECT (${missingParent(parentId)}) AS missing`),
    db.execute(sql`INSERT INTO ${categories} (id, name, parent_id, color, icon, system_key)
      SELECT ${id}::uuid, ${input.name}, ${parentId}, ${input.color}, ${input.icon}, ${input.systemKey ?? null}
      WHERE NOT (${missingParent(parentId)}) AND NOT ${siblingExists(sql`${input.name}::text`, parentId, id)}
      RETURNING id`),
    db.select().from(categories).where(eq(categories.id, id)),
  ]);
  if (result.rows.length) return categoryDetails(rows[0]!);
  if (validation.rows[0]?.missing) throw validationError("Parent category does not exist");
  throw conflictError("A sibling category already has this name");
}

export async function updateCategory(db: Db, id: string, input: CategoryPatch) {
  const current = and(eq(categories.id, id), isNull(categories.deletedAt));
  const parentId = hasOwn(input, "parentId")
    ? sql`${input.parentId ?? null}::uuid`
    : sql`${categories.parentId}`;
  const name = input.name === undefined ? sql`${categories.name}` : sql`${input.name}::text`;
  const moved = sql`${parentId} IS DISTINCT FROM ${categories.parentId}`;
  const reason = sql<string | null>`CASE
    WHEN (${moved}) AND ${categories.systemKey} IN (${protectedKeys}) THEN 'protected'
    WHEN (${moved}) AND (${missingParent(parentId)}) THEN 'parent'
    WHEN (${moved}) AND EXISTS (
      WITH RECURSIVE tree(id) AS (${categoryTree(id)}) SELECT 1 FROM tree WHERE id = ${parentId}
    ) THEN 'cycle'
    WHEN ((${moved}) OR ${normalizedName(name)} <> ${normalizedName(sql`${categories.name}`)})
      AND ${siblingExists(name, parentId, id)} THEN 'duplicate'
    ELSE NULL END`;
  const [, validity, rows] = await db.batch([
    lockCategoryWrites(db),
    db.select({ reason }).from(categories).where(current),
    db
      .update(categories)
      .set({ ...input, updatedAt: new Date() })
      .where(and(current, sql`(${reason}) IS NULL`))
      .returning(),
  ]);
  if (rows[0]) return categoryDetails(rows[0]);
  switch (validity[0]?.reason) {
    case "protected":
      throw conflictError("System categories cannot be moved");
    case "parent":
      throw validationError("Parent category does not exist");
    case "cycle":
      throw validationError("A category cannot be moved into its own tree");
    case "duplicate":
      throw conflictError("A sibling category already has this name");
    default:
      return null;
  }
}

const references = {
  records,
  cardRecords: creditCardRecords,
  budgets,
  debts,
  recurringDebts,
  installmentPlans,
  templates: recordTemplates,
  merchants,
} as const;

export async function categoryUsage(
  db: Db,
  ids?: string[],
): Promise<Record<string, CategoryUsage>> {
  if (ids?.length === 0) return {};
  const counts = Object.entries(references).map(
    ([key, table]) => sql`
    SELECT category_id, ${key}::text AS source,
      ${key === "records" || key === "cardRecords" ? sql`occurred_at` : sql`NULL::timestamptz`} AS used_at
    FROM ${table}
    WHERE category_id IN (SELECT id FROM selected)`,
  );
  const fields = Object.keys(references).map(
    (key) => sql`count(*) FILTER (WHERE source = ${key})::int AS ${sql.identifier(key)}`,
  );
  const { rows } = await db.execute<CategoryUsage & { id: string }>(sql`
    WITH selected AS (
      SELECT id FROM ${categories} ${
        ids
          ? sql`WHERE id IN (${sql.join(
              ids.map((id) => sql`${id}::uuid`),
              sql`, `,
            )})`
          : sql.empty()
      }
    ), usage AS (${sql.join(counts, sql` UNION ALL `)})
    SELECT selected.id, ${sql.join(fields, sql`, `)},
      to_char(max(used_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "lastUsedAt"
    FROM selected LEFT JOIN usage ON usage.category_id = selected.id
    GROUP BY selected.id`);
  return Object.fromEntries(rows.map(({ id, ...counts }) => [id, counts]));
}

async function archiveCategoryTree(db: Db, id: string, targetId?: string) {
  const now = new Date();
  const changes = Object.entries(references).map(([key, table]) => {
    const needsReview = key === "merchants" && !targetId;
    const destination = needsReview ? sql`review_category` : sql`destination`;
    const timestamp =
      "updatedAt" in table ? sql`, updated_at = ${now.toISOString()}::timestamptz` : sql.empty();
    return sql`${sql.identifier(`changed_${key}`)} AS (
      UPDATE ${table} SET category_id = (SELECT id FROM ${destination})${timestamp}
      WHERE category_id IN (SELECT id FROM tree) AND (SELECT reason FROM validation) IS NULL
      RETURNING id
    )`;
  });
  const counts = Object.keys(references).map(
    (key) => sql`${key}::text, (SELECT count(*) FROM ${sql.identifier(`changed_${key}`)})`,
  );

  const [, , result] = await db.batch([
    lockCategoryWrites(db),
    db.execute(sql`WITH RECURSIVE tree(id) AS (${categoryTree(id)})
      SELECT id FROM ${categories} WHERE deleted_at IS NULL AND (
        id IN (SELECT id FROM tree) OR ${targetId ? sql`id = ${targetId}::uuid` : sql`system_key IN ('category_eliminated', 'unknown_expense', 'others')`}
      ) ORDER BY id FOR NO KEY UPDATE`),
    db.execute<{
      reason: "not_found" | "protected" | "invalid_target" | "missing_fallback" | null;
      destination: string;
      archived: string[];
      counts: Omit<CategoryUsage, "lastUsedAt">;
    }>(sql`
      WITH RECURSIVE tree(id) AS (${categoryTree(id)}),
      destination AS (
        SELECT id, system_key FROM ${categories} WHERE deleted_at IS NULL AND
          ${targetId ? sql`id = ${targetId}::uuid` : sql`system_key = 'category_eliminated'`}
      ), review_category AS (
        SELECT id FROM ${categories} WHERE deleted_at IS NULL AND system_key IN ('unknown_expense', 'others')
        ORDER BY (system_key = 'unknown_expense') DESC LIMIT 1
      ), validation AS (
        SELECT CASE
          WHEN NOT EXISTS (SELECT 1 FROM tree) THEN 'not_found'
          WHEN EXISTS (SELECT 1 FROM ${categories} WHERE id IN (SELECT id FROM tree)
            AND system_key IN (${protectedKeys})) THEN 'protected'
          WHEN NOT EXISTS (SELECT 1 FROM destination) THEN ${targetId ? "invalid_target" : "missing_fallback"}
          ${targetId ? sql.empty() : sql`WHEN NOT EXISTS (SELECT 1 FROM review_category) THEN 'missing_fallback'`}
          ${
            targetId
              ? sql`WHEN EXISTS (SELECT 1 FROM destination WHERE id IN (SELECT id FROM tree)
            OR system_key IN (${protectedKeys})) THEN 'invalid_target'`
              : sql.empty()
          }
          ELSE NULL END AS reason
      ), archived AS (
        UPDATE ${categories} SET deleted_at = ${now.toISOString()}::timestamptz, updated_at = ${now.toISOString()}::timestamptz
        WHERE id IN (SELECT id FROM tree) AND (SELECT reason FROM validation) IS NULL
        RETURNING id
      ), ${sql.join(changes, sql`, `)}
      SELECT reason, (SELECT id FROM destination) AS destination,
        (SELECT coalesce(jsonb_agg(id ORDER BY id), '[]'::jsonb) FROM archived) AS archived,
        jsonb_build_object(${sql.join(counts, sql`, `)}) AS counts
      FROM validation`),
  ]);
  return result.rows[0]!;
}

export async function deleteCategory(db: Db, id: string) {
  const result = await archiveCategoryTree(db, id);
  if (result.reason === "not_found" || result.reason === "protected")
    return { deleted: false as const, reason: result.reason };
  if (result.reason) throw new Error("Category archive fallbacks are not configured");
  const { cardRecords, ...counts } = result.counts;
  return {
    deleted: true as const,
    fallbackCategoryId: result.destination,
    archivedCategoryIds: result.archived,
    reassigned: { ...counts, creditCardRecords: cardRecords },
  };
}

export async function mergeCategory(db: Db, id: string, targetId: string) {
  const result = await archiveCategoryTree(db, id, targetId);
  if (result.reason === "not_found") throw notFoundError("Category");
  if (result.reason === "protected") throw conflictError("Protected categories cannot be merged");
  if (result.reason)
    throw conflictError("Choose an active destination outside this tree and system categories");
  return { targetId, archivedCategoryIds: result.archived, reassigned: result.counts };
}
