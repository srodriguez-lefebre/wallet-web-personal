import { createSessionToken, isValidApiToken } from "../auth.js";
import { HttpError } from "../errors.js";
import { assertUnlockAllowed, clearUnlockFailures, registerUnlockFailure } from "../rate-limit.js";

import type { HandlerMap } from "../handler-types.js";
export const authHandlers = {
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
    return createSessionToken(ctx.now);
  },
} satisfies Pick<HandlerMap, "auth.unlock">;
