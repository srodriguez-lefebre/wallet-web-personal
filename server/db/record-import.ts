import { createHash } from "node:crypto";

import { recordFingerprint } from "../../shared/record-identity.js";
import { type DbClient } from "./client.js";
import { createRecordsBulk, getWalletDataset } from "./index.js";
import { isPgError } from "./pg-error.js";
import { records } from "./schema.js";

import type { WalletRecord } from "../../shared/types.js";
function importId(fingerprint: string) {
  const bytes = createHash("sha256")
    .update(`wallet-import-v1:${fingerprint}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes.readUInt8(6) & 0x0f) | 0x50;
  bytes[8] = (bytes.readUInt8(8) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
/** Durable identities serialize competing copies; failed batches leave no orphan side effects. */
export async function importWalletRecords(db: DbClient, inputs: Omit<WalletRecord, "id">[]) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const [dataset, persistedRecords] = await Promise.all([
      getWalletDataset(db),
      db.select({ id: records.id }).from(records),
    ]);
    const seen = new Set(dataset.records.map(recordFingerprint));
    // Editing changes the fingerprint; soft deletion hides the row from the UI.
    // Neither operation frees its durable deterministic identity for another import.
    const persistedIds = new Set(persistedRecords.map((record) => record.id));
    const pending = inputs.filter((input) => {
      const identity = recordFingerprint(input);
      if (seen.has(identity) || persistedIds.has(importId(identity))) return false;
      seen.add(identity);
      return true;
    });
    if (!pending.length) return [];
    try {
      return await createRecordsBulk(
        db,
        pending,
        pending.map((input) => importId(recordFingerprint(input))),
      );
    } catch (error) {
      if (!isPgError(error, "23505") || attempt === 3) throw error;
    }
  }
  return [];
}
