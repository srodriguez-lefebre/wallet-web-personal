import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, test } from "vitest";
import { createDb } from "../../server/db/client.js";
import { accounts, records } from "../../server/db/schema.js";
import { getWalletDataset } from "../../server/db/wallet-repository.js";
import { applyMigrations, installLocalTransport } from "./database.js";
import { importSnapshot } from "./snapshot.js";

const pg = new PGlite();
const accountId = "00000000-0000-4000-8000-000000000001";
const categoryId = "00000000-0000-4000-8000-000000000002";
const recordId = "00000000-0000-4000-8000-000000000003";
const goalId = "00000000-0000-4000-8000-000000000004";
const snapshot = {
  settings: { primaryCurrency: "UYU", primaryAccountId: accountId },
  accounts: [
    {
      id: accountId,
      name: "Test",
      type: "bank",
      currency: "UYU",
      initialBalance: 500.25,
      color: "blue",
      icon: "bank",
    },
  ],
  categories: [{ id: categoryId, name: "Test", color: "blue", icon: "bank" }],
  recordTemplates: [
    {
      id: "00000000-0000-4000-8000-000000000005",
      name: "Imported template",
      type: "expense",
      amount: 12.5,
      currency: "UYU",
      accountId,
      categoryId,
      paymentType: "debit",
      note: "Reusable configuration",
    },
  ],
  goals: [
    {
      id: goalId,
      name: "Test",
      targetAmount: 100,
      currency: "UYU",
      color: "blue",
      icon: "bank",
    },
  ],
  records: [
    {
      id: recordId,
      type: "expense" as const,
      amount: 12.5,
      currency: "UYU",
      accountId,
      categoryId,
      paymentType: "debit" as const,
      paymentStatus: "cleared" as const,
      exchangeRateToPrimary: 1,
      occurredAt: "2026-06-21T12:00:00.000Z",
      tagIds: [],
      goalAssociations: [
        {
          goalId,
          assignmentSource: "manual",
          allocatedAmount: 5,
          useReserved: false,
          reserveIncome: false,
        },
      ],
    },
  ],
};

beforeAll(async () => {
  process.env.DATABASE_URL = "postgresql://local:local@wallet.local/wallet";
  installLocalTransport(pg);
  await applyMigrations(pg);
}, 30_000);
afterAll(async () => {
  await pg.close();
});

test("reconstructs snapshot associations and exact amounts through the real repository", async () => {
  await importSnapshot(pg, snapshot);
  const result = await getWalletDataset();
  expect(result.accounts[0].initialBalance).toBe(500.25);
  expect(result.categories).toHaveLength(1);
  expect(result.records[0].occurredAt).toBe("2026-06-21T12:00:00.000Z");
  expect(result.records[0].goalAssociations?.[0]).toMatchObject({
    goalId,
    allocatedAmount: 5,
    useReserved: false,
  });
  expect(result.recordTemplates).toHaveLength(1);
  expect(result.recordTemplates![0]).toMatchObject(snapshot.recordTemplates[0]);
});

test("Neon batches roll back earlier financial writes when a later write fails", async () => {
  const db = createDb();
  await expect(
    db.batch([
      db.update(accounts).set({ initialBalance: "900" }),
      db.insert(records).values({
        ...snapshot.records[0],
        id: "00000000-0000-4000-8000-000000000099",
        accountId: "00000000-0000-4000-8000-000000000098",
        amount: "1",
        exchangeRateToPrimary: "1",
        occurredAt: new Date(),
      }),
    ]),
  ).rejects.toThrow();
  const [account] = await db.select().from(accounts);
  expect(account.initialBalance).toBe("500.25");
  const result = await db.execute(sql`select 123.45::numeric as amount`);
  expect(result.rows[0]).toEqual({ amount: "123.45" });
});

test("invalid snapshot restores none of its rows and leaves existing data intact", async () => {
  await expect(
    importSnapshot(pg, {
      ...snapshot,
      accounts: [{ ...snapshot.accounts[0], id: "invalid" }],
    }),
  ).rejects.toThrow();
  const result = await pg.query("select initial_balance from accounts");
  expect(result.rows).toHaveLength(1);
});
