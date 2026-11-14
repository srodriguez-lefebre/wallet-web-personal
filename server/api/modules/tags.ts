import { createTag, deleteTag, listTags, updateTag } from "../../db/index.js";
import { deleted, found } from "./helpers.js";

import type { HandlerMap } from "../handler-types.js";
export const tagsHandlers = {
  "tags.list": (ctx) => listTags(ctx.db),
  "tags.create": (ctx, { body }) => createTag(ctx.db, body),
  "tags.patch": async (ctx, { params, body }) =>
    found(await updateTag(ctx.db, params.id, body), "Tag"),
  "tags.delete": async (ctx, { params }) => deleted(await deleteTag(ctx.db, params.id), "Tag"),
} satisfies Pick<HandlerMap, "tags.list" | "tags.create" | "tags.patch" | "tags.delete">;
