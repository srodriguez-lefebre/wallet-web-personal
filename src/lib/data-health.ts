import { readStorage, writeStorage } from "./storage";
import type { WalletDataset } from "../../shared/types";
export {
  walletDataHealth,
  summarizeCsvPreview,
} from "../../shared/data-quality";

export interface BackupReceipt {
  requestedAt: string;
  records: number;
  cardRecords: number;
}
export function backupFilename(date = new Date()) {
  return `wallet-backup-${date.toISOString().replaceAll(":", "-").replace(".", "-")}.json`;
}
export function rememberBackupExport(
  dataset: WalletDataset,
  date = new Date(),
): BackupReceipt {
  const receipt = {
    requestedAt: date.toISOString(),
    records: dataset.records.length,
    cardRecords: dataset.creditCardRecords.length,
  };
  writeStorage("wallet-last-backup-export", JSON.stringify(receipt));
  return receipt;
}
export function readBackupReceipt(): BackupReceipt | null {
  try {
    const value = JSON.parse(
      readStorage("wallet-last-backup-export") ?? "null",
    ) as BackupReceipt | null;
    return value &&
      typeof value.requestedAt === "string" &&
      Number.isFinite(Date.parse(value.requestedAt)) &&
      Number.isInteger(value.records) &&
      value.records >= 0 &&
      Number.isInteger(value.cardRecords) &&
      value.cardRecords >= 0
      ? {
          requestedAt: value.requestedAt,
          records: value.records,
          cardRecords: value.cardRecords,
        }
      : null;
  } catch {
    return null;
  }
}
