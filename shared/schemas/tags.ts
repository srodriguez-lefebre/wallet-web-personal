import { z } from "zod";

import { nonEmptyPatch } from "./common.js";

export const tagSchema = z.object({
  name: z.string().min(1),
  color: z.string().min(1),
  isActive: z.boolean().default(true),
});

export const tagPatchSchema = nonEmptyPatch({
  name: z.string().min(1).optional(),
  color: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

export type TagPatch = z.infer<typeof tagPatchSchema>;
