import { afterAll,beforeAll,beforeEach,expect,test,vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createPostgresTestDatabase } from "../../scripts/sandbox/postgres-test.js";
import { processMailIngestion } from "./process-mail-ingestion.js";
import * as classification from "./openai-category.js";
import { createGoal,createGoalReservation,getWalletDataset } from "../db/wallet-repository.js";
import type { MailIngestionInput } from "../../shared/schemas.js";
import { resolveFrozenRate } from "./exchange-rates.js";
import { createDb } from "../db/client.js";
import { calculateAccountBalances, calculateCreditCardSummary, calculateSummary } from "../../shared/calculations.js";
import { walletDataHealth } from "../../shared/data-quality.js";

let fixture:Awaited<ReturnType<typeof createPostgresTestDatabase>>;
const accountId=randomUUID(),cardId=randomUUID();
beforeAll(async()=>{fixture=await createPostgresTestDatabase();},60_000);
afterAll(async()=>{await fixture?.close();});
beforeEach(async()=>{
  vi.restoreAllMocks();
  await fixture.pool.query("TRUNCATE ingestion_events,records,accounts,credit_cards,goals,settings,exchange_rates CASCADE");
  await fixture.pool.query("INSERT INTO accounts(id,name,type,currency,initial_balance,color,icon) VALUES($1,'Test','bank','UYU',500,'blue','bank')",[accountId]);
  await fixture.pool.query("INSERT INTO credit_cards(id,name,issuer,last_four,credit_limit,limit_currency,closing_day,due_day,color,icon,is_active) VALUES($1,'Test','Test','1234',1000,'UYU',20,5,'blue','bank',true)",[cardId]);
  await fixture.pool.query("INSERT INTO settings(primary_currency) VALUES('UYU')");
  vi.spyOn(classification,"inferCategoryWithOpenAi").mockResolvedValue(null);
});
function input():MailIngestionInput{
  const messageId=randomUUID();
  return {idempotencyKey:`gmail:test:${messageId}`,integration:{name:"gmail_apps_script",version:"test"},email:{provider:"gmail",messageId,threadId:randomUUID(),subject:"Test",from:"test@example.com",date:"2026-02-01T12:00:00Z"},transaction:{source:"itau_credit_card",sourceLabel:"Test",occurredAt:"2026-02-01T12:00:00Z",amount:50,currency:"UYU",merchantRaw:"Test unknown merchant",cardAlias:"Test",cardBrand:"VISA",cardNumber:"1234",paymentType:"credit_card"},destination:{accountId,creditCardId:cardId}};
}
test("unknown cards stay under review without changing a valid account balance",async()=>{
  const event=input();event.destination.creditCardId=randomUUID();
  const result=await processMailIngestion(event);expect(result.status).toBe("needs_review");
  const dataset=await getWalletDataset();expect(dataset.records[0].accountId).toBeUndefined();expect(dataset.creditCardRecords).toHaveLength(0);
});

test("missing primary FX remains reviewable while known bank and card currency amounts count",async()=>{
  await fixture.pool.query("UPDATE settings SET primary_currency='EUR'");
  vi.spyOn(globalThis,"fetch").mockRejectedValue(new Error("Offline"));
  const result=await processMailIngestion(input());
  expect(result.status).toBe("needs_review");
  const dataset=await getWalletDataset();
  expect(dataset.records[0]).toMatchObject({paymentStatus:"needs_review",accountId,accountAmount:50,creditCardId:cardId,exchangeRateToPrimary:0});
  expect(dataset.creditCardRecords).toHaveLength(1);
  expect(calculateAccountBalances(dataset)[0].totalBalance).toBe(450);
  expect(calculateCreditCardSummary(dataset,dataset.creditCards.find(row=>row.id===cardId)!).usedLimit).toBe(50);
  expect(calculateSummary(dataset,"2026-02").expenses).toBe(0);
  expect(walletDataHealth(dataset).conversions).toBe(1);
});
test("zero-amount notifications are ignored without financial writes",async()=>{
  const event=input();event.transaction.amount=0;
  expect((await processMailIngestion(event)).status).toBe("ignored");expect((await getWalletDataset()).records).toHaveLength(0);
});
test("stored historical quotes take precedence without calling an external service",async()=>{
  await fixture.pool.query("INSERT INTO exchange_rates(from_currency,to_currency,rate,date) VALUES('USD','UYU',42,'2026-01-01')");
  const fetch=vi.spyOn(globalThis,"fetch").mockRejectedValue(new Error("Offline"));
  expect((await resolveFrozenRate(createDb(),"USD","UYU",new Date("2026-02-01")))?.rate).toBe(42);
  expect(fetch).not.toHaveBeenCalled();
});
test("mail records capture automatic goals and consume reserves only once after retry",async()=>{
  const goal=await createGoal({name:"Test",targetAmount:100,currency:"UYU",color:"blue",icon:"bank",isVisible:true,status:"active",autoCaptureEnabled:true,autoCaptureStart:"2026-02-01",autoCaptureEnd:"2026-02-28",autoReservationAccountId:accountId});
  await createGoalReservation({goalId:goal.id,accountId,amount:100,currency:"UYU",createdAt:"2026-02-01T10:00:00Z"});
  const event=input();await processMailIngestion(event);await processMailIngestion(event);
  const dataset=await getWalletDataset();expect(dataset.records).toHaveLength(1);expect(dataset.records[0].goalIds).toEqual([goal.id]);expect(dataset.goalReservations[0].amount).toBe(50);
});
test("a retry reclaims an abandoned lease and fences the expired original worker",async()=>{
  let release:(value:null)=>void=()=>{},entered:()=>void=()=>{};
  const reached=new Promise<void>(resolve=>{entered=resolve;});
  const stalled=new Promise<null>(resolve=>{release=resolve;});
  vi.mocked(classification.inferCategoryWithOpenAi).mockImplementationOnce(()=>{entered();return stalled;});
  const event=input(),original=processMailIngestion(event);
  // Attach a rejection observer before releasing the expired worker.
  const outcome=original.then(()=>"unexpected success",()=>"expired");
  await reached;
  await fixture.pool.query("UPDATE ingestion_events SET updated_at=now()-interval '10 minutes' WHERE idempotency_key=$1",[event.idempotencyKey]);
  expect((await processMailIngestion(event)).status).toBe("created");release(null);
  expect(await outcome).toBe("expired");
  const dataset=await getWalletDataset();expect(dataset.records).toHaveLength(1);expect(dataset.creditCardRecords).toHaveLength(1);
  expect((await fixture.pool.query("SELECT status FROM ingestion_events")).rows).toEqual([{status:"completed"}]);
});
