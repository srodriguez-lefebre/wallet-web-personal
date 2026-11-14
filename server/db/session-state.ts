import { sql } from "drizzle-orm";

import { settings } from "./schema.js";

import type { Db } from "./input-types.js";

export async function getSessionVersion(db: Db) {
  const [row] = await db.select({ version: settings.sessionVersion }).from(settings).limit(1);
  return row?.version ?? 1;
}
export async function revokeAllSessions(db: Db) {
  const [row] = await db
    .insert(settings)
    .values({ sessionVersion: 2 })
    .onConflictDoUpdate({
      target: settings.singleton,
      set: { sessionVersion: sql`${settings.sessionVersion}+1`, updatedAt: new Date() },
    })
    .returning({ version: settings.sessionVersion });
  if (!row) throw new Error("Session version update returned no row");
  return row.version;
}
