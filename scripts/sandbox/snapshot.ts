import type { PGlite } from "@electric-sql/pglite";
import { getTableColumns, getTableName, type Table } from "drizzle-orm";
import { z } from "zod";
import * as schema from "../../server/db/schema.js";

type Row = Record<string, unknown>;
const rows = z.array(z.record(z.string(), z.unknown()));
const snapshotSchema = z
  .object({
    settings: z.record(z.string(), z.unknown()),
    accounts: rows,
    categories: rows.min(1),
    records: rows,
  })
  .catchall(z.unknown());
const collections: Array<[string, Table, string?]> = [
  ["accounts", schema.accounts],
  ["categories", schema.categories, "parentId"],
  ["tags", schema.tags],
  ["creditCards", schema.creditCards],
  ["recordTemplates", schema.recordTemplates],
  ["goals", schema.goals],
  ["recurringDebts", schema.recurringDebts],
  ["debts", schema.debts],
  ["creditCardStatements", schema.creditCardStatements],
  ["records", schema.records],
  ["creditCardRecords", schema.creditCardRecords, "originalRecordId"],
  ["creditCardPayments", schema.creditCardPayments],
  ["creditCardPaymentAllocations", schema.creditCardPaymentAllocations],
  [
    "goalReservationMovements",
    schema.goalReservationMovements,
    "reversesMovementId",
  ],
  ["budgets", schema.budgets],
  ["exchangeRates", schema.exchangeRates],
  ["investments", schema.investments],
  ["installmentPlans", schema.installmentPlans],
];
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;

export async function importSnapshot(pg: PGlite, input: unknown) {
  const snapshot = snapshotSchema.parse(input) as Record<string, unknown> & {
    settings: Row;
    records: Row[];
  };
  const counts: Record<string, number> = {};
  await pg.transaction(async (tx) => {
    if ((await tx.query("SELECT id FROM accounts LIMIT 1")).rows.length)
      throw new Error(
        "Local database already contains data; use sandbox:setup --reset explicitly",
      );
    // Migrations seed protected categories with fresh IDs; the backup owns those IDs.
    await tx.query("DELETE FROM categories");
    const insert = async (table: Table, row: Row, defer?: string) => {
      const columns = getTableColumns(table);
      const entries = Object.entries(row).filter(
        ([key, value]) => columns[key] && value !== undefined,
      );
      if (!entries.length)
        throw new Error(`Empty row in ${getTableName(table)}`);
      const values = entries.map(([key, value]) =>
        key === defer
          ? null
          : value !== null && columns[key].dataType === "json"
            ? JSON.stringify(value)
            : value,
      );
      await tx.query(
        `INSERT INTO ${quote(getTableName(table))} (${entries.map(([key]) => quote(columns[key].name)).join(",")}) VALUES (${values.map((_, index) => `$${index + 1}`).join(",")})`,
        values,
      );
    };
    for (const [key, table, defer] of collections) {
      let items = rows.parse(snapshot[key] ?? []);
      // Old backups contain balances rather than the newer movement ledger.
      if (key === "goalReservationMovements" && !items.length) {
        items = rows
          .parse(snapshot.goalReservations ?? [])
          .map((row) => ({ ...row, type: "reserve" }));
      }
      counts[key] = items.length;
      for (const row of items) await insert(table, row, defer);
      if (defer)
        for (const row of items) {
          if (row[defer])
            await tx.query(
              `UPDATE ${quote(getTableName(table))} SET ${quote(getTableColumns(table)[defer].name)} = $1 WHERE id = $2`,
              [row[defer], row.id],
            );
        }
    }
    await insert(schema.settings, snapshot.settings);
    for (const record of snapshot.records) {
      for (const tagId of (record.tagIds as string[]) ?? [])
        await insert(schema.recordTags, { recordId: record.id, tagId });
      const associations = record.goalAssociations as Row[] | undefined;
      const links = associations?.length
        ? associations
        : ((record.goalIds as string[]) ?? []).map((goalId) => ({ goalId }));
      for (const association of links)
        await insert(schema.recordGoals, {
          ...association,
          recordId: record.id,
        });
    }
    for (const goal of rows.parse(snapshot.goals ?? [])) {
      for (const tagId of (goal.tagIds as string[]) ?? [])
        await insert(schema.goalTags, { goalId: goal.id, tagId });
    }
  });
  return counts;
}
