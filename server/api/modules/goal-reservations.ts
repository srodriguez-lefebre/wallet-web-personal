import {
  createGoalReservation,
  deleteGoalReservation,
  listGoalReservations,
  releaseGoalReservation,
} from "../../db/index.js";
import { deleted } from "./helpers.js";

import type { HandlerMap } from "../handler-types.js";
export const goalReservationsHandlers = {
  "goalReservations.list": (ctx) => listGoalReservations(ctx.db),
  "goalReservations.create": (ctx, { body }) => createGoalReservation(ctx.db, body),
  "goalReservations.release": (ctx, { body }) => releaseGoalReservation(ctx.db, body),
  "goalReservations.delete": async (ctx, { params }) =>
    deleted(await deleteGoalReservation(ctx.db, params.id), "Reservation"),
} satisfies Pick<
  HandlerMap,
  | "goalReservations.list"
  | "goalReservations.create"
  | "goalReservations.release"
  | "goalReservations.delete"
>;
