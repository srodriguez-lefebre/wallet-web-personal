import {
  createDebt,
  deleteDebt,
  generateDueRecurringDebts,
  listDebts,
  recordDebtPayment,
  updateDebt,
} from "../../db/index.js";
import { deleted, found } from "./helpers.js";

import type { HandlerMap } from "../handler-types.js";
export const debtsHandlers = {
  "debts.list": (ctx) => listDebts(ctx.db),
  "debts.create": (ctx, { body }) => createDebt(ctx.db, body),
  "debts.patch": async (ctx, { params, body }) =>
    found(await updateDebt(ctx.db, params.id, body), "Debt"),
  "debts.delete": async (ctx, { params }) => deleted(await deleteDebt(ctx.db, params.id), "Debt"),
  "debts.pay": async (ctx, { params, body }) =>
    found(await recordDebtPayment(ctx.db, params.id, body), "Debt"),
  "debts.generateRecurring": async (ctx) => {
    const result = await generateDueRecurringDebts(ctx.db, ctx.now);
    ctx.successStatus = result.length ? 201 : 200;
    return result;
  },
} satisfies Pick<
  HandlerMap,
  | "debts.list"
  | "debts.create"
  | "debts.patch"
  | "debts.delete"
  | "debts.pay"
  | "debts.generateRecurring"
>;
