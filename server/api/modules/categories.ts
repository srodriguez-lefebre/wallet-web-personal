import {
  categoryUsage,
  createCategory,
  deleteCategory,
  listCategories,
  mergeCategory,
  updateCategory,
} from "../../db/index.js";
import { conflictError, notFoundError } from "../errors.js";
import { found } from "./helpers.js";

import type { HandlerMap } from "../handler-types.js";
export const categoriesHandlers = {
  "categories.list": (ctx, { query }) => listCategories(ctx.db, query.includeArchived === "true"),
  "categories.create": (ctx, { body }) => createCategory(ctx.db, body),
  "categories.patch": async (ctx, { params, body }) =>
    found(await updateCategory(ctx.db, params.id, body), "Category"),
  "categories.usage": (ctx, { query }) => categoryUsage(ctx.db, query.ids?.split(",")),
  "categories.merge": (ctx, { params, body }) => mergeCategory(ctx.db, params.id, body.targetId),
  "categories.delete": async (ctx, { params }) => {
    const result = await deleteCategory(ctx.db, params.id);
    if (!result.deleted) {
      if (result.reason === "not_found") throw notFoundError("Category");
      throw conflictError("Protected categories cannot be deleted");
    }
    return result;
  },
} satisfies Pick<
  HandlerMap,
  | "categories.list"
  | "categories.create"
  | "categories.patch"
  | "categories.delete"
  | "categories.usage"
  | "categories.merge"
>;
