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

    expect(states.at(-1)).toEqual({
      status: "processing",
      message: "Deleting record...",
    });

    second.resolve("second");
    await secondAction;

    expect(states.at(-1)).toEqual({
      status: "success",
      message: "Record deleted",
    });
  });
});
