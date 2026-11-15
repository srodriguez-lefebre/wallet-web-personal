import type { ActionToastStatus } from "@/components/ui/action-toast";

export interface ActionToastOptions {
  singleFlight?: string;
  processing?: string;
  success?: string;
  error?: string;
}

export type ShowActionToast = (status: ActionToastStatus, message: string) => void;
export type ActionResult<T> = { ok: true; value: T } | { ok: false; error: Error };

export function createActionToastRunner(showToast: ShowActionToast) {
  let activeActions = 0;
  const pending = new Map<string, Promise<unknown>>();

  return async function runAction<T>(
    action: () => Promise<T>,
    options: ActionToastOptions = {},
  ): Promise<ActionResult<T>> {
    if (options.singleFlight) {
      const key = options.singleFlight;
      const existing = pending.get(key);
      if (existing) return existing as Promise<ActionResult<T>>;
      const promise = Promise.resolve()
        .then(() => runAction(action, { ...options, singleFlight: undefined }))
        .finally(() => pending.delete(key));
      pending.set(key, promise);
      return promise;
    }
    activeActions += 1;
    const processingMessage = options.processing ?? "Processing...";
    showToast("processing", processingMessage);

    try {
      const result = await action();
      activeActions = Math.max(0, activeActions - 1);

      if (activeActions > 0) {
        showToast("processing", processingMessage);
      } else {
        showToast("success", options.success ?? "Successfully completed");
      }

      return { ok: true, value: result };
    } catch (error) {
      activeActions = Math.max(0, activeActions - 1);
      showToast("error", options.error ?? "Action failed");
      return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
    }
  };
}
