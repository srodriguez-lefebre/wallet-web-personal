import { afterEach, expect, test, vi } from "vitest";

import { createSessionToken, isValidSessionToken } from "./auth.js";
import {
  createRevocableSessionToken,
  requireIndependentSessionSecret,
  verifyRevocableSessionToken,
} from "./session-revocation.js";
const now = new Date("2026-11-14T12:00:00Z");
afterEach(() => vi.unstubAllEnvs());
function configured() {
  vi.stubEnv("API_TOKEN", "synthetic-master");
  vi.stubEnv("SESSION_SECRET", "synthetic-independent-signing");
}
test("versioned payload has no master-derived subject and rejects revoked versions", () => {
  configured();
  const first = createRevocableSessionToken(1, now),
    second = createRevocableSessionToken(1, now);
  expect(first.token).not.toBe(second.token);
  const payload = JSON.parse(
    Buffer.from(first.token.split(".")[0]!, "base64url").toString(),
  ) as Record<string, unknown>;
  expect(payload).toMatchObject({ ver: 1 });
  expect(payload).not.toHaveProperty("sub");
  expect(verifyRevocableSessionToken(first.token, 1, now)).toBe(true);
  expect(verifyRevocableSessionToken(first.token, 2, now)).toBe(false);
  expect(verifyRevocableSessionToken(second.token, 2, now)).toBe(false);
  expect(verifyRevocableSessionToken(first.token, 1, new Date("2027-02-01"))).toBe(false);
});
test("strict signing never falls back to a master token", () => {
  vi.stubEnv("API_TOKEN", "synthetic-master");
  vi.stubEnv("SESSION_SECRET", "");
  expect(() => requireIndependentSessionSecret()).toThrow(/SESSION_SECRET/);
  vi.stubEnv("SESSION_SECRET", "synthetic-master");
  expect(() => requireIndependentSessionSecret()).toThrow(/differ/);
});
test("a bounded explicit transition preserves old sessions while the new secret is introduced", () => {
  vi.stubEnv("API_TOKEN", "synthetic-master");
  vi.stubEnv("SESSION_SECRET", "");
  const legacy = createSessionToken(now);
  vi.stubEnv("LEGACY_SESSION_ACCEPT_UNTIL", "2026-12-29T12:00:00Z");
  vi.stubEnv("SESSION_SECRET", "synthetic-independent-signing");
  expect(isValidSessionToken(legacy.token, now)).toBe(true);
  expect(verifyRevocableSessionToken(legacy.token, 1, now)).toBe(true);
  expect(verifyRevocableSessionToken(legacy.token, 2, now)).toBe(false);
  expect(verifyRevocableSessionToken(legacy.token, 1, new Date("2027-01-01"))).toBe(false);
  vi.stubEnv("LEGACY_SESSION_ACCEPT_UNTIL", "");
  expect(verifyRevocableSessionToken(legacy.token, 1, now)).toBe(false);
});

test("new sessions use only the independent secret and survive master-token rotation", () => {
  configured();
  const token = createRevocableSessionToken(1, now).token;
  vi.stubEnv("API_TOKEN_PREVIOUS", "synthetic-master");
  vi.stubEnv("API_TOKEN", "synthetic-rotated-master");
  expect(verifyRevocableSessionToken(token, 1, now)).toBe(true);
  vi.stubEnv("SESSION_SECRET", "synthetic-other-signing");
  expect(verifyRevocableSessionToken(token, 1, now)).toBe(false);
});
