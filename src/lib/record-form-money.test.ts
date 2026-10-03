import { expect,test } from "vitest";
import { recordAccountAmount,scaleConvertedAmount } from "./record-form-money";

test("editing a same-currency amount updates both transfer sides despite hidden old amounts",()=>{
  expect(recordAccountAmount(200,"UYU","UYU","100",1)).toBe(200);
});
test("a notes-only edit preserves bank fees and historic foreign conversion",()=>{
  expect(recordAccountAmount(100,"UYU","UYU","103",1,true)).toBe(103);
  expect(recordAccountAmount(100,"USD","UYU","4100",44,true)).toBe(4100);
  expect(recordAccountAmount(200,"USD","UYU",scaleConvertedAmount("4100","100","200"),44)).toBe(8200);
});
test("missing foreign conversion remains unresolved while same currency needs no quote",()=>{
  expect(recordAccountAmount(100,"USD","UYU","",null)).toBeNull();
  expect(recordAccountAmount(100,"USD","USD","",null)).toBe(100);
});
