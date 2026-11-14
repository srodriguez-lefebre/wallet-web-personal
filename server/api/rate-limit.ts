import { createHmac } from "node:crypto";

import { eq, inArray, sql } from "drizzle-orm";

import { authAttempts } from "../db/schema.js";
import { sessionSigningSecret } from "./auth.js";

import type { VercelRequest } from "@vercel/node";
import type { DbClient } from "../db/client.js";

const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 5;
const GLOBAL_MAX_FAILURES = 20;
const GLOBAL_KEY = "unlock:global";

function clientKey(req: VercelRequest) {
  const forwarded = req.headers["x-forwarded-for"];
  const ip =
    (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown";
  return createHmac("sha256", sessionSigningSecret()).update(ip).digest("hex");
}

export async function assertUnlockAllowed(db: DbClient, req: VercelRequest) {
  const key = clientKey(req);
  const rows = await db
    .select()
    .from(authAttempts)
    .where(inArray(authAttempts.key, [key, GLOBAL_KEY]));
  const now = Date.now();
  const blockedUntil = Math.max(0, ...rows.map((row) => row.blockedUntil?.getTime() ?? 0));
  if (blockedUntil > now)
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((blockedUntil - now) / 1000)),
    } as const;
  return { allowed: true, key } as const;
}

function failureQuery(db: DbClient, key: string, threshold: number) {
  const expired = sql`${authAttempts.windowStartedAt} <= now() - (${WINDOW_MS} * interval '1 millisecond')`;
  const count = sql`CASE WHEN ${expired} THEN 1 ELSE ${authAttempts.failedCount} + 1 END`;
  return db
    .insert(authAttempts)
    .values({
      key,
      failedCount: 1,
      windowStartedAt: sql`now()`,
      blockedUntil: null,
      updatedAt: sql`now()`,
    })
    .onConflictDoUpdate({
      target: authAttempts.key,
      set: {
        failedCount: count,
        windowStartedAt: sql`CASE WHEN ${expired} THEN now() ELSE ${authAttempts.windowStartedAt} END`,
        blockedUntil: sql`CASE WHEN ${count} >= ${threshold} THEN now() + (${WINDOW_MS} * interval '1 millisecond') ELSE NULL END`,
        updatedAt: sql`now()`,
      },
    });
}

export async function registerUnlockFailure(db: DbClient, key: string) {
  await db.batch([
    failureQuery(db, key, MAX_FAILURES),
    failureQuery(db, GLOBAL_KEY, GLOBAL_MAX_FAILURES),
  ]);
}

export async function clearUnlockFailures(db: DbClient, key: string) {
  // A successful unlock clears this IP only; distributed attacks retain their window.
  if (key !== GLOBAL_KEY) await db.delete(authAttempts).where(eq(authAttempts.key, key));
}
