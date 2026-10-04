import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import {
  applyMigrations,
  installLocalTransport,
  LOCAL_DATABASE_URL,
} from "../../scripts/sandbox/database.js";
import { importSnapshot } from "../../scripts/sandbox/snapshot.js";
import { createDb } from "./client.js";
import {
  createGoalReservation,
  createRecord,
  deleteGoal,
  deleteRecord,
  getWalletBackup,
  getWalletDataset,
} from "./wallet-repository.js";
import { recordSchema, walletBackupSchema } from "../../shared/schemas.js";
import { restoreWalletBackup } from "./wallet-restore.js";
import { processMailIngestion } from "../ingestion/process-mail-ingestion.js";

const pg = new PGlite();
const accountId = "00000000-0000-4000-8000-000000000001";
const categoryId = "00000000-0000-4000-8000-000000000002";
const goalId = "00000000-0000-4000-8000-000000000003";
const date = "2026-06-21T12:00:00.000Z";
let restore: () => void;
beforeAll(async () => {
  process.env.DATABASE_URL = LOCAL_DATABASE_URL;
  restore = installLocalTransport(pg);
  await applyMigrations(pg);
}, 30_000);
afterAll(async () => {
  restore();
  await pg.close();
});
beforeEach(async () => {
  await pg.exec(
    "TRUNCATE accounts,categories,settings,goals,tags,exchange_rates CASCADE",
  );
  await importSnapshot(pg, {
    settings: { primaryCurrency: "UYU" },
    accounts: [
      {
        id: accountId,
        name: "Account",
        type: "bank",
        currency: "UYU",
        initialBalance: 1000,
        color: "blue",
        icon: "bank",
      },
    ],
    categories: [
      { id: categoryId, name: "Category", color: "blue", icon: "bank" },
    ],
    goals: [
      {
        id: goalId,
        name: "Goal",
        targetAmount: 100,
        currency: "UYU",
        color: "blue",
        icon: "bank",
      },
    ],
    records: [],
  });
});
async function archiveHistory() {
  await createGoalReservation({
    goalId,
    accountId,
    amount: 100,
    currency: "UYU",
    createdAt: date,
  });
  const record = await createRecord(
    recordSchema.parse({
      type: "expense",
      amount: 40,
      currency: "UYU",
      accountId,
      categoryId,
      paymentType: "debit",
      paymentStatus: "cleared",
      occurredAt: date,
      goalIds: [goalId],
    }),
  );
  await deleteGoal(goalId);
  return record;
}

test("complete backups preserve mail retry identities and duplicate lineage after restoration",async()=>{
  const record=await createRecord(recordSchema.parse({type:"expense",amount:40,currency:"UYU",accountId,categoryId,paymentType:"debit",paymentStatus:"cleared",occurredAt:date}));
  const eventId="00000000-0000-4000-8000-000000000011",duplicateId="00000000-0000-4000-8000-000000000012";
  await pg.query("INSERT INTO ingestion_events(id,idempotency_key,source,status,action,record_id) VALUES($1,'backup-mail','test','completed','created',$2)",[eventId,record.id]);
  await pg.query("INSERT INTO ingestion_events(id,idempotency_key,source,status,action,duplicate_of_id) VALUES($1,'backup-duplicate','test','completed','duplicate',$2)",[duplicateId,eventId]);
  const backup=walletBackupSchema.parse(await getWalletBackup());
  expect(backup.ingestionEvents).toHaveLength(2);
  await pg.exec("DELETE FROM ingestion_events");
  await restoreWalletBackup(backup);
  const input={idempotencyKey:"backup-mail",integration:{name:"gmail_apps_script" as const,version:"test"},email:{provider:"gmail" as const,messageId:"test",threadId:"test",subject:"Test",from:"test@example.com",date},transaction:{source:"test",sourceLabel:"test",occurredAt:date,amount:40,currency:"UYU" as const,merchantRaw:"Test",cardAlias:"",cardBrand:"",cardNumber:"",paymentType:"credit_card" as const},destination:{}};
  expect((await processMailIngestion(input)).status).toBe("already_processed");
  expect((await getWalletDataset()).records).toHaveLength(1);
  expect((await getWalletBackup()).ingestionEvents?.find(event=>event.id===duplicateId)?.duplicateOfId).toBe(eventId);
  const legacy={...backup};delete legacy.ingestionEvents;
  await restoreWalletBackup(legacy);
  expect((await processMailIngestion(input)).status).toBe("already_processed");
});

test("backup retains archived goals and every ledger reference without exposing them in normal wallet state", async () => {
  const record = await archiveHistory();
  const normal = await getWalletDataset();
  expect(normal.goals).toEqual([]);
  expect(normal.records[0].goalIds).toEqual([goalId]);
  const backup = await getWalletBackup(createDb());
  expect(backup.goals).toHaveLength(1);
  expect(backup.goals[0]).toMatchObject({
    id: goalId,
    deletedAt: expect.any(String),
  });
  expect(backup.records[0].id).toBe(record.id);
  expect(backup.goalReservationMovements).toHaveLength(3);
  expect(
    backup.goalReservationMovements?.find(
      (movement) => movement.type === "consume",
    ),
  ).toMatchObject({ recordId: record.id, idempotencyKey: expect.any(String) });
});

test("backup retains soft-deleted records and accounts referenced by durable financial history", async () => {
  const record = await archiveHistory();
  await deleteRecord(record.id);
  await pg.query("update accounts set deleted_at=now() where id=$1", [
    accountId,
  ]);
  const normal = await getWalletDataset();
  expect(normal.accounts).toEqual([]);
  expect(normal.records).toEqual([]);
  const backup = await getWalletBackup(createDb());
  expect(backup.accounts[0]).toMatchObject({
    id: accountId,
    deletedAt: expect.any(String),
  });
  expect(backup.records[0]).toMatchObject({
    id: record.id,
    deletedAt: expect.any(String),
  });
});

test("JSON export and atomic restore preserve archived goals and reservation ledger without reviving UI entities", async () => {
  await archiveHistory();
  const before = await getWalletDataset();
  const backup = walletBackupSchema.parse(
    JSON.parse(JSON.stringify(await getWalletBackup())),
  );
  expect(backup.goals[0].deletedAt).toEqual(expect.any(String));
  await restoreWalletBackup(backup);
  expect(await getWalletDataset()).toEqual(before);
  expect(JSON.parse(JSON.stringify(await getWalletBackup()))).toEqual(
    JSON.parse(JSON.stringify(backup)),
  );
});

test("export and restore retain deleted records and archived accounts needed by reservation references", async () => {
  const record = await archiveHistory();
  await deleteRecord(record.id);
  await pg.query("update accounts set deleted_at=now() where id=$1", [
    accountId,
  ]);
  const backup = walletBackupSchema.parse(
    JSON.parse(JSON.stringify(await getWalletBackup())),
  );
  expect(backup.accounts[0].deletedAt).toEqual(expect.any(String));
  expect(backup.records[0].deletedAt).toEqual(expect.any(String));
  await restoreWalletBackup(backup);
  const reloaded = await getWalletDataset();
  expect(reloaded.accounts).toEqual([]);
  expect(reloaded.records).toEqual([]);
  expect(reloaded.goals).toEqual([]);
  expect(reloaded.goalReservationMovements).toHaveLength(3);
  expect(JSON.parse(JSON.stringify(await getWalletBackup()))).toEqual(
    JSON.parse(JSON.stringify(backup)),
  );
});
