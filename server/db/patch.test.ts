import { expect, test } from "vitest";
import { z } from "zod";

import { changedColumns, mergePatch } from "./patch.js";

const schema = z.object({
  name: z.string().min(1),
  note: z.string().optional(),
  amount: z.number().positive(),
});
test("patch keeps omitted fields, clears nullable fields, and validates the complete entity", () => {
  const current = { name: "Original", note: "Keep", amount: 10 };
  expect(mergePatch(schema, current, { note: null }, ["note"])).toEqual({
    name: "Original",
    note: undefined,
    amount: 10,
  });
  expect(mergePatch(schema, current, { amount: 20 }, ["note"])).toEqual({ ...current, amount: 20 });
  expect(() => mergePatch(schema, current, { name: null }, ["note"])).toThrow();
  expect(() => mergePatch(schema, current, { amount: 0 }, ["note"])).toThrow();
});
test("changed columns writes only own input fields, retaining explicit zero and null", () => {
  const input = { amount: 0, note: null };
  const merged = { name: "Current", amount: 0, note: undefined };
  expect(
    changedColumns(input, merged, {
      name: (row) => row.name,
      amount: (row) => String(row.amount),
      note: (row) => row.note ?? null,
    }),
  ).toEqual({ amount: "0", note: null });
  expect(
    changedColumns(Object.create({ name: "Inherited" }) as object, merged, {
      name: (row) => row.name,
    }),
  ).toEqual({});
});
