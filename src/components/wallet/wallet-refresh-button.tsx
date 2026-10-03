import { useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionToast } from "@/components/ui/action-toast";
import { useActionToast } from "@/lib/use-action-toast";

export function WalletRefreshButton({
  refresh,
}: {
  refresh: () => Promise<unknown>;
}) {
  const pending = useRef(false),
    [busy, setBusy] = useState(false),
    [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const { toast, runAction } = useActionToast();
  async function check() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      await runAction(
        async () => {
          await refresh();
          setCheckedAt(new Date());
        },
        {
          processing: "Refreshing wallet...",
          success: "Wallet refreshed",
          error: "Could not refresh wallet",
        },
      );
    } catch {
      /* Keep the previous successful check time and allow a retry. */
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ActionToast toast={toast} />
      <Button variant="outline" disabled={busy} onClick={() => void check()}>
        <RefreshCw className={`mr-2 h-4 w-4 ${busy ? "animate-spin" : ""}`} />
        {busy ? "Refreshing..." : "Refresh data"}
      </Button>
      {checkedAt && (
        <span className="text-xs text-muted-foreground">
          Checked {checkedAt.toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}
