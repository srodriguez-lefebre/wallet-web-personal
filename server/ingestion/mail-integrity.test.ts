import { afterAll,beforeAll,beforeEach,expect,test,vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createPostgresTestDatabase } from "../../scripts/sandbox/postgres-test.js";
import { processMailIngestion } from "./process-mail-ingestion.js";
import * as classification from "./openai-category.js";
import { createGoal,createGoalReservation,getWalletDataset } from "../db/wallet-repository.js";
import { mailIngestionSchema, type MailIngestionInput } from "../../shared/schemas.js";
import { resolveFrozenRate } from "./exchange-rates.js";
import { createDb } from "../db/client.js";
import { calculateAccountBalances, calculateCreditCardSummary, calculateSummary } from "../../shared/calculations.js";
import { walletDataHealth } from "../../shared/data-quality.js";

let fixture:Awaited<ReturnType<typeof createPostgresTestDatabase>>;
const accountId=randomUUID(),cardId=randomUUID(),knownCategoryId=randomUUID();
beforeAll(async()=>{fixture=await createPostgresTestDatabase();},60_000);
afterAll(async()=>{await fixture?.close();});
beforeEach(async()=>{
  vi.restoreAllMocks();
  await fixture.pool.query("TRUNCATE ingestion_events,records,accounts,credit_cards,goals,settings,exchange_rates,merchants CASCADE");
  await fixture.pool.query("INSERT INTO accounts(id,name,type,currency,initial_balance,color,icon) VALUES($1,'Test','bank','UYU',500,'blue','bank')",[accountId]);
  await fixture.pool.query("INSERT INTO credit_cards(id,name,issuer,last_four,credit_limit,limit_currency,closing_day,due_day,color,icon,is_active) VALUES($1,'Test','Test','1234',1000,'UYU',20,5,'blue','bank',true)",[cardId]);
  await fixture.pool.query("INSERT INTO settings(primary_currency) VALUES('UYU')");
  await fixture.pool.query("INSERT INTO categories(id,name,color,icon) VALUES($1,'Restaurant, fast-food','blue','bank') ON CONFLICT(id) DO NOTHING",[knownCategoryId]);
  vi.spyOn(classification,"inferCategoryWithOpenAi").mockResolvedValue(knownCategoryId);
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

function bankInput(paymentType: "debit" | "transfer", destinationAccountId?: string): MailIngestionInput {
  const event=input();
  return mailIngestionSchema.parse({...event,
    transaction:{...event.transaction,source:`itau_${paymentType}`,paymentType,cardNumber:"1234",accountNumber:"****7777",destinationAccountNumber:paymentType==="transfer"?"123456789012":undefined,destinationBank:paymentType==="transfer"?"Test bank":undefined},
    destination:{accountId,destinationAccountId},
  });
}

test("debit notices debit the mapped bank account without matching a credit card with the same last four",async()=>{
  const event=bankInput("debit");
  expect((await processMailIngestion(event)).status).toBe("created");
  expect((await processMailIngestion(event)).status).toBe("already_processed");
  const dataset=await getWalletDataset();
  expect(dataset.records).toHaveLength(1);
  expect(dataset.records[0]).toMatchObject({type:"expense",accountId,accountAmount:50,paymentType:"debit",paymentStatus:"cleared"});
  expect(dataset.records[0].creditCardId).toBeUndefined();
  expect(dataset.creditCardRecords).toHaveLength(0);
  expect(calculateAccountBalances(dataset)[0].totalBalance).toBe(450);
});

test("a debit notice without an account mapping stays reviewable without guessing a bank account",async()=>{
  const event=bankInput("debit");event.destination={};
  expect((await processMailIngestion(event)).status).toBe("needs_review");
  const dataset=await getWalletDataset();
  expect(dataset.records[0]).toMatchObject({paymentType:"debit",paymentStatus:"needs_review"});
  expect(dataset.records[0].accountId).toBeUndefined();
  expect(calculateAccountBalances(dataset)[0].totalBalance).toBe(500);
  expect(dataset.creditCardRecords).toHaveLength(0);
});

test("inactive bank mappings are not used for debit notices",async()=>{
  await fixture.pool.query("UPDATE accounts SET is_active=false WHERE id=$1",[accountId]);
  expect((await processMailIngestion(bankInput("debit"))).status).toBe("needs_review");
  expect((await getWalletDataset()).records[0].accountId).toBeUndefined();
});

test("a bank account deactivated during ingestion cannot receive a cleared debit",async()=>{
  let reached:()=>void=()=>{},release:(value:null)=>void=()=>{};
  const entered=new Promise<void>(resolve=>{reached=resolve;});
  const stalled=new Promise<null>(resolve=>{release=resolve;});
  vi.mocked(classification.inferCategoryWithOpenAi).mockImplementationOnce(()=>{reached();return stalled;});
  const attempt=processMailIngestion(bankInput("debit"));
  const outcome=attempt.then(()=>"created",()=>"rejected");
  await entered;
  await fixture.pool.query("UPDATE accounts SET is_active=false WHERE id=$1",[accountId]);
  release(null);
  expect(await outcome).toBe("rejected");
  expect((await getWalletDataset()).records).toHaveLength(0);
  expect((await fixture.pool.query("SELECT id FROM ingestion_events")).rows).toHaveLength(0);
});

test("a positively mapped owned transfer moves both balances once without creating expenses or card activity",async()=>{
  const destinationAccountId=randomUUID();
  await fixture.pool.query("INSERT INTO accounts(id,name,type,currency,initial_balance,color,icon) VALUES($1,'Savings','bank','UYU',100,'blue','bank')",[destinationAccountId]);
  const event=bankInput("transfer",destinationAccountId);
  expect((await processMailIngestion(event)).status).toBe("created");
  expect((await processMailIngestion(event)).status).toBe("already_processed");
  const dataset=await getWalletDataset();
  expect(dataset.records).toHaveLength(1);
  expect(dataset.records[0]).toMatchObject({type:"transfer",accountId,accountAmount:50,destinationAccountId,destinationAmount:50,paymentType:"transfer",paymentStatus:"cleared"});
  const balances=new Map(calculateAccountBalances(dataset).map(row=>[row.account.id,row.totalBalance]));
  expect(balances.get(accountId)).toBe(450);expect(balances.get(destinationAccountId)).toBe(150);
  expect(calculateSummary(dataset,"2026-02").expenses).toBe(0);
  expect(dataset.creditCardRecords).toHaveLength(0);
});

test("owned transfers freeze source and destination amounts in their currencies",async()=>{
  const destinationAccountId=randomUUID();
  await fixture.pool.query("INSERT INTO accounts(id,name,type,currency,initial_balance,color,icon) VALUES($1,'Dollar savings','bank','USD',0,'blue','bank')",[destinationAccountId]);
  await fixture.pool.query("INSERT INTO exchange_rates(from_currency,to_currency,rate,date) VALUES('UYU','USD',0.025,'2026-01-01')");
  const event=bankInput("transfer",destinationAccountId);
  expect((await processMailIngestion(event)).status).toBe("created");
  expect((await getWalletDataset()).records[0]).toMatchObject({accountAmount:50,destinationAmount:1.25});
});

test("missing destination FX preserves an owned transfer without inventing dollars or counting it as an expense",async()=>{
  const destinationAccountId=randomUUID();
  await fixture.pool.query("INSERT INTO accounts(id,name,type,currency,initial_balance,color,icon) VALUES($1,'Dollar savings','bank','USD',10,'blue','bank')",[destinationAccountId]);
  vi.spyOn(globalThis,"fetch").mockRejectedValue(new Error("Offline"));
  expect((await processMailIngestion(bankInput("transfer",destinationAccountId))).status).toBe("needs_review");
  const dataset=await getWalletDataset();
  expect(dataset.records[0]).toMatchObject({type:"transfer",accountId,accountAmount:50,destinationAccountId,paymentStatus:"needs_review"});
  expect(dataset.records[0].destinationAmount).toBeUndefined();
  expect(calculateAccountBalances(dataset).find(row=>row.account.id===destinationAccountId)?.totalBalance).toBe(10);
  expect(calculateSummary(dataset,"2026-02").expenses).toBe(0);
});

test("same-amount bank and unmatched credit notices remain distinct across sources",async()=>{
  const credit=input();credit.destination={accountId};credit.transaction.cardNumber="9999";
  expect((await processMailIngestion(credit)).status).toBe("needs_review");
  expect((await processMailIngestion(bankInput("debit"))).status).toBe("created");
  expect((await getWalletDataset()).records).toHaveLength(2);
});

test("unmapped transfer destinations preserve outgoing money and flag ownership for review",async()=>{
  const result=await processMailIngestion(bankInput("transfer"));
  expect(result.status).toBe("needs_review");
  expect(result.warnings?.join(" ")).toMatch(/ownership/i);
  const dataset=await getWalletDataset();
  expect(dataset.records[0]).toMatchObject({type:"expense",accountId,accountAmount:50,paymentType:"transfer",paymentStatus:"needs_review"});
  expect(dataset.records[0].destinationAccountId).toBeUndefined();
  expect(calculateAccountBalances(dataset)[0].totalBalance).toBe(450);
  const metadata=(await fixture.pool.query("SELECT sanitized_payload FROM ingestion_events")).rows[0].sanitized_payload;
  expect(JSON.stringify(metadata)).not.toContain("123456789012");
  expect(metadata.transaction.destinationAccountNumber).toBe("****9012");
});

test("an invalid configured owned destination cannot become a third-party expense",async()=>{
  const event=bankInput("transfer",randomUUID());
  await expect(processMailIngestion(event)).rejects.toThrow(/destination/i);
  expect((await getWalletDataset()).records).toHaveLength(0);
  expect((await fixture.pool.query("SELECT id FROM ingestion_events")).rows).toHaveLength(0);
});

test("bank payloads reject credit-card assignments and same-account transfers",()=>{
  const event=bankInput("debit");
  expect(mailIngestionSchema.safeParse({...event,destination:{accountId,creditCardId:cardId}}).success).toBe(false);
  expect(mailIngestionSchema.safeParse({...event,transaction:{...event.transaction,paymentType:"transfer"},destination:{accountId,destinationAccountId:accountId}}).success).toBe(false);
});
