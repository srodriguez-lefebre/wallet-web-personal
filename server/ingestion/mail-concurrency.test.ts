import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createPostgresTestDatabase } from "../../scripts/sandbox/postgres-test.js";
import { processMailIngestion } from "./process-mail-ingestion.js";
import type { MailIngestionInput } from "../../shared/schemas.js";

let fixture: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
const accountId=randomUUID(), cardId=randomUUID(), categoryId=randomUUID(), merchantId=randomUUID();
beforeAll(async()=>{fixture=await createPostgresTestDatabase();},60_000);
afterAll(async()=>{await fixture?.close();});
beforeEach(async()=>{
  vi.restoreAllMocks();
  await fixture.pool.query("TRUNCATE accounts, categories, credit_cards, settings CASCADE");
  await fixture.pool.query("INSERT INTO accounts(id,name,type,currency,initial_balance,color,icon) VALUES($1,'Test','bank','UYU',500,'blue','bank')",[accountId]);
  await fixture.pool.query("INSERT INTO categories(id,name,color,icon) VALUES($1,'Test','blue','bank')",[categoryId]);
  await fixture.pool.query("INSERT INTO merchants(id,name,category_id) VALUES($1,'Test',$2)",[merchantId,categoryId]);
  await fixture.pool.query("INSERT INTO merchant_aliases(merchant_id,alias,normalized_alias) VALUES($1,'Test','test')",[merchantId]);
  await fixture.pool.query("INSERT INTO credit_cards(id,name,issuer,last_four,credit_limit,limit_currency,closing_day,due_day,color,icon,is_active) VALUES($1,'Test','Test','1234',1000,'UYU',20,5,'blue','bank',true)",[cardId]);
  await fixture.pool.query("INSERT INTO settings(primary_currency) VALUES('UYU')");
});

function input(source: MailIngestionInput["transaction"]["source"]):MailIngestionInput{
  return {idempotencyKey:randomUUID(),integration:{name:"gmail_apps_script",version:"test"},email:{provider:"gmail",messageId:randomUUID(),threadId:randomUUID(),subject:"Test",from:"test@example.com",date:"2026-02-01T12:00:00Z"},transaction:{source,sourceLabel:"Test",occurredAt:"2026-02-01T12:00:00Z",amount:50,currency:"UYU",merchantRaw:"Test",cardAlias:"Test",cardBrand:"VISA",cardNumber:"1234",paymentType:"credit_card"},destination:{accountId,creditCardId:cardId}};
}

async function overlap(first:MailIngestionInput,second:MailIngestionInput){
  const blocker=await fixture.pool.connect();
  await blocker.query("BEGIN");
  await blocker.query("SELECT id FROM credit_cards WHERE id=$1 FOR UPDATE",[cardId]);
  const result=Promise.all([processMailIngestion(first),processMailIngestion(second)]);
  void result.catch(()=>{});
  try {
    let waiting=0;
    for(let attempt=0;attempt<200&&waiting<2;attempt++){
      const state=await fixture.pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'");
      waiting=state.rows[0].n;
      if(waiting<2)await new Promise(resolve=>setTimeout(resolve,25));
    }
    expect(waiting,"Both independent workers must reach their transaction before the card is unlocked").toBeGreaterThanOrEqual(2);
  }finally{await blocker.query("COMMIT");blocker.release();}
  return result;
}

test("concurrent cross-source duplicate creates one purchase and completes the other claim as duplicate",async()=>{
  const first=input("itau_credit_card"),second=input("google_wallet");
  const results=await overlap(first,second);
  expect(results.map(result=>result.status).sort()).toEqual(["created","duplicate"]);
  expect((await fixture.pool.query("SELECT * FROM records")).rows).toHaveLength(1);
  expect((await fixture.pool.query("SELECT * FROM credit_card_records")).rows).toHaveLength(1);
  expect((await fixture.pool.query("SELECT status,action FROM ingestion_events ORDER BY action")).rows).toEqual([{status:"completed",action:"created"},{status:"completed",action:"duplicate"}]);
  expect((await processMailIngestion(second)).status).toBe("already_processed");
});

test("same-source purchases and cross-source purchases outside the duplicate window remain distinct",async()=>{
  expect((await overlap(input("itau_credit_card"),input("itau_credit_card"))).map(result=>result.status)).toEqual(["created","created"]);
  const later=input("google_wallet");later.transaction.occurredAt="2026-02-01T12:11:00Z";
  expect((await processMailIngestion(later)).status).toBe("created");
  expect((await fixture.pool.query("SELECT * FROM records")).rows).toHaveLength(3);
});
