import { afterAll,beforeAll,expect,test } from "vitest";
import { createServer,type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { createPostgresTestDatabase } from "../../scripts/sandbox/postgres-test.js";
import { serveWalletApi } from "../../scripts/sandbox/http.js";
import { findApiOperation } from "../../shared/api-contract.js";
import { walletBackupSchema } from "../../shared/schemas.js";
import { restoreWalletBackup } from "../db/wallet-restore.js";
import { getWalletDataset } from "../db/wallet-repository.js";

let fixture:Awaited<ReturnType<typeof createPostgresTestDatabase>>,server:Server,url:string,token:string;
const accountId=randomUUID(), categoryId=randomUUID();
beforeAll(async()=>{
  fixture=await createPostgresTestDatabase();
  process.env.API_TOKEN="local-contract-test";process.env.SESSION_SECRET="local-contract-test";
  await fixture.pool.query("INSERT INTO accounts(id,name,type,currency,initial_balance,color,icon) VALUES($1,'Test','bank','UYU',500,'blue','bank')",[accountId]);
  await fixture.pool.query("INSERT INTO categories(id,name,color,icon) VALUES($1,'Test','blue','bank')",[categoryId]);
  server=createServer((req,res)=>{void serveWalletApi(req,res);});
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const address=server.address(); if(!address||typeof address==="string")throw new Error("Missing port");url=`http://127.0.0.1:${address.port}`;
  const response=await fetch(`${url}/api/auth/unlock`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:"local-contract-test"})});
  const payload=await response.json() as {data:{token:string}};expect(response.status).toBe(200);token=payload.data.token;
},60_000);
afterAll(async()=>{await new Promise<void>(resolve=>server?.close(()=>resolve()));await fixture?.close();delete process.env.API_TOKEN;delete process.env.SESSION_SECRET;});
async function request(path:string,method="GET",input?:unknown){
  const response=await fetch(url+path,{method,headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:input===undefined?undefined:JSON.stringify(input)});
  const payload=await response.json() as {data:Record<string,unknown>;error:unknown};
  if(response.ok){const operation=findApiOperation(method,path.split("?")[0]);expect(operation).toBeDefined();const parsed=operation!.response.safeParse(payload.data);expect(parsed.success,JSON.stringify(parsed.error?.issues)).toBe(true);expect(payload.error).toBeNull();}
  return {response,payload};
}

test("authenticated template CRUD persists through HTTP reload and never creates financial records",async()=>{
  const before=(await getWalletDataset()).records.length;
  const template={name:"Template groceries",type:"expense",amount:25,currency:"UYU",accountId,categoryId,paymentType:"debit"};
  const created=await request("/api/record-templates","POST",template);
  expect(created.response.status).toBe(201);
  const id=created.payload.data.id;
  expect((await request("/api/record-templates")).payload.data).toContainEqual(expect.objectContaining({...template,id}));
  expect((await request(`/api/record-templates/${id}`,"PATCH",{note:"Test"})).payload.data).toMatchObject({...template,id,note:"Test"});
  expect((await request("/api/wallet")).payload.data.recordTemplates).toContainEqual(expect.objectContaining({id,note:"Test"}));
  expect((await getWalletDataset()).records).toHaveLength(before);
  const duplicate=await request("/api/record-templates","POST",{...template,name:" template GROCERIES "});
  expect(duplicate.response.status).toBe(409);
  expect(duplicate.payload.error).toMatchObject({code:"CONFLICT",message:expect.stringMatching(/template.*name/i)});
  expect((await request(`/api/record-templates/${id}`,"PATCH",{accountId:randomUUID()})).response.status).toBe(422);
  expect((await request(`/api/record-templates/invalid`,"PATCH",{note:"Test"})).response.status).toBe(400);
  expect((await request(`/api/record-templates/${id}`,"DELETE")).response.status).toBe(200);
  expect((await request(`/api/record-templates/${id}`,"PATCH",{note:"Test"})).response.status).toBe(404);
  const anonymous=await fetch(url+"/api/record-templates");expect(anonymous.status).toBe(401);
});
test("authenticated real HTTP routes match concrete response contracts",async()=>{
  expect((await request("/api/health")).response.status).toBe(200);
  const created=await request("/api/records","POST",{type:"expense",amount:25,currency:"UYU",accountId,categoryId,paymentType:"debit",paymentStatus:"cleared",exchangeRateToPrimary:1,occurredAt:"2026-02-01T12:00:00Z",tagIds:[]});
  expect(created.response.status).toBe(201);
  const id=created.payload.data.id;
  expect((await request(`/api/records/${id}`,"PATCH",{note:"Updated"})).response.status).toBe(200);
  expect((await request("/api/records?limit=1")).payload.data.items).toHaveLength(1);
  expect((await request("/api/wallet/bootstrap","POST",{recordsLimit:1})).response.status).toBe(200);
  expect((await request("/api/wallet")).response.status).toBe(200);
});
test("bad credentials and nested invalid IDs return envelopes instead of routing or database leaks",async()=>{
  const wrong=await fetch(url+"/api/auth/unlock",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:"wrong"})});expect(wrong.status).toBe(401);
  const nested=await request("/api/records/invalid","PATCH",{note:"Test"});expect(nested.response.status).toBe(400);expect(nested.payload.data).toBeNull();
});

test("account activity includes transfers received as well as transfers sent",async()=>{
  const destinationId=randomUUID();
  await fixture.pool.query("INSERT INTO accounts(id,name,type,currency,initial_balance,color,icon) VALUES($1,'Destination','bank','UYU',0,'blue','bank')",[destinationId]);
  const transfer=await request("/api/records","POST",{type:"transfer",amount:25,currency:"UYU",accountId,destinationAccountId:destinationId,paymentType:"transfer",paymentStatus:"cleared",exchangeRateToPrimary:1,occurredAt:"2026-02-02T12:00:00Z",tagIds:[]});
  expect(transfer.response.status).toBe(201);
  const received=await request(`/api/records?accountId=${destinationId}`);
  expect(received.payload.data.items).toEqual([expect.objectContaining({id:transfer.payload.data.id,destinationAccountId:destinationId})]);
  const sent=await request(`/api/records?accountId=${accountId}`);
  expect(sent.payload.data.items).toContainEqual(expect.objectContaining({id:transfer.payload.data.id}));
});
test("confirmed backup restore persists associations and rolls back every write on failure",async()=>{
  const before=await getWalletDataset();expect(walletBackupSchema.safeParse(before).success).toBe(true);
  const restored=await request("/api/wallet/restore","POST",before);expect(restored.response.status).toBe(200);
  expect((await getWalletDataset()).records).toEqual(before.records);
  const broken=structuredClone(before);broken.categories[0].parentId=randomUUID();
  await expect(restoreWalletBackup(broken)).rejects.toThrow();
  expect((await getWalletDataset()).records).toEqual(before.records);
  expect((await getWalletDataset()).accounts).toEqual(before.accounts);
});
