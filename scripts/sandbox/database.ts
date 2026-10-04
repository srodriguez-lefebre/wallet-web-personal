import type { PGlite, Transaction } from "@electric-sql/pglite";
import { neonConfig } from "@neondatabase/serverless";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const LOCAL_DATABASE_URL =
  "postgresql://local:local@wallet.local/wallet";

// Keep the real Neon and Drizzle query/result path, changing only the transport.
export function installLocalTransport(pg: PGlite) {
  const previousFetch = neonConfig.fetchFunction;
  const previousEndpoint = neonConfig.fetchEndpoint;
  neonConfig.fetchEndpoint = "http://wallet.local/sql";
  neonConfig.fetchFunction = async (input: string, options: RequestInit) => {
    const headers = new Headers(options.headers);
    if (
      input !== "http://wallet.local/sql" ||
      headers.get("Neon-Connection-String") !== LOCAL_DATABASE_URL
    ) {
      throw new Error("Sandbox refused a non-local database connection");
    }
    const body = JSON.parse(String(options.body)) as {
      query?: string;
      params?: unknown[];
      queries?: Array<{ query: string; params: unknown[] }>;
    };
    const execute = async (
      client: PGlite | Transaction,
      query: string,
      params: unknown[],
    ) => {
      const result = await client.query<unknown[]>(query, params, {
        rowMode: "array",
        parsers: Object.fromEntries(
          [16, 20, 21, 23, 700, 701, 1082, 1114, 1184, 1700, 114, 3802].map(
            (oid) => [oid, (value: string) => value],
          ),
        ),
      });
      return {
        fields: result.fields,
        rows: result.rows,
        rowCount: result.affectedRows,
        command: query.trim().split(/\s/)[0],
      };
    };
    try {
      const result = body.queries
        ? {
            results: await pg.transaction(async (tx) => {
              const results = [];
              for (const query of body.queries!)
                results.push(await execute(tx, query.query, query.params));
              return results;
            }),
          }
        : await execute(pg, body.query!, body.params ?? []);
      return Response.json(result);
    } catch (error) {
      const failure = error as {
        message: string;
        code?: string;
        detail?: string;
        constraint?: string;
      };
      return Response.json(
        {
          message: failure.message,
          code: failure.code,
          detail: failure.detail,
          constraint: failure.constraint,
        },
        { status: 400 },
      );
    }
  };
  return () => {
    neonConfig.fetchFunction = previousFetch;
    neonConfig.fetchEndpoint = previousEndpoint;
  };
}

export async function applyMigrations(pg: PGlite) {
  const folder = new URL("../../drizzle/migrations/", import.meta.url);
  const journal = JSON.parse(
    await readFile(new URL("meta/_journal.json", folder), "utf8"),
  ) as { entries: Array<{ tag: string }> };
  await pg.exec(
    "CREATE TABLE IF NOT EXISTS sandbox_migrations (tag text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  const applied = new Set(
    (
      await pg.query<{ tag: string }>("SELECT tag FROM sandbox_migrations")
    ).rows.map((row) => row.tag),
  );
  for (const entry of journal.entries) {
    if (applied.has(entry.tag)) continue;
    const source = await readFile(
      fileURLToPath(new URL(`${entry.tag}.sql`, folder)),
      "utf8",
    );
    await pg.transaction(async (tx) => {
      await tx.exec(source);
      await tx.query("INSERT INTO sandbox_migrations (tag) VALUES ($1)", [
        entry.tag,
      ]);
    });
  }
}
