import { getSessionVersion } from "../db/session-state.js";
import { extractBearerToken, requireApiToken } from "./auth.js";
import { sendError } from "./response.js";
import { inspectRevocableSession, revocableSessionsEnabled } from "./session-revocation.js";

import type { VercelResponse } from "@vercel/node";
import type { RequestContext } from "./context.js";

export async function requireRequestSession(ctx: RequestContext, res: VercelResponse) {
  if (!revocableSessionsEnabled()) return requireApiToken(ctx.req, res);
  const claims = inspectRevocableSession(extractBearerToken(ctx.req), ctx.now);
  if (!claims || claims.version !== (await getSessionVersion(ctx.db))) {
    sendError(res, 401, "UNAUTHORIZED", "Invalid, expired or revoked session");
    return false;
  }
  return true;
}
