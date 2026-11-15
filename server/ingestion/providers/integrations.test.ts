import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";

import { createPostgresTestDatabase } from "../../../scripts/sandbox/postgres-test";
import { createDb } from "../../db/client";
import { resolveFrozenRate } from "../exchange-rates";
import { processMailIngestion } from "../process-mail-ingestion";
import { getWalletDataset } from "../../db/index";
import { categoryProvider } from "./category";
import { runProvider } from "./circuit";

import type { MailIngestionInput } from "../../../shared/schemas";

let fixture: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
const fetchMock = vi.fn<typeof fetch>();
beforeAll(async () => {
  fixture = await createPostgresTestDatabase();
}, 60000);
beforeEach(async () => {
  await fixture.pool.query(
    "TRUNCATE provider_state,exchange_rates,ingestion_events,accounts,settings CASCADE",
  );
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("OPENAI_API_KEY", "synthetic-provider-key");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await fixture?.close();
});

test.each(
  [
    [{ base: "USD", quote: "UYU", date: "2026-01-30", rate: 0 }],
    [{ base: "EUR", quote: "UYU", date: "2026-01-30", rate: 42 }],
    [{ base: "USD", quote: "ARS", date: "2026-01-30", rate: 42 }],
    [{ base: "USD", quote: "UYU", date: "2026-02-02", rate: 42 }],
    [{ base: "USD", quote: "UYU", date: "2026-02-30", rate: 42 }],
    [],
  ].map((body) => ({ body })),
)("invalid FX response $body never creates a frozen quote", async ({ body }) => {
  fetchMock.mockResolvedValue(Response.json(body));
  expect(await resolveFrozenRate(createDb(), "USD", "UYU", new Date("2026-02-01"))).toBeNull();
  expect((await fixture.pool.query("SELECT id FROM exchange_rates")).rows).toHaveLength(0);
});

test("a validated historical rate is frozen and later reads bypass the provider", async () => {
  fetchMock.mockResolvedValue(
    Response.json([{ base: "USD", quote: "UYU", date: "2026-01-30", rate: 42.5 }]),
  );
  const date = new Date("2026-02-01");
  expect(await resolveFrozenRate(createDb(), "USD", "UYU", date)).toMatchObject({
    rate: 42.5,
    source: "frankfurter",
    date: new Date("2026-01-30"),
  });
  expect(await resolveFrozenRate(createDb(), "USD", "UYU", date)).toMatchObject({
    rate: 42.5,
    source: "stored_fallback",
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("a hanging OpenAI response is aborted by the complete-call budget", async () => {
  let signal: AbortSignal | undefined;
  fetchMock.mockImplementation((_url, options) => {
    signal = options?.signal ?? undefined;
    return new Promise(() => {});
  });
  const result = await runProvider(
    createDb(),
    categoryProvider,
    {
      merchantRaw: "Synthetic opaque company",
      categories: [{ id: randomUUID(), path: "Synthetic food" }],
    },
    { budgetMs: 20 },
  );
  expect(result).toMatchObject({ status: "failed", reason: "timeout" });
  expect(signal?.aborted).toBe(true);
});

test("OpenAI outage persists reviewable expenses, skips an open circuit and keeps retries idempotent", async () => {
  const accountId = randomUUID();
  await fixture.pool.query(
    "INSERT INTO accounts(id,name,type,currency,initial_balance,color,icon) VALUES($1,'Synthetic bank','bank','UYU',1000,'blue','bank');",
    [accountId],
  );
  await fixture.pool.query("INSERT INTO settings(primary_currency) VALUES('UYU')");
  fetchMock.mockResolvedValue(new Response("unavailable", { status: 503 }));
  let first: MailIngestionInput | undefined;
  const started = performance.now();
  for (let i = 0; i < 4; i++) {
    const messageId = randomUUID();
    const input: MailIngestionInput = {
      idempotencyKey: `gmail:itau_debit_card:${messageId}`,
      integration: { name: "synthetic", version: "5" },
      email: {
        provider: "gmail",
        messageId,
        threadId: randomUUID(),
        subject: "Synthetic notice",
        from: "synthetic@example.test",
        date: "2026-02-01T12:00:00Z",
      },
      transaction: {
        source: "itau_debit_card",
        sourceLabel: "Synthetic",
        occurredAt: `2026-02-0${i + 1}T12:00:00Z`,
        amount: 20 + i,
        currency: "UYU",
        merchantRaw: "Opaque synthetic company",
        cardAlias: "",
        cardBrand: "",
        cardNumber: "",
        paymentType: "debit",
      },
      destination: { accountId },
    };
    first ??= input;
    expect((await processMailIngestion(createDb(), input)).status).toBe("needs_review");
  }
  expect(performance.now() - started).toBeLessThan(5000);
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect((await processMailIngestion(createDb(), first!)).status).toBe("already_processed");
  const dataset = await getWalletDataset(createDb());
  expect(dataset.records).toHaveLength(4);
  expect(dataset.records.every((record) => record.paymentStatus === "needs_review")).toBe(true);
  expect(dataset.records.reduce((sum, record) => sum + record.accountAmount!, 0)).toBe(86);
});
