import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";

import { trackPoolShutdown } from "./postgres-pool.js";

import type { TestPostgresConfig } from "./postgres-global.js";

async function startCluster() {
  const directory = await mkdtemp(join(tmpdir(), "wallet-pg-run-"));
  const socket = createServer();
  await new Promise<void>((resolve, reject) => {
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", resolve);
  });
  const address = socket.address();
  if (!address || typeof address === "string") throw new Error("Missing test port");
  const config: TestPostgresConfig = {
    host: "127.0.0.1",
    port: address.port,
    user: "wallet_test",
    password: "local-test-only",
  };
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  const pg = new EmbeddedPostgres({
    databaseDir: directory,
    port: config.port,
    user: config.user,
    password: config.password,
    persistent: true,
    postgresFlags: ["-h", config.host],
    onLog: () => {},
    onError: () => {},
  });
  let started = false;
  let closeAdmin: (() => Promise<void>) | undefined;
  const cleanup = async () => {
    await closeAdmin?.();
    if (started) await pg.stop();
    await rm(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  };
  try {
    await pg.initialise();
    await pg.start();
    started = true;
    const admin = new Pool({ ...config, database: "postgres" });
    closeAdmin = trackPoolShutdown(admin);
    await admin.query("CREATE DATABASE wallet_template");
    const template = new Pool({ ...config, database: "wallet_template" });
    const closeTemplate = trackPoolShutdown(template);
    try {
      const folder = new URL("../../drizzle/migrations/", import.meta.url);
      const journal = JSON.parse(await readFile(new URL("meta/_journal.json", folder), "utf8")) as {
        entries: { tag: string }[];
      };
      for (const entry of journal.entries) {
        try {
          await template.query(await readFile(new URL(`${entry.tag}.sql`, folder), "utf8"));
        } catch (error) {
          throw new Error(`Migration ${entry.tag} failed`, { cause: error });
        }
      }
    } finally {
      await closeTemplate();
    }
    return { config, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

const startup = startCluster();
let shutdown: Promise<void> | undefined;
function stop() {
  return (shutdown ??= startup.then(async ({ cleanup }) => {
    await cleanup();
    if (process.connected) process.disconnect();
  }));
}
process.once("disconnect", () => {
  void stop().catch(() => {
    process.exitCode = 1;
  });
});
process.on("message", (message: unknown) => {
  if (typeof message === "object" && message && "type" in message && message.type === "stop") {
    void stop().catch(() => {
      process.exitCode = 1;
      if (process.connected) process.disconnect();
    });
  }
});
try {
  const { config } = await startup;
  if (process.connected) process.send?.({ type: "ready", config });
  else await stop();
} catch (error) {
  process.send?.({
    type: "error",
    error: error instanceof Error ? error.message : "PostgreSQL fixture failed",
  });
  process.exitCode = 1;
  if (process.connected) process.disconnect();
}
