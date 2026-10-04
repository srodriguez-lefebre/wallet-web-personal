import { expect,test } from "vitest";
import { localDateInput,dateInputToIso } from "./date-input";
test("uses the selected local calendar day and a stable instant for payment retries",()=>{
  const date=new Date(2026,1,1,23,30);
  expect(localDateInput(date)).toBe("2026-02-01");
  const parsed=new Date(dateInputToIso("2026-02-01"));
  expect(parsed.getDate()).toBe(1);expect(parsed.getHours()).toBe(12);
  expect(dateInputToIso("2026-02-01")).toBe(dateInputToIso("2026-02-01"));
});
test("preserves plain dates and rejects impossible dates",()=>{
  expect(localDateInput("2026-02-01")).toBe("2026-02-01");
  expect(()=>dateInputToIso("2026-02-30")).toThrow();
});
