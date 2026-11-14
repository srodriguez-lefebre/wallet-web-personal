import { Pool } from "pg";
import { expect, inject, test } from "vitest";

import type {} from "./postgres-global.js";
import { trackPoolShutdown } from "./postgres-pool.js";

test("pool shutdown waits for client sockets before PostgreSQL can stop", async () => {
  const pool = new Pool({ ...inject("walletPostgres"), database: "postgres" });
  const close = trackPoolShutdown(pool);
  let ended = false;
  pool.on("connect", (client) => {
    client.once("end", () => {
      ended = true;
    });
  });
  await pool.query("SELECT 1");
  await close();
  expect(ended).toBe(true);
});
