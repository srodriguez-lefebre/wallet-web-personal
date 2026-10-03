import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { createPostgresTestDatabase } from "../../scripts/sandbox/postgres-test.js";
import { updateRecord } from "./wallet-repository.js";

const uyu = "00000000-0000-4000-8000-000000000001";
const usd = "00000000-0000-4000-8000-000000000002";
const eur = "00000000-0000-4000-8000-000000000003";
const recordId = "00000000-0000-4000-8000-000000000004";
const uyuDestination = "00000000-0000-4000-8000-000000000005";
const categoryId = "00000000-0000-4000-8000-000000000006";
const cardId = "00000000-0000-4000-8000-000000000007";
let fixture: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
beforeAll(async () => { fixture = await createPostgresTestDatabase(); }, 60_000);
afterAll(async () => { if (fixture) await fixture.close(); }, 30_000);
beforeEach(async () => {
  await fixture.pool.query("TRUNCATE accounts,categories,settings,exchange_rates,credit_cards CASCADE");
  for (const [id, currency] of [[uyu, "UYU"], [usd, "USD"], [eur, "EUR"], [uyuDestination, "UYU"]]) {
    await fixture.pool.query("insert into accounts(id,name,type,currency,initial_balance,color,icon) values ($1,$2,'bank',$2,1000,'blue','bank')", [id, currency]);
  }
  await fixture.pool.query("insert into settings(primary_currency) values ('UYU')");
  await fixture.pool.query("insert into categories(id,name,color,icon) values ($1,'Category','blue','bank')", [categoryId]);
});
async function seed({ currency = "UYU", amount = 100, account = uyu, accountAmount = 100, destination = null as string | null, destinationAmount = null as number | null, primaryRate = 1 } = {}) {
  await fixture.pool.query("insert into records(id,type,amount,currency,account_id,account_amount,destination_account_id,destination_amount,payment_type,payment_status,exchange_rate_to_primary,occurred_at,category_id) values ($1,$2,$3,$4,$5,$6,$7,$8,'debit','cleared',$9,'2026-06-01T12:00:00Z',$10)", [recordId, destination ? "transfer" : "expense", amount, currency, account, accountAmount, destination, destinationAmount, primaryRate, categoryId]);
}
async function saved() { return (await fixture.pool.query("select * from records where id=$1", [recordId])).rows[0]; }
async function quote(from: string, to: string, rate: number, date = "2026-05-01") {
  await fixture.pool.query("insert into exchange_rates(from_currency,to_currency,rate,date,source) values ($1,$2,$3,$4,'test')", [from, to, rate, date]);
}
async function linkedCard() {
  await fixture.pool.query("insert into credit_cards(id,name,issuer,last_four,credit_limit,limit_currency,closing_day,due_day,color,icon) values ($1,'Card','Bank','1234',10000,'UYU',10,25,'blue','card')", [cardId]);
  await fixture.pool.query("update records set credit_card_id=$1,payment_type='credit',amount_in_limit_currency=4100,exchange_rate_to_limit_currency=41 where id=$2", [cardId, recordId]);
  await fixture.pool.query("insert into credit_card_records(credit_card_id,wallet_record_id,kind,amount,currency,amount_in_limit_currency,exchange_rate_to_limit_currency,category_id,occurred_at) values ($1,$2,'purchase',100,'USD',4100,41,$3,'2026-06-01T12:00:00Z')", [cardId, recordId, categoryId]);
}

