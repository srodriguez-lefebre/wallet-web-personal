import { z } from "zod";

import {
  positiveMoneySchema,
  nonnegativeMoneySchema,
  currencySchema,
  nonEmptyPatch,
} from "./common.js";

export const investmentSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["stock", "fund", "crypto", "deposit", "other"]),
  amountInvested: positiveMoneySchema,
  currentValue: nonnegativeMoneySchema,
  currency: currencySchema,
  isVisible: z.boolean().default(true),
  startedAt: z.iso.datetime().or(z.iso.date()),
  note: z.string().optional(),
});

export const investmentPatchSchema = nonEmptyPatch({
  name: z.string().min(1).optional(),
  type: z.enum(["stock", "fund", "crypto", "deposit", "other"]).optional(),
  amountInvested: positiveMoneySchema.optional(),
  currentValue: nonnegativeMoneySchema.optional(),
  currency: currencySchema.optional(),
  isVisible: z.boolean().optional(),
  startedAt: z.iso.datetime().or(z.iso.date()).optional(),
  note: z.string().nullable().optional(),
});

export type InvestmentPatch = z.infer<typeof investmentPatchSchema>;
