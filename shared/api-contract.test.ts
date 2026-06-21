import { describe, expect, it } from "vitest";
import { apiOperations, findApiOperation } from "./api-contract.js";

const samplePath = (path: string) => path.replace(/\{[^/]+\}/g, "11111111-1111-4111-8111-111111111111");

describe("API contract manifest", () => {
  it("has unique operation IDs and method/path pairs", () => {
    expect(new Set(apiOperations.map((operation) => operation.operationId)).size).toBe(apiOperations.length);
    expect(new Set(apiOperations.map((operation) => `${operation.method} ${operation.path}`)).size).toBe(apiOperations.length);
  });

  it("matches every declared runtime route", () => {
    for (const operation of apiOperations) {
      expect(findApiOperation(operation.method, samplePath(operation.path))?.operationId).toBe(operation.operationId);
      expect(operation.response).toBeDefined();
      expect(operation.errors.length).toBeGreaterThan(0);
    }
  });

  it("does not expose roadmap-only modules", () => {
    const paths = apiOperations.map((operation) => operation.path);
    expect(paths.some((path) => path.startsWith("/api/import-batches"))).toBe(false);
    expect(paths.some((path) => path.startsWith("/api/recommendations"))).toBe(false);
  });
});
