import { PGlite } from "@electric-sql/pglite";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { afterAll, beforeAll, expect, test } from "vitest";
import { applyMigrations, installLocalTransport } from "./database.js";
import { createSandboxServer } from "./server.js";
import { configureLocalEnvironment, LOCAL_ACCESS_CODE } from "./workspace.js";
import type { MailRunResult } from "./mail.js";
import type { WalletDataset } from "../../shared/types.js";

const pg = new PGlite();
let server: Server;
let origin: string;
let directory: string;
let session: string;
beforeAll(async () => {
  configureLocalEnvironment();
  installLocalTransport(pg);
  await applyMigrations(pg);
  directory = await mkdtemp(path.join(os.tmpdir(), "wallet-sandbox-test-"));
  server = await createSandboxServer({
    pg,
    mailboxPath: path.join(directory, "mailbox.json"),
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}, 30_000);
afterAll(async () => {
  if (server)
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  await pg.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

const post = (route: string, data: unknown, headers = {}) =>
  fetch(`${origin}${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(data),
  });

test("local HTTP uses the real unlock and protected nested router", async () => {
  expect((await fetch(`${origin}/api/health`)).status).toBe(401);
  expect(
    (await post("/api/auth/unlock", { token: "invalid-code" })).status,
  ).toBe(401);
  const unlocked = await post("/api/auth/unlock", { token: LOCAL_ACCESS_CODE });
  expect(unlocked.status).toBe(200);
  session = ((await unlocked.json()) as { data: { token: string } }).data.token;
  expect(
    (
      await fetch(`${origin}/api/health`, {
        headers: { Authorization: `Bearer ${session}` },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await fetch(
        `${origin}/api/records/00000000-0000-4000-8000-000000000099`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${session}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ note: "Test" }),
        },
      )
    ).status,
  ).toBe(404);
});

test("mailbox rejects malformed input and cross-origin writes", async () => {
  expect(
    (await post("/__sandbox/messages", { body: "missing fields" })).status,
  ).toBe(400);
  expect(
    (await post("/__sandbox/messages", {}, { Origin: "https://other.example" }))
      .status,
  ).toBe(403);
  expect((await fetch(`${origin}/__sandbox/state`)).status).toBe(200);
});

test("worker executes actual Apps Script into the local API and persists labels for reload", async () => {
  const created = await post("/__sandbox/messages", {
    from: "comunicaciones@itau.com.uy",
    subject: "Aviso de consumo aprobado con tarjeta de crédito",
    date: new Date().toISOString(),
    body: "Importe: 12,50 UYU\nComercio: TEST STORE\nVISA nro. ****1234",
  });
  expect(created.status).toBe(201);
  const run = await post("/__sandbox/run", {});
  const result = (await run.json()) as MailRunResult;
  expect(run.status, JSON.stringify(result)).toBe(200);
  expect(result.deliveries).toHaveLength(1);
  expect(result.deliveries[0].status).toBe(201);
  expect(result.threads[0].labels).toEqual(["Wallet/Procesado"]);
  const wallet = await fetch(`${origin}/api/wallet`, {
    headers: { Authorization: `Bearer ${session}` },
  });
  expect(
    ((await wallet.json()) as { data: WalletDataset }).data.records,
  ).toHaveLength(1);
  const persisted = JSON.parse(
    await readFile(path.join(directory, "mailbox.json"), "utf8"),
  );
  expect(persisted.threads[0].labels).toEqual(["Wallet/Procesado"]);
  const retried = await post("/__sandbox/requeue", {
    threadId: persisted.threads[0].id,
  });
  expect(retried.status).toBe(200);
  const replay = (await (
    await post("/__sandbox/run", {})
  ).json()) as MailRunResult;
  expect(replay.deliveries[0].status).toBe(200);
  expect((await pg.query("SELECT id FROM records")).rows).toHaveLength(1);
}, 30_000);
