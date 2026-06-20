interface CategoryOption {
  id: string;
  path: string;
}

function extractOutputText(body: unknown) {
  if (!body || typeof body !== "object") return undefined;
  const response = body as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  if (response.output_text) return response.output_text;
  return response.output
    ?.flatMap((item) => item.content ?? [])
    .find((item) => item.type === "output_text")?.text;
}

export async function inferCategoryWithOpenAi(
  merchantRaw: string,
  categories: CategoryOption[],
) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || categories.length === 0) return null;
  const allowedIds = categories.map((category) => category.id);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5-nano",
      input: [
        {
          role: "system",
          content:
            "Classify the merchant into exactly one supplied personal-finance category. Use Others/Unknown expense when uncertain.",
        },
        {
          role: "user",
          content: `Merchant: ${merchantRaw}\nAllowed categories:\n${categories.map((item) => `${item.id}: ${item.path}`).join("\n")}`,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "merchant_category",
          strict: true,
          schema: {
            type: "object",
            properties: { categoryId: { type: "string", enum: allowedIds } },
            required: ["categoryId"],
            additionalProperties: false,
          },
        },
      },
      max_output_tokens: 100,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`OpenAI returned ${response.status}`);
  const parsed = JSON.parse(
    extractOutputText(await response.json()) ?? "{}",
  ) as { categoryId?: string };
  return parsed.categoryId && allowedIds.includes(parsed.categoryId)
    ? parsed.categoryId
    : null;
}
