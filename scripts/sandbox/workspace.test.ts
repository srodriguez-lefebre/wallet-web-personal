import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { acquireWorkspaceLock } from "./workspace.js";

test("concurrent starts cannot recover and delete each other's stale lock", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "wallet-lock-test-"));
  try {
    const file = path.join(directory, "process.lock");
    await writeFile(file, "99999999");
    const results = await Promise.allSettled([
      acquireWorkspaceLock(directory),
      acquireWorkspaceLock(directory),
    ]);
    for (const result of results)
      if (result.status === "fulfilled") await result.value();
    expect(results.map((result) => result.status)).toEqual([
      "rejected",
      "rejected",
    ]);
    expect(await readFile(file, "utf8")).toBe("99999999");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("lock release does not remove a replacement owner's lock", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "wallet-lock-test-"));
  try {
    const release = await acquireWorkspaceLock(directory);
    const file = path.join(directory, "process.lock");
    await writeFile(file, '{"pid":1,"owner":"different"}');
    await release();
    expect(await readFile(file, "utf8")).toBe('{"pid":1,"owner":"different"}');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
