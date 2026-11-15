import { z } from "zod";

import { uuidSchema, nonEmptyPatch } from "./common.js";

export const categorySchema = z.object({
  name: z.string().min(1),
  parentId: uuidSchema.optional(),
  color: z.string().min(1),
  icon: z.string().min(1),
});

export const categoryPatchSchema = nonEmptyPatch({
  name: z.string().min(1).optional(),
  parentId: uuidSchema.nullable().optional(),
  color: z.string().min(1).optional(),
  icon: z.string().min(1).optional(),
});

export type CategoryPatch = z.infer<typeof categoryPatchSchema>;
