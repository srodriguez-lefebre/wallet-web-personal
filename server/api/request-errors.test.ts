import { afterEach, expect, test, vi } from "vitest";

import { routeError } from "./request.js";

import type { VercelResponse } from "@vercel/node";
afterEach(() => vi.restoreAllMocks());
test("unexpected wrapped database errors never log SQL or bound values", () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const res = { setHeader: vi.fn(), status: () => res, json: vi.fn() };
  const error = Object.assign(new Error("Failed query: synthetic-private-value"), {
    query: "select synthetic-private-value",
    params: ["synthetic-private-value"],
    cause: { code: "XX000", detail: "synthetic-private-value" },
  });
  routeError(res as unknown as VercelResponse, error);
  expect(JSON.stringify(log.mock.calls)).not.toContain("synthetic-private-value");
  expect(log).toHaveBeenCalled();
});
