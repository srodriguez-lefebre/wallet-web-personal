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
  expect(persisted.threads[0].messages[0].isRead).toBe(true);
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

test("HTTP sandbox saves bank mappings and actual script imports debit and owned transfers through the API",async()=>{
  const sourceId="00000000-0000-4000-8000-000000000041",destinationId="00000000-0000-4000-8000-000000000042";
  await pg.query("INSERT INTO accounts(id,name,type,currency,initial_balance,color,icon) VALUES($1,'Bank test','bank','UYU',500,'blue','bank'),($2,'Savings test','bank','UYU',0,'blue','bank')",[sourceId,destinationId]);
  const targets={cards:{},debitCards:{"2468:UYU":{accountId:sourceId}},bankAccounts:{"1357:UYU":{accountId:sourceId},"ITAU:9876540:UYU":{accountId:destinationId}}};
  const saved=await post("/__sandbox/targets",targets);
  expect(saved.status).toBe(200);expect(await saved.json()).toEqual(targets);
  const debit=await post("/__sandbox/messages",{from:"Itaú Comunicaciones <comunicaciones@itau.com.uy>",subject:"Aviso de consumo aprobado con tarjeta de débito",date:"2026-10-01T12:00:00.000Z",body:"Se aprobo un consumo de su tarjeta Visa terminada en 2468 . Realizado en TEST CAFE Monto: 25.00 Pesos. Si no fuiste tú comunícate al 1784."});
  const debitThread=(await debit.json()) as {id:string};
  const transfer=await post("/__sandbox/messages",{from:"comunicaciones@itau.com.uy",subject:"Aviso transferencia realizada",date:"2026-10-01T13:00:00.000Z",body:"Transferencia realizada desde la cuenta ****1357\nImporte: 50.00 UYU\nCuenta destino: 9876540\nBanco/Institución destino: Banco Itau"});
  const transferThread=(await transfer.json()) as {id:string};
  await post("/__sandbox/targets",{...targets,bankAccounts:{"ITAU:9876540:UYU":{accountId:destinationId}}});
  const partial=(await (await post("/__sandbox/run",{})).json()) as MailRunResult;
  expect(partial.deliveries.map(item=>item.status)).toEqual([201]);
  expect(partial.threads.find(row=>row.id===transferThread.id)?.labels).toContain("Wallet/Pendiente");
  expect(partial.threads.find(row=>row.id===transferThread.id)?.messages[0].isRead).toBe(false);
  expect(partial.logs.join(" ")).toMatch(/origen/i);
  await post("/__sandbox/targets",targets);
  const run=await post("/__sandbox/run",{}),result=(await run.json()) as MailRunResult;
  expect(run.status).toBe(200);expect(result.deliveries.map(item=>item.status)).toEqual([201]);
  expect(result.threads.filter(row=>[debitThread.id,transferThread.id].includes(row.id)).every(row=>row.labels.join()==="Wallet/Procesado"&&row.messages.every(message=>message.isRead))).toBe(true);
  const wallet=await fetch(`${origin}/api/wallet`,{headers:{Authorization:`Bearer ${session}`}});
  const dataset=((await wallet.json()) as {data:WalletDataset}).data;
  expect(dataset.records.filter(row=>row.accountId===sourceId).map(row=>[row.type,row.paymentType,row.accountAmount,row.destinationAmount]).sort()).toEqual([["expense","debit",25,undefined],["transfer","transfer",50,50]]);
  expect(dataset.creditCardRecords).toHaveLength(0);
  for(const id of [debitThread.id,transferThread.id]) await post("/__sandbox/requeue",{threadId:id});
  const retried=(await (await post("/__sandbox/run",{})).json()) as MailRunResult;
  expect(retried.deliveries.map(item=>item.status)).toEqual([200,200]);
  expect((await pg.query("SELECT id FROM records WHERE account_id=$1",[sourceId])).rows).toHaveLength(2);
  const persisted=JSON.parse(await readFile(path.join(directory,"mailbox.json"),"utf8"));
  expect(persisted.targets).toEqual(targets);
},30_000);

test("a new message on a processed thread becomes pending and unsupported mail is persisted as read",async()=>{
  const state=await (await fetch(`${origin}/__sandbox/state`)).json() as {threads:{id:string}[]};
  const oldId=state.threads[0].id;
  expect((await post("/__sandbox/messages",{threadId:oldId,from:"comunicaciones@itau.com.uy",subject:"Beneficios del mes",date:"2026-10-01T14:00:00.000Z",body:"Promoción sin movimiento financiero"})).status).toBe(201);
  const pending=await (await fetch(`${origin}/__sandbox/state`)).json() as {threads:{id:string,labels:string[]}[]};
  expect(pending.threads.find(row=>row.id===oldId)?.labels).toContain("Wallet/Pendiente");
  const result=(await (await post("/__sandbox/run",{})).json()) as MailRunResult;
  expect(result.threads.find(row=>row.id===oldId)?.labels).toEqual(["Wallet/Procesado"]);
  expect(result.threads.find(row=>row.id===oldId)?.messages.at(-1)?.isRead).toBe(true);
  expect((await pg.query("SELECT id FROM records")).rows).toHaveLength(3);
},30_000);
