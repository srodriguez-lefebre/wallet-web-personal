import { sql } from "drizzle-orm";

import { withProviderBudget } from "./budget.js";

import type { Provider, ProviderContext, ProviderResult } from "./types.js";
import type { DbClient } from "../../db/client.js";

export const providerFailureThreshold = 3;
export const providerCooldownMs = 5 * 60_000;

/** Each generation fences completions from calls that preceded a circuit transition. */
export async function runProvider<I, O>(
  db: DbClient,
  provider: Provider<I, O>,
  input: I,
  context: ProviderContext & { now?: Date },
): Promise<ProviderResult<O>> {
  const now = context.now ?? new Date();
  let generation: number, probe: boolean;
  try {
    const grant = await db.execute(sql`INSERT INTO provider_state(name,failures,generation)
      VALUES(${provider.name},0,0)
      ON CONFLICT(name) DO UPDATE SET
        open_until=CASE WHEN provider_state.failures>=${providerFailureThreshold} THEN ${new Date(now.getTime() + context.budgetMs + 1000)}::timestamptz ELSE NULL END,
        generation=provider_state.generation+CASE WHEN provider_state.failures>=${providerFailureThreshold} THEN 1 ELSE 0 END
      WHERE provider_state.open_until IS NULL OR provider_state.open_until<=${now}::timestamptz
      RETURNING generation,failures`);
    const row = grant.rows[0];
    if (!row) return { status: "unavailable", reason: "circuit_open" };
    generation = Number(row.generation);
    probe = Number(row.failures) >= providerFailureThreshold;
  } catch {
    return { status: "unavailable", reason: "provider_state_unavailable" };
  }
  let result: ProviderResult<O>;
  try {
    result = await withProviderBudget(context.budgetMs, context.signal, (limits) =>
      provider.call(input, limits),
    );
  } catch (error) {
    result = {
      status: "failed",
      reason:
        error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
          ? "timeout"
          : "provider_error",
    };
  }
  // An unavailable configuration is neutral; a leased probe still needs a cooldown.
  if (result.status === "unavailable" && !probe) return result;
  const finished = context.now ?? new Date();
  try {
    if (result.status === "ok")
      await db.execute(
        sql`UPDATE provider_state SET failures=0,open_until=NULL,generation=generation+1 WHERE name=${provider.name} AND generation=${generation}`,
      );
    else
      await db.execute(sql`UPDATE provider_state SET
      failures=least(failures+1,${providerFailureThreshold}),
      open_until=CASE WHEN failures+1>=${providerFailureThreshold} THEN ${new Date(finished.getTime() + providerCooldownMs)}::timestamptz ELSE NULL END,
      generation=generation+CASE WHEN failures+1>=${providerFailureThreshold} THEN 1 ELSE 0 END
      WHERE name=${provider.name} AND generation=${generation}`);
  } catch {
    return { status: "unavailable", reason: "provider_state_unavailable" };
  }
  return result;
}
