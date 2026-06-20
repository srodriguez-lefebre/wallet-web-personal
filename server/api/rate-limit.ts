import type { VercelRequest } from "@vercel/node";
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { createDb } from "../db/client.js";
import { authAttempts } from "../db/schema.js";
import { sessionSigningSecret } from "./auth.js";

const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 5;

function clientKey(req: VercelRequest) {
  const forwarded = req.headers["x-forwarded-for"];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim()
    || req.socket?.remoteAddress || "unknown";
  return createHmac("sha256", sessionSigningSecret()).update(ip).digest("hex");
}

export async function assertUnlockAllowed(req: VercelRequest) {
  const db = createDb();
  const key = clientKey(req);
  const [row] = await db.select().from(authAttempts).where(eq(authAttempts.key, key)).limit(1);
  const now = new Date();
  if (row?.blockedUntil && row.blockedUntil > now) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((row.blockedUntil.getTime() - now.getTime()) / 1000)) } as const;
  }
  return { allowed: true, key } as const;
}

export async function registerUnlockFailure(key: string) {
  const db = createDb();
  const [row] = await db.select().from(authAttempts).where(eq(authAttempts.key, key)).limit(1);
  const now = new Date();
  const expired = !row || now.getTime() - row.windowStartedAt.getTime() >= WINDOW_MS;
  const failedCount = expired ? 1 : row.failedCount + 1;
  const blockedUntil = failedCount >= MAX_FAILURES ? new Date(now.getTime() + WINDOW_MS) : null;
  await db.insert(authAttempts).values({
    key,
    failedCount,
    windowStartedAt: expired ? now : row.windowStartedAt,
    blockedUntil,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: authAttempts.key,
    set: { failedCount, windowStartedAt: expired ? now : row.windowStartedAt, blockedUntil, updatedAt: now },
  });
}

export async function clearUnlockFailures(key: string) {
  await createDb().delete(authAttempts).where(eq(authAttempts.key, key));
}
