import { notFoundError } from "../errors.js";
export function found<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) throw notFoundError(label);
  return value;
}
export function deleted(value: boolean, label: string) {
  if (!value) throw notFoundError(label);
  return { deleted: true } as const;
}
