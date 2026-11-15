import { z } from "zod";

import {
  recordTypeSchema,
  currencySchema,
  uuidSchema,
  paymentTypeSchema,
  nonEmptyPatch,
} from "./common.js";

export const recordTemplateSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    type: recordTypeSchema,
    amount: z.number().finite().positive(),
    currency: currencySchema,
    accountId: uuidSchema.optional(),
    creditCardId: uuidSchema.optional(),
    destinationAccountId: uuidSchema.optional(),
    categoryId: uuidSchema.optional(),
    tagId: uuidSchema.optional(),
    counterpartyName: z.string().optional(),
    note: z.string().optional(),
    paymentType: paymentTypeSchema,
  })
  .strict();

export const recordTemplatePatchSchema = nonEmptyPatch({
  name: recordTemplateSchema.shape.name.optional(),
  type: recordTypeSchema.optional(),
  amount: recordTemplateSchema.shape.amount.optional(),
  currency: currencySchema.optional(),
  accountId: uuidSchema.nullable().optional(),
  creditCardId: uuidSchema.nullable().optional(),
  destinationAccountId: uuidSchema.nullable().optional(),
  categoryId: uuidSchema.nullable().optional(),
  tagId: uuidSchema.nullable().optional(),
  counterpartyName: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  paymentType: paymentTypeSchema.optional(),
});

export type RecordTemplatePatch = z.infer<typeof recordTemplatePatchSchema>;
