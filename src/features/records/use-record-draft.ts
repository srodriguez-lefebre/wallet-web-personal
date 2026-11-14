import { useCallback, useMemo, useReducer } from "react";

import type { Dispatch, SetStateAction } from "react";
import type { RecordDraft } from "@/lib/record-draft";

type DraftUpdate = (draft: RecordDraft) => RecordDraft;
type DraftSetters = {
  [Key in keyof RecordDraft as `set${Capitalize<Key>}`]: Dispatch<SetStateAction<RecordDraft[Key]>>;
};
const fields = {
  type: true,
  accountId: true,
  creditCardId: true,
  currency: true,
  exchangeRateToLimitCurrency: true,
  destinationAccountId: true,
  categoryId: true,
  amount: true,
  accountAmount: true,
  destinationAmount: true,
  primaryRate: true,
  moneyError: true,
  note: true,
  tagId: true,
  goalAssociations: true,
  counterpartyName: true,
  occurredAtLocal: true,
  paymentType: true,
  paymentStatus: true,
} satisfies Record<keyof RecordDraft, true>;
function applyDraftUpdate(draft: RecordDraft, update: DraftUpdate) {
  return update(draft);
}
function createSetters(dispatch: Dispatch<DraftUpdate>): DraftSetters {
  function setter<Key extends keyof RecordDraft>(key: Key) {
    return (next: SetStateAction<RecordDraft[Key]>) =>
      dispatch((current) => ({
        ...current,
        [key]: typeof next === "function" ? next(current[key]) : next,
      }));
  }
  // The exhaustive field map above guarantees the same keys as the mapped type.
  return Object.fromEntries(
    (Object.keys(fields) as (keyof RecordDraft)[]).map((key) => [
      `set${key.charAt(0).toUpperCase()}${key.slice(1)}`,
      setter(key),
    ]),
  ) as DraftSetters;
}
export function useRecordDraft(initial: () => RecordDraft) {
  const [draft, dispatch] = useReducer(applyDraftUpdate, undefined, initial);
  const setters = useMemo(() => createSetters(dispatch), [dispatch]);
  const setDraft = useCallback(
    (next: SetStateAction<RecordDraft>) =>
      dispatch((current) => (typeof next === "function" ? next(current) : next)),
    [],
  );
  return { ...draft, ...setters, draft, setDraft };
}
