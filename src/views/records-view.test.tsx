import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { PropsWithChildren } from "react";
import { mockWalletData } from "../../shared/mock-data";
import { RecordsView } from "./records-view";

const state=vi.hoisted(()=>({dataset:undefined as unknown, update:vi.fn()}));
vi.mock("@/providers/wallet-provider",()=>({useWallet:()=>({dataset:state.dataset,selectedMonth:"2026-02",selectedPeriodMode:"month",selectedDateRange:{from:"2026-02-01",to:"2026-02-28"},recordFilters:{},setRecordFilters:vi.fn(),clearRecordFilters:vi.fn(),addRecord:vi.fn(),updateRecord:state.update,deleteRecord:vi.fn(),newRecordRequestId:0,consumeNewRecordRequest:vi.fn(),recordsPage:{hasMore:false},isLoadingMoreRecords:false,isSelectedRangeComplete:true,loadMoreRecords:vi.fn()})}));
vi.mock("@/lib/use-action-toast",()=>({useActionToast:()=>({toast:null,runAction:(action:()=>Promise<unknown>)=>action()})}));
vi.mock("@/components/wallet/category-picker",()=>({CategoryPicker:()=>null}));
vi.mock("@/components/ui/dialog",()=>{
  const Part=({children}:PropsWithChildren)=><div>{children}</div>;
  return {Dialog:({open,children}:PropsWithChildren<{open:boolean}>)=>open?<div>{children}</div>:null,DialogContent:Part,DialogDescription:Part,DialogHeader:Part,DialogTitle:Part};
});
vi.mock("@radix-ui/react-select",()=>{
  const Part=({children}:PropsWithChildren)=><div>{children}</div>;
  return Object.fromEntries(["Root","Trigger","Value","Icon","Portal","Content","Viewport","Item","ItemText","ItemIndicator"].map(name=>[name,Part]));
});

let tree:ReturnType<typeof create>|undefined;
beforeEach(()=>{vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);state.update.mockResolvedValue(undefined);});
afterEach(async()=>{if(tree)await act(async()=>tree!.unmount());tree=undefined;vi.unstubAllGlobals();vi.clearAllMocks();});
async function edit(amount:number,accountAmount:number){
  const dataset=structuredClone(mockWalletData),account=dataset.accounts[0];
  account.currency="UYU";
  dataset.settings.primaryCurrency="UYU";
  dataset.records=[{...dataset.records[0],id:"editing-test",type:"expense",currency:"USD",accountId:account.id,amount,accountAmount,creditCardId:undefined,exchangeRateToPrimary:41,occurredAt:"2026-02-01T12:00:00Z",goalIds:[],goalAssociations:[],tagIds:[],paymentType:"debit",paymentStatus:"cleared"}];
  dataset.exchangeRates=[{id:"test-rate",fromCurrency:"USD",toCurrency:"UYU",rate:40,date:"2026-01-01T12:00:00Z"}];
  state.dataset=dataset;
  await act(async()=>{tree=create(<RecordsView/>);});
  await act(async()=>{tree!.root.findByProps({role:"button",tabIndex:0}).props.onClick();});
}
async function changeAmount(value:string){
  await act(async()=>{tree!.root.findAllByType("input").find(input=>input.props.type==="number"&&input.props.placeholder==="0")!.props.onChange({target:{value}});});
}
async function submit(){await act(async()=>{await tree!.root.findByType("form").props.onSubmit({preventDefault:vi.fn()});});return state.update.mock.calls[0][1];}

test("clearing then retyping an edited amount retains its original bank conversion",async()=>{
  await edit(100,4100);await changeAmount("");await changeAmount("200");
  expect((await submit()).accountAmount).toBe(8200);
});
test("changing the amount away and back does not accumulate bank rounding",async()=>{
  await edit(3,1);await changeAmount("2");await changeAmount("3");
  expect((await submit()).accountAmount).toBe(1);
});
