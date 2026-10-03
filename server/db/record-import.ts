import { createHash } from "node:crypto";
import type { WalletRecord } from "../../shared/types.js";
import { recordFingerprint } from "../../shared/record-identity.js";
import { createDb,type DbClient } from "./client.js";
import { createRecordsBulk,getWalletDataset } from "./wallet-repository.js";

function importId(fingerprint:string){
  const bytes=createHash("sha256").update(`wallet-import-v1:${fingerprint}`).digest().subarray(0,16);
  bytes[6]=(bytes[6]&0x0f)|0x50;bytes[8]=(bytes[8]&0x3f)|0x80;
  const hex=bytes.toString("hex");return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
function isUniqueConflict(error:unknown){
  let current=error as {code?:string;cause?:unknown}|undefined;
  for(let depth=0;depth<5&&current;depth++,current=current.cause as typeof current)if(current.code==="23505")return true;
  return false;
}
/** Durable identities serialize competing copies; failed batches leave no orphan side effects. */
export async function importWalletRecords(inputs:Omit<WalletRecord,"id">[],db:DbClient=createDb()){
  for(let attempt=0;attempt<4;attempt++){
    const dataset=await getWalletDataset(db),seen=new Set(dataset.records.map(recordFingerprint));
    const pending=inputs.filter(input=>{const identity=recordFingerprint(input);if(seen.has(identity))return false;seen.add(identity);return true;});
    if(!pending.length)return [];
    try{return await createRecordsBulk(pending,db,pending.map(input=>importId(recordFingerprint(input))));}
    catch(error){if(!isUniqueConflict(error)||attempt===3)throw error;}
  }
  return [];
}
