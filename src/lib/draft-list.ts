type DraftRow = { id: string; name: string };
export function draftBaseline<T extends DraftRow>(rows: readonly T[]) {
  return new Map(rows.map((row) => [row.id, JSON.stringify(row)]));
}

/** Advance only acknowledged rows; retry preserves failed drafts and skips saved rows. */
export async function commitDraftRows<T extends DraftRow>(
  rows: readonly T[],
  baseline: Map<string, string>,
  write: (row: T) => Promise<unknown>,
) {
  const failures: string[] = [];
  for (const row of rows) {
    const fingerprint = JSON.stringify(row);
    if (baseline.get(row.id) === fingerprint) continue;
    try {
      await write(row);
      baseline.set(row.id, fingerprint);
    } catch (error) {
      failures.push(`${row.name}: ${error instanceof Error ? error.message : "Could not save"}`);
    }
  }
  if (failures.length)
    throw new Error(
      `Some changes could not be saved. Retry the retained drafts. ${failures.join("; ")}`,
    );
}
