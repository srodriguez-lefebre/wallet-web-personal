import { afterEach, expect, test, vi } from "vitest";
import { readStorage, writeStorage } from "./storage";
afterEach(() => vi.unstubAllGlobals());
test("unavailable storage and quota exhaustion do not break loading", () => {
  vi.stubGlobal("window", {
    localStorage: {
      getItem() {
        throw new Error("denied");
      },
      setItem() {
        throw new Error("quota");
      },
    },
  });
  expect(() => writeStorage("cache", "large")).not.toThrow();
  expect(readStorage("cache")).toBeNull();
});
