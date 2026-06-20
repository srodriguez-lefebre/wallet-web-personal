import { describe, expect, it } from "vitest";
import { HttpError } from "./errors.js";
import { decodeRecordCursor, encodeRecordCursor } from "./record-cursor.js";

describe("record cursor", () => {
  const payload = {
    occurredAt: "2026-06-20T12:00:00.000Z",
    id: "11111111-1111-4111-8111-111111111111",
  };

  it("round trips a stable keyset cursor", () => {
    expect(decodeRecordCursor(encodeRecordCursor(payload))).toEqual(payload);
  });

  it("rejects malformed cursors as validation errors", () => {
    expect(() => decodeRecordCursor("not-a-cursor")).toThrow(HttpError);
  });
});
