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
