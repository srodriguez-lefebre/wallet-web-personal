import {
  IngestionInProgressError,
  processMailIngestion,
} from "../../ingestion/process-mail-ingestion.js";
import { HttpError } from "../errors.js";

import type { HandlerMap } from "../handler-types.js";
export const ingestHandlers = {
  "ingest.mailTransaction": async (ctx, { body }) => {
    try {
      const result = await processMailIngestion(ctx.db, body);
      ctx.successStatus =
        result.status === "created" || result.status === "needs_review" ? 201 : 200;
      return result;
    } catch (error) {
      if (error instanceof IngestionInProgressError)
        throw new HttpError(
          503,
          "SERVICE_UNAVAILABLE",
          "Ingestion is still processing; retry later",
        );
      throw error;
    }
  },
} satisfies Pick<HandlerMap, "ingest.mailTransaction">;
