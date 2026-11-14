import { walletDatasetSchema } from "@shared/schemas";
import { z } from "zod";

import { removeStorage } from "./storage";

import type { WalletDataset } from "@shared/types";

const key = "wallet-dataset-cache";
export const REFERENCE_CACHE_MAX_BYTES = 128 * 1024;
const maxAgeMs = 24 * 60 * 60 * 1000;
const referenceSchema = walletDatasetSchema
  .pick({
    settings: true,
    accounts: true,
    categories: true,
    tags: true,
    creditCards: true,
    goals: true,
    budgets: true,
    exchangeRates: true,
    recordTemplates: true,
  })
  .strict();
const envelopeSchema = z
  .object({
    schemaVersion: z.literal(3),
    cachedAt: z.iso.datetime(),
    environment: z.string(),
    ownerKey: z.string().min(1),
    reference: referenceSchema,
  })
  .strict();

function ownerKey(token: string | null) {
  if (!token) return null;
  try {
    const encoded = token.split(".")[0] ?? "";
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const value = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="))) as {
      sub?: unknown;
    };
    return typeof value.sub === "string" && value.sub ? value.sub : null;
  } catch {
    return null;
  }
}

export function readReferenceCache(token: string | null): z.infer<typeof referenceSchema> | null {
  if (typeof window === "undefined") return null;
  try {
    const text = window.localStorage.getItem(key);
    if (!text) return null;
    if (new TextEncoder().encode(text).byteLength > REFERENCE_CACHE_MAX_BYTES)
      throw new Error("Reference cache too large");
    const value = envelopeSchema.parse(JSON.parse(text));
    const age = Date.now() - Date.parse(value.cachedAt);
    if (
      !ownerKey(token) ||
      value.ownerKey !== ownerKey(token) ||
      value.environment !== window.location.origin ||
      age < 0 ||
      age > maxAgeMs
    )
      throw new Error("Stale reference cache");
    return value.reference;
  } catch {
    removeStorage(key);
    return null;
  }
}

export function writeReferenceCache(dataset: WalletDataset, token: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const owner = ownerKey(token);
    if (!owner) {
      removeStorage(key);
      return false;
    }
    // Explicit allowlist; never spread a full dataset into a persisted object.
    const reference = referenceSchema.parse({
      settings: dataset.settings,
      accounts: dataset.accounts,
      categories: dataset.categories,
      tags: dataset.tags,
      creditCards: dataset.creditCards,
      goals: dataset.goals,
      budgets: dataset.budgets,
      exchangeRates: dataset.exchangeRates,
      recordTemplates: dataset.recordTemplates,
    });
    const text = JSON.stringify({
      schemaVersion: 3,
      cachedAt: new Date().toISOString(),
      environment: window.location.origin,
      ownerKey: owner,
      reference,
    });
    if (new TextEncoder().encode(text).byteLength > REFERENCE_CACHE_MAX_BYTES)
      throw new Error("Reference cache too large");
    window.localStorage.setItem(key, text);
    return true;
  } catch {
    removeStorage(key);
    return false;
  }
}
