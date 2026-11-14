import { afterAll, beforeAll, expect, test } from "vitest";

import { createPostgresTestDatabase } from "../../scripts/sandbox/postgres-test.js";
import { createDb } from "./client.js";
import { getExchangeRate } from "./fx.js";

let fixture: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
beforeAll(async () => {
  fixture = await createPostgresTestDatabase();
}, 60_000);
afterAll(async () => {
  await fixture?.close();
});

test("historical SQL quotes retain direct, inverse and ordered bridge semantics", async () => {
  await fixture.pool.query("TRUNCATE exchange_rates");
  await fixture.pool.query(`INSERT INTO exchange_rates(from_currency,to_currency,rate,date) VALUES
    ('USD','UYU',40,'2026-01-01'), ('USD','UYU',42,'2026-02-01'),
    ('USD','UYU',99,'2026-12-01'), ('UYU','USD',0.03,'2026-03-01'),
    ('EUR','UYU',48,'2026-01-01'), ('EUR','USD',2,'2026-01-01')`);
  const db = createDb();
  expect(await getExchangeRate(db, "USD", "UYU", "2026-01-15")).toBe(40);
  // A direct quote wins over a more recent inverse, matching shared/money.
  expect(await getExchangeRate(db, "USD", "UYU", "2026-04-15")).toBe(42);
  expect(await getExchangeRate(db, "UYU", "EUR", "2026-02-15")).toBeCloseTo(1 / 48);
  // UYU is the first bridge, before USD.
  expect(await getExchangeRate(db, "EUR", "BRL", "2026-02-15")).toBeNull();
  await fixture.pool.query(
    "INSERT INTO exchange_rates(from_currency,to_currency,rate,date) VALUES('UYU','BRL',0.1,'2026-01-01'),('USD','BRL',5,'2026-01-01')",
  );
  expect(await getExchangeRate(db, "EUR", "BRL", "2026-02-15")).toBeCloseTo(4.8);
  expect(await getExchangeRate(db, "USD", "UYU", "2025-01-01")).toBeNull();
  expect(await getExchangeRate(db, "ARS", "UYU", "2026-02-15")).toBeNull();
  expect(await getExchangeRate(db, "UYU", "UYU", "2025-01-01")).toBe(1);
});

test("invalid stored quotes are skipped instead of poisoning the latest historical rate", async () => {
  await fixture.pool.query("TRUNCATE exchange_rates");
  await fixture.pool.query(`INSERT INTO exchange_rates(from_currency,to_currency,rate,date) VALUES
    ('USD','UYU',40,'2026-01-01'), ('USD','UYU','NaN','2026-02-01'),
    ('USD','UYU',0,'2026-03-01'), ('USD','UYU',-1,'2026-04-01')`);
  expect(await getExchangeRate(createDb(), "USD", "UYU", "2026-05-01")).toBe(40);
});
