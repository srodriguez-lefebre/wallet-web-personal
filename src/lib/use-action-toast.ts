import { useEffect, useRef, useState } from "react";
import type {
  ActionToastState,
  ActionToastStatus,
} from "@/components/ui/action-toast";

interface ActionToastOptions {
  processing?: string;
  success?: string;
  error?: string;
}

export function useActionToast() {
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const timeoutRef = useRef<number | null>(null);

  function clearTimer() {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  function showToast(status: ActionToastStatus, message: string) {
    clearTimer();
    setToast({ status, message });

    if (status !== "processing") {
      timeoutRef.current = window.setTimeout(() => setToast(null), 2200);
    }
  }

  async function runAction<T>(
    action: () => Promise<T>,
    options: ActionToastOptions = {},
  ) {
    showToast("processing", options.processing ?? "Processing...");

    try {
      const result = await action();
      showToast("success", options.success ?? "Successfully completed");
      return result;
    } catch (error) {
      showToast("error", options.error ?? "Action failed");
      throw error;
    }
  }

  useEffect(() => clearTimer, []);

  return { toast, runAction };
}
