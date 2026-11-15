import { useState, type Dispatch, type SetStateAction } from "react";

type FieldSetters<T> = { [Key in keyof T]: Dispatch<SetStateAction<T[Key]>> };

/** One draft per form; queued field updates always see the latest draft. */
export function useDraftFields<T extends object>(initial: T | (() => T)) {
  const [draft, setDraft] = useState(initial);
  const [setters] = useState(
    () =>
      Object.fromEntries(
        Object.keys(draft).map((key) => [
          key,
          (value: unknown) => {
            setDraft((current) => ({
              ...current,
              [key]:
                typeof value === "function"
                  ? (value as (previous: unknown) => unknown)(current[key as keyof T])
                  : value,
            }));
          },
        ]),
      ) as FieldSetters<T>,
  );
  return [draft, setters] as const;
}
