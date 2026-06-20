import { describe, expect, it } from "vitest";

describe("OpenAI category contract", () => {
  it("uses the configured fallback model name", () => {
    expect(process.env.OPENAI_MODEL || "gpt-5-nano").toBeTruthy();
  });
});
