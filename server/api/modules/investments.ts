import {
  createInvestment,
  deleteInvestment,
  listInvestments,
  updateInvestment,
} from "../../db/index.js";
import { deleted, found } from "./helpers.js";

import type { HandlerMap } from "../handler-types.js";
export const investmentsHandlers = {
  "investments.list": (ctx) => listInvestments(ctx.db),
  "investments.create": (ctx, { body }) => createInvestment(ctx.db, body),
  "investments.patch": async (ctx, { params, body }) =>
    found(await updateInvestment(ctx.db, params.id, body), "Investment"),
  "investments.delete": async (ctx, { params }) =>
    deleted(await deleteInvestment(ctx.db, params.id), "Investment"),
} satisfies Pick<
  HandlerMap,
  "investments.list" | "investments.create" | "investments.patch" | "investments.delete"
>;
