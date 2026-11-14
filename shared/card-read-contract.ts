import { z } from "zod";

import { referenceQuerySchema } from "./reference-contract.js";
import {
  cardStatementResponseSchema,
  creditCardSchema,
  currencySchema,
  uuidSchema,
  walletDatasetSchema,
} from "./schemas.js";

export const cardAgendaQuerySchema = referenceQuerySchema;
const currencyAmounts = z.array(z.object({ currency: currencySchema, amount: z.number() }));
export const cardAgendaSchema = z.array(
  z.object({
    card: creditCardSchema.extend({ id: uuidSchema }),
    statement: cardStatementResponseSchema,
    totalAmountInLimitCurrency: z.number(),
    paidAmountInLimitCurrency: z.number(),
    dueAmountInLimitCurrency: z.number(),
    currencyBreakdown: currencyAmounts,
    daysUntilDue: z.number().int(),
    urgency: z.enum(["overdue", "today", "soon", "later"]),
    href: z.string(),
  }),
);
export const cardCategoryUsageSchema = z.array(
  z.object({
    id: z.union([uuidSchema, z.literal("uncategorized")]),
    name: z.string(),
    color: z.string(),
    amount: z.number(),
  }),
);
export const cardLedgerSchema = walletDatasetSchema.pick({
  creditCardRecords: true,
  creditCardStatements: true,
  creditCardPayments: true,
  creditCardPaymentAllocations: true,
});
export type CardAgendaQuery = z.infer<typeof cardAgendaQuerySchema>;
export type CardAgenda = z.infer<typeof cardAgendaSchema>;
export type CardLedger = z.infer<typeof cardLedgerSchema>;
