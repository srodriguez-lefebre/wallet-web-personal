import { and, desc, eq, gte, ilike, inArray, isNull, lt, or } from "drizzle-orm";

import { decodeRecordCursor, encodeRecordCursor } from "../../api/record-cursor.js";
import { groupGoalAssociations, groupIds, mapRecord } from "../mappers.js";
import { recordGoals, records, recordTags } from "../schema.js";

import type { WalletRecord } from "../../../shared/types.js";
import type { Db } from "../input-types.js";

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
  if (filters.categoryId) clauses.push(eq(records.categoryId, filters.categoryId));
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
    const pattern = `%${filters.search.replace(/[%_]/g, "\\$&")}%`;
    clauses.push(or(ilike(records.counterpartyName, pattern), ilike(records.note, pattern))!);
  }
  if (filters.from)
    clauses.push(gte(records.occurredAt, new Date(`${filters.from}T00:00:00.000Z`)));
  if (filters.to) {
    const exclusiveEnd = new Date(`${filters.to}T00:00:00.000Z`);
    exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
    clauses.push(lt(records.occurredAt, exclusiveEnd));
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
  const recordTagRows =
    pageRows.length > 0
      ? await db
          .select()
          .from(recordTags)
          .where(
            inArray(
              recordTags.recordId,
              pageRows.map((row) => row.id),
            ),
          )
      : [];
  const recordGoalRows =
    pageRows.length > 0
      ? await db
          .select()
          .from(recordGoals)
          .where(
            inArray(
              recordGoals.recordId,
              pageRows.map((row) => row.id),
            ),
          )
      : [];
  const tagIdsByRecord = groupIds(recordTagRows, "recordId", "tagId");
  const goalAssociationsByRecord = groupGoalAssociations(recordGoalRows);
  const last = pageRows.length ? pageRows[pageRows.length - 1] : undefined;
  return {
    items: pageRows.map((record) => mapRecord(record, tagIdsByRecord, goalAssociationsByRecord)),
    hasMore,
    nextCursor:
      hasMore && last
        ? encodeRecordCursor({ occurredAt: last.occurredAt.toISOString(), id: last.id })
        : null,
  };
}
