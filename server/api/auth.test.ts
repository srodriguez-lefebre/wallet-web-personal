import { afterEach, describe, expect, it } from "vitest";
import { createSessionToken, isValidApiToken, isValidSessionToken } from "./auth.js";

afterEach(() => {
  delete process.env.API_TOKEN;
  delete process.env.API_TOKEN_PREVIOUS;
  delete process.env.SESSION_SECRET;
});

describe("signed wallet sessions", () => {
  it("accepts current and previous master tokens only for unlock", () => {
    process.env.API_TOKEN = "current-secret";
    process.env.API_TOKEN_PREVIOUS = "previous-secret";
    expect(isValidApiToken("current-secret")).toBe(true);
    expect(isValidApiToken("previous-secret")).toBe(true);
    expect(isValidApiToken("wrong")).toBe(false);
  });

  it("signs, validates, rejects tampering and expires sessions", () => {
    process.env.SESSION_SECRET = "a-long-test-session-secret";
    const now = new Date("2026-06-20T12:00:00.000Z");
    const session = createSessionToken(now);
    expect(isValidSessionToken(session.token, now)).toBe(true);
    expect(isValidSessionToken(`${session.token}x`, now)).toBe(false);
    expect(isValidSessionToken(session.token, new Date("2026-06-21T12:00:00.000Z"))).toBe(false);
  });
});
