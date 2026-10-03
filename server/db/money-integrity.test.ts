import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { createPostgresTestDatabase } from "../../scripts/sandbox/postgres-test.js";
import { createDebt, recordDebtPayment, updateRecord, deleteRecord, getWalletDataset, createRecord, generateDueRecurringDebts, upsertSettings } from "./wallet-repository.js";
import { calculateAccountBalances, calculateVisibleDebtSummary } from "../../shared/calculations.js";
import { randomUUID } from "node:crypto";

let fixture: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
const accountId = randomUUID(), dollarAccount = randomUUID(), categoryId = randomUUID();
beforeAll(async () => { fixture = await createPostgresTestDatabase(); }, 60_000);
afterAll(async () => { await fixture?.close(); });
beforeEach(async () => {
  await fixture.pool.query("TRUNCATE records, accounts, categories, debts, recurring_debts, settings, exchange_rates CASCADE");
  await fixture.pool.query("INSERT INTO accounts (id,name,type,currency,initial_balance,color,icon) VALUES ($1,'Pesos','bank','UYU',5000,'blue','bank'),($2,'Dollars','bank','USD',0,'blue','bank')", [accountId,dollarAccount]);
  await fixture.pool.query("INSERT INTO categories(id,name,color,icon) VALUES($1,'Test','blue','bank')", [categoryId]);
  await fixture.pool.query("INSERT INTO settings(primary_currency) VALUES('UYU')");
  await fixture.pool.query("INSERT INTO exchange_rates(from_currency,to_currency,rate,date) VALUES('USD','UYU',40,'2026-01-01')");
});
const debtInput = { name: "Test", direction: "payable" as const, currency: "USD" as const, originalAmount: 200, pendingAmount: 200, counterpartyName: "Test", categoryId, status: "active" as const, isVisible: true, startedAt: "2026-01-01T12:00:00Z" };
const payment = { amount: 100, accountId, occurredAt: "2026-02-01T12:00:00Z" };
test("debt payment freezes separate account and reporting amounts and retries only once", async () => {
  const debt = await createDebt(debtInput), idempotencyKey = randomUUID();
  const first = await recordDebtPayment(debt.id, { ...payment, idempotencyKey });
  const second = await recordDebtPayment(debt.id, { ...payment, idempotencyKey });
  expect(first!.record.accountAmount).toBe(4000);
  expect(first!.record.exchangeRateToPrimary).toBe(40);
  expect(second!.record.id).toBe(first!.record.id);
  const dataset = await getWalletDataset();
  expect(calculateAccountBalances(dataset).find(item=>item.account.id===accountId)!.balance).toBe(1000);
  expect(calculateVisibleDebtSummary(dataset).toPay).toBe(4000);
});
test("cancelling, editing and deleting payments reconciles the debt atomically", async () => {
  const debt = await createDebt(debtInput);
  const result = await recordDebtPayment(debt.id,payment);
  await updateRecord(result!.record.id, { amount: 50, accountAmount: 2000 });
  expect((await getWalletDataset()).debts[0].pendingAmount).toBe(150);
  await updateRecord(result!.record.id, { paymentStatus: "cancelled" });
  expect((await getWalletDataset()).debts[0].pendingAmount).toBe(200);
  await updateRecord(result!.record.id, { paymentStatus: "cleared" });
  expect((await getWalletDataset()).debts[0].pendingAmount).toBe(150);
  await deleteRecord(result!.record.id);
  await deleteRecord(result!.record.id);
  expect((await getWalletDataset()).debts[0].pendingAmount).toBe(200);
});
test("simultaneous payments cannot overpay or partially insert a financial record", async () => {
  const debt = await createDebt({...debtInput, originalAmount: 100,pendingAmount:100});
  const results = await Promise.allSettled([recordDebtPayment(debt.id,{...payment,amount:75}),recordDebtPayment(debt.id,{...payment,amount:75})]);
  expect(results.filter(result=>result.status==="fulfilled")).toHaveLength(1);
  const dataset = await getWalletDataset();
  expect(dataset.debts[0].pendingAmount).toBe(25);
  expect(dataset.records).toHaveLength(1);
});
test("cross currency transfer persists the actual amount received", async () => {
  const input = {type:"transfer" as const,amount:4000,currency:"UYU" as const,accountId,destinationAccountId:dollarAccount,destinationAmount:100,tagIds:[],paymentType:"transfer" as const,paymentStatus:"cleared" as const,exchangeRateToPrimary:1,occurredAt:payment.occurredAt};
  await createRecord(input);
  const balances = calculateAccountBalances(await getWalletDataset());
  expect(balances.find(item=>item.account.id===accountId)!.balance).toBe(1000);
  expect(balances.find(item=>item.account.id===dollarAccount)!.balance).toBe(100);
  await expect(createRecord({...input,destinationAmount:undefined})).rejects.toThrow();
});
test("primary currency cannot relabel frozen financial history",async()=>{
  const debt=await createDebt(debtInput); await recordDebtPayment(debt.id,payment);
  const dataset=await getWalletDataset();
  await expect(upsertSettings({...dataset.settings,primaryCurrency:"USD"})).rejects.toThrow("moneda principal");
});
test("unknown recurring amounts stay unknown and cycles do not precede rule start",async()=>{
  await fixture.pool.query("INSERT INTO recurring_debts(name,direction,currency,counterparty_name,category_id,day_of_month,is_active,started_at) VALUES('Test','payable','UYU','Test',$1,5,true,'2026-01-20')",[categoryId]);
  const generated=await generateDueRecurringDebts(new Date("2026-02-10T12:00:00Z"));
  expect(generated).toHaveLength(1);
  expect(generated[0].pendingAmount).toBeUndefined();
  expect(generated[0].status).toBe("active");
});
