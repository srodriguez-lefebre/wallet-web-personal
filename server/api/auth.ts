import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { sendError } from "./response.js";

const DEFAULT_SESSION_TTL_SECONDS = 12 * 60 * 60;

export function extractBearerToken(req: VercelRequest) {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

function authSecret() {
  return process.env.SESSION_SECRET || process.env.API_TOKEN || "";
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    timingSafeEqual(leftBuffer, leftBuffer);
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function isValidApiToken(token: string | null) {
  if (!token) return false;
  return [process.env.API_TOKEN, process.env.API_TOKEN_PREVIOUS]
    .filter((value): value is string => Boolean(value))
    .some((expected) => safeEqual(token, expected));
}

function sign(value: string) {
  const secret = authSecret();
  if (!secret) throw new Error("Session signing secret is not configured");
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function createSessionToken(now = new Date()) {
  const ttl = Number(process.env.SESSION_TTL_SECONDS) || DEFAULT_SESSION_TTL_SECONDS;
  const payload = Buffer.from(
    JSON.stringify({
      iat: Math.floor(now.getTime() / 1000),
      exp: Math.floor(now.getTime() / 1000) + ttl,
      jti: randomUUID(),
      sub: createHash("sha256").update(process.env.API_TOKEN ?? authSecret()).digest("base64url").slice(0, 24),
    }),
  ).toString("base64url");
  return { token: `${payload}.${sign(payload)}`, expiresAt: new Date(now.getTime() + ttl * 1000).toISOString() };
}

export function isValidSessionToken(token: string | null, now = new Date()) {
  if (!token) return false;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra || !safeEqual(signature, sign(payload))) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: number };
    return typeof parsed.exp === "number" && parsed.exp > Math.floor(now.getTime() / 1000);
  } catch {
    return false;
  }
}

export function requireApiToken(req: VercelRequest, res: VercelResponse) {
  if (!isValidSessionToken(extractBearerToken(req))) {
    sendError(res, 401, "UNAUTHORIZED", "Invalid or expired session");
    return false;
  }
  return true;
}

export function requireIngestToken(req: VercelRequest, res: VercelResponse) {
  const expected = process.env.INGEST_API_TOKEN;
  const received = extractBearerToken(req);
  if (!expected || !received || !safeEqual(received, expected)) {
    sendError(res, 401, "UNAUTHORIZED", "Invalid or missing ingest token");
    return false;
  }
  return true;
}

export function sessionSigningSecret() {
  return authSecret();
}
