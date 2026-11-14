import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, expect, test, vi } from "vitest";

import { createPostgresTestDatabase } from "../../scripts/sandbox/postgres-test.js";
import { calculateCreditCardSummary } from "../../shared/calculations.js";
import * as classification from "../ingestion/openai-category.js";
import { processMailIngestion } from "../ingestion/process-mail-ingestion.js";
import { createDb } from "./client.js";
import { createGoal, createGoalReservation, getWalletDataset } from "./index.js";

import type { MailIngestionInput } from "../../shared/schemas.js";
let fixture: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
beforeAll(async () => {
  fixture = await createPostgresTestDatabase();
}, 60000);
afterAll(async () => {
  vi.restoreAllMocks();
  await fixture?.close();
});
test("unresolved automatic goal conversion preserves a known card purchase and its review history", async () => {
  const accountId = randomUUID(),
    fallbackId = randomUUID(),
    cardId = randomUUID();
  await fixture.pool.query(
    "insert into accounts(id,name,type,currency,initial_balance,color,icon) values ($1,'Unknown bank conversion','bank','USD',500,'blue','bank'),($2,'Goal fallback','bank','EUR',100,'blue','bank')",
    [accountId, fallbackId],
  );
  await fixture.pool.query(
    "insert into credit_cards(id,name,issuer,last_four,credit_limit,limit_currency,closing_day,due_day,color,icon,is_active) values ($1,'Known card','Test','1234',1000,'UYU',20,5,'blue','bank',true)",
    [cardId],
  );
  await fixture.pool.query("insert into settings(primary_currency) values ('UYU')");
  const goal = await createGoal(createDb(), {
    name: "Automatic goal",
    targetAmount: 1000,
    currency: "EUR",
    color: "blue",
    icon: "bank",
    isVisible: true,
    status: "active",
    autoCaptureEnabled: true,
    autoCaptureStart: "2026-02-01",
    autoCaptureEnd: "2026-02-28",
    autoReservationAccountId: fallbackId,
  });
  await createGoalReservation(createDb(), {
    goalId: goal.id,
    accountId: fallbackId,
    amount: 100,
    currency: "EUR",
    createdAt: "2026-02-01T10:00:00Z",
  });
  vi.spyOn(classification, "inferCategoryWithOpenAi").mockResolvedValue(null);
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Offline"));
  const messageId = randomUUID();
  const event: MailIngestionInput = {
    idempotencyKey: `gmail:test:${messageId}`,
    integration: { name: "gmail_apps_script", version: "test" },
    email: {
      provider: "gmail",
      messageId,
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
      currency: "UYU" as const,
      merchantRaw: "Unknown merchant",
      cardAlias: "Test",
      cardBrand: "VISA",
      cardNumber: "1234",
      paymentType: "credit_card" as const,
    },
    destination: { accountId, creditCardId: cardId },
  };
  const result = await processMailIngestion(createDb(), event);
  expect(result.status).toBe("needs_review");
  expect(result.warnings?.some((warning) => warning.includes("Automatic goal"))).toBe(true);
  await processMailIngestion(createDb(), event);
  const data = await getWalletDataset(createDb());
  expect(data.records).toHaveLength(1);
  expect(data.records[0]!).toMatchObject({
    paymentStatus: "needs_review",
    creditCardId: cardId,
    goalIds: [],
  });
  expect(data.records[0]!.importHistory?.some((entry) => entry.includes("Automatic goal"))).toBe(
    true,
  );
  expect(data.creditCardRecords).toHaveLength(1);
  expect(calculateCreditCardSummary(data, data.creditCards[0]!).usedLimit).toBe(50);
  expect(data.goalReservations[0]!.amount).toBe(100);
  expect((await fixture.pool.query("select status from ingestion_events")).rows).toEqual([
    { status: "completed" },
  ]);
});
