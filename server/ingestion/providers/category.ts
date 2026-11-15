import { inferCategoryWithOpenAi, type CategoryInferenceDiagnostic } from "../openai-category.js";
import { runProvider } from "./circuit.js";

import type { Provider } from "./types.js";
import type { DbClient } from "../../db/client.js";

interface CategoryInput {
  merchantRaw: string;
  categories: { id: string; path: string }[];
  report?: (diagnostic: CategoryInferenceDiagnostic) => void;
}
export const categoryProvider: Provider<CategoryInput, string> = {
  name: "openai:category",
  async call(input, context) {
    let diagnostic: CategoryInferenceDiagnostic | undefined;
    const id = await inferCategoryWithOpenAi(
      input.merchantRaw,
      input.categories,
      (value) => {
        diagnostic = value;
        input.report?.(value);
      },
      context,
    );
    if (id) return { status: "ok", value: id };
    return {
      status: diagnostic?.outcome === "failed" ? "failed" : "unavailable",
      reason: diagnostic?.reason ?? "unresolved",
    };
  },
};
export async function callCategoryProvider(db: DbClient, input: CategoryInput) {
  const started = performance.now();
  let diagnostic: CategoryInferenceDiagnostic | undefined;
  const result = await runProvider(
    db,
    categoryProvider,
    {
      ...input,
      report: (value) => {
        diagnostic = value;
        input.report?.(value);
      },
    },
    { budgetMs: 10000 },
  );
  if (result.status === "ok") return result.value;
  if (diagnostic?.reason !== result.reason)
    input.report?.({
      outcome: result.status,
      model: process.env.OPENAI_MODEL?.trim() || "gpt-5-nano",
      reason: result.reason,
      elapsedMs: Math.round(performance.now() - started),
    });
  return null;
}
