import { requireApiToken, requireIngestToken } from "../server/api/auth.js";
import { createRequestContext } from "../server/api/context.js";
import { handlers } from "../server/api/handlers.js";
import { requireMethod } from "../server/api/method.js";
import { parseBody, routeError } from "../server/api/request.js";
import { sendData, sendError } from "../server/api/response.js";
import { matchOperation, matchPath, requestPath } from "../server/api/router.js";

import type { Handler, OperationInput } from "../server/api/handler-types.js";
import type { RequestContext } from "../server/api/context.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { ApiOperation, ApiOperationId } from "../shared/api-contract.js";

function execute<K extends ApiOperationId>(
  id: K,
  ctx: RequestContext,
  operation: ApiOperation,
  params: Record<string, string>,
) {
  // This is the single runtime validation boundary for the exhaustive handler table.
  const input = {
    params: operation.params?.parse(params),
    query: operation.query?.parse(ctx.req.query),
    body: operation.body?.parse(parseBody(ctx.req)),
  } as OperationInput<K>;
  return (handlers[id] as Handler<K>)(ctx, input);
}
// One Vercel function; vercel.json preserves nested /api rewrites.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = createRequestContext(req, res);
  let status = 500;
  let failure: unknown;
  try {
    const path = requestPath(req);
    const match = matchOperation(req.method, path),
      known = matchPath(path);
    if (!known) {
      status = 404;
      sendError(res, status, "NOT_FOUND", "Not found");
      return;
    }
    const operation = match?.operation ?? known.operation;
    ctx.operationId = match?.operation.operationId;
    if (
      (operation.auth === "session" && !requireApiToken(req, res)) ||
      (operation.auth === "ingest" && !requireIngestToken(req, res))
    ) {
      status = 401;
      return;
    }
    if (!requireMethod(req, res, known.methods)) {
      status = 405;
      return;
    }
    if (!match) {
      status = 404;
      sendError(res, status, "NOT_FOUND", "Not found");
      return;
    }
    res.setHeader("X-Operation-Id", operation.operationId);
    const clientId = req.headers["x-client-operation-id"];
    if (typeof clientId === "string" && clientId !== operation.operationId) {
      status = 400;
      sendError(res, status, "CONTRACT_MISMATCH", "Client operation does not match request route");
      return;
    }
    const result = await execute(operation.operationId, ctx, operation, match.params);
    status = ctx.successStatus ?? operation.successStatus;
    sendData(res, result, status);
  } catch (error) {
    failure = error;
    status = routeError(res, error, { requestId: ctx.requestId, log: false });
  } finally {
    ctx.log(status, failure);
  }
}
