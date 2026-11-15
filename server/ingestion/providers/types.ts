export interface ProviderContext {
  signal?: AbortSignal;
  budgetMs: number;
}
export type ProviderResult<T> =
  | { status: "ok"; value: T; reason?: never }
  | { status: "failed" | "unavailable"; reason: string };
export interface Provider<Input, Output> {
  name: string;
  call(input: Input, context: ProviderContext): Promise<ProviderResult<Output>>;
}
