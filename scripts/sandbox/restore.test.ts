import { PGlite } from "@electric-sql/pglite";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test, vi } from "vitest";
import { restoreLocalDatabase } from "./restore.js";

test("a rejected replacement leaves the active database and mailbox intact", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "wallet-restore-test-"),
  );
  try {
    const existing = await PGlite.create(path.join(directory, "db"));
    await existing.exec(
      "CREATE TABLE sentinel (amount numeric); INSERT INTO sentinel VALUES (321.25)",
    );
    await existing.close();
    await writeFile(
      path.join(directory, "mailbox.json"),
      '{"marker":"original"}',
    );
    await writeFile(
      path.join(directory, "wallet-backup.json"),
      '{"marker":"snapshot"}',
    );
    const invalid = {
      settings: {},
      accounts: [{ id: "invalid" }],
      categories: [{ name: "invalid" }],
      records: [],
    };
    await expect(
      restoreLocalDatabase(invalid, directory, true),
    ).rejects.toThrow();
    expect((await readdir(directory)).sort()).toEqual([
      "db",
      "mailbox.json",
      "wallet-backup.json",
    ]);
    const reopened = await PGlite.create(path.join(directory, "db"));
    try {
      expect(
        (await reopened.query("SELECT amount::text FROM sentinel")).rows,
      ).toEqual([{ amount: "321.25" }]);
    } finally {
      await reopened.close();
    }
    expect(await readFile(path.join(directory, "mailbox.json"), "utf8")).toBe(
      '{"marker":"original"}',
    );
    expect(
      await readFile(path.join(directory, "wallet-backup.json"), "utf8"),
    ).toBe('{"marker":"snapshot"}');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);

test("failed migrations remove the staged database", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "wallet-restore-test-"),
  );
  const execution = vi
    .spyOn(PGlite.prototype, "exec")
    .mockRejectedValueOnce(new Error("migration failed"));
  try {
    await expect(restoreLocalDatabase({}, directory, false)).rejects.toThrow(
      "migration failed",
    );
    expect(await readdir(directory)).toEqual([]);
  } finally {
    execution.mockRestore();
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
