import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { createPostgresTestDatabase } from "../../scripts/sandbox/postgres-test";
import { processMailIngestion } from "./process-mail-ingestion";
import * as classification from "./openai-category";
import type { MailIngestionInput } from "../../shared/schemas";
import { createDb } from "../db/client";
import { getWalletDataset } from "../db/wallet-repository";
import { resolveCategory } from "./process-mail-ingestion";

let fixture: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
const accountId = randomUUID(),
  cardId = randomUUID();
const taxiId = randomUUID(),
  publicId = randomUUID(),
  foodId = randomUUID(),
  unknownId = randomUUID(),
  tvId = randomUUID();
beforeAll(async () => {
  fixture = await createPostgresTestDatabase();
}, 60_000);
afterAll(async () => {
  await fixture?.close();
});
beforeEach(async () => {
  vi.restoreAllMocks();
  await fixture.pool.query(
    "TRUNCATE accounts,categories,credit_cards,settings CASCADE",
  );
  for (const [id, name, systemKey] of [
    [taxiId, "Taxi", null],
    [publicId, "Public transport", null],
    [foodId, "Restaurant, fast-food", null],
    [tvId, "TV, Streaming", null],
    [unknownId, "Unknown expense", "unknown_expense"],
  ]) {
    await fixture.pool.query(
      "INSERT INTO categories(id,name,color,icon,system_key) VALUES($1,$2,'blue','bank',$3)",
      [id, name, systemKey],
    );
  }
  await fixture.pool.query(
    "INSERT INTO accounts(id,name,type,currency,initial_balance,color,icon) VALUES($1,'Bank','bank','UYU',500,'blue','bank')",
    [accountId],
  );
  await fixture.pool.query(
    "INSERT INTO credit_cards(id,name,issuer,last_four,credit_limit,limit_currency,closing_day,due_day,color,icon) VALUES($1,'Card','Bank','1234',1000,'UYU',20,5,'blue','bank')",
    [cardId],
  );
  await fixture.pool.query(
    "INSERT INTO settings(primary_currency) VALUES('UYU')",
  );
  vi.spyOn(classification, "inferCategoryWithOpenAi").mockResolvedValue(null);
});
async function rule(name: string, categoryId: string, normalizedAlias = name.toUpperCase()) {
  const id = randomUUID();
  await fixture.pool.query(
    "INSERT INTO merchants(id,name,category_id) VALUES($1,$2,$3)",
    [id, name, categoryId],
  );
  await fixture.pool.query(
    "INSERT INTO merchant_aliases(merchant_id,alias,normalized_alias) VALUES($1,$2,$3)",
    [id, name, normalizedAlias],
  );
}
function input(merchantRaw: string): MailIngestionInput {
  return {
    idempotencyKey: randomUUID(),
    integration: { name: "gmail_apps_script", version: "test" },
    email: {
      provider: "gmail",
      messageId: randomUUID(),
      threadId: randomUUID(),
      subject: "Test",
      from: "test@example.com",
      date: "2026-02-01T12:00:00Z",
    },
    transaction: {
      source: "itau_credit_card",
      sourceLabel: "Test",
      occurredAt: "2026-02-01T12:00:00Z",
      amount: 50,
      currency: "UYU",
      merchantRaw,
      cardNumber: "1234",
      cardAlias: "Card",
      cardBrand: "VISA",
      paymentType: "credit_card",
    },
    destination: { accountId, creditCardId: cardId },
  };
}
async function stored() {
  return {
    record: (await fixture.pool.query("SELECT * FROM records")).rows[0],
    card: (await fixture.pool.query("SELECT * FROM credit_card_records"))
      .rows[0],
    metadata: (
      await fixture.pool.query("SELECT sanitized_payload FROM ingestion_events")
    ).rows[0].sanitized_payload,
  };
}
test("an existing erroneous Uber transport rule produces Taxi in both durable records", async () => {
  await rule("Uber", publicId);
  expect((await processMailIngestion(input("UBER TRIP MONTE"))).status).toBe(
    "created",
  );
  const saved = await stored();
  expect(saved.record.category_id).toBe(taxiId);
  expect(saved.card.category_id).toBe(taxiId);
  expect(saved.metadata.classification).toMatchObject({
    source: "corrected_rule",
    categoryId: taxiId,
    needsReview: false,
  });
  expect(classification.inferCategoryWithOpenAi).not.toHaveBeenCalled();
});
test("the more specific Uber Eats rule remains food instead of becoming a ride", async () => {
  await rule("Uber", publicId);
  await rule("Uber Eats", foodId);
  await processMailIngestion(input("UBER EATS MONTE"));
  expect((await stored()).record.category_id).toBe(foodId);
  expect(classification.inferCategoryWithOpenAi).not.toHaveBeenCalled();
});

