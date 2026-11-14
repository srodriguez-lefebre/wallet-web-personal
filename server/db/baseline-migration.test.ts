import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, test } from "vitest";

import { installLocalTransport, LOCAL_DATABASE_URL } from "../../scripts/sandbox/database.js";
import { settingsSchema, walletBackupSchema } from "../../shared/schemas.js";
import { createDb } from "./client.js";
import { getWalletBackup } from "./dataset.js";
import { restoreWalletBackup } from "./wallet-restore.js";
const pg = new PGlite();
let restore: () => void;
const accountId = randomUUID(),
  categoryId = randomUUID(),
  recordId = randomUUID();
let migration: string;
beforeAll(async () => {
  const folder = new URL("../../drizzle/migrations/", import.meta.url);
  const journal = JSON.parse(await readFile(new URL("meta/_journal.json", folder), "utf8")) as {
    entries: { tag: string }[];
  };
  for (const entry of journal.entries) {
    if (entry.tag.startsWith("0022_")) break;
    await pg.exec(await readFile(new URL(`${entry.tag}.sql`, folder), "utf8"));
  }
  migration = await readFile(new URL("0022_repository_baseline.sql", folder), "utf8");
  process.env.DATABASE_URL = LOCAL_DATABASE_URL;
  restore = installLocalTransport(pg);
}, 30_000);
afterAll(async () => {
  restore?.();
  await pg.close();
});
test("the additive baseline rejects duplicate settings without losing rows, preserves old data and restores a synthetic older backup", async () => {
  await pg.exec("INSERT INTO settings(primary_currency) VALUES('UYU'),('UYU')");
  await expect(pg.transaction((tx) => tx.exec(migration))).rejects.toThrow(/multiple rows/);
  expect((await pg.query("SELECT id FROM settings")).rows).toHaveLength(2);
  expect(
    (
      await pg.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name='settings' AND column_name='singleton'",
      )
    ).rows,
  ).toEqual([]);
  await pg.exec("TRUNCATE settings");
  await pg.exec("INSERT INTO settings(primary_currency) VALUES('UYU')");
  await pg.query(
    "INSERT INTO accounts(id,name,type,currency,initial_balance,color,icon) VALUES($1,'Synthetic bank','bank','UYU',100,'blue','bank')",
    [accountId],
  );
  await pg.query(
    "INSERT INTO categories(id,name,color,icon) VALUES($1,'Synthetic category','blue','tag')",
    [categoryId],
  );
  await pg.query(
    "INSERT INTO records(id,type,amount,currency,account_id,category_id,payment_type,payment_status,exchange_rate_to_primary,occurred_at) VALUES($1,'expense',12.34,'UYU',$2,$3,'debit','cleared',1,'2026-01-01T12:00:00Z')",
    [recordId, accountId, categoryId],
  );
  const oldRows = (
    await pg.query("SELECT id,amount::text,currency,account_id,occurred_at::text FROM records")
  ).rows;
  await pg.transaction((tx) => tx.exec(migration));
  expect(
    (await pg.query("SELECT id,amount::text,currency,account_id,occurred_at::text FROM records"))
      .rows,
  ).toEqual(oldRows);
  expect((await pg.query("SELECT to_regclass('goal_reservations') AS legacy")).rows[0]).toEqual({
    legacy: "goal_reservations",
  });
  await expect(pg.exec("INSERT INTO settings DEFAULT VALUES")).rejects.toThrow();
  await expect(pg.exec("INSERT INTO settings(singleton) VALUES(false)")).rejects.toThrow();
  const oldBackup = walletBackupSchema.parse({
    settings: settingsSchema.parse({
      primaryCurrency: "UYU",
      theme: "light",
      defaultDashboardPreset: "general",
      locale: "es-UY",
      includeHiddenAccountsInReports: false,
      defaultPaymentType: "debit",
      defaultPaymentStatus: "cleared",
    }),
    accounts: [
      {
        id: accountId,
        name: "Synthetic bank",
        type: "bank",
        currency: "UYU",
        initialBalance: 100,
        color: "blue",
        icon: "bank",
        isActive: true,
        isVisible: true,
      },
    ],
    categories: [{ id: categoryId, name: "Synthetic category", color: "blue", icon: "tag" }],
    records: [
      {
        id: recordId,
        type: "expense",
        amount: 12.34,
        currency: "UYU",
        accountId,
        categoryId,
        paymentType: "debit",
        paymentStatus: "cleared",
        exchangeRateToPrimary: 1,
        occurredAt: "2026-01-01T12:00:00.000Z",
        tagIds: [],
      },
    ],
    tags: [],
    goals: [],
    goalReservations: [],
    budgets: [],
    exchangeRates: [],
    creditCards: [],
    creditCardRecords: [],
    creditCardPayments: [],
    creditCardStatements: [],
    creditCardPaymentAllocations: [],
    debts: [],
    recurringDebts: [],
    investments: [],
    installmentPlans: [],
    recordTemplates: [],
  });
  await restoreWalletBackup(createDb(), oldBackup);
  const restored = await getWalletBackup(createDb());
  expect(restored.records).toContainEqual(
    expect.objectContaining({ id: recordId, amount: 12.34, accountId, categoryId }),
  );
  expect(restored.accounts[0]!.initialBalance).toBe(100);
  expect((await pg.query("SELECT session_version FROM settings")).rows[0]).toEqual({
    session_version: 1,
  });
});
