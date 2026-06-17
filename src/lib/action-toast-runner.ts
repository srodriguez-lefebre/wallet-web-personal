import type { ActionToastStatus } from "@/components/ui/action-toast";

export interface ActionToastOptions {
  processing?: string;
  success?: string;
  error?: string;
}

export type ShowActionToast = (
  status: ActionToastStatus,
  message: string,
) => void;

export function createActionToastRunner(showToast: ShowActionToast) {
  let activeActions = 0;

  return async function runAction<T>(
    action: () => Promise<T>,
    options: ActionToastOptions = {},
  ) {
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

      return result;
    } catch (error) {
      activeActions = Math.max(0, activeActions - 1);
      showToast("error", options.error ?? "Action failed");
      throw error;
    }
  };
}
