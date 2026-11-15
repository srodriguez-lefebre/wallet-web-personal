import type { ProviderContext } from "./types.js";

/** Bounds the whole call, including reading the response body, even if fetch ignores abort. */
export async function withProviderBudget<T>(
  budgetMs: number,
  parent: AbortSignal | undefined,
  call: (context: ProviderContext & { signal: AbortSignal }) => Promise<T>,
): Promise<T> {
  if (parent?.aborted) throw parent.reason;
  if (!Number.isFinite(budgetMs) || budgetMs <= 0)
    throw new DOMException("Provider budget exhausted", "TimeoutError");
  const controller = new AbortController();
  let abortParent: () => void = () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancelled = new Promise<never>((_, reject) => {
    const abort = (reason: Error) => {
      controller.abort(reason);
      reject(reason);
    };
    abortParent = () => {
      abort(
        parent?.reason instanceof Error ? parent.reason : new DOMException("Aborted", "AbortError"),
      );
    };
    parent?.addEventListener("abort", abortParent, { once: true });
    timer = setTimeout(() => {
      abort(new DOMException("Provider budget exhausted", "TimeoutError"));
    }, budgetMs);
  });
  try {
    return await Promise.race([call({ signal: controller.signal, budgetMs }), cancelled]);
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", abortParent);
  }
}
