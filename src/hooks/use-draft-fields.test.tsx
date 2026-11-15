// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { expect, test } from "vitest";

import { useDraftFields } from "./use-draft-fields";

test("a grouped draft retains user edits through rerenders and applies queued field updates to current values", () => {
  let initializations = 0;
  const { result, rerender } = renderHook(() =>
    useDraftFields(() => {
      initializations++;
      return { amount: "10", notes: "initial", selections: ["one"] };
    }),
  );
  const setters = result.current[1];
  act(() => {
    setters.amount("20");
    setters.notes("retained draft");
    setters.selections((current) => [...current, "two"]);
    setters.selections((current) => [...current, "three"]);
  });
  rerender();
  expect(result.current[0]).toEqual({
    amount: "20",
    notes: "retained draft",
    selections: ["one", "two", "three"],
  });
  expect(result.current[1]).toBe(setters);
  expect(initializations).toBe(1);
});
