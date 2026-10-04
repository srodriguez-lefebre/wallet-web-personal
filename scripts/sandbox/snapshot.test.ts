import { PGlite } from "@electric-sql/pglite";
import { expect, test } from "vitest";
import { applyMigrations } from "./database.js";
import { importSnapshot } from "./snapshot.js";

const emptyWallet = {
  settings: { primaryCurrency: "UYU", primaryAccountId: null },
  accounts: [],
  categories: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      name: "General",
      color: "blue",
      icon: "bank",
    },
  ],
  records: [],
};

test("imports a wallet with no accounts and no dangling references", async () => {
  const pg = new PGlite();
  try {
    await applyMigrations(pg);
    expect(await importSnapshot(pg, emptyWallet)).toMatchObject({
      accounts: 0,
      categories: 1,
      records: 0,
    });
    expect(
      (await pg.query("SELECT primary_account_id FROM settings")).rows,
    ).toEqual([{ primary_account_id: null }]);
  } finally {
    await pg.close();
  }
}, 30_000);

test("an empty account collection still rejects a dangling settings reference atomically", async () => {
  const pg = new PGlite();
  try {
    await applyMigrations(pg);
    const before = (await pg.query("SELECT id FROM categories ORDER BY id"))
      .rows;
    await expect(
      importSnapshot(pg, {
        ...emptyWallet,
        settings: {
          ...emptyWallet.settings,
          primaryAccountId: "00000000-0000-4000-8000-000000000002",
        },
      }),
    ).rejects.toThrow();
    expect(
      (await pg.query("SELECT id FROM categories ORDER BY id")).rows,
    ).toEqual(before);
    expect((await pg.query("SELECT id FROM settings")).rows).toEqual([]);
  } finally {
    await pg.close();
  }
}, 30_000);
