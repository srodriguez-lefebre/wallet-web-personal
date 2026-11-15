import { z } from "zod";

export const unlockSchema = z.object({
  token: z.string().min(1),
});
