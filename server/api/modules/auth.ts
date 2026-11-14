import { getSessionVersion, revokeAllSessions } from "../../db/session-state.js";
import { createSessionToken, isValidApiToken } from "../auth.js";
import { HttpError } from "../errors.js";
import { assertUnlockAllowed, clearUnlockFailures, registerUnlockFailure } from "../rate-limit.js";
import { createRevocableSessionToken, revocableSessionsEnabled } from "../session-revocation.js";

import type { HandlerMap } from "../handler-types.js";
export const authHandlers = {
  "auth.session": () => ({ revocable: revocableSessionsEnabled() }),
  "auth.lockAll": async (ctx) => {
    if (!revocableSessionsEnabled())
      throw new HttpError(503, "SERVICE_UNAVAILABLE", "Session revocation has not been activated");
    await revokeAllSessions(ctx.db);
    return { locked: true };
  },
  "auth.unlock": async (ctx, { body }) => {
    const limit = await assertUnlockAllowed(ctx.db, ctx.req);
    if (!limit.allowed) {
      ctx.setHeader("Retry-After", String(limit.retryAfter));
      throw new HttpError(429, "TOO_MANY_REQUESTS", "Too many unlock attempts");
    }
    if (!isValidApiToken(body.token)) {
      await registerUnlockFailure(ctx.db, limit.key);
      throw new HttpError(401, "UNAUTHORIZED", "Invalid token");
    }
    await clearUnlockFailures(ctx.db, limit.key);
    return revocableSessionsEnabled()
      ? createRevocableSessionToken(await getSessionVersion(ctx.db), ctx.now)
      : createSessionToken(ctx.now);
  },
} satisfies Pick<HandlerMap, "auth.unlock" | "auth.session" | "auth.lockAll">;
