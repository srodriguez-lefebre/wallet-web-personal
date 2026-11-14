import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { isValidSessionToken } from "./auth.js";

const defaultTtl = 45 * 24 * 60 * 60;
const payloadSchema = z
  .object({
    iat: z.number().int().nonnegative(),
    exp: z.number().int().positive(),
    jti: z.uuid(),
    ver: z.number().int().positive(),
  })
  .strict();
export function requireIndependentSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for revocable sessions");
  if ([process.env.API_TOKEN, process.env.API_TOKEN_PREVIOUS].includes(secret))
    throw new Error("SESSION_SECRET must differ from master tokens");
  return secret;
}
export function revocableSessionsEnabled() {
  if (process.env.WALLET_REVOCABLE_SESSIONS !== "true") return false;
  requireIndependentSessionSecret();
  if (
    !process.env.LEGACY_SESSION_ACCEPT_UNTIL ||
    !Number.isFinite(Date.parse(process.env.LEGACY_SESSION_ACCEPT_UNTIL))
  )
    throw new Error("LEGACY_SESSION_ACCEPT_UNTIL must be an explicit transition deadline");
  return true;
}
function signature(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}
function equal(left: string, right: string) {
  const a = Buffer.from(left),
    b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function createRevocableSessionToken(version: number, now = new Date()) {
  const configured = Number(process.env.SESSION_TTL_SECONDS),
    ttl = Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : defaultTtl;
  const payload = payloadSchema.parse({
    iat: Math.floor(now.getTime() / 1000),
    exp: Math.floor(now.getTime() / 1000) + ttl,
    jti: randomUUID(),
    ver: version,
  });
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return {
    token: `${encoded}.${signature(encoded, requireIndependentSessionSecret())}`,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  };
}
export function inspectRevocableSession(
  token: string | null,
  now = new Date(),
): { version: number; legacy: boolean } | null {
  const secret = requireIndependentSessionSecret();
  if (!token || token.length > 4096) return null;
  const [encoded, signed, extra] = token.split(".");
  if (!encoded || !signed || extra) return null;
  try {
    const data: unknown = JSON.parse(Buffer.from(encoded, "base64url").toString());
    if (data && typeof data === "object" && "ver" in data) {
      if (!equal(signed, signature(encoded, secret))) return null;
      const parsed = payloadSchema.safeParse(data);
      return parsed.success && parsed.data.exp > Math.floor(now.getTime() / 1000)
        ? { version: parsed.data.ver, legacy: false }
        : null;
    }
    const deadline = Date.parse(process.env.LEGACY_SESSION_ACCEPT_UNTIL ?? "");
    return Number.isFinite(deadline) && now.getTime() < deadline && isValidSessionToken(token, now)
      ? { version: 1, legacy: true }
      : null;
  } catch {
    return null;
  }
}
export function verifyRevocableSessionToken(
  token: string | null,
  version: number,
  now = new Date(),
) {
  return inspectRevocableSession(token, now)?.version === version;
}
// Opt-in only. The default deployed profile keeps the existing format and sessions.
if (process.env.WALLET_REVOCABLE_SESSIONS === "true") revocableSessionsEnabled();
