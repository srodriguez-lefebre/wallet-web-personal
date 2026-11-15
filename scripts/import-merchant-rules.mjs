import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { isNull } from "drizzle-orm";
import { createDb } from "../server/db/client.ts";
import { categories } from "../server/db/schema.ts";
import { runImportCli } from "./import/cli-outcome.ts";
import {
  merchantSourcePath,
  prepareMerchantImport,
  importMerchantRules,
} from "./import/merchant-rules.ts";

async function main() {
  try {
    process.loadEnvFile(process.env.WALLET_IMPORT_ENV_FILE || ".env.local");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const source = merchantSourcePath(process.argv.slice(2), process.env);
  const payload = JSON.parse(await readFile(source, "utf8"));
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  const db = createDb();
  const rows = await db
    .select({ id: categories.id, systemKey: categories.systemKey })
    .from(categories)
    .where(isNull(categories.deletedAt));
  const prepared = prepareMerchantImport(payload, rows);
  await importMerchantRules(db, prepared);
  console.log(
    JSON.stringify({ merchants: prepared.rules.length, aliases: prepared.aliases.length }),
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runImportCli(main, "Merchant");
}
