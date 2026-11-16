import {
  and,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { categoryMatchesKind } from "../../../shared/categories.js";
import { isReviewCategory } from "../../../shared/record-review.js";
import { creditCardRecordSchema } from "../../../shared/schemas.js";
import { decodeRecordCursor, encodeRecordCursor } from "../../api/record-cursor.js";
import { categoryReadColumns } from "../category-metadata.js";
import { groupGoalAssociations, groupIds, mapRecord } from "../mappers.js";
import {
  categories,
  creditCardRecords,
  ingestionEvents,
  recordGoals,
  records,
  recordTags,
} from "../schema.js";
import { lowercaseSql, normalizedSearchSql } from "./search.js";

import type { WalletRecord } from "../../../shared/types.js";
import type { Db } from "../input-types.js";

async function listReviewSuggestions(db: Db, recordIds: string[]) {
  if (!recordIds.length) return new Map<string | null, string>();
  const child = alias(categories, "suggestion_child");
  const rows = await db
    .selectDistinctOn([ingestionEvents.recordId], {
      recordId: ingestionEvents.recordId,
      id: categories.id,
      name: categories.name,
      systemKey: categories.systemKey,
      kind: categoryReadColumns.kind,
    })
    .from(ingestionEvents)
    .innerJoin(
      categories,
      sql`${categories.id}::text = ${ingestionEvents.sanitizedPayload}->'classification'->>'suggestedCategoryId'`,
    )
    .where(
      and(
        inArray(ingestionEvents.recordId, recordIds),
        eq(ingestionEvents.status, "completed"),
        eq(ingestionEvents.action, "needs_review"),
        gt(ingestionEvents.metadataExpiresAt, new Date()),
        isNull(categories.deletedAt),
        notExists(
          db
            .select({ id: child.id })
            .from(child)
            .where(and(eq(child.parentId, categories.id), isNull(child.deletedAt))),
        ),
      ),
    )
    .orderBy(ingestionEvents.recordId, desc(ingestionEvents.completedAt), desc(ingestionEvents.id));
  return new Map(
    rows
      .filter(
        (row) =>
          isReviewCategory(row) && categoryMatchesKind({ kind: row.kind ?? undefined }, "expense"),
      )
      .map((row) => [row.recordId, row.id]),
  );
}

export async function listRecords(
  db: Db,
  filters: {
    type?: string;
    accountId?: string;
    creditCardId?: string;
    categoryId?: string;
    tagId?: string;
    goalId?: string;
    search?: string;
    searchMode?: "legacy" | "wallet";
    note?: string;
    categoryMode?: "exact" | "descendants";
    timeZone?: string;
    paymentStatus?: string;
    from?: string;
    to?: string;
    limit?: number;
    cursor?: string;
  } = {},
) {
  const clauses = [isNull(records.deletedAt)];
  if (filters.type && filters.type !== "all") {
    clauses.push(eq(records.type, filters.type as WalletRecord["type"]));
  }
  if (filters.accountId)
    clauses.push(
      or(
        eq(records.accountId, filters.accountId),
        eq(records.destinationAccountId, filters.accountId),
      )!,
    );
  if (filters.creditCardId) clauses.push(eq(records.creditCardId, filters.creditCardId));
  if (filters.categoryId) {
    clauses.push(
      filters.categoryMode === "descendants"
        ? sql`${records.categoryId} IN (
      WITH RECURSIVE descendants AS (
        SELECT id, ARRAY[id] AS visited FROM categories WHERE id=${filters.categoryId}::uuid AND deleted_at IS NULL
        UNION ALL SELECT c.id, d.visited || c.id FROM categories c JOIN descendants d ON c.parent_id=d.id
          WHERE c.deleted_at IS NULL AND NOT c.id=ANY(d.visited)
      ) SELECT id FROM descendants
    )`
        : eq(records.categoryId, filters.categoryId),
    );
  }
  if (filters.tagId)
    clauses.push(
      inArray(
        records.id,
        db
          .select({ id: recordTags.recordId })
          .from(recordTags)
          .where(eq(recordTags.tagId, filters.tagId)),
      ),
    );
  if (filters.goalId)
    clauses.push(
      inArray(
        records.id,
        db
          .select({ id: recordGoals.recordId })
          .from(recordGoals)
          .where(eq(recordGoals.goalId, filters.goalId)),
      ),
    );
  if (filters.paymentStatus && filters.paymentStatus !== "all")
    clauses.push(eq(records.paymentStatus, filters.paymentStatus as WalletRecord["paymentStatus"]));
  if (filters.search) {
    if (filters.searchMode === "wallet") {
      const haystack = sql`concat(
        (SELECT concat(CASE WHEN parent.id IS NOT NULL THEN parent.name || ' / ' ELSE '' END, c.name)
          FROM categories c LEFT JOIN categories parent ON parent.id=c.parent_id AND parent.deleted_at IS NULL
          WHERE c.id=${records.categoryId} AND c.deleted_at IS NULL), ' ',
        ${records.counterpartyName}, ' ', ${records.importMerchant}, ' ',
        (SELECT string_agg(t.name,' ' ORDER BY t.id) FROM tags t JOIN record_tags rt ON rt.tag_id=t.id WHERE rt.record_id=${records.id} AND t.deleted_at IS NULL), ' ',
        ${records.note})`;
      const term = filters.search.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();
      clauses.push(sql`strpos(${normalizedSearchSql(haystack)}, ${term}) > 0`);
    } else {
      const pattern = `%${filters.search.replace(/[\\%_]/g, "\\$&")}%`;
      clauses.push(or(ilike(records.counterpartyName, pattern), ilike(records.note, pattern))!);
    }
  }
  if (filters.note)
    clauses.push(
      sql`strpos(${lowercaseSql(sql`coalesce(${records.note},'')`)}, ${filters.note.trim().toLowerCase()}) > 0`,
    );
  if (filters.from)
    clauses.push(
      filters.timeZone
        ? sql`${records.occurredAt} >= (${filters.from}::date::timestamp AT TIME ZONE ${filters.timeZone})`
        : gte(records.occurredAt, new Date(`${filters.from}T00:00:00.000Z`)),
    );
  if (filters.to) {
    if (filters.timeZone)
      clauses.push(
        sql`${records.occurredAt} < ((${filters.to}::date + 1)::timestamp AT TIME ZONE ${filters.timeZone})`,
      );
    else {
      const exclusiveEnd = new Date(`${filters.to}T00:00:00.000Z`);
      exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
      clauses.push(lt(records.occurredAt, exclusiveEnd));
    }
  }
  if (filters.cursor) {
    const cursor = decodeRecordCursor(filters.cursor);
    const occurredAt = new Date(cursor.occurredAt);
    clauses.push(
      or(
        lt(records.occurredAt, occurredAt),
        and(eq(records.occurredAt, occurredAt), lt(records.id, cursor.id)),
      )!,
    );
  }
  const limit = filters.limit ?? 100;
  const rows = await db
    .select()
    .from(records)
    .where(and(...clauses))
    .orderBy(desc(records.occurredAt), desc(records.id))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const recordIds = pageRows.map((row) => row.id);
  const reviewIds = pageRows
    .filter(
      (record) =>
        record.paymentStatus === "needs_review" &&
        record.type === "expense" &&
        record.paymentType !== "transfer" &&
        record.importMerchant &&
        !record.merchantCorrection,
    )
    .map((record) => record.id);
  const [recordTagRows, recordGoalRows, linkedRows, suggestions] = await Promise.all([
    recordIds.length
      ? db.select().from(recordTags).where(inArray(recordTags.recordId, recordIds))
      : [],
    recordIds.length
      ? db.select().from(recordGoals).where(inArray(recordGoals.recordId, recordIds))
      : [],
    recordIds.length
      ? db
          .select({
            walletRecordId: creditCardRecords.walletRecordId,
            kind: creditCardRecords.kind,
          })
          .from(creditCardRecords)
          .where(
            and(
              isNull(creditCardRecords.deletedAt),
              inArray(creditCardRecords.walletRecordId, recordIds),
            ),
          )
      : [],
    listReviewSuggestions(db, reviewIds),
  ]);
  const tagIdsByRecord = groupIds(recordTagRows, "recordId", "tagId");
  const goalAssociationsByRecord = groupGoalAssociations(recordGoalRows);
  const linkedKinds = new Map(
    linkedRows.map((row) => [
      row.walletRecordId,
      creditCardRecordSchema.shape.kind.parse(row.kind),
    ]),
  );
  const last = pageRows.length ? pageRows[pageRows.length - 1] : undefined;
  return {
    items: pageRows.map((record) => ({
      ...mapRecord(record, tagIdsByRecord, goalAssociationsByRecord),
      linkedCardRecordKind: linkedKinds.get(record.id),
      suggestedCategoryId: suggestions.get(record.id),
    })),
    hasMore,
    nextCursor:
      hasMore && last
        ? encodeRecordCursor({ occurredAt: last.occurredAt.toISOString(), id: last.id })
        : null,
  };
}
