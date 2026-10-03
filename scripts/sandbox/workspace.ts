import {
  mkdir,
  open,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { LOCAL_DATABASE_URL } from "./database.js";

export const workspace = fileURLToPath(
  new URL("../../.local-wallet/", import.meta.url),
);
export const dbDirectory = path.join(workspace, "db");
export const snapshotFile = path.join(workspace, "wallet-backup.json");
export const mailboxFile = path.join(workspace, "mailbox.json");
export const LOCAL_ACCESS_CODE = "wallet-local-test";

export function configureLocalEnvironment() {
  // Never inherit credentials from the shell and never read .env or Vercel files.
  for (const key of [
    "DATABASE_URL",
    "API_TOKEN",
    "API_TOKEN_PREVIOUS",
    "SESSION_SECRET",
    "SESSION_TTL_SECONDS",
    "INGEST_API_TOKEN",
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
  ])
    delete process.env[key];
  process.env.DATABASE_URL = LOCAL_DATABASE_URL;
  process.env.API_TOKEN = LOCAL_ACCESS_CODE;
  process.env.SESSION_SECRET = "wallet-local-session-signing-only";
  process.env.INGEST_API_TOKEN = "wallet-local-ingest-only";
  process.env.TZ = "America/Montevideo";
}

export async function acquireWorkspaceLock(directory = workspace) {
  await mkdir(directory, { recursive: true });
  const lockPath = path.join(directory, "process.lock");
  const owner = JSON.stringify({ pid: process.pid, owner: randomUUID() });
  const lock = await open(lockPath, "wx").catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "EEXIST")
        throw new Error(
          "Sandbox lock exists. Stop the running wallet first. After a crash, verify it is stopped before removing .local-wallet/process.lock.",
        );
      throw error;
    },
  );
  await lock.writeFile(owner);
  await lock.close();
  return async () => {
    if ((await readFile(lockPath, "utf8").catch(() => "")) === owner)
      await unlink(lockPath).catch(() => undefined);
  };
}

export async function writePrivateJson(file: string, value: unknown) {
  const temporary = `${file}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
  await rename(temporary, file);
}
