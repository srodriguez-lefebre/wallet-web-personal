import type { RecordPatch } from "@shared/schemas";
import type { WalletRecord } from "@shared/types";

export function historicalGoalPatches(
  records: readonly WalletRecord[],
  selections: readonly { goalId: string; recordIds: readonly string[] }[],
): { id: string; patch: RecordPatch }[] {
  const selected = new Map<string, Set<string>>();
  for (const group of selections)
    for (const id of group.recordIds) {
      const goals = selected.get(id) ?? new Set<string>();
      goals.add(group.goalId);
      selected.set(id, goals);
    }
  return records.flatMap((record) => {
    const goals = selected.get(record.id);
    if (!goals) return [];
    const additions = [...goals].filter((id) => !(record.goalIds ?? []).includes(id));
    if (!additions.length) return [];
    return [
      {
        id: record.id,
        patch: {
          expectedUpdatedAt: record.updatedAt,
          goalIds: [...(record.goalIds ?? []), ...additions],
          goalAssociations: [
            ...(record.goalAssociations ?? []),
            ...additions.map((goalId) => ({
              goalId,
              assignmentSource: "date_rule" as const,
              useReserved: false,
              reserveIncome: true,
            })),
          ],
        },
      },
    ];
  });
}
