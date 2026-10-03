import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionToast } from "@/components/ui/action-toast";
import { useActionToast } from "@/lib/use-action-toast";
import { useWallet } from "@/providers/wallet-provider";
import { formatMoney } from "@shared/calculations";
import type { RecordTemplate } from "@shared/types";

export function RecordTemplateLibrary({
  onUse,
  onEdit,
}: {
  onUse: (template: RecordTemplate) => void;
  onEdit: (template: RecordTemplate) => void;
}) {
  const { dataset, deleteRecordTemplate } = useWallet();
  const [expanded, setExpanded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef(false),
    { toast, runAction } = useActionToast();
  const templates = dataset.recordTemplates ?? [];
  async function remove(id: string) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await runAction(() => deleteRecordTemplate(id), {
        processing: "Removing template...",
        success: "Template removed",
        error: "Could not remove template",
      });
    } catch {
      setError(
        "Could not remove the template or refresh its library. Reload to check its current state, then retry.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <Card className="mb-4">
      <ActionToast toast={toast} />
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>Record templates</CardTitle>
        <Button
          variant="outline"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          {expanded ? "Hide templates" : `Open templates (${templates.length})`}
        </Button>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Reusable details for regular payments or income. Using a template
            opens a new draft; check the date and current conversions before
            confirming. Save one from the record form.
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {templates.length === 0 ? (
            <p className="text-sm">No saved templates yet.</p>
          ) : (
            <ul className="divide-y">
              {templates.map((template) => (
                <li
                  key={template.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="break-words font-medium">{template.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {template.type} ·{" "}
                      {formatMoney(template.amount, template.currency)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={busy}
                      variant="outline"
                      onClick={() => onUse(template)}
                      aria-label={`Use template ${template.name}`}
                    >
                      Use
                    </Button>
                    <Button
                      disabled={busy}
                      variant="outline"
                      onClick={() => onEdit(template)}
                      aria-label={`Edit template ${template.name}`}
                    >
                      Edit
                    </Button>
                    <Button
                      disabled={busy}
                      variant="ghost"
                      onClick={() => void remove(template.id)}
                      aria-label={`Remove template ${template.name}`}
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      )}
    </Card>
  );
}
