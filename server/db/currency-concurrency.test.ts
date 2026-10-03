import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { createPostgresTestDatabase } from "../../scripts/sandbox/postgres-test.js";

let fixture:Awaited<ReturnType<typeof createPostgresTestDatabase>>;
const accountId=randomUUID(),categoryId=randomUUID();
beforeAll(async()=>{fixture=await createPostgresTestDatabase();},60_000);
afterAll(async()=>{await fixture?.close();});
beforeEach(async()=>{
  await fixture.pool.query("TRUNCATE accounts, categories CASCADE");
  await fixture.pool.query("INSERT INTO accounts(id,name,type,currency,initial_balance,color,icon) VALUES($1,'Empty account','bank','UYU',0,'blue','bank')",[accountId]);
  await fixture.pool.query("INSERT INTO categories(id,name,color,icon) VALUES($1,'Test','blue','bank')",[categoryId]);
});
const insertSql="INSERT INTO records(type,amount,currency,account_id,category_id,payment_type,payment_status,exchange_rate_to_primary,occurred_at) VALUES('expense',100,'UYU',$1,$2,'debit','cleared',1,now())";

async function waitsForLock(settled:()=>boolean){
  for(let attempt=0;attempt<200&&!settled();attempt++){
    const result=await fixture.pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'");
    if(result.rows[0].n>0)return true;
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  return false;
}

test("currency change waits for a first record and then rejects relabeling its bank amount",async()=>{
  const insertion=await fixture.pool.connect();
  await insertion.query("BEGIN");
  await insertion.query(insertSql,[accountId,categoryId]);
  let settled=false;
  const changing=fixture.pool.query("UPDATE accounts SET currency='USD' WHERE id=$1",[accountId]).then(()=>({code:"accepted"}),error=>({code:error.code as string})).finally(()=>{settled=true;});
  let waiting=false;
  try{waiting=await waitsForLock(()=>settled);}finally{await insertion.query("COMMIT");insertion.release();}
  const outcome=await changing;
  expect(waiting,"The currency update must wait for the uncommitted financial record").toBe(true);
  expect(outcome.code).toBe("23514");
  expect((await fixture.pool.query("SELECT currency FROM accounts WHERE id=$1",[accountId])).rows[0].currency).toBe("UYU");
  expect((await fixture.pool.query("SELECT * FROM records")).rows).toHaveLength(1);
});

test("a first record waits for a currency change and validates the newly committed account currency",async()=>{
  const changing=await fixture.pool.connect();
  await changing.query("BEGIN");
  await changing.query("UPDATE accounts SET currency='USD' WHERE id=$1",[accountId]);
  let settled=false;
  const insertion=fixture.pool.query(insertSql,[accountId,categoryId]).then(()=>({code:"accepted"}),error=>({code:error.code as string})).finally(()=>{settled=true;});
  let waiting=false;
  try{waiting=await waitsForLock(()=>settled);}finally{await changing.query("COMMIT");changing.release();}
  const outcome=await insertion;
  expect(waiting,"The record must wait before validating the account's currency").toBe(true);
  expect(outcome.code).toBe("23514");
  expect((await fixture.pool.query("SELECT currency FROM accounts WHERE id=$1",[accountId])).rows[0].currency).toBe("USD");
  expect((await fixture.pool.query("SELECT * FROM records")).rows).toHaveLength(0);
});
