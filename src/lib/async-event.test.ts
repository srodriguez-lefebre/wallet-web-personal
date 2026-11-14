import { expect, test } from "vitest";

import { finishAction } from "./async-event";

test("a void UI event consumes a rejection after the action toast reports it", async () => {
  let reported = false;
  const action = Promise.resolve().then(() => {
    reported = true;
    throw new Error("Already reported by action toast");
  });
  expect(finishAction(action)).toBeUndefined();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  expect(reported).toBe(true);
});
