import type { z, ZodType } from "zod";
import type { ApiOperationId, apiOperations } from "../../shared/api-contract.js";
import type { RequestContext } from "./context.js";

type Operation<K extends ApiOperationId> = Extract<
  (typeof apiOperations)[number],
  { operationId: K }
>;
type SchemaValue<O, K extends PropertyKey> =
  O extends Record<K, ZodType> ? z.infer<O[K]> : undefined;
export type OperationInput<K extends ApiOperationId> = {
  params: SchemaValue<Operation<K>, "params">;
  query: SchemaValue<Operation<K>, "query">;
  body: SchemaValue<Operation<K>, "body">;
};
export type Handler<K extends ApiOperationId> = (
  ctx: RequestContext,
  input: OperationInput<K>,
) => unknown;
export type HandlerMap = { [K in ApiOperationId]: Handler<K> };