test("Uber Eats also overrides a broad legacy mixed-case Uber alias", async () => {
  await rule("Uber", publicId, "Uber");
  await processMailIngestion(input("UBER EATS MONTE"));
  expect((await stored()).record.category_id).toBe(foodId);
});
test("a rule pointing at Unknown expense still falls through to GPT", async () => {
  await rule("Shop", unknownId);
  vi.mocked(classification.inferCategoryWithOpenAi).mockResolvedValue(foodId);
  expect((await processMailIngestion(input("Shop"))).status).toBe("created");
  expect(classification.inferCategoryWithOpenAi).toHaveBeenCalled();
  expect((await stored()).metadata.classification).toMatchObject({
    source: "openai",
    categoryId: foodId,
  });
});

test("unknown-rule GPT fallback preserves canonical identity for cross-source duplicates", async () => {
  await rule("Shop", unknownId);
  vi.mocked(classification.inferCategoryWithOpenAi).mockResolvedValue(foodId);
  expect((await processMailIngestion(input("SHOP MONTE"))).status).toBe("created");
  const second = input("HANDY*SHOP");
  second.transaction.source = "google_wallet";
  expect((await processMailIngestion(second)).status).toBe("duplicate");
  expect((await fixture.pool.query("SELECT counterparty_name FROM records")).rows).toEqual([{ counterparty_name: "Shop" }]);
});
test("a failed model call keeps the expense reviewable and persists safe diagnostics", async () => {
  vi.mocked(classification.inferCategoryWithOpenAi).mockImplementation(
    async (_merchant, _categories, report) => {
      report?.({
        outcome: "failed",
        model: "gpt-5-nano",
        reason: "incomplete_max_output_tokens",
        httpStatus: 200,
        elapsedMs: 10,
      });
      return null;
    },
  );
  const result = await processMailIngestion(input("HDP HURBAN FOOD MONTE"));
  expect(result.status).toBe("needs_review");
  const saved = await stored();
  expect(saved.record).toMatchObject({
    category_id: unknownId,
    payment_status: "needs_review",
    account_amount: "50.00",
  });
  expect(saved.metadata.classification).toMatchObject({
    source: "fallback",
    needsReview: true,
    modelAttempt: { reason: "incomplete_max_output_tokens" },
  });
  expect(result.warnings?.join(" ")).toMatch(/category/i);
});
test("a model explicitly choosing Unknown expense also needs review", async () => {
  vi.mocked(classification.inferCategoryWithOpenAi).mockResolvedValue(
    unknownId,
  );
  expect((await processMailIngestion(input("Opaque company"))).status).toBe(
    "needs_review",
  );
  expect((await stored()).metadata.classification).toMatchObject({
    source: "openai",
    needsReview: true,
  });
});
test("HBO bank-domain descriptors get the specific TV category without GPT", async () => {
  await rule("HBO", foodId);
  expect(
    (await processMailIngestion(input("DLO*help.hbomax.com MONTE"))).status,
  ).toBe("created");
  expect((await stored()).record.category_id).toBe(tvId);
  expect(classification.inferCategoryWithOpenAi).not.toHaveBeenCalled();
});

test("a pañalera is shopping rather than a guessed bakery", async () => {
  const shoppingId = randomUUID();
  await fixture.pool.query("INSERT INTO categories(id,name,color,icon) VALUES($1,'Shopping','blue','bank')", [shoppingId]);
  vi.mocked(classification.inferCategoryWithOpenAi).mockResolvedValue(foodId);
  await processMailIngestion(input("PAÑALERA NATAL 27 MONTE"));
  expect((await stored()).record.category_id).toBe(shoppingId);
  expect(classification.inferCategoryWithOpenAi).not.toHaveBeenCalled();
});

test("insurance without an appropriate category stays reviewable instead of becoming bank fees", async () => {
  vi.mocked(classification.inferCategoryWithOpenAi).mockResolvedValue(foodId);
  expect((await processMailIngestion(input("BANCO DE SEGUROS 98290"))).status).toBe("needs_review");
  expect((await stored()).record.category_id).toBe(unknownId);
  expect(classification.inferCategoryWithOpenAi).not.toHaveBeenCalled();
});

