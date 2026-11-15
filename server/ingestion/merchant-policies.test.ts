import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";

import { createPostgresTestDatabase } from "../../scripts/sandbox/postgres-test";
import { createDb } from "../db/client";
import * as classification from "./openai-category";
import { resolveCategory } from "./process-mail-ingestion";
import { compatibleMailSourceSchema, mailSourceSchema } from "../../shared/mail-source";

let fixture: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
beforeEach(() => {
  vi.restoreAllMocks();
});
test("typed canonical sources retain historical custom source labels", () => {
  expect(mailSourceSchema.parse("google_wallet")).toBe("google_wallet");
  expect(compatibleMailSourceSchema.parse("legacy-synthetic-source")).toBe(
    "legacy-synthetic-source",
  );
  expect(compatibleMailSourceSchema.safeParse(42).success).toBe(false);
});
beforeAll(async () => {
  fixture = await createPostgresTestDatabase();
  await fixture.pool.query(
    "INSERT INTO categories(name,color,icon,system_key) VALUES('Review','blue','bank','unknown_expense'),('Renamed rides','blue','bank','taxi'),('Renamed meals','blue','bank','restaurants')",
  );
}, 60000);
afterAll(async () => {
  vi.restoreAllMocks();
  await fixture?.close();
});

test("SQL policies survive category renames and do not match inside a token", async () => {
  const taxi = (await fixture.pool.query("SELECT id FROM categories WHERE system_key='taxi'"))
    .rows[0].id as string;
  const model = vi.spyOn(classification, "inferCategoryWithOpenAi").mockResolvedValue(null);
  expect(await resolveCategory(createDb(), "UBER TRIP SYNTHETIC")).toMatchObject({
    categoryId: taxi,
    source: "generic_rule",
    needsReview: false,
  });
  expect(await resolveCategory(createDb(), "NOTUBER SYNTHETIC")).toMatchObject({
    source: "fallback",
    needsReview: true,
  });
  expect(model).toHaveBeenCalledTimes(1);
});

test("a generic payment processor remains reviewable instead of guessing a shop", async () => {
  const food = (
    await fixture.pool.query("SELECT id FROM categories WHERE system_key='restaurants'")
  ).rows[0].id as string;
  const model = vi.spyOn(classification, "inferCategoryWithOpenAi").mockResolvedValue(food);
  expect(await resolveCategory(createDb(), "MERPAGO*12345")).toMatchObject({
    source: "fallback",
    needsReview: true,
  });
  expect(model).not.toHaveBeenCalled();
});

test("specific food policy overrides a broad legacy ride alias after renaming", async () => {
  const id = randomUUID();
  const taxi = (await fixture.pool.query("SELECT id FROM categories WHERE system_key='taxi'"))
    .rows[0].id as string;
  const food = (
    await fixture.pool.query("SELECT id FROM categories WHERE system_key='restaurants'")
  ).rows[0].id as string;
  await fixture.pool.query("INSERT INTO merchants(id,name,category_id) VALUES($1,'Uber',$2)", [
    id,
    taxi,
  ]);
  await fixture.pool.query(
    "INSERT INTO merchant_aliases(merchant_id,alias,normalized_alias) VALUES($1,'Uber','Uber')",
    [id],
  );
  expect(await resolveCategory(createDb(), "UBER EATS SYNTHETIC")).toMatchObject({
    categoryId: food,
    source: "generic_rule",
    merchantName: "UBER EATS SYNTHETIC",
  });
});

test("an unavailable longer policy does not hide an available category", async () => {
  const id = randomUUID();
  await fixture.pool.query(
    "INSERT INTO categories(id,name,color,icon,system_key) VALUES($1,'Renamed bread','blue','bank','bakery')",
    [id],
  );
  const model = vi.spyOn(classification, "inferCategoryWithOpenAi").mockResolvedValue(null);
  expect(await resolveCategory(createDb(), "SUPERMERCADO PANADERIA SYNTHETIC")).toMatchObject({
    categoryId: id,
    source: "generic_rule",
    needsReview: false,
  });
  expect(model).not.toHaveBeenCalled();
});
test("missing insurance category still requests review when another matching policy is longer", async () => {
  await fixture.pool.query(
    "INSERT INTO categories(name,color,icon,system_key) VALUES('Renamed fuel','blue','bank','service_station')",
  );
  const model = vi.spyOn(classification, "inferCategoryWithOpenAi").mockResolvedValue(null);
  expect(
    await resolveCategory(createDb(), "ASEGURADORA ESTACION DE SERVICIO SYNTHETIC"),
  ).toMatchObject({ source: "fallback", needsReview: true, reason: "missing_insurance_category" });
  expect(model).not.toHaveBeenCalled();
});

