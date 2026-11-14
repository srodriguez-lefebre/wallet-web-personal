import { randomUUID } from "node:crypto";

import { Pool, types } from "pg";
import { inject } from "vitest";
import type {} from "./postgres-global.js";
import { neonConfig } from "@neondatabase/serverless";

import { LOCAL_DATABASE_URL } from "./database.js";
import { trackPoolShutdown } from "./postgres-pool.js";

/** Real independent connections, with the same Neon HTTP batch protocol as production. */
export async function createPostgresTestDatabase() {
  const config = inject("walletPostgres");
  if (!config) throw new Error("PostgreSQL globalSetup is missing");
  const database = `wallet_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ ...config, database: "postgres" });
  const closeAdmin = trackPoolShutdown(admin);
  await admin.query(`CREATE DATABASE "${database}" TEMPLATE wallet_template`);
  const pool = new Pool({ ...config, database, max: 8 });
  const closePool = trackPoolShutdown(pool);
  const previousUrl = process.env.DATABASE_URL;
  const previousFetch: unknown = neonConfig.fetchFunction,
    previousEndpoint = neonConfig.fetchEndpoint;
  process.env.DATABASE_URL = LOCAL_DATABASE_URL;
  neonConfig.fetchEndpoint = "http://wallet.local/sql";
  neonConfig.fetchFunction = async (input: string, options: RequestInit) => {
    if (
      input !== "http://wallet.local/sql" ||
      new Headers(options.headers).get("Neon-Connection-String") !== LOCAL_DATABASE_URL
    )
      throw new Error("Refused non-local database");
    if (typeof options.body !== "string") throw new Error("Local SQL requires a JSON string body");
    const body = JSON.parse(options.body) as {
      query?: string;
      params?: unknown[];
      queries?: { query: string; params: unknown[] }[];
    };
    const client = await pool.connect();
    const execute = async (query: string, params: unknown[] = []) => {
      const result = await client.query({
        text: query,
        values: params,
        rowMode: "array",
        types: {
          getTypeParser: (oid: number) =>
            [16, 20, 21, 23, 700, 701, 1082, 1114, 1184, 1700, 114, 3802].includes(oid)
              ? (value: string) => value
              : (types.getTypeParser(oid) as (value: string) => unknown),
        },
      });
      return {
        fields: result.fields,
        rows: result.rows,
        rowCount: result.rowCount,
        command: result.command,
      };
    };
    try {
      if (!body.queries) return Response.json(await execute(body.query!, body.params));
      await client.query("BEGIN");
      const results = [];
      for (const query of body.queries) results.push(await execute(query.query, query.params));
      await client.query("COMMIT");
      return Response.json({ results });
    } catch (error) {
      await client.query("ROLLBACK");
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
    } finally {
      client.release();
    }
  };
  return {
    pool,
    close: async () => {
      neonConfig.fetchFunction = previousFetch;
      neonConfig.fetchEndpoint = previousEndpoint;
      if (previousUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousUrl;
      await closePool();
      try {
        await admin.query(`DROP DATABASE "${database}"`);
      } finally {
        await closeAdmin();
      }
    },
  };
}