test("insurance category matching ignores letter case", async () => {
  const insuranceId = randomUUID();
  await fixture.pool.query("INSERT INTO categories(id,name,color,icon) VALUES($1,'insurance','blue','bank')", [insuranceId]);
  await processMailIngestion(input("BANCO DE SEGUROS 98290"));
  expect((await stored()).record.category_id).toBe(insuranceId);
});

test("an explicit insurance merchant rule retains its custom category", async () => {
  const insuranceId = randomUUID();
  await fixture.pool.query("INSERT INTO categories(id,name,color,icon) VALUES($1,'Auto insurance','blue','bank')", [insuranceId]);
  await rule("Banco de Seguros", insuranceId);
  await processMailIngestion(input("BANCO DE SEGUROS 98290"));
  expect((await stored()).record.category_id).toBe(insuranceId);
});

test.each(["generic", "failed model"])("unknown-rule %s fallback preserves canonical merchant identity", async (mode) => {
  await rule(mode === "generic" ? "Restaurante" : "Shop", unknownId);
  await processMailIngestion(input(mode === "generic" ? "RESTAURANTE MONTE" : "SHOP MONTE"));
  expect((await stored()).record.counterparty_name).toBe(mode === "generic" ? "Restaurante" : "Shop");
});

test.each(["UBER TRIP", "UBER EATS"])("a longer %s alias does not retain an erroneous public-transport category", async alias => {
  await rule("Uber", publicId);
  await fixture.pool.query("INSERT INTO merchant_aliases(merchant_id,alias,normalized_alias) SELECT id,$1,$1 FROM merchants WHERE name='Uber'", [alias]);
  await processMailIngestion(input(alias + " MONTE"));
  const saved = await stored();
  expect(saved.record.category_id).toBe(alias === "UBER EATS" ? foodId : taxiId);
  expect(saved.record.counterparty_name).toBe(alias === "UBER EATS" ? "UBER EATS MONTE" : "Uber");
});

test("a credit notice cannot debit an account deactivated during classification", async () => {
  vi.mocked(classification.inferCategoryWithOpenAi).mockImplementationOnce(async () => {
    await fixture.pool.query("UPDATE accounts SET is_active=false WHERE id=$1", [accountId]);
    return foodId;
  });
  await expect(processMailIngestion(input("New store"))).rejects.toThrow();
  expect((await fixture.pool.query("SELECT * FROM records")).rows).toHaveLength(0);
  expect((await fixture.pool.query("SELECT * FROM credit_card_records")).rows).toHaveLength(0);
});

test("a successful GPT category becomes a persistent rule available in JSON backups", async () => {
  vi.mocked(classification.inferCategoryWithOpenAi).mockResolvedValue(foodId);
  await processMailIngestion(input("HDP HURBAN FOOD MONTE"));
  vi.mocked(classification.inferCategoryWithOpenAi).mockClear();
  const next = input("hdp hurban food monte");
  next.transaction.amount = 60;
  await processMailIngestion(next, createDb());
  expect(classification.inferCategoryWithOpenAi).not.toHaveBeenCalled();
  const backup = await getWalletDataset(createDb(), { includeArchived: true });
  expect(backup.merchants).toEqual([expect.objectContaining({name: "HDP HURBAN FOOD MONTE", categoryId: foodId})]);
  expect(backup.merchantAliases).toEqual([expect.objectContaining({normalizedAlias: "HDP HURBAN FOOD MONTE"})]);
  expect((await fixture.pool.query("SELECT category_id FROM records")).rows).toEqual([{category_id: foodId}, {category_id: foodId}]);
});

test("a learned category promotes an unknown rule without changing its merchant identity", async () => {
  await rule("Shop", unknownId);
  vi.mocked(classification.inferCategoryWithOpenAi).mockResolvedValue(foodId);
  await processMailIngestion(input("SHOP MONTE"));
  vi.mocked(classification.inferCategoryWithOpenAi).mockClear();
  expect(await resolveCategory(createDb(), "HANDY*SHOP")).toMatchObject({merchantName: "Shop", categoryId: foodId, source: "merchant_rule"});
  expect(classification.inferCategoryWithOpenAi).not.toHaveBeenCalled();
  expect((await fixture.pool.query("SELECT name,category_id FROM merchants")).rows).toEqual([{name: "Shop", category_id: foodId}]);
});

