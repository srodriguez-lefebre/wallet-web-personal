import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";

import { afterAll, beforeAll, expect, test, vi } from "vitest";

import { serveWalletApi } from "../../scripts/sandbox/http.js";
import { createPostgresTestDatabase } from "../../scripts/sandbox/postgres-test.js";
import { findApiOperation } from "../../shared/api-contract.js";
import { walletBackupSchema, walletRecordResponseSchema } from "../../shared/schemas.js";
import { createDb } from "../db/client.js";
import { getWalletDataset } from "../db/index.js";
import { restoreWalletBackup } from "../db/wallet-restore.js";
import * as classification from "../ingestion/openai-category.js";
let fixture: Awaited<ReturnType<typeof createPostgresTestDatabase>>,
  server: Server,
  url: string,
  token: string;
const accountId = randomUUID(),
  categoryId = randomUUID();
beforeAll(async () => {
  fixture = await createPostgresTestDatabase();
  process.env.API_TOKEN = "local-contract-test";
  process.env.SESSION_SECRET = "local-contract-test";
  await fixture.pool.query(
    "INSERT INTO accounts(id,name,type,currency,initial_balance,color,icon) VALUES($1,'Test','bank','UYU',500,'blue','bank')",
    [accountId],
  );
  await fixture.pool.query(
    "INSERT INTO categories(id,name,color,icon) VALUES($1,'Test','blue','bank')",
    [categoryId],
  );
  server = createServer((req, res) => {
    void serveWalletApi(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing port");
  url = `http://127.0.0.1:${address.port}`;
  const response = await fetch(`${url}/api/auth/unlock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "local-contract-test" }),
  });
  const payload = (await response.json()) as {
    data: {
      token: string;
    };
  };
  expect(response.status).toBe(200);
  token = payload.data.token;
}, 60000);
afterAll(async () => {
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  await fixture?.close();
  delete process.env.API_TOKEN;
  delete process.env.SESSION_SECRET;
});
async function request(path: string, method = "GET", input?: unknown) {
  const response = await fetch(url + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: input === undefined ? undefined : JSON.stringify(input),
  });
  const payload = (await response.json()) as {
    data: Record<string, unknown>;
    error: unknown;
  };
  if (response.ok) {
    const operation = findApiOperation(method, path.split("?")[0]!);
    expect(operation).toBeDefined();
    const parsed = operation!.response.safeParse(payload.data);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(payload.error).toBeNull();
  }
  return { response, payload };
}
test("authenticated template CRUD persists through HTTP reload and never creates financial records", async () => {
  const before = (await getWalletDataset(createDb())).records.length;
  const template = {
    name: "Template groceries",
    type: "expense",
    amount: 25,
    currency: "UYU",
    accountId,
    categoryId,
    paymentType: "debit",
  };
  const created = await request("/api/record-templates", "POST", template);
  expect(created.response.status).toBe(201);
  const id = created.payload.data.id;
  if (typeof id !== "string") throw new Error("Missing synthetic resource ID");
  expect((await request("/api/record-templates")).payload.data).toContainEqual(
    expect.objectContaining({ ...template, id }),
  );
  expect(
    (await request(`/api/record-templates/${id}`, "PATCH", { note: "Test" })).payload.data,
  ).toMatchObject({ ...template, id, note: "Test" });
  expect((await request("/api/wallet")).payload.data.recordTemplates).toContainEqual(
    expect.objectContaining({ id, note: "Test" }),
  );
  expect((await getWalletDataset(createDb())).records).toHaveLength(before);
  const duplicate = await request("/api/record-templates", "POST", {
    ...template,
    name: " template GROCERIES ",
  });
  expect(duplicate.response.status).toBe(409);
  expect(duplicate.payload.error).toMatchObject({
    code: "CONFLICT",
    message: expect.stringMatching(/template.*name/i),
  });
  expect(
    (await request(`/api/record-templates/${id}`, "PATCH", { accountId: randomUUID() })).response
      .status,
  ).toBe(422);
  expect(
    (await request(`/api/record-templates/invalid`, "PATCH", { note: "Test" })).response.status,
  ).toBe(400);
  expect((await request(`/api/record-templates/${id}`, "DELETE")).response.status).toBe(200);
  expect(
    (await request(`/api/record-templates/${id}`, "PATCH", { note: "Test" })).response.status,
  ).toBe(404);
  const anonymous = await fetch(url + "/api/record-templates");
  expect(anonymous.status).toBe(401);
});
test("authenticated real HTTP routes match concrete response contracts", async () => {
  expect((await request("/api/health")).response.status).toBe(200);
  const created = await request("/api/records", "POST", {
    type: "expense",
    amount: 25,
    currency: "UYU",
    accountId,
    categoryId,
    paymentType: "debit",
    paymentStatus: "cleared",
    exchangeRateToPrimary: 1,
    occurredAt: "2026-02-01T12:00:00Z",
    tagIds: [],
  });
  expect(created.response.status).toBe(201);
  const id = created.payload.data.id;
  if (typeof id !== "string") throw new Error("Missing synthetic resource ID");
  expect((await request(`/api/records/${id}`, "PATCH", { note: "Updated" })).response.status).toBe(
    200,
  );
  expect((await request("/api/records?limit=1")).payload.data.items).toHaveLength(1);
  expect(
    (await request("/api/wallet/bootstrap", "POST", { recordsLimit: 1 })).response.status,
  ).toBe(200);
  expect((await request("/api/wallet")).response.status).toBe(200);
});
test("bad credentials and nested invalid IDs return envelopes instead of routing or database leaks", async () => {
  const wrong = await fetch(url + "/api/auth/unlock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "wrong" }),
  });
  expect(wrong.status).toBe(401);
  const nested = await request("/api/records/invalid", "PATCH", { note: "Test" });
  expect(nested.response.status).toBe(400);
  expect(nested.payload.data).toBeNull();
});
test("account activity includes transfers received as well as transfers sent", async () => {
  const destinationId = randomUUID();
  await fixture.pool.query(
    "INSERT INTO accounts(id,name,type,currency,initial_balance,color,icon) VALUES($1,'Destination','bank','UYU',0,'blue','bank')",
    [destinationId],
  );
  const transfer = await request("/api/records", "POST", {
    type: "transfer",
    amount: 25,
    currency: "UYU",
    accountId,
    destinationAccountId: destinationId,
    paymentType: "transfer",
    paymentStatus: "cleared",
    exchangeRateToPrimary: 1,
    occurredAt: "2026-02-02T12:00:00Z",
    tagIds: [],
  });
  expect(transfer.response.status).toBe(201);
  const received = await request(`/api/records?accountId=${destinationId}`);
  expect(received.payload.data.items).toEqual([
    expect.objectContaining({ id: transfer.payload.data.id, destinationAccountId: destinationId }),
  ]);
  const sent = await request(`/api/records?accountId=${accountId}`);
  expect(sent.payload.data.items).toContainEqual(
    expect.objectContaining({ id: transfer.payload.data.id }),
  );
});
test("confirmed backup restore persists associations and rolls back every write on failure", async () => {
  const before = await getWalletDataset(createDb());
  expect(walletBackupSchema.safeParse(before).success).toBe(true);
  const restored = await request("/api/wallet/restore", "POST", before);
  expect(restored.response.status).toBe(200);
  expect((await getWalletDataset(createDb())).records).toEqual(before.records);
  const broken = structuredClone(before);
  broken.categories[0]!.parentId = randomUUID();
  await expect(restoreWalletBackup(createDb(), broken)).rejects.toThrow();
  expect((await getWalletDataset(createDb())).records).toEqual(before.records);
  expect((await getWalletDataset(createDb())).accounts).toEqual(before.accounts);
});
test("nested card summary uses the real authenticated router and matches persisted movements after reload", async () => {
  const created = await request("/api/cards", "POST", {
    name: "Synthetic summary card",
    issuer: "Test bank",
    lastFour: "4242",
    creditLimit: 1000,
    limitCurrency: "UYU",
    closingDay: 20,
    dueDay: 5,
    color: "blue",
    icon: "card",
    isActive: true,
  });
  expect(created.response.status).toBe(201);
  const cardId = created.payload.data.id;
  if (typeof cardId !== "string") throw new Error("Missing synthetic card ID");
  const consumption = await request(`/api/cards/${cardId}/records`, "POST", {
    kind: "purchase",
    amount: 75,
    currency: "UYU",
    amountInLimitCurrency: 75,
    exchangeRateToLimitCurrency: 1,
    categoryId,
    occurredAt: "2026-10-12T12:00:00.000Z",
  });
  expect(consumption.response.status).toBe(201);
  for (let reload = 0; reload < 2; reload++) {
    const summary = await request(`/api/cards/${cardId}/summary`);
    expect(summary.response.status).toBe(200);
    expect(summary.payload.data).toMatchObject({
      card: { id: cardId, creditLimit: 1000 },
      usedLimit: 75,
      availableLimit: 925,
      outstanding: [{ currency: "UYU", amount: 75 }],
    });
  }
  const invalid = await request("/api/cards/not-a-uuid/summary");
  expect(invalid.response.status).toBe(400);
});

test("a mail suggestion is returned by Records until its metadata expires, without assigning it", async () => {
  vi.stubEnv("INGEST_API_TOKEN", "synthetic-ingest-test");
  const model = vi.spyOn(classification, "inferCategoryWithOpenAi").mockResolvedValue({
    decision: "assign",
    categoryId,
  });
  try {
    const id = randomUUID();
    const date = "2026-11-14T12:00:00.000Z";
    const response = await fetch(`${url}/api/ingest/mail/transactions`, {
      method: "POST",
      headers: {
        Authorization: "Bearer synthetic-ingest-test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        idempotencyKey: id,
        integration: { name: "fixture", version: "1" },
        email: { provider: "gmail", messageId: id, threadId: id, date },
        transaction: {
          source: "itau_debit_card",
          paymentType: "debit",
          merchantRaw: "Fixture unidentified store",
          amount: 35,
          currency: "UYU",
          occurredAt: date,
        },
        destination: { accountId },
      }),
    });
    expect(response.status).toBe(201);
    const result = (await response.json()) as { data: { recordId: string; status: string } };
    expect(result.data.status).toBe("needs_review");
    const loadReview = async () => {
      const { response: loaded, payload } = await request(
        "/api/records?paymentStatus=needs_review",
      );
      expect(loaded.status).toBe(200);
      return walletRecordResponseSchema
        .array()
        .parse(payload.data.items)
        .find((record) => record.id === result.data.recordId);
    };
    const pending = await loadReview();
    expect(pending).toMatchObject({
      suggestedCategoryId: categoryId,
      amount: 35,
      accountAmount: 35,
    });
    expect(pending?.categoryId).not.toBe(categoryId);

    await fixture.pool.query(
      "UPDATE ingestion_events SET metadata_expires_at=now()-interval '1 second' WHERE record_id=$1",
      [result.data.recordId],
    );
    const reloaded = await loadReview();
    expect(reloaded).toMatchObject({
      id: pending?.id,
      categoryId: pending?.categoryId,
      paymentStatus: "needs_review",
    });
    expect(reloaded?.suggestedCategoryId).toBeUndefined();
  } finally {
    model.mockRestore();
    vi.unstubAllEnvs();
  }
});
