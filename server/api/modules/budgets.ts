import { createBudget, deleteBudget, listBudgets, updateBudget } from "../../db/index.js";
import { deleted, found } from "./helpers.js";

import type { HandlerMap } from "../handler-types.js";
export const budgetsHandlers = {
  "budgets.list": (ctx) => listBudgets(ctx.db),
  "budgets.create": (ctx, { body }) => createBudget(ctx.db, body),
  "budgets.patch": async (ctx, { params, body }) =>
    found(await updateBudget(ctx.db, params.id, body), "Budget"),
  "budgets.delete": async (ctx, { params }) =>
    deleted(await deleteBudget(ctx.db, params.id), "Budget"),
} satisfies Pick<
  HandlerMap,
  "budgets.list" | "budgets.create" | "budgets.patch" | "budgets.delete"
>;
