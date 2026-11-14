import { randomUUID } from "node:crypto";

import { neonConfig } from "@neondatabase/serverless";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

import { createPostgresTestDatabase } from "../../scripts/sandbox/postgres-test.js";
import {
  calculateAccountBalanceAtDate,
  calculateAccountBalances,
  calculateGoalProgress,
} from "../../shared/calculations.js";
import { getAccountBalanceMetrics } from "./balances.js";
import { createDb } from "./client.js";
import { getWalletDataset } from "./dataset.js";
import { getGoalProgressMetrics } from "./goals/progress.js";

let fixture: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
const id = () => randomUUID();
const bank = id(),
  usd = id(),
  unknown = id(),
  card = id(),
  statement = id(),
  category = id();
const expense = id(),
  missing = id(),
  purchase = id(),
  second = id(),
  payment = id();
const tieBank = id(),
  tieCard = id();
const goal = id(),
  eurGoal = id(),
  missingGoal = id(),
  primaryMissingGoal = id();
const now = new Date("2026-11-14T12:00:00Z");
beforeAll(async () => {
  vi.stubEnv("TZ", "America/Montevideo");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  fixture = await createPostgresTestDatabase();
  await fixture.pool.query("INSERT INTO settings(primary_currency) VALUES('UYU')");
  await fixture.pool.query(
    "INSERT INTO accounts(id,name,type,currency,initial_balance,color,icon) VALUES($1,'Synthetic bank','bank','UYU',1000,'blue','bank'),($2,'Synthetic USD','bank','USD',100,'blue','bank'),($3,'Synthetic unknown FX','bank','BRL',50,'blue','bank')",
    [bank, usd, unknown],
  );
  await fixture.pool.query(
    "INSERT INTO categories(id,name,color,icon) VALUES($1,'Synthetic category','blue','tag')",
    [category],
  );
  await fixture.pool.query(
    "INSERT INTO credit_cards(id,name,issuer,last_four,credit_limit,limit_currency,closing_day,due_day,color,icon) VALUES($1,'Synthetic card','Bank','1234',1000,'UYU',20,5,'blue','card')",
    [card],
  );
  await fixture.pool.query(
    "INSERT INTO credit_card_statements(id,credit_card_id,cycle_start,cycle_end,due_at,closed_at,status) VALUES($1,$2,'2026-11-01','2026-11-30','2026-12-05','2026-11-30','open')",
    [statement, card],
  );
  await fixture.pool.query(
    "INSERT INTO goals(id,name,target_amount,currency,color,icon) VALUES($1,'Synthetic UYU goal',100,'UYU','blue','flag'),($2,'Synthetic EUR goal',10,'EUR','blue','flag'),($3,'Synthetic unknown goal',10,'BRL','blue','flag'),($4,'Synthetic primary missing FX',100,'UYU','blue','flag')",
    [goal, eurGoal, missingGoal, primaryMissingGoal],
  );
  await fixture.pool.query(
    "INSERT INTO exchange_rates(from_currency,to_currency,rate,date) VALUES('USD','UYU',39,'2026-10-01'),('USD','UYU',40,'2026-11-10'),('EUR','USD',2,'2026-10-01')",
  );
  await fixture.pool.query(
    "INSERT INTO records(id,type,amount,currency,account_id,account_amount,category_id,payment_type,payment_status,exchange_rate_to_primary,occurred_at) VALUES($1,'expense',2,'USD',$2,80,$3,'debit','needs_review',40,'2026-11-01T12:00:00Z'),($4,'expense',1,'USD',$5,1,$3,'debit','needs_review',0,'2026-11-01T13:00:00Z')",
    [expense, bank, category, missing, usd],
  );
  await fixture.pool.query(
    `INSERT INTO records(type,amount,currency,account_id,destination_account_id,account_amount,destination_amount,category_id,payment_type,payment_status,exchange_rate_to_primary,occurred_at,deleted_at) VALUES
    ('income',100,'UYU',$1,NULL,NULL,NULL,$3,'debit','cleared',1,'2026-11-01T10:00:00Z',NULL),
    ('transfer',1,'USD',$2,$1,1,40,NULL,'transfer','cleared',40,'2026-11-01T11:00:00Z',NULL),
    ('income',5,'UYU',$1,NULL,NULL,NULL,$3,'debit','cleared',1,'2030-01-01T12:00:00Z',NULL),
    ('expense',999,'UYU',$1,NULL,NULL,NULL,$3,'debit','cancelled',1,'2026-11-01T12:00:00Z',NULL),
    ('expense',888,'UYU',$1,NULL,NULL,NULL,$3,'debit','cleared',1,'2026-11-01T12:00:00Z',now())`,
    [bank, usd, category],
  );
  await fixture.pool.query(
    "INSERT INTO credit_card_records(id,credit_card_id,statement_id,kind,amount,currency,amount_in_limit_currency,exchange_rate_to_limit_currency,category_id,account_id,account_amount,account_impact_at_creation,occurred_at) VALUES($1,$2,$3,'purchase',100,'UYU',100,1,$4,$5,100,true,'2026-11-01T12:00:00Z'),($6,$2,$3,'purchase',50,'UYU',50,1,$4,$5,50,true,'2026-11-01T13:00:00Z')",
    [purchase, card, statement, category, bank, second],
  );
  await fixture.pool.query(
    "INSERT INTO credit_card_records(credit_card_id,statement_id,kind,original_record_id,amount,currency,amount_in_limit_currency,exchange_rate_to_limit_currency,category_id,account_impact_at_creation,occurred_at) VALUES($1,$2,'refund',$3,80,'UYU',80,1,$4,false,'2026-11-03T12:00:00Z')",
    [card, statement, purchase, category],
  );
  await fixture.pool.query(
    "INSERT INTO credit_card_records(credit_card_id,statement_id,wallet_record_id,kind,amount,currency,amount_in_limit_currency,exchange_rate_to_limit_currency,category_id,account_id,account_amount,account_impact_at_creation,occurred_at) VALUES($1,$2,$3,'purchase',2,'USD',80,40,$4,$5,80,true,'2026-11-06T12:00:00Z')",
    [card, statement, expense, category, bank],
  );
  await fixture.pool.query(
    "INSERT INTO credit_card_payments(id,credit_card_id,statement_id,amount,currency,amount_in_limit_currency,account_id,account_amount,occurred_at) VALUES($1,$2,$3,40,'UYU',40,$4,40,'2026-11-02T12:00:00Z')",
    [payment, card, statement, bank],
  );
  await fixture.pool.query(
    "INSERT INTO credit_card_payment_allocations(payment_id,credit_card_record_id,amount,amount_in_limit_currency) VALUES($1,$2,40,40)",
    [payment, purchase],
  );
  await fixture.pool.query(
    "INSERT INTO goal_reservation_movements(goal_id,account_id,type,amount,currency,created_at) VALUES($1,$2,'reserve',10,'UYU','2026-11-01T12:00:00Z'),($1,$2,'release',3,'UYU','2026-11-03T12:00:00Z'),($3,$2,'reserve',0.01,'UYU','2026-11-01T12:00:00Z')",
    [goal, bank, eurGoal],
  );
  await fixture.pool.query(
    "INSERT INTO record_goals(record_id,goal_id,allocated_amount) VALUES($1,$2,1),($1,$3,0.5),($1,$4,0.25),($5,$6,1)",
    [expense, goal, eurGoal, missingGoal, missing, primaryMissingGoal],
  );
  await fixture.pool.query(
    "INSERT INTO records(type,amount,currency,account_id,category_id,payment_type,payment_status,exchange_rate_to_primary,occurred_at) VALUES('income',11,'UYU',$1,$2,'debit','cleared',1,'2026-11-02T04:30:00Z'),('income',13,'UYU',$1,$2,'debit','cleared',1,'2026-11-02T05:30:00Z')",
    [bank, category],
  );
  await fixture.pool.query(
    "INSERT INTO accounts(id,name,type,currency,initial_balance,color,icon) VALUES($1,'Synthetic rounding bank','bank','UYU',1000,'blue','bank')",
    [tieBank],
  );
  await fixture.pool.query(
    "INSERT INTO credit_cards(id,name,issuer,last_four,credit_limit,limit_currency,closing_day,due_day,color,icon) VALUES($1,'Synthetic rounding card','Bank','5678',1000,'USD',20,5,'blue','card')",
    [tieCard],
  );
  await fixture.pool.query(
    "INSERT INTO credit_card_records(credit_card_id,kind,amount,currency,amount_in_limit_currency,exchange_rate_to_limit_currency,category_id,account_id,account_amount,account_impact_at_creation,occurred_at) VALUES($1,'purchase',2,'USD',2,1,$2,$3,2.01,true,'2026-11-01T12:00:00Z')",
    [tieCard, category, tieBank],
  );
  // A legacy payment without allocations must release the proportional reserve.
  await fixture.pool.query(
    "INSERT INTO credit_card_payments(credit_card_id,amount,currency,amount_in_limit_currency,occurred_at) VALUES($1,1,'USD',1,'2026-11-02T12:00:00Z')",
    [tieCard],
  );
}, 30_000);
afterAll(async () => {
  await fixture?.close();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
const wire = (value: number) => (Number.isFinite(value) ? value : null);
test("account SQL aggregates preserve frozen transfers, review impact, refund-credit releases and unknown FX without history payloads", async () => {
  const expected = calculateAccountBalances(await getWalletDataset(createDb()));
  let calls = 0;
  const previous = neonConfig.fetchFunction!;
  neonConfig.fetchFunction = (input: string, init: RequestInit) => {
    calls++;
    return previous(input, init);
  };
  try {
    const actual = await getAccountBalanceMetrics(
      createDb(),
      { timeZone: "America/Montevideo" },
      now,
    );
    expect(calls).toBe(1);
    expect(actual.find((row) => row.accountId === tieBank)?.balance).toBe(999);
    for (const row of expected) {
      const result = actual.find((item) => item.accountId === row.account.id)!;
      expect(result).not.toHaveProperty("records");
      for (const field of [
        "balance",
        "totalBalance",
        "reserved",
        "freeBalance",
        "balanceInPrimary",
        "totalBalanceInPrimary",
      ] as const) {
        if (Number.isFinite(row[field])) expect(result[field]).toBeCloseTo(row[field], 10);
        else expect(result[field]).toBeNull();
      }
    }
  } finally {
    neonConfig.fetchFunction = previous;
  }
});
test("historical account balances use the viewer's calendar cutoff and the reservation ledger at that date", async () => {
  const data = await getWalletDataset(createDb());
  for (const cutoff of ["2026-11-01", "2026-11-02", "2026-11-03"]) {
    const actual = await getAccountBalanceMetrics(
      createDb(),
      { cutoff, timeZone: "America/Montevideo" },
      now,
    );
    for (const account of data.accounts)
      expect(actual.find((row) => row.accountId === account.id)?.balance).toBeCloseTo(
        calculateAccountBalanceAtDate(data, account.id, cutoff),
        10,
      );
  }
});
test("goal SQL aggregates preserve allocated portions, frozen account/primary FX, inverse bridges and unresolved rates", async () => {
  const expected = calculateGoalProgress(await getWalletDataset(createDb()));
  const actual = await getGoalProgressMetrics(createDb(), now);
  for (const row of expected) {
    const result = actual.find((item) => item.goalId === row.goal.id)!;
    expect(result.hasMissingExchangeRate).toBe(row.hasMissingExchangeRate);
    for (const field of [
      "reserved",
      "spent",
      "committed",
      "remaining",
      "overTarget",
      "percentage",
    ] as const) {
      const value = wire(row[field]);
      if (value === null) expect(result[field]).toBeNull();
      else expect(result[field]).toBeCloseTo(value, 10);
    }
  }
});

test("account cutoffs follow a 25-hour viewer calendar day across DST", async () => {
  vi.stubEnv("TZ", "America/New_York");
  try {
    const dataset = await getWalletDataset(createDb());
    const result = await getAccountBalanceMetrics(
      createDb(),
      { cutoff: "2026-11-01", timeZone: "America/New_York" },
      now,
    );
    for (const account of dataset.accounts)
      expect(result.find((row) => row.accountId === account.id)?.balance).toBeCloseTo(
        calculateAccountBalanceAtDate(dataset, account.id, "2026-11-01"),
        10,
      );
  } finally {
    vi.stubEnv("TZ", "America/Montevideo");
  }
});
