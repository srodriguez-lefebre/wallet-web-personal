import type { ZodType } from "zod";

export function hasOwn(value: object, key: PropertyKey) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/** Validate a full entity while preserving omitted fields and explicit null clearing. */
export function mergePatch<T extends object>(
  schema: ZodType<T>,
  current: T,
  input: Partial<{ [K in keyof T]: T[K] | null }>,
  nullableKeys: readonly (keyof T)[] = [],
): T {
  const merged = { ...current, ...input };
  for (const key of nullableKeys) {
    if (input[key] === null) merged[key] = undefined as T[keyof T];
  }
  return schema.parse(merged);
}

/** Conversion spec uses database column names matching their input property names. */
export function changedColumns<M, S extends Record<string, (merged: M) => unknown>>(
  input: object,
  merged: M,
  spec: S,
): Partial<{ [K in keyof S]: ReturnType<S[K]> }> {
  const values: Partial<{ [K in keyof S]: ReturnType<S[K]> }> = {};
  for (const key of Object.keys(spec) as (keyof S)[]) {
    if (hasOwn(input, key)) values[key] = spec[key]!(merged) as ReturnType<S[typeof key]>;
  }
  return values;
}
