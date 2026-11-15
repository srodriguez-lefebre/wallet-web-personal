import { z } from "zod";

import { mailSources } from "./mail-normalization.js";

export const mailSourceSchema = z.enum(mailSources);
/** Historical clients used custom labels. Preserve their audit and cross-source identity. */
export const compatibleMailSourceSchema = mailSourceSchema.or(z.string().min(1).max(100));