test("amount-only PATCH updates a same-currency account amount", async () => {
  await seed();
  expect((await updateRecord(recordId, { amount: 200 }))?.accountAmount).toBe(200);
  expect((await saved()).account_amount).toBe("200.00");
});
test("amount-only transfer PATCH normalizes both source and destination", async () => {
  await seed({ destination: uyuDestination, destinationAmount: 100 });
  await updateRecord(recordId, { amount: 200 });
  expect((await saved()).account_amount).toBe("200.00");
  expect((await saved()).destination_amount).toBe("200.00");
});
test("amount-only PATCH scales frozen source and destination FX ratios using numeric rounding", async () => {
  await seed({ currency: "USD", amount: 3, account: uyu, accountAmount: 123.46, destination: eur, destinationAmount: 2.71, primaryRate: 41.153333 });
  await quote("USD", "UYU", 80, "2026-07-01");
  await updateRecord(recordId, { amount: 7 });
  const row = await saved();
  expect(row.account_amount).toBe("288.07");
  expect(row.destination_amount).toBe("6.32");
  expect(Number(row.exchange_rate_to_primary)).toBe(41.153333);
});
test("currency change recalculates source, destination and primary conversions using historical rates", async () => {
  await seed({ destination: usd, destinationAmount: 2.5 });
  await quote("EUR", "UYU", 45);
  await quote("EUR", "USD", 1.1);
  await quote("EUR", "UYU", 60, "2026-07-01");
  await updateRecord(recordId, { currency: "EUR", amount: 10 });
  const row = await saved();
  expect(row.account_amount).toBe("450.00");
  expect(row.destination_amount).toBe("11.00");
  expect(Number(row.exchange_rate_to_primary)).toBe(45);
});
test("account changes resolve new currencies and cannot retain previous converted amounts", async () => {
  await seed();
  await quote("USD", "UYU", 40);
  await updateRecord(recordId, { accountId: usd });
  expect((await saved()).account_amount).toBe("2.50");
});
test("missing conversion rejects a changed account atomically", async () => {
  await seed();
  await expect(updateRecord(recordId, { accountId: eur })).rejects.toThrow();
  expect((await saved()).account_id).toBe(uyu);
});
test("a new transfer destination resolves its own currency instead of retaining old conversion", async () => {
  await seed({ destination: uyuDestination, destinationAmount: 100 });
  await quote("USD", "UYU", 40);
  await updateRecord(recordId, { destinationAccountId: usd });
  expect((await saved()).destination_amount).toBe("2.50");
});
test("explicit converted amounts and primary rates remain authoritative on a currency change", async () => {
  await seed({ destination: eur, destinationAmount: 90 });
  await updateRecord(recordId, { currency: "USD", amount: 10, accountAmount: 410, destinationAmount: 9, exchangeRateToPrimary: 41 });
  const row = await saved();
  expect(row.account_amount).toBe("410.00");
  expect(row.destination_amount).toBe("9.00");
  expect(Number(row.exchange_rate_to_primary)).toBe(41);
});
test("a currency change cannot retain a stale primary rate when the new conversion is unknown", async () => {
  await seed();
  await expect(updateRecord(recordId, { currency: "USD", accountId: usd })).rejects.toThrow();
  expect((await saved()).currency).toBe("UYU");
});
test("notes-only PATCH preserves frozen conversions even without historical quotes", async () => {
  await seed({ currency: "USD", accountAmount: 4100, destination: eur, destinationAmount: 90, primaryRate: 41 });
  await updateRecord(recordId, { note: "Only the note" });
  const row = await saved();
  expect(row.account_amount).toBe("4100.00");
  expect(row.destination_amount).toBe("90.00");
  expect(Number(row.exchange_rate_to_primary)).toBe(41);
});
test("amount-only linked-card PATCH scales the frozen limit conversion in both ledgers", async () => {
  await seed({ currency: "USD", accountAmount: 4100, primaryRate: 41 });
  await linkedCard();
  await quote("USD", "UYU", 60, "2026-07-01");
  await updateRecord(recordId, { amount: 200 });
  expect((await saved()).amount_in_limit_currency).toBe("8200.00");
  const linked = (await fixture.pool.query("select * from credit_card_records where wallet_record_id=$1", [recordId])).rows[0];
  expect(linked.amount_in_limit_currency).toBe("8200.00");
  expect(Number(linked.exchange_rate_to_limit_currency)).toBe(41);
});
test("linked-card currency PATCH resolves the historical limit rate and updates both ledgers", async () => {
  await seed({ currency: "USD", accountAmount: 4100, primaryRate: 41 });
  await linkedCard();
  await quote("EUR", "UYU", 45);
  await quote("EUR", "UYU", 60, "2026-07-01");
  await updateRecord(recordId, { currency: "EUR", amount: 10 });
  expect((await saved()).amount_in_limit_currency).toBe("450.00");
  const linked = (await fixture.pool.query("select * from credit_card_records where wallet_record_id=$1", [recordId])).rows[0];
  expect(linked.amount_in_limit_currency).toBe("450.00");
  expect(Number(linked.exchange_rate_to_limit_currency)).toBe(45);
});
