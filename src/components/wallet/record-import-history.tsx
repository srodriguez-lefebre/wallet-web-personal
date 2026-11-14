import { splitImportNote } from "@shared/record-review";

import type { WalletRecord } from "@shared/types";

export function ImportHistory({ record }: { record: WalletRecord }) {
  const history = [
    ...new Set([...(record.importHistory ?? []), ...splitImportNote(record.note).history]),
  ];
  if (!history.length) return null;
  return (
    <details className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
      <summary className="cursor-pointer">Import history</summary>
      <ul className="mt-1 list-disc space-y-1 pl-4">
        {history.map((entry) => (
          <li key={entry}>{entry}</li>
        ))}
      </ul>
    </details>
  );
}
