import type { GoalPatch } from "@shared/schemas";
import type { CurrencyCode, GoalStatus } from "@shared/types";

export interface GoalUpdateDraft {
  name: string;
  targetAmount: string;
  currency: CurrencyCode;
  color: string;
  isVisible: boolean;
  deadline: string;
  status: GoalStatus;
  accountId: string;
  note: string;
  autoCaptureEnabled: boolean;
  autoCaptureStart: string;
  autoCaptureEnd: string;
  autoReservationAccountId: string;
}

export function buildGoalUpdatePayload(
  draft: GoalUpdateDraft,
  icon: string,
): GoalPatch {
  return {
    name: draft.name.trim(),
    targetAmount: Number(draft.targetAmount),
    currency: draft.currency,
    color: draft.color,
    isVisible: draft.isVisible,
    icon,
    deadline: draft.deadline || null,
    status: draft.status,
    accountId: draft.accountId || null,
    autoCaptureEnabled: draft.autoCaptureEnabled,
    autoCaptureStart: draft.autoCaptureEnabled
      ? draft.autoCaptureStart
      : null,
    autoCaptureEnd: draft.autoCaptureEnabled ? draft.autoCaptureEnd : null,
    autoReservationAccountId: draft.autoReservationAccountId || null,
    note: draft.note.trim() || null,
  };
}
