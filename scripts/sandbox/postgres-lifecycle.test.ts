import { afterEach, expect, inject, test } from "vitest";

import { createPostgresTestDatabase } from "./postgres-test.js";

const fixtures: Awaited<ReturnType<typeof createPostgresTestDatabase>>[] = [];
afterEach(async () => {
  for (const fixture of fixtures.splice(0).reverse()) await fixture.close();
});

test("files clone a migrated template on one cluster without sharing synthetic rows", async () => {
  const config = inject("walletPostgres");
  expect(config).toBeDefined();
  const first = await createPostgresTestDatabase();
  fixtures.push(first);
  const second = await createPostgresTestDatabase();
  fixtures.push(second);
  expect(first.pool.options.port).toBe(config.port);
  expect(second.pool.options.port).toBe(config.port);
  expect(first.pool.options.database).not.toBe(second.pool.options.database);
  await first.pool.query("INSERT INTO tags(name,color) VALUES('Isolated fixture','#123456')");
  expect((await first.pool.query("SELECT name FROM tags")).rows).toHaveLength(1);
  expect((await second.pool.query("SELECT name FROM tags")).rows).toHaveLength(0);
  expect(
    (await second.pool.query("SELECT count(*)::int AS n FROM categories")).rows[0].n,
  ).toBeGreaterThan(0);
});
