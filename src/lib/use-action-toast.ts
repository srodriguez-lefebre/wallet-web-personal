import { useEffect, useMemo, useState } from "react";
import type { ActionToastState } from "@/components/ui/action-toast";
import { createActionToastRunner } from "@/lib/action-toast-runner";

export function useActionToast() {
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const runAction = useMemo(
    () =>
      createActionToastRunner((status, message) => {
        setToast({ status, message });
      }),
    [],
  );

  useEffect(() => {
    if (!toast || toast.status === "processing") return;

    const timeout = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  return { toast, runAction };
}
