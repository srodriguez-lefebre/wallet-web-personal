import { z } from "zod";

export const walletBootstrapSchema = z
  .object({
    recordsLimit: z.number().int().min(1).max(500).default(200),
    recordsCursor: z.string().min(1).max(500).nullable().default(null),
  })
  .strict();
