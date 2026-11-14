import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { expect, test } from "vitest";

const execute = promisify(execFile);
test("a failed Vitest run with global PostgreSQL setup exits with status one", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wallet-runner-exit-"));
  try {
    const config = join(directory, "vitest.config.mjs");
    await writeFile(
      config,
      `export default ${JSON.stringify({
        test: {
          include: [resolve("scripts/sandbox/fixtures/expected-failure.fixture.ts")],
          globalSetup: [resolve("scripts/sandbox/postgres-global.ts")],
          maxWorkers: 1,
        },
      })};`,
    );
    const outcome = await execute(
      process.execPath,
      [resolve("node_modules/vitest/vitest.mjs"), "run", "--config", config],
      { cwd: process.cwd(), timeout: 30_000 },
    ).then(
      (result) => ({ code: 0, stdout: result.stdout }),
      (error: { code?: number; stdout?: string }) => ({
        code: error.code,
        stdout: error.stdout ?? "",
      }),
    );
    expect(outcome.stdout).toContain("1 failed");
    expect(outcome.code).toBe(1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 40_000);