test("canonical keys override reserved-looking display names in policies and saved corrections", async () => {
  const taxi = (await fixture.pool.query("SELECT id FROM categories WHERE system_key='taxi'"))
    .rows[0].id as string;
  const model = vi.spyOn(classification, "inferCategoryWithOpenAi").mockResolvedValue(null);
  await fixture.pool.query("UPDATE categories SET name='Others' WHERE id=$1", [taxi]);
  try {
    expect(await resolveCategory(createDb(), "UBER SYNTHETIC RENAME")).toMatchObject({
      categoryId: taxi,
      needsReview: false,
    });
    const account = randomUUID();
    await fixture.pool.query(
      "INSERT INTO accounts(id,name,type,currency,initial_balance,color,icon) VALUES($1,'Synthetic correction','bank','UYU',0,'blue','bank')",
      [account],
    );
    await fixture.pool.query(
      "INSERT INTO records(type,amount,currency,account_id,category_id,payment_type,payment_status,exchange_rate_to_primary,occurred_at,import_merchant,merchant_correction) VALUES('expense',1,'UYU',$1,$2,'debit','cleared',1,now(),'SYNTHETIC CORRECTED',$3)",
      [account, taxi, JSON.stringify({ savedAt: "2026-11-14T12:00:00Z", autoApply: true })],
    );
    expect(await resolveCategory(createDb(), "SYNTHETIC CORRECTED")).toMatchObject({
      categoryId: taxi,
      source: "user_rule",
      needsReview: false,
    });
    expect(model).not.toHaveBeenCalled();
  } finally {
    await fixture.pool.query("UPDATE categories SET name='Renamed rides' WHERE id=$1", [taxi]);
  }
});

test("an eliminated merchant category never clears review or changes canonical identity", async () => {
  const category = (
      await fixture.pool.query(
        "UPDATE categories SET name='Renamed eliminated' WHERE system_key='category_eliminated' RETURNING id",
      )
    ).rows[0].id as string,
    merchant = randomUUID();
  await fixture.pool.query(
    "INSERT INTO merchants(id,name,category_id) VALUES($1,'Synthetic canonical retired',$2)",
    [merchant, category],
  );
  await fixture.pool.query(
    "INSERT INTO merchant_aliases(merchant_id,alias,normalized_alias) VALUES($1,'RETIRED SYNTHETIC','RETIRED SYNTHETIC')",
    [merchant],
  );
  vi.spyOn(classification, "inferCategoryWithOpenAi").mockResolvedValue(category);
  expect(await resolveCategory(createDb(), "RETIRED SYNTHETIC")).toMatchObject({
    merchantName: "Synthetic canonical retired",
    needsReview: true,
  });
});

test.each([
  "MERPAGO*12345 UY",
  "MERPAGO*12345 MONTE",
  "HANDY 998 MONTEVIDEO UY",
  "DLO 123 URUGUAY",
])("processor-only bank suffix stays reviewable: %s", async (descriptor) => {
  const food = (
    await fixture.pool.query("SELECT id FROM categories WHERE system_key='restaurants'")
  ).rows[0].id as string;
  const model = vi.spyOn(classification, "inferCategoryWithOpenAi").mockResolvedValue(food);
  expect(await resolveCategory(createDb(), descriptor)).toMatchObject({
    source: "fallback",
    needsReview: true,
    reason: "generic_payment_processor",
  });
  expect(model).not.toHaveBeenCalled();
});

test("a real merchant between processor and location is still classified", async () => {
  const food = (
    await fixture.pool.query("SELECT id FROM categories WHERE system_key='restaurants'")
  ).rows[0].id as string;
  const model = vi.spyOn(classification, "inferCategoryWithOpenAi").mockResolvedValue(food);
  expect(await resolveCategory(createDb(), "MERPAGO*12345 SYNTHETIC SHOP UY")).toMatchObject({
    categoryId: food,
    source: "openai",
    needsReview: false,
  });
  expect(model).toHaveBeenCalledOnce();
});
