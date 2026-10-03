import { afterEach, expect, test, vi } from "vitest";
import { createRecordTemplate,deleteRecordTemplate,listRecordTemplates,updateRecordTemplate } from "./wallet-api";
import { findApiOperation } from "../../shared/api-contract";

afterEach(() => vi.unstubAllGlobals());
test("template client sends authenticated CRUD requests that match the shared contract",async()=>{
  const template={id:"00000000-0000-4000-8000-000000000001",name:"Coffee",type:"expense" as const,amount:20,currency:"UYU" as const,paymentType:"cash" as const};
  const calls:Array<{path:string;init:RequestInit}>=[];
  vi.stubGlobal("fetch",async(path:string,init:RequestInit)=>{
    calls.push({path,init});
    const operation=findApiOperation(init.method ?? "GET",path)!;
    expect(operation).toBeDefined();
    const headers=new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer session");
    expect(headers.get("X-Client-Operation-Id")).toBe(operation.operationId);
    if("body" in operation)expect(operation.body.safeParse(JSON.parse(String(init.body))).success).toBe(true);
    return Response.json({data:operation.method==="GET"?[template]:operation.method==="DELETE"?{deleted:true}:template,error:null});
  });
  const {id,...input}=template;
  expect(await createRecordTemplate("session",input)).toEqual(template);
  expect(await listRecordTemplates("session")).toEqual([template]);
  expect(await updateRecordTemplate("session",id,{note:null})).toEqual(template);
  expect(await deleteRecordTemplate("session",id)).toEqual({deleted:true});
  expect(calls.map(call=>call.init.method ?? "GET")).toEqual(["POST","GET","PATCH","DELETE"]);
});
test("template client propagates safe capacity conflicts",async()=>{
  vi.stubGlobal("fetch",async()=>Response.json({data:null,error:{code:"CONFLICT",message:"The template library is limited to 100 templates"}},{status:409}));
  await expect(createRecordTemplate("session",{name:"Coffee",type:"expense",amount:20,currency:"UYU",paymentType:"cash"})).rejects.toThrow(/100 templates/);
});
