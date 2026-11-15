import { sql } from "drizzle-orm";

import type { DbClient } from "../db/client.js";

/** One atomic claim and prune. The UPDATE has a one-time guard, so an unclaimed hour never scans events. */
export async function pruneExpiredMetadata(db: DbClient, now = new Date()) {
  await db.execute(sql`WITH claim AS (
    INSERT INTO provider_state(name,open_until) VALUES('maintenance:ingestion-metadata',${new Date(now.getTime() + 3600000)}::timestamptz)
    ON CONFLICT(name) DO UPDATE SET open_until=excluded.open_until
    WHERE provider_state.open_until<=${now}::timestamptz
    RETURNING name
  ) UPDATE ingestion_events SET email_thread_id=NULL,email_subject=NULL,email_from=NULL,sanitized_payload=NULL,updated_at=${now}::timestamptz
    WHERE EXISTS(SELECT 1 FROM claim) AND metadata_expires_at<${now}::timestamptz AND sanitized_payload IS NOT NULL`);
}
