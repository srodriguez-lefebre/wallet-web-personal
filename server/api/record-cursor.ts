import { Buffer } from "node:buffer";
import { z } from "zod";
import { uuidSchema } from "../../shared/schemas.js";
import { validationError } from "./errors.js";

const cursorPayloadSchema = z.object({
  occurredAt: z.string().datetime(),
  id: uuidSchema,
}).strict();

export type RecordCursor = z.infer<typeof cursorPayloadSchema>;

export function encodeRecordCursor(cursor: RecordCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeRecordCursor(cursor: string): RecordCursor {
  try {
    return cursorPayloadSchema.parse(
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
    );
  } catch {
    throw validationError("Invalid records cursor");
  }
}
