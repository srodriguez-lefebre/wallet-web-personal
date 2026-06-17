import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type ActionToastState = {
  status: ActionToastStatus;
  message: string;
};

export type ActionToastStatus = "processing" | "success" | "error";

export function ActionToast({ toast }: { toast: ActionToastState | null }) {
  if (!toast) return null;

  const Icon =
    toast.status === "processing"
      ? Loader2
      : toast.status === "success"
        ? CheckCircle2
        : XCircle;

  return (
    <div
      className={cn(
        "fixed bottom-5 right-5 z-[70] inline-flex items-center gap-2 rounded-full border bg-card px-3 py-2 text-sm font-medium shadow-lg",
        toast.status === "processing" &&
          "border-sky-500/30 text-sky-600 dark:text-sky-300",
        toast.status === "success" &&
          "border-emerald-500/30 text-emerald-600 dark:text-emerald-300",
        toast.status === "error" &&
          "border-red-500/30 text-red-600 dark:text-red-300",
      )}
      role="status"
      aria-live="polite"
    >
      <Icon
        className={cn(
          "h-4 w-4",
          toast.status === "processing" && "animate-spin",
        )}
      />
      {toast.message}
    </div>
  );
}
