import { mockWalletData } from "@shared/mock-data";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import {
  readReferenceCache,
  REFERENCE_CACHE_MAX_BYTES,
  writeReferenceCache,
} from "./wallet-reference-cache";

import type { WalletDataset } from "@shared/types";

const token = `${btoa(JSON.stringify({ sub: "synthetic-owner" }))}.signature`;
let storage: Map<string, string>;
const fixture = (): WalletDataset => ({
  ...structuredClone(mockWalletData),
  settings: {
    ...mockWalletData.settings,
    primaryAccountId: undefined,
    defaultAccountId: undefined,
    defaultCreditCardId: undefined,
  },
  accounts: [],
  categories: [],
  tags: [],
  creditCards: [],
  goals: [],
  budgets: [],
  exchangeRates: [],
  recordTemplates: [],
});
beforeEach(() => {
  storage = new Map();
  vi.stubGlobal("window", {
    location: { origin: "http://reference.test" },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});
test("only allowlisted reference collections reach storage; no records, card activity, payments or debts", () => {
  const dataset = fixture();
  expect(writeReferenceCache(dataset, token)).toBe(true);
  const raw = storage.get("wallet-dataset-cache")!;
  expect(raw).not.toContain('"records"');
  for (const key of [
    "creditCardRecords",
    "creditCardStatements",
    "creditCardPayments",
    "creditCardPaymentAllocations",
    "goalReservations",
    "goalReservationMovements",
    "debts",
    "recurringDebts",
    "investments",
    "installmentPlans",
  ])
    expect(raw).not.toContain(`"${key}"`);
  expect(readReferenceCache(token)?.settings).toEqual(dataset.settings);
  expect(Object.keys(readReferenceCache(token) ?? {}).sort()).toEqual(
    [
      "settings",
      "accounts",
      "categories",
      "tags",
      "creditCards",
      "goals",
      "budgets",
      "exchangeRates",
      "recordTemplates",
    ].sort(),
  );
});
test("old full caches, wrong owners, stale dates and malformed envelopes are deleted", () => {
  expect(writeReferenceCache(fixture(), token)).toBe(true);
  const valid = JSON.parse(storage.get("wallet-dataset-cache")!) as Record<string, unknown>;
  for (const value of [
    { ...valid, schemaVersion: 2 },
    { ...valid, ownerKey: "another" },
    { ...valid, cachedAt: "invalid" },
    { ...valid, cachedAt: "2000-01-01T00:00:00.000Z" },
    { ...valid, reference: { ...(valid.reference as object), records: ["private"] } },
  ]) {
    storage.set("wallet-dataset-cache", JSON.stringify(value));
    expect(readReferenceCache(token)).toBeNull();
    expect(storage.has("wallet-dataset-cache")).toBe(false);
  }
});
test("oversized references and disabled storage cannot break mutations or retain old financial caches", () => {
  const dataset = fixture();
  dataset.settings.locale = "es-UY";
  dataset.accounts = [
    {
      ...mockWalletData.accounts[0]!,
      id: "00000000-0000-4000-8000-000000000001",
      name: "x".repeat(REFERENCE_CACHE_MAX_BYTES),
    },
  ];
  storage.set("wallet-dataset-cache", "old financial cache");
  expect(writeReferenceCache(dataset, token)).toBe(false);
  expect(storage.has("wallet-dataset-cache")).toBe(false);
  Object.assign(window.localStorage, {
    getItem: () => {
      throw new Error("disabled");
    },
    setItem: () => {
      throw new Error("quota");
    },
    removeItem: () => {
      throw new Error("disabled");
    },
  });
  expect(readReferenceCache(token)).toBeNull();
  expect(writeReferenceCache(fixture(), token)).toBe(false);
});
