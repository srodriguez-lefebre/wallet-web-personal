import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { createPostgresTestDatabase } from "../../scripts/sandbox/postgres-test.js";
import * as repository from "./wallet-repository.js";
import * as schemas from "../../shared/schemas.js";
import { restoreWalletBackup } from "./wallet-restore.js";

let fixture: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
const accountId = randomUUID(), categoryId = randomUUID();
const input = { name: "  Groceries  ", type: "expense" as const, amount: 25, currency: "UYU" as const, accountId, categoryId, paymentType: "debit" as const, note: "Weekly" };
beforeAll(async () => { fixture = await createPostgresTestDatabase(); }, 60_000);
afterAll(async () => { await fixture?.close(); });
beforeEach(async () => {
  await fixture.pool.query("TRUNCATE accounts,categories,settings CASCADE");
  await fixture.pool.query("INSERT INTO accounts(id,name,type,currency,initial_balance,color,icon) VALUES($1,'Bank','bank','UYU',500,'blue','bank')", [accountId]);
  await fixture.pool.query("INSERT INTO categories(id,name,color,icon) VALUES($1,'Food','blue','bank')", [categoryId]);
});

test("template CRUD changes only the library and partial patches preserve untouched fields", async () => {
  const template = await repository.createRecordTemplate(input);
  expect(template).toMatchObject({ ...input, name: "Groceries", id: expect.any(String) });
  expect(await repository.listRecordTemplates()).toEqual([template]);
  const updated = await repository.updateRecordTemplate(template.id, { name: "Lunch", note: null });
  expect(updated).toMatchObject({ name: "Lunch", amount: 25, accountId, categoryId, paymentType: "debit", note: undefined });
  expect((await repository.getWalletDataset()).recordTemplates).toEqual([updated]);
  expect((await repository.bootstrapWallet({ recordsLimit: 50 })).dataset.recordTemplates).toEqual([updated]);
  expect((await repository.getWalletDataset()).records).toEqual([]);
  expect(await repository.deleteRecordTemplate(template.id)).toBe(true);
  expect(await repository.deleteRecordTemplate(template.id)).toBe(false);
  expect(await repository.listRecordTemplates()).toEqual([]);
});

test("templates reject malformed, inactive and archived references without mutating history", async () => {
  expect(schemas.recordTemplateSchema.safeParse({ ...input, name: " " }).success).toBe(false);
  expect(schemas.recordTemplateSchema.safeParse({ ...input, name: "x".repeat(81) }).success).toBe(false);
  for (const amount of [0, -1, Infinity, NaN]) expect(schemas.recordTemplateSchema.safeParse({ ...input, amount }).success).toBe(false);
  expect(schemas.recordTemplateSchema.safeParse({ ...input, accountId: "invalid" }).success).toBe(false);
  for(const fields of [{occurredAt:new Date().toISOString()},{exchangeRateToPrimary:1},{debtId:randomUUID()},{goalIds:[]},{paymentStatus:"cleared"}]) expect(schemas.recordTemplateSchema.safeParse({...input,...fields}).success).toBe(false);
  expect(schemas.recordTemplatePatchSchema.safeParse({}).success).toBe(false);
  for(const key of ["accountId","destinationAccountId","categoryId","creditCardId","tagId"] as const) {
    expect(schemas.recordTemplateSchema.safeParse({...input,[key]:"invalid"}).success).toBe(false);
    await expect(repository.createRecordTemplate({ ...input, [key]: randomUUID() })).rejects.toThrow(/reference|active/i);
  }
  await fixture.pool.query("UPDATE accounts SET is_active=false WHERE id=$1", [accountId]);
  await expect(repository.createRecordTemplate(input)).rejects.toThrow(/reference|active/i);
  await fixture.pool.query("UPDATE accounts SET is_active=true WHERE id=$1", [accountId]);
  const template = await repository.createRecordTemplate(input);
  await fixture.pool.query("UPDATE categories SET deleted_at=now() WHERE id=$1", [categoryId]);
  await expect(repository.updateRecordTemplate(template.id, { amount: 30 })).rejects.toThrow(/reference|active/i);
  expect((await repository.listRecordTemplates())[0].amount).toBe(25);
});

test("deleting a tag keeps its template while clearing the optional tag reference", async () => {
  const tag=await repository.createTag({name:"Template tag",color:"blue",isActive:true});
  const template=await repository.createRecordTemplate({...input,tagId:tag.id});
  expect(await repository.deleteTag(tag.id)).toBe(true);
  expect((await repository.listRecordTemplates()).find(item=>item.id===template.id)).toMatchObject({name:"Groceries",tagId:undefined});
});

test("concurrent creates cannot exceed the 100 template library limit", async () => {
  await fixture.pool.query("INSERT INTO record_templates(name,type,amount,currency,payment_type) SELECT 'Template '||n,'expense',1,'UYU','cash' FROM generate_series(1,99) n");
  const results = await Promise.allSettled([repository.createRecordTemplate(input), repository.createRecordTemplate({...input,name:"Lunch"})]);
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(await repository.listRecordTemplates()).toHaveLength(100);
});

test("template names are unique after trimming and ignoring case, including renames", async () => {
  const template = await repository.createRecordTemplate(input);
  await expect(repository.createRecordTemplate({...input,name:" groceries "})).rejects.toThrow();
  const other = await repository.createRecordTemplate({...input,name:"Lunch"});
  await expect(repository.updateRecordTemplate(other.id,{name:"GROCERIES"})).rejects.toThrow();
  expect(await repository.listRecordTemplates()).toHaveLength(2);
  expect((await repository.listRecordTemplates()).find(item=>item.id===template.id)?.name).toBe("Groceries");
});

test("complete template backups restore archived dictionary references and old backups reset to an empty library", async () => {
  const template = await repository.createRecordTemplate(input);
  await fixture.pool.query("UPDATE accounts SET deleted_at=now(),is_active=false WHERE id=$1", [accountId]);
  await fixture.pool.query("UPDATE categories SET deleted_at=now() WHERE id=$1", [categoryId]);
  const backup = schemas.walletBackupSchema.parse(JSON.parse(JSON.stringify(await repository.getWalletBackup())));
  expect(backup.recordTemplates).toEqual([JSON.parse(JSON.stringify(template))]);
  await restoreWalletBackup(backup);
  expect((await repository.getWalletDataset()).recordTemplates).toEqual([template]);
  const old: Omit<typeof backup,"recordTemplates"> & {recordTemplates?: typeof backup.recordTemplates} = {...backup}; delete old.recordTemplates;
  expect(schemas.walletBackupSchema.parse(old).recordTemplates).toEqual([]);
  await restoreWalletBackup(old);
  expect(await repository.listRecordTemplates()).toEqual([]);
  const broken = { ...backup, recordTemplates: [{ ...template, accountId: randomUUID() }] };
  expect(schemas.walletBackupSchema.safeParse(broken).success).toBe(false);
});
