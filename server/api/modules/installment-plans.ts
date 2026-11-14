import {
  createInstallmentPlan,
  deleteInstallmentPlan,
  listInstallmentPlans,
  updateInstallmentPlan,
} from "../../db/index.js";
import { deleted, found } from "./helpers.js";

import type { HandlerMap } from "../handler-types.js";
export const installmentPlansHandlers = {
  "installmentPlans.list": (ctx) => listInstallmentPlans(ctx.db),
  "installmentPlans.create": (ctx, { body }) => createInstallmentPlan(ctx.db, body),
  "installmentPlans.patch": async (ctx, { params, body }) =>
    found(await updateInstallmentPlan(ctx.db, params.id, body), "Installment plan"),
  "installmentPlans.delete": async (ctx, { params }) =>
    deleted(await deleteInstallmentPlan(ctx.db, params.id), "Installment plan"),
} satisfies Pick<
  HandlerMap,
  | "installmentPlans.list"
  | "installmentPlans.create"
  | "installmentPlans.patch"
  | "installmentPlans.delete"
>;
