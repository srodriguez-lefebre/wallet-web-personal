import { describe, expect, it } from "vitest";

import { createActionToastRunner } from "./action-toast-runner";

import type { ActionToastState } from "@/components/ui/action-toast";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });

  return { promise, resolve };
}

describe("createActionToastRunner", () => {
  it("runs a financial submission once until it settles and permits a later retry", async () => {
    const runAction = createActionToastRunner(() => {});
    const pending = deferred<string>();
    let writes = 0;
    const save = () => {
      writes += 1;
      return pending.promise;
    };
    const first = runAction(save, { singleFlight: "card-payment" });
    const duplicate = runAction(save, { singleFlight: "card-payment" });
    pending.resolve("saved");
    expect(await first).toEqual({ ok: true, value: "saved" });
    expect(await duplicate).toEqual({ ok: true, value: "saved" });
    expect(writes).toBe(1);
    await runAction(
      async () => {
        writes += 1;
      },
      { singleFlight: "card-payment" },
    );
    expect(writes).toBe(2);
  });
  it("keeps processing visible until all concurrent actions finish", async () => {
    const states: ActionToastState[] = [];
    const runAction = createActionToastRunner((status, message) => {
      states.push({ status, message });
    });
    const first = deferred<string>();
    const second = deferred<string>();

    const firstAction = runAction(() => first.promise, {
      processing: "Deleting record...",
      success: "Record deleted",
    });
    const secondAction = runAction(() => second.promise, {
      processing: "Deleting record...",
      success: "Record deleted",
    });

    first.resolve("first");
    await firstAction;

    expect(states[states.length - 1]!).toEqual({
      status: "processing",
      message: "Deleting record...",
    });

    second.resolve("second");
    await secondAction;

    expect(states[states.length - 1]!).toEqual({
      status: "success",
      message: "Record deleted",
    });
  });
});

it("returns an explicit failure without throwing and releases single flight for a retry", async () => {
  const states: ActionToastState[] = [];
  const runAction = createActionToastRunner((status, message) => states.push({ status, message }));
  const error = new Error("Synthetic offline failure");
  await expect(
    runAction(() => Promise.reject(error), { singleFlight: "save-draft", error: "Draft retained" }),
  ).resolves.toEqual({ ok: false, error });
  expect(states.at(-1)).toEqual({ status: "error", message: "Draft retained" });
  await expect(
    runAction(() => Promise.resolve(false), { singleFlight: "save-draft" }),
  ).resolves.toEqual({ ok: true, value: false });
});
