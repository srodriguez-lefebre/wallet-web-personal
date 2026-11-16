import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { inferCategoryWithOpenAi } from "./openai-category";

const categories = [
  { id: "restaurant", path: "Food > Restaurant, fast-food" },
  { id: "unknown", path: "Others > Unknown expense" },
];
const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "test-key-never-log");
  vi.stubEnv("OPENAI_MODEL", "gpt-5-nano");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "x-request-id": "req-test" },
  });
}
test("Luna is the default with explicit non-reasoning and a structured way to request review", async () => {
  vi.stubEnv("OPENAI_MODEL", undefined);
  fetchMock.mockResolvedValue(
    response({
      status: "completed",
      output_text: '{"decision":"review","categoryId":null,"reason":"ambiguous"}',
    }),
  );
  const diagnostic = vi.fn();
  expect(await inferCategoryWithOpenAi("Synthetic reference", categories, diagnostic)).toEqual({
    decision: "review",
    reason: "ambiguous",
  });
  const request = JSON.parse(fetchMock.mock.calls[0]![1].body);
  expect(request).toMatchObject({
    model: "gpt-6-luna",
    reasoning: { effort: "none" },
    store: false,
    text: { format: { type: "json_schema", strict: true } },
  });
  expect(diagnostic).toHaveBeenCalledWith(
    expect.objectContaining({
      outcome: "review",
      reason: "ambiguous",
      promptVersion: expect.any(String),
    }),
  );
});

test("a review response carrying a category ID is invalid", async () => {
  fetchMock.mockResolvedValue(
    response({
      status: "completed",
      output_text: '{"decision":"review","categoryId":"restaurant","reason":"ambiguous"}',
    }),
  );
  const diagnostic = vi.fn();
  expect(await inferCategoryWithOpenAi("Synthetic reference", categories, diagnostic)).toBeNull();
  expect(diagnostic).toHaveBeenCalledWith(
    expect.objectContaining({ outcome: "failed", reason: "invalid_decision" }),
  );
});
test("a bank descriptor gets sufficient output budget, purchase context and a valid supplied category", async () => {
  fetchMock.mockResolvedValue(
    response({
      status: "completed",
      output: [
        {
          content: [
            {
              type: "output_text",
              text: '{"decision":"assign","categoryId":"restaurant","reason":null}',
            },
          ],
        },
      ],
      usage: { input_tokens: 100, output_tokens: 50 },
    }),
  );
  const diagnostic = vi.fn();
  expect(await inferCategoryWithOpenAi("HDP HURBAN FOOD MONTE", categories, diagnostic)).toEqual({
    decision: "assign",
    categoryId: "restaurant",
  });
  const request = JSON.parse(fetchMock.mock.calls[0]![1].body);
  expect(request.max_output_tokens).toBeGreaterThanOrEqual(2048);
  expect(request.reasoning).toEqual({ effort: "low" });
  expect(request.store).toBe(false);
  expect(request.input[0].content).toMatch(/Uruguay/);
  expect(JSON.parse(request.input[1].content)).toEqual({
    descriptor: "HDP HURBAN FOOD MONTE",
    categories,
  });
  expect(diagnostic).toHaveBeenCalledWith(
    expect.objectContaining({
      outcome: "classified",
      model: "gpt-5-nano",
      requestId: "req-test",
    }),
  );
});
test("HTTP 200 with incomplete reasoning is diagnosed instead of looking like successful classification", async () => {
  fetchMock.mockResolvedValue(
    response({
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
      output: [{ type: "reasoning" }],
    }),
  );
  const diagnostic = vi.fn();
  expect(await inferCategoryWithOpenAi("HBO MAX", categories, diagnostic)).toBeNull();
  expect(diagnostic).toHaveBeenCalledWith(
    expect.objectContaining({
      outcome: "failed",
      reason: "incomplete_max_output_tokens",
      httpStatus: 200,
    }),
  );
});
test.each([
  ["empty_output", { status: "completed", output: [] }],
  [
    "invalid_category",
    {
      status: "completed",
      output_text: '{"decision":"assign","categoryId":"invented","reason":null}',
    },
  ],
  ["invalid_json", { status: "completed", output_text: "not JSON" }],
  [
    "refused",
    {
      status: "completed",
      output: [{ content: [{ type: "refusal", refusal: "Cannot classify" }] }],
    },
  ],
])("invalid model result %s stays unresolved with a reason", async (reason, body) => {
  fetchMock.mockResolvedValue(response(body));
  const diagnostic = vi.fn();
  expect(await inferCategoryWithOpenAi("Unknown", categories, diagnostic)).toBeNull();
  expect(diagnostic).toHaveBeenCalledWith(expect.objectContaining({ outcome: "failed", reason }));
});
test("missing credentials are reported without attempting a call", async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  const diagnostic = vi.fn();
  expect(await inferCategoryWithOpenAi("Unknown", categories, diagnostic)).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(diagnostic).toHaveBeenCalledWith(
    expect.objectContaining({
      outcome: "unavailable",
      reason: "missing_api_key",
    }),
  );
});
test("HTTP errors omit upstream bodies and secrets from diagnostics", async () => {
  fetchMock.mockResolvedValue(
    response({ error: { message: "test-key-never-log private bank text" } }, 429),
  );
  const diagnostic = vi.fn();
  expect(await inferCategoryWithOpenAi("Unknown", categories, diagnostic)).toBeNull();
  expect(diagnostic).toHaveBeenCalledWith(
    expect.objectContaining({
      outcome: "failed",
      reason: "http_429",
      httpStatus: 429,
    }),
  );
  expect(JSON.stringify(diagnostic.mock.calls)).not.toMatch(/test-key-never-log|private bank/);
});
test("timeouts report a reason without discarding the expense", async () => {
  fetchMock.mockRejectedValue(new DOMException("timeout", "TimeoutError"));
  const diagnostic = vi.fn();
  expect(await inferCategoryWithOpenAi("Unknown", categories, diagnostic)).toBeNull();
  expect(diagnostic).toHaveBeenCalledWith(
    expect.objectContaining({ outcome: "failed", reason: "timeout" }),
  );
});
test("a configured non-reasoning model does not receive GPT-5-only parameters", async () => {
  vi.stubEnv("OPENAI_MODEL", "gpt-4.1-mini");
  fetchMock.mockResolvedValue(
    response({
      status: "completed",
      output_text: '{"decision":"assign","categoryId":"restaurant","reason":null}',
    }),
  );
  expect(await inferCategoryWithOpenAi("Unknown", categories)).toEqual({
    decision: "assign",
    categoryId: "restaurant",
  });
  expect(JSON.parse(fetchMock.mock.calls[0]![1].body).reasoning).toBeUndefined();
});
