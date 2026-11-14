import { expect, test } from "vitest";

import { apiOperations } from "../../shared/api-contract.js";
import { matchOperation, matchPath } from "./router.js";

const id = "11111111-1111-4111-8111-111111111111";
test("compiled routes match the entire contract and return named nested parameters", () => {
  for (const operation of apiOperations) {
    const path = operation.path.replace(/\{[^/]+\}/g, id);
    const match = matchOperation(operation.method, path);
    expect(match?.operation.operationId).toBe(operation.operationId);
    for (const name of operation.path.matchAll(/\{([^}]+)\}/g))
      expect(match?.params[name[1]!]).toBe(id);
    expect(matchOperation(operation.method, `${path}/extra`)).toBeNull();
  }
  expect(matchOperation("PATCH", `/api/cards/${id}/records/${id}`)?.params).toEqual({
    id,
    recordId: id,
  });
});
test("literal actions are distinguished from ids and unknown paths or methods never partially match", () => {
  expect(matchOperation("POST", "/api/debts/generate-recurring")?.operation.operationId).toBe(
    "debts.generateRecurring",
  );
  expect(matchOperation("POST", "/api/debts/generate-recurring/extra")).toBeNull();
  expect(matchOperation("TRACE", "/api/accounts")).toBeNull();
  expect(matchPath("/api/accounts")?.methods).toEqual(["GET", "POST"]);
  expect(matchPath("/api/not-present")).toBeNull();
});
