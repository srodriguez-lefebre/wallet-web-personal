import { expect, test } from "vitest";
import { mockWalletData } from "./mock-data";
import type { WalletRecord } from "./types";
import { reportDataset } from "../src/lib/preferences";
import { calculateMerchantSpending } from "./merchant-analytics";

const range={from:"2026-02-01",to:"2026-02-28"};
function record(id:string,patch:Partial<WalletRecord>={}):WalletRecord{
  return {...mockWalletData.records[0],id,type:"expense",amount:10,currency:"USD",exchangeRateToPrimary:40,occurredAt:"2026-02-02T12:00:00Z",counterpartyName:"Corner Store",paymentStatus:"cleared",...patch};
}
test("merchant frequency and average use the recorded primary conversion rather than current rates",()=>{
  const records=[record("a"),record("b",{counterpartyName:"  CORNER STORE ",amount:100,currency:"UYU",exchangeRateToPrimary:1}),record("c",{counterpartyName:"Other",amount:1})];
  expect(calculateMerchantSpending(records,range)).toEqual([
    {key:"corner store",name:"Corner Store",purchases:2,total:500,average:250},
    {key:"other",name:"Other",purchases:1,total:40,average:40},
  ]);
});
test("only financial purchases in the selected range contribute to the gross merchant totals",()=>{
  const records=[record("keep"),record("draft",{paymentStatus:"needs_review"}),record("cancel",{paymentStatus:"cancelled"}),record("income",{type:"income"}),record("transfer",{type:"transfer"}),record("old",{occurredAt:"2026-01-31T12:00:00Z"}),record("new",{occurredAt:"2026-03-01T12:00:00Z"})];
  expect(calculateMerchantSpending(records,range)).toEqual([{key:"corner store",name:"Corner Store",purchases:2,total:800,average:400}]);
});
test("merchant totals respect hidden-account preference and explicit account selection",()=>{
  const data=structuredClone(mockWalletData),visible=data.accounts[0],hidden=data.accounts[1];
  visible.isVisible=true;hidden.isVisible=false;data.settings.includeHiddenAccountsInReports=false;
  data.records=[record("visible",{accountId:visible.id}),record("hidden",{accountId:hidden.id,amount:20})];
  expect(calculateMerchantSpending(reportDataset(data).records,range)[0].total).toBe(400);
  expect(calculateMerchantSpending(reportDataset(data,hidden.id).records,range)[0].total).toBe(800);
  data.settings.includeHiddenAccountsInReports=true;
  expect(calculateMerchantSpending(reportDataset(data).records,range)[0].total).toBe(1200);
});
test("unnamed purchases remain visible and distinct merchant spelling is preserved",()=>{
  const rows=calculateMerchantSpending([record("a",{counterpartyName:undefined}),record("b",{counterpartyName:"  "}),record("c",{counterpartyName:"Cafe"}),record("d",{counterpartyName:"Café"})],range);
  expect(rows).toHaveLength(3);
  expect(rows[0]).toMatchObject({name:"Unspecified merchant",purchases:2,total:800});
  expect(calculateMerchantSpending([],range)).toEqual([]);
});
