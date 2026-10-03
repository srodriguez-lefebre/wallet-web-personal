import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { rename, stat } from "node:fs/promises";
import path from "node:path";
import { applyMigrations } from "./database.js";
import { importSnapshot } from "./snapshot.js";
import { writePrivateJson } from "./workspace.js";

// The caller owns this directory's lock for the entire operation.
export async function restoreLocalDatabase(
  input: unknown,
  directory: string,
  reset: boolean,
) {
  const root = path.resolve(directory);
  const active = path.join(root, "db");
  const exists = (file: string) =>
    stat(file).then(
      () => true,
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return false;
        throw error;
      },
    );
  if ((await exists(active)) && !reset)
    throw new Error(
      "Local database exists. Use --reset explicitly to restore the snapshot.",
    );
  const id = randomUUID();
  const staging = path.join(root, `db-pending-${id}`);
  const stagedSnapshot = path.join(root, `snapshot-pending-${id}.json`);
  const pg = await PGlite.create(staging);
  let counts: Record<string, number>;
  try {
    await applyMigrations(pg);
    counts = await importSnapshot(pg, input);
  } finally {
    await pg.close();
  }
  await writePrivateJson(stagedSnapshot, input);
  const moves: Array<[string, string]> = [];
  const move = async (from: string, to: string) => {
    if (path.dirname(from) !== root || path.dirname(to) !== root)
      throw new Error("Restore paths must stay inside the sandbox directory");
    await rename(from, to);
    moves.push([from, to]);
  };
  try {
    for (const name of ["db", "mailbox.json", "wallet-backup.json"]) {
      const file = path.join(root, name);
      if (await exists(file))
        await move(
          file,
          path.join(
            root,
            `${name === "db" ? "db-before-reset" : name + "-before-reset"}-${id}`,
          ),
        );
    }
    await move(staging, active);
    await move(stagedSnapshot, path.join(root, "wallet-backup.json"));
  } catch (error) {
    for (const [from, to] of moves.reverse()) await rename(to, from);
    throw error;
  }
  return counts;
}
