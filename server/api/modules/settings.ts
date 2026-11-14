import { getSettings, patchSettings, upsertSettings } from "../../db/index.js";

import type { HandlerMap } from "../handler-types.js";
export const settingsHandlers = {
  "settings.get": (ctx) => getSettings(ctx.db),
  "settings.replace": (ctx, { body }) => upsertSettings(ctx.db, body),
  "settings.patch": (ctx, { body }) => patchSettings(ctx.db, body),
} satisfies Pick<HandlerMap, "settings.get" | "settings.replace" | "settings.patch">;
