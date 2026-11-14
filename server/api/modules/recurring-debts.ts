import {
  createRecurringDebt,
  deleteRecurringDebt,
  listRecurringDebts,
  updateRecurringDebt,
} from "../../db/index.js";
import { deleted, found } from "./helpers.js";

import type { HandlerMap } from "../handler-types.js";
export const recurringDebtsHandlers = {
  "recurringDebts.list": (ctx) => listRecurringDebts(ctx.db),
  "recurringDebts.create": (ctx, { body }) => createRecurringDebt(ctx.db, body),
  "recurringDebts.patch": async (ctx, { params, body }) =>
    found(await updateRecurringDebt(ctx.db, params.id, body), "Recurring debt"),
  "recurringDebts.delete": async (ctx, { params }) =>
    deleted(await deleteRecurringDebt(ctx.db, params.id), "Recurring debt"),
} satisfies Pick<
  HandlerMap,
  "recurringDebts.list" | "recurringDebts.create" | "recurringDebts.patch" | "recurringDebts.delete"
>;
