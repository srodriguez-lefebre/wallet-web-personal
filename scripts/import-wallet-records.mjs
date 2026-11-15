import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createDb } from "../server/db/client.ts";
import { prepareWalletImport, importWalletRecords } from "./import/wallet-records.ts";
import { runImportCli } from "./import/cli-outcome.ts";

async function main() {
  try {
    process.loadEnvFile(process.env.WALLET_IMPORT_ENV_FILE || ".env.local");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const csvPath = resolve(
    process.argv[2] || process.env.WALLET_RECORDS_PATH || "wallet_records.csv",
  );
  const prepared = prepareWalletImport(await readFile(csvPath, "utf8"));
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  await importWalletRecords(createDb(), prepared);
  console.log(JSON.stringify(prepared.counts, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runImportCli(main, "Wallet");
}
