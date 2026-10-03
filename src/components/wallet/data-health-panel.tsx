import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionToast } from "@/components/ui/action-toast";
import { useActionToast } from "@/lib/use-action-toast";
import { walletDataHealth } from "@shared/data-quality";
import type { WalletDataset } from "@shared/types";

interface Props {
  getSnapshot: () => Promise<WalletDataset>;
  onReview: () => void;
  onRecords: () => void;
  onCards: () => void;
}
export function DataHealthPanel({
  getSnapshot,
  onReview,
  onRecords,
  onCards,
}: Props) {
  const [result, setResult] = useState<{
    counts: ReturnType<typeof walletDataHealth>;
    checkedAt: string;
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const running = useRef(false);
  const { toast, runAction } = useActionToast();
  async function check() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await runAction(
        async () => {
          const snapshot = await getSnapshot();
          setResult({
            counts: walletDataHealth(snapshot),
            checkedAt: new Date().toISOString(),
          });
        },
        {
          processing: "Checking complete history...",
          success: "Data check complete",
          error: "Could not check data",
        },
      );
    } catch {
      setError("Could not load complete history. Retry the check.");
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  const metrics = result
    ? ([
        ["Needs review", result.counts.review, onReview],
        ["Uncategorized records", result.counts.uncategorized, onRecords],
        ["Missing conversions", result.counts.conversions, onRecords],
        ["Broken references", result.counts.references, onRecords],
      ] as const)
    : [];
  return (
    <Card className="mb-4">
      <CardHeader className="flex flex-wrap flex-row items-center justify-between gap-3">
        <CardTitle>Data check</CardTitle>
        <Button variant="outline" disabled={busy} onClick={check}>
          {busy ? "Checking..." : "Check complete history"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Review complete history, including archived account and category
          references. This check leaves your data unchanged.
        </p>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {result ? (
          <>
            <p className="text-xs text-muted-foreground">
              Checked {new Date(result.checkedAt).toLocaleString("es-UY")}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {metrics.map(([label, count, open]) => (
                <button
                  key={label}
                  type="button"
                  onClick={open}
                  className="rounded-md border p-3 text-left hover:bg-secondary"
                >
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p
                    className={`text-2xl font-semibold ${count ? "text-amber-600" : "text-emerald-600"}`}
                  >
                    {count}
                  </p>
                </button>
              ))}
            </div>
            {result.counts.references ? (
              <Button variant="outline" onClick={onCards}>
                Review card history
              </Button>
            ) : null}
            {Object.values(result.counts).every((count) => count === 0) ? (
              <p className="text-sm text-emerald-600">
                No issues found by these checks.
              </p>
            ) : null}
          </>
        ) : null}
        <ActionToast toast={toast} />
      </CardContent>
    </Card>
  );
}
