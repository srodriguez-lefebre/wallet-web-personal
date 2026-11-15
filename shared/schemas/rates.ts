import { z } from "zod";

import { id, currencySchema } from "./common.js";

export const exchangeRateResponseSchema = z.object({
  ...id,
  fromCurrency: currencySchema,
  toCurrency: currencySchema,
  rate: z.number().positive(),
  date: z.string(),
  source: z.string().optional(),
});
