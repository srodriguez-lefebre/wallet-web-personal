import { z } from "zod";

import { uuidSchema } from "./common.js";

export const merchantCategoryRuleSchema = z.object({
  id: uuidSchema,
  normalizedAlias: z.string().min(1),
  categorySystemKey: z.string().min(1),
  priority: z.number().int(),
  overrideMerchant: z.string().nullable(),
  overrideFromCategoryKey: z.string().nullable(),
  reviewWhenMissing: z.boolean(),
});
