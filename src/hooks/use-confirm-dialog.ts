import { useCallback, useEffect, useRef, useState } from "react";

interface Confirmation {
  title: string;
  description: string;
  confirmLabel?: string;
}

/** A cancelled/unmounted dialog must settle its caller before any mutation starts. */
export function useConfirmDialog() {
  const [request, setRequest] = useState<Confirmation | null>(null);
  const pending = useRef<((accepted: boolean) => void) | null>(null);
  const active = useRef(false);
  const finish = useCallback((accepted: boolean) => {
    const resolve = pending.current;
    pending.current = null;
    setRequest(null);
    resolve?.(accepted);
  }, []);
  const confirm = useCallback((next: Confirmation) => {
    if (!active.current) return Promise.resolve(false);
    pending.current?.(false);
    setRequest(next);
    return new Promise<boolean>((resolve) => {
      pending.current = resolve;
    });
  }, []);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      pending.current?.(false);
      pending.current = null;
    };
  }, []);
  return {
    confirm,
    isActive: () => active.current,
    confirmationProps: {
      open: request !== null,
      title: request?.title ?? "Confirm change",
      description: request?.description ?? "",
      confirmLabel: request?.confirmLabel ?? "Confirm",
      onOpenChange: (open: boolean) => {
        if (!open) finish(false);
      },
      onConfirm: () => finish(true),
    },
  };
}
