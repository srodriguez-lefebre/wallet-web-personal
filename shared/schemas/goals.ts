import { z } from "zod";

import {
  positiveMoneySchema,
  currencySchema,
  uuidSchema,
  calendarDateSchema,
  nonEmptyPatch,
  id,
} from "./common.js";

export const goalSchema = z
  .object({
    name: z.string().min(1),
    targetAmount: positiveMoneySchema,
    currency: currencySchema,
    color: z.string().min(1),
    icon: z.string().min(1),
    isVisible: z.boolean().default(true),
    deadline: z.string().optional(),
    status: z.enum(["active", "completed", "paused", "cancelled"]).default("active"),
    accountId: uuidSchema.optional(),
    autoCaptureEnabled: z.boolean().default(false),
    autoCaptureStart: calendarDateSchema.optional(),
    autoCaptureEnd: calendarDateSchema.optional(),
    autoReservationAccountId: uuidSchema.optional(),
    note: z.string().optional(),
  })
  .superRefine((value, context) => {
    if (value.autoCaptureEnabled && (!value.autoCaptureStart || !value.autoCaptureEnd)) {
      context.addIssue({
        code: "custom",
        path: ["autoCaptureStart"],
        message: "Automatic capture requires a date range",
      });
    }
    if (
      value.autoCaptureStart &&
      value.autoCaptureEnd &&
      value.autoCaptureStart > value.autoCaptureEnd
    ) {
      context.addIssue({
        code: "custom",
        path: ["autoCaptureEnd"],
        message: "End date must be on or after start date",
      });
    }
  });

export const goalReservationSchema = z.object({
  goalId: uuidSchema,
  accountId: uuidSchema,
  amount: positiveMoneySchema,
  currency: currencySchema,
  createdAt: z.iso.datetime(),
  note: z.string().optional(),
});

export const goalReservationReleaseSchema = z.object({
  goalId: uuidSchema,
  accountId: uuidSchema,
  amount: positiveMoneySchema,
  note: z.string().optional(),
});

export const goalPatchSchema = nonEmptyPatch({
  name: z.string().min(1).optional(),
  targetAmount: positiveMoneySchema.optional(),
  currency: currencySchema.optional(),
  color: z.string().min(1).optional(),
  icon: z.string().min(1).optional(),
  isVisible: z.boolean().optional(),
  deadline: z.string().nullable().optional(),
  status: z.enum(["active", "completed", "paused", "cancelled"]).optional(),
  accountId: uuidSchema.nullable().optional(),
  autoCaptureEnabled: z.boolean().optional(),
  autoCaptureStart: calendarDateSchema.nullable().optional(),
  autoCaptureEnd: calendarDateSchema.nullable().optional(),
  autoReservationAccountId: uuidSchema.nullable().optional(),
  note: z.string().nullable().optional(),
});

export type GoalPatch = z.infer<typeof goalPatchSchema>;

export const reservationMovementResponseSchema = goalReservationSchema.extend({
  ...id,
  type: z.enum(["reserve", "consume", "restore", "release"]),
  recordId: uuidSchema.optional(),
  reversesMovementId: uuidSchema.optional(),
});

export const goalResponseSchema = goalSchema.safeExtend({
  ...id,
  tagIds: z.array(uuidSchema).default([]),
});
