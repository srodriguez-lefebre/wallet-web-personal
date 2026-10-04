import { readFile } from "node:fs/promises";
import path from "node:path";
import { restoreLocalDatabase } from "./restore.js";
import {
  acquireWorkspaceLock,
  snapshotFile,
  workspace,
  writePrivateJson,
} from "./workspace.js";

const args = process.argv.slice(2);
const backupIndex = args.indexOf("--backup");
if (
  args.some(
    (arg, index) =>
      arg !== "--reset" &&
      arg !== "--backup" &&
      !(backupIndex >= 0 && index === backupIndex + 1),
  ) ||
  (backupIndex >= 0 &&
    (!args[backupIndex + 1] || args[backupIndex + 1].startsWith("--")))
)
  throw new Error("Usage: npm run sandbox:setup -- --backup <file> [--reset]");
const source =
  backupIndex >= 0 ? path.resolve(args[backupIndex + 1] ?? "") : snapshotFile;
const text = await readFile(source, "utf8");
const snapshot = JSON.parse(text);
const release = await acquireWorkspaceLock();
try {
  const counts = await restoreLocalDatabase(
    snapshot,
    workspace,
    args.includes("--reset"),
  );
  await writePrivateJson(path.join(workspace, "import-report.json"), {
    importedAt: new Date().toISOString(),
    counts,
  });
  console.log("Local snapshot imported:", JSON.stringify(counts));
} finally {
  await release();
}
