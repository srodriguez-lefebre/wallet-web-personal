import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { PGlite } from "@electric-sql/pglite";
import { QueryObserver } from "@tanstack/react-query";
import { afterAll, beforeAll, expect, test } from "vitest";

import { createWalletClient } from "../../src/services/api-client.js";
import { createWalletMutations } from "../../src/services/mutations.js";
import {
  accountBalancesQueryOptions,
  createWalletQueryClient,
  ensureWalletBootstrap,
  goalProgressQueryOptions,
  recordsQueryOptions,
} from "../../src/services/wallet-queries.js";
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

test("reference operations validate real HTTP responses without changing legacy wallet responses", async () => {
  token = (await client["auth.unlock"]({ body: { token: LOCAL_ACCESS_CODE } })).token;
  const reference = await client["wallet.reference"]({ query: { timeZone: "America/Montevideo" } });
  expect(reference).not.toHaveProperty("records");
  expect(reference).not.toHaveProperty("creditCardRecords");
  const boot = await client["wallet.bootstrapReference"]({
    body: { recordsLimit: 1, timeZone: "America/Montevideo" },
  });
  expect(boot.reference).not.toHaveProperty("records");
  expect(Array.isArray(boot.recordsPage.items)).toBe(true);
  expect(boot.recordsPage.items.length).toBeLessThanOrEqual(1);
  expect((await client["wallet.get"]()).records).toEqual(expect.any(Array));
});

test("balance and goal aggregate contracts cross real HTTP without sending history", async () => {
  token = (await client["auth.unlock"]({ body: { token: LOCAL_ACCESS_CODE } })).token;
  await client["goals.create"]({
    body: {
      name: "Synthetic aggregate goal",
      targetAmount: 100,
      currency: "UYU",
      color: "#123456",
      icon: "flag",
    },
  });
  const balances = await client["analytics.accountBalances"]({
    query: { timeZone: "America/Montevideo" },
  });
  expect(Array.isArray(balances)).toBe(true);
  for (const row of balances) {
    expect(row).not.toHaveProperty("records");
    expect(typeof row.balance).toBe("number");
  }
  const goals = await client["analytics.goalProgress"]();
  expect(goals.some((row) => row.spent === 0 && row.reserved === 0)).toBe(true);
  const details = await client["analytics.details"]({
    query: {
      from: "2026-04-01",
      to: "2026-04-30",
      selectedMonth: "2026-04",
      periodMode: "month",
      timeZone: "America/Montevideo",
    },
  });
  expect(details).not.toHaveProperty("records");
  expect(details.expenseTrend).toHaveLength(31);
  const accountId = balances[0]?.accountId;
  expect(accountId).toBeDefined();
  if (!accountId) throw new Error("Synthetic wallet requires an account");
  const trend = await client["analytics.balanceTrend"]({
    query: {
      from: "2026-04-01",
      to: "2026-04-30",
      selectedMonth: "2026-04",
      periodMode: "month",
      accountId,
      timeZone: "America/Montevideo",
    },
  });
  expect(trend).toHaveLength(31);
  expect(trend[30]?.current).toBeNull();
});

test("editing and undoing a goal expense refreshes balances and progress across reload with older records outside the visible page", async () => {
  token = (await client["auth.unlock"]({ body: { token: LOCAL_ACCESS_CODE } })).token;
  const account = await client["accounts.create"]({
    body: {
      name: "Synthetic paged goal account",
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
    body: { name: "Synthetic paged goal category", color: "#123456", icon: "tag" },
  });
  const goal = await client["goals.create"]({
    body: {
      name: "Synthetic paged goal",
      targetAmount: 100,
      currency: "UYU",
      color: "#123456",
      icon: "flag",
    },
  });
  const create = (amount: number, occurredAt: string) =>
    client["records.create"]({
      body: {
        type: "expense",
        amount,
        currency: "UYU",
        accountId: account.id,
        accountAmount: amount,
        categoryId: category.id,
        paymentType: "debit",
        paymentStatus: "cleared",
        exchangeRateToPrimary: 1,
        occurredAt,
        goalAssociations: [{ goalId: goal.id, allocatedAmount: amount }],
      },
    });
  const old = await create(20, "2026-04-01T12:00:00.000Z");
  const visible = await create(10, "2026-04-02T12:00:00.000Z");
  const cache = createWalletQueryClient();
  const reload = createWalletQueryClient();
  const balanceOptions = accountBalancesQueryOptions(client, { timeZone: "America/Montevideo" });
  const goalOptions = goalProgressQueryOptions(client);
  const pageOptions = recordsQueryOptions(client, { accountId: account.id, limit: 1 });
  const stop: (() => void)[] = [];
  try {
    await ensureWalletBootstrap(cache, client, { recordsLimit: 1, timeZone: "America/Montevideo" });
    await Promise.all([
      cache.fetchQuery(balanceOptions),
      cache.fetchQuery(goalOptions),
      cache.fetchInfiniteQuery(pageOptions),
    ]);
    stop.push(
      new QueryObserver(cache, balanceOptions).subscribe(() => {}),
      new QueryObserver(cache, goalOptions).subscribe(() => {}),
    );
    const check = (value: typeof cache, balance: number, spent: number) => {
      expect(
        value.getQueryData(balanceOptions.queryKey)?.find((row) => row.accountId === account.id)
          ?.balance,
      ).toBe(balance);
      expect(
        value.getQueryData(goalOptions.queryKey)?.find((row) => row.goalId === goal.id)?.spent,
      ).toBe(spent);
    };
    const page = cache.getQueryData(pageOptions.queryKey)?.pages[0];
    expect(page?.items.map((row) => row.id)).toEqual([visible.id]);
    expect(page?.items.some((row) => row.id === old.id)).toBe(false);
    expect(page?.hasMore).toBe(true);
    check(cache, 970, 30);
    const mutations = createWalletMutations(client, cache);
    await mutations["records.patch"]({
      params: { id: visible.id },
      body: {
        amount: 30,
        accountAmount: 30,
        goalAssociations: [{ goalId: goal.id, allocatedAmount: 30 }],
      },
    });
    check(cache, 950, 50);
    await ensureWalletBootstrap(reload, client, {
      recordsLimit: 1,
      timeZone: "America/Montevideo",
    });
    await Promise.all([
      reload.fetchQuery(balanceOptions),
      reload.fetchQuery(goalOptions),
      reload.fetchInfiniteQuery(pageOptions),
    ]);
    check(reload, 950, 50);
    expect(reload.getQueryData(pageOptions.queryKey)?.pages[0]?.items[0]).toMatchObject({
      id: visible.id,
      amount: 30,
    });
    await mutations["records.patch"]({
      params: { id: visible.id },
      body: {
        amount: 10,
        accountAmount: 10,
        goalAssociations: [{ goalId: goal.id, allocatedAmount: 10 }],
      },
    });
    check(cache, 970, 30);
    await Promise.all([
      reload.refetchQueries({ queryKey: balanceOptions.queryKey, type: "all" }),
      reload.refetchQueries({ queryKey: goalOptions.queryKey, type: "all" }),
    ]);
    check(reload, 970, 30);
  } finally {
    for (const unsubscribe of stop) unsubscribe();
    cache.clear();
    reload.clear();
  }
});
