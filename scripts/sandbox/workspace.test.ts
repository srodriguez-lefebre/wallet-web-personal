import * as fs from "node:fs/promises";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test, vi } from "vitest";
import { acquireWorkspaceLock } from "./workspace.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, mkdir: vi.fn(actual.mkdir) };
});

test("new workspaces request owner-only permissions", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "wallet-lock-test-"));
  const directory = path.join(parent, "private");
  const create = vi.mocked(fs.mkdir);
  try {
    const release = await acquireWorkspaceLock(directory);
    await release();
    expect(create).toHaveBeenCalledWith(directory, {
      recursive: true,
      mode: 0o700,
    });
  } finally {
    create.mockClear();
    await rm(parent, { recursive: true, force: true });
  }
});

test.skipIf(process.platform === "win32")(
  "existing POSIX workspaces become owner-only",
  async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "wallet-lock-test-"),
    );
    try {
      await mkdir(directory, { recursive: true });
      await chmod(directory, 0o755);
      const release = await acquireWorkspaceLock(directory);
      await release();
      expect((await stat(directory)).mode & 0o777).toBe(0o700);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);

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
