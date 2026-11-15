import { afterAll, beforeAll, expect, test } from "vitest";

import { createPostgresTestDatabase } from "../sandbox/postgres-test";
import { createDb } from "../../server/db/client";
import { prepareWalletImport, importWalletRecords } from "./wallet-records";

let fixture: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
beforeAll(async () => {
  fixture = await createPostgresTestDatabase();
}, 60000);
afterAll(async () => {
  await fixture?.close();
});
const headers =
  "type;amount;currency;category;date;payee;payment_type;labels;note;ref_currency_amount";
const salaries =
  headers +
  "\nincome;5000;UYU;Wage, invoices;2026-01-01T12:00:00Z;Synthetic salary;transfer;Salary;;5000\nincome;5000;UYU;Wage, invoices;2026-02-01T12:00:00Z;Synthetic salary;transfer;Salary;;5000";
test("equal salaries on distinct dates remain distinct and a repeated replacement does not duplicate them", async () => {
  await importWalletRecords(createDb(), prepareWalletImport(salaries));
  expect(
    (await fixture.pool.query("SELECT amount,occurred_at FROM records ORDER BY occurred_at")).rows,
  ).toEqual([
    { amount: "5000.00", occurred_at: new Date("2026-01-01T12:00:00Z") },
    { amount: "5000.00", occurred_at: new Date("2026-02-01T12:00:00Z") },
  ]);
  await importWalletRecords(createDb(), prepareWalletImport(salaries));
  expect((await fixture.pool.query("SELECT count(*)::int AS count FROM records")).rows).toEqual([
    { count: 2 },
  ]);
});
test("a late write failure rolls back both the reset and every inserted entity", async () => {
  const before = (await fixture.pool.query("SELECT id,amount,occurred_at FROM records ORDER BY id"))
    .rows;
  await fixture.pool.query(
    "CREATE FUNCTION reject_synthetic_import() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic late failure'; END $$; CREATE TRIGGER reject_synthetic_import BEFORE INSERT ON record_tags FOR EACH ROW EXECUTE FUNCTION reject_synthetic_import()",
  );
  try {
    await expect(importWalletRecords(createDb(), prepareWalletImport(salaries))).rejects.toThrow();
  } finally {
    await fixture.pool.query(
      "DROP TRIGGER reject_synthetic_import ON record_tags; DROP FUNCTION reject_synthetic_import()",
    );
  }
  expect(
    (await fixture.pool.query("SELECT id,amount,occurred_at FROM records ORDER BY id")).rows,
  ).toEqual(before);
});
test("malformed CSV is rejected before any database operation", () => {
  expect(() =>
    prepareWalletImport(headers + "\nexpense;not-money;UYU;Shopping;invalid;;;;;"),
  ).toThrow();
  expect(() =>
    prepareWalletImport(headers + "\nexpense;10;ZZZ;Shopping;2026-01-01T12:00:00Z;;;;;10"),
  ).toThrow();
});