test.each([null, "unknown"])("a model result %s does not become a learned rule", async result => {
  vi.mocked(classification.inferCategoryWithOpenAi).mockResolvedValue(result === "unknown" ? unknownId : null);
  await processMailIngestion(input("OPAQUE SHOP"));
  expect((await fixture.pool.query("SELECT * FROM merchants")).rows).toHaveLength(0);
});

test("learning does not overwrite a merchant category manually changed during GPT classification", async () => {
  await rule("Shop", unknownId);
  vi.mocked(classification.inferCategoryWithOpenAi).mockImplementationOnce(async () => {
    await fixture.pool.query("UPDATE merchants SET category_id=$1 WHERE name='Shop'", [tvId]);
    return foodId;
  });
  await processMailIngestion(input("SHOP MONTE"));
  expect((await fixture.pool.query("SELECT category_id FROM merchants")).rows).toEqual([{category_id: tvId}]);
});

test("two concurrent classifications create only one merchant and one alias", async () => {
  let arrived = 0;
  let release = () => {};
  const both = new Promise<void>(resolve => {release = resolve;});
  vi.mocked(classification.inferCategoryWithOpenAi).mockImplementation(async () => {
    if (++arrived === 2) release();
    await both;
    return foodId;
  });
  const first = input("NEW SHOP"), second = input("NEW SHOP");
  second.transaction.amount = 60;
  await Promise.all([processMailIngestion(first), processMailIngestion(second)]);
  expect((await fixture.pool.query("SELECT * FROM merchants")).rows).toHaveLength(1);
  expect((await fixture.pool.query("SELECT * FROM merchant_aliases")).rows).toHaveLength(1);
  expect((await fixture.pool.query("SELECT * FROM records")).rows).toHaveLength(2);
});

test("failed financial writes roll back learned rules together with the records", async () => {
  vi.mocked(classification.inferCategoryWithOpenAi).mockResolvedValue(foodId);
  await fixture.pool.query("CREATE FUNCTION reject_completion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='completed' THEN RAISE EXCEPTION 'test completion failure'; END IF; RETURN NEW; END $$");
  await fixture.pool.query("CREATE TRIGGER reject_completion BEFORE UPDATE ON ingestion_events FOR EACH ROW EXECUTE FUNCTION reject_completion()");
  try {
    await expect(processMailIngestion(input("NEW SHOP"))).rejects.toThrow();
    expect((await fixture.pool.query("SELECT * FROM merchants")).rows).toHaveLength(0);
    expect((await fixture.pool.query("SELECT * FROM records")).rows).toHaveLength(0);
  } finally {
    await fixture.pool.query("DROP TRIGGER reject_completion ON ingestion_events");
    await fixture.pool.query("DROP FUNCTION reject_completion()");
  }
});

test("a shorter learned descriptor cannot change old fingerprints and duplicate an expense", async () => {
  await processMailIngestion(input("SHOP MONTE"));
  vi.mocked(classification.inferCategoryWithOpenAi).mockResolvedValue(foodId);
  const learning = input("SHOP"); learning.transaction.amount = 60;
  await processMailIngestion(learning);
  const repeat = input("SHOP MONTE"); repeat.transaction.source = "google_wallet";
  expect((await processMailIngestion(repeat)).status).toBe("duplicate");
  expect((await fixture.pool.query("SELECT * FROM records")).rows).toHaveLength(2);
});

test("a broader manual rule created during GPT is not shadowed by learning", async () => {
  vi.mocked(classification.inferCategoryWithOpenAi).mockImplementationOnce(async () => {
    await rule("Shop", tvId);
    return foodId;
  });
  await processMailIngestion(input("SHOP MONTE"));
  expect((await fixture.pool.query("SELECT name,category_id FROM merchants")).rows).toEqual([{name: "Shop", category_id: tvId}]);
  expect(await resolveCategory(createDb(), "SHOP MONTE")).toMatchObject({categoryId: tvId, merchantName: "Shop"});
});

test("a manual rule takes precedence over an older exact learned descriptor", async () => {
  vi.mocked(classification.inferCategoryWithOpenAi).mockResolvedValue(foodId);
  await processMailIngestion(input("SHOP MONTE"));
  await rule("Shop", tvId);
  expect(await resolveCategory(createDb(), "SHOP MONTE")).toMatchObject({categoryId: tvId, merchantName: "Shop"});
});
