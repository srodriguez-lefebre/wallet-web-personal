import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, test } from "vitest";

import { createWalletClient } from "../../src/services/api-client.js";
import { applyMigrations, installLocalTransport } from "./database.js";
import { createSandboxServer } from "./server.js";
import { configureLocalEnvironment, LOCAL_ACCESS_CODE } from "./workspace.js";

import type { Server } from "node:http";

const pg = new PGlite();
const nativeFetch = globalThis.fetch;
let server: Server;
let directory: string;
let restoreTransport = () => {};
let token: string | null = null;
const client = createWalletClient(() => token);
beforeAll(async () => {
  configureLocalEnvironment();
  restoreTransport = installLocalTransport(pg);
  await applyMigrations(pg);
  directory = await mkdtemp(path.join(os.tmpdir(), "wallet-client-sandbox-"));
  server = await createSandboxServer({ pg, mailboxPath: path.join(directory, "mailbox.json") });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  globalThis.fetch = (input, init) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      origin,
    );
    if (url.origin !== origin) throw new Error("Refused external client test request");
    return nativeFetch(url, init);
  };
}, 30_000);
afterAll(async () => {
  globalThis.fetch = nativeFetch;
  if (server)
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  restoreTransport();
  await pg.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

test("contract client preserves records, debt retry, card movements and backup restore through real sandbox HTTP", async () => {
  token = (await client["auth.unlock"]({ body: { token: LOCAL_ACCESS_CODE } })).token;
  await client["wallet.bootstrap"]({ body: { recordsLimit: 5, recordsCursor: null } });
  const account = await client["accounts.create"]({
    body: {
      name: "Synthetic client bank",
      type: "bank",
      currency: "UYU",
      initialBalance: 1000,
      color: "#123456",
      icon: "bank",
      isVisible: true,
      isActive: true,
    },
  });
  const category = await client["categories.create"]({
    body: { name: "Synthetic client category", color: "#123456", icon: "tag" },
  });
  const record = await client["records.create"]({
    body: {
      type: "expense",
      amount: 12.35,
      currency: "UYU",
      accountId: account.id,
      categoryId: category.id,
      paymentType: "debit",
      paymentStatus: "needs_review",
      occurredAt: "2026-11-01T12:00:00.000Z",
      exchangeRateToPrimary: 1,
    },
  });
  await client["records.patch"]({
    params: { id: record.id },
    body: { note: "Synthetic metadata edit", paymentStatus: "cleared" },
  });
  const page = await client["records.list"]({ query: { accountId: account.id, limit: 5 } });
  expect(page.items.find((row) => row.id === record.id)).toMatchObject({
    amount: 12.35,
    paymentStatus: "cleared",
    note: "Synthetic metadata edit",
  });
  const debt = await client["debts.create"]({
    body: {
      name: "Synthetic client debt",
      direction: "payable",
      originalAmount: 100,
      pendingAmount: 100,
      currency: "UYU",
      counterpartyName: "Synthetic party",
      accountId: account.id,
      categoryId: category.id,
      startedAt: "2026-11-01",
    },
  });
  const payment = {
    amount: 10,
    accountId: account.id,
    occurredAt: "2026-11-02T12:00:00.000Z",
    idempotencyKey: randomUUID(),
  };
  const paid = await client["debts.pay"]({ params: { id: debt.id }, body: payment });
  const retry = await client["debts.pay"]({ params: { id: debt.id }, body: payment });
  expect(retry.record.id).toBe(paid.record.id);
  expect(retry.debt.pendingAmount).toBe(90);
  const card = await client["cards.create"]({
    body: {
      name: "Synthetic client card",
      issuer: "Synthetic issuer",
      lastFour: "1234",
      creditLimit: 1000,
      limitCurrency: "UYU",
      closingDay: 20,
      dueDay: 5,
      color: "#123456",
      icon: "credit-card",
      isActive: true,
    },
  });
  const movement = await client["cardRecords.create"]({
    params: { id: card.id },
    body: {
      amount: 20,
      currency: "UYU",
      amountInLimitCurrency: 20,
      exchangeRateToLimitCurrency: 1,
      categoryId: category.id,
      occurredAt: "2026-11-03T12:00:00.000Z",
    },
  });
  expect(
    (await client["cardRecords.list"]({ params: { id: card.id } })).some(
      (row) => row.id === movement.id,
    ),
  ).toBe(true);
  const backup = await client["wallet.backup"]();
  expect(backup.records.filter((row) => row.debtId === debt.id)).toHaveLength(1);
  await client["wallet.restore"]({ body: backup });
  const reloaded = await client["wallet.get"]();
  expect(reloaded.records.find((row) => row.id === record.id)?.amount).toBe(12.35);
  expect(reloaded.debts.find((row) => row.id === debt.id)?.pendingAmount).toBe(90);
  expect(reloaded.creditCardRecords.find((row) => row.id === movement.id)?.amount).toBe(20);
}, 30_000);
