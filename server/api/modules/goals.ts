import { createGoal, deleteGoal, listGoals, updateGoal } from "../../db/index.js";
import { deleted, found } from "./helpers.js";

import type { HandlerMap } from "../handler-types.js";
export const goalsHandlers = {
  "goals.list": (ctx) => listGoals(ctx.db),
  "goals.create": (ctx, { body }) => createGoal(ctx.db, body),
  "goals.patch": async (ctx, { params, body }) =>
    found(await updateGoal(ctx.db, params.id, body), "Goal"),
  "goals.delete": async (ctx, { params }) => deleted(await deleteGoal(ctx.db, params.id), "Goal"),
} satisfies Pick<HandlerMap, "goals.list" | "goals.create" | "goals.patch" | "goals.delete">;
