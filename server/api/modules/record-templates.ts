import {
  createRecordTemplate,
  deleteRecordTemplate,
  listRecordTemplates,
  updateRecordTemplate,
} from "../../db/index.js";
import { deleted, found } from "./helpers.js";

import type { HandlerMap } from "../handler-types.js";
export const recordTemplatesHandlers = {
  "recordTemplates.list": (ctx) => listRecordTemplates(ctx.db),
  "recordTemplates.create": (ctx, { body }) => createRecordTemplate(ctx.db, body),
  "recordTemplates.patch": async (ctx, { params, body }) =>
    found(await updateRecordTemplate(ctx.db, params.id, body), "Template"),
  "recordTemplates.delete": async (ctx, { params }) =>
    deleted(await deleteRecordTemplate(ctx.db, params.id), "Template"),
} satisfies Pick<
  HandlerMap,
  | "recordTemplates.list"
  | "recordTemplates.create"
  | "recordTemplates.patch"
  | "recordTemplates.delete"
>;
