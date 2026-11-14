import { afterAll, beforeAll, expect, test } from "vitest";

import { createDb } from "../server/db/client.js";
import {
  endpointFingerprint,
  inspectMigrationState,
  migrationManifest,
  verifyEndpoint,
} from "./db-preflight.js";
import { createPostgresTestDatabase } from "./sandbox/postgres-test.js";
let fixture: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
beforeAll(async () => {
  fixture = await createPostgresTestDatabase();
}, 60_000);
afterAll(async () => {
  await fixture?.close();
});
test("endpoint guard ignores pooler naming and never exposes URL credentials", () => {
  const direct = "postgresql://synthetic:private-value@ep-synthetic.region.aws.neon.tech/neondb";
  const pooled = direct.replace("ep-synthetic.", "ep-synthetic-pooler.");
  expect(endpointFingerprint(direct)).toBe(endpointFingerprint(pooled));
  expect(() => verifyEndpoint(direct, endpointFingerprint(pooled))).not.toThrow();
  try {
    verifyEndpoint(direct, "0".repeat(64));
    throw new Error("Guard did not reject");
  } catch (error) {
    expect(String(error)).not.toContain("private-value");
    expect(String(error)).toContain("mismatch");
  }
});
test("preflight stops for missing history or drift instead of inventing applied migrations", async () => {
  let state = await inspectMigrationState(createDb());
  expect(state.journalPresent).toBe(false);
  expect(state.baselineReadyToApply).toBe(false);
  expect(state.baselineAlreadyApplied).toBe(false);
  await fixture.pool.query(
    "CREATE SCHEMA drizzle; CREATE TABLE drizzle.__drizzle_migrations(id serial PRIMARY KEY,hash text NOT NULL,created_at bigint)",
  );
  for (const entry of await migrationManifest())
    await fixture.pool.query(
      "INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES($1,$2)",
      [entry.hash, entry.when],
    );
  state = await inspectMigrationState(createDb());
  expect(state.baselineAlreadyApplied).toBe(true);
  await fixture.pool.query(
    "INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES('synthetic-drift',9999999999999)",
  );
  state = await inspectMigrationState(createDb());
  expect(state.unknownMigrationHashes).toBe(true);
  expect(state.baselineAlreadyApplied).toBe(false);
});

test.each(["type", "nullable", "default"])(
  "preflight rejects drift in new column %s",
  async (kind) => {
    await fixture.pool.query(
      "DELETE FROM drizzle.__drizzle_migrations WHERE hash='synthetic-drift'",
    );
    expect((await inspectMigrationState(createDb())).baselineAlreadyApplied).toBe(true);
    try {
      if (kind === "type")
        await fixture.pool.query(
          "ALTER TABLE settings ALTER COLUMN session_version DROP DEFAULT; ALTER TABLE settings ALTER COLUMN session_version TYPE text USING session_version::text",
        );
      if (kind === "nullable")
        await fixture.pool.query("ALTER TABLE settings ALTER COLUMN session_version DROP NOT NULL");
      if (kind === "default")
        await fixture.pool.query("ALTER TABLE settings ALTER COLUMN session_version DROP DEFAULT");
      const state = await inspectMigrationState(createDb());
      expect(state.baselineAlreadyApplied).toBe(false);
      expect(
        (state as unknown as { invalidBaselineColumns: string[] }).invalidBaselineColumns,
      ).toContain("settings.session_version");
    } finally {
      await fixture.pool.query(
        "ALTER TABLE settings ALTER COLUMN session_version TYPE integer USING session_version::integer; ALTER TABLE settings ALTER COLUMN session_version SET DEFAULT 1; ALTER TABLE settings ALTER COLUMN session_version SET NOT NULL",
      );
    }
  },
);
test.each(["table", "method"])("preflight rejects an index on the wrong %s", async (kind) => {
  await fixture.pool.query("DROP INDEX records_category_idx");
  try {
    if (kind === "table")
      await fixture.pool.query(
        "CREATE TABLE preflight_wrong_table(category_id uuid); CREATE INDEX records_category_idx ON preflight_wrong_table(category_id)",
      );
    else
      await fixture.pool.query(
        "CREATE INDEX records_category_idx ON records USING hash(category_id)",
      );
    const state = await inspectMigrationState(createDb());
    expect(state.baselineAlreadyApplied).toBe(false);
    expect(state.invalidBaselineIndexes).toContain("records_category_idx");
  } finally {
    await fixture.pool.query(
      "DROP INDEX records_category_idx; DROP TABLE IF EXISTS preflight_wrong_table; CREATE INDEX records_category_idx ON records(category_id)",
    );
  }
});
test("preflight rejects a partial singleton index that cannot arbitrate upsert", async () => {
  await fixture.pool.query(
    "DROP INDEX settings_singleton_idx; CREATE UNIQUE INDEX settings_singleton_idx ON settings(singleton) WHERE singleton",
  );
  try {
    const state = await inspectMigrationState(createDb());
    expect(state.baselineAlreadyApplied).toBe(false);
    expect(state.invalidBaselineIndexes).toContain("settings_singleton_idx");
  } finally {
    await fixture.pool.query(
      "DROP INDEX settings_singleton_idx; CREATE UNIQUE INDEX settings_singleton_idx ON settings(singleton)",
    );
  }
});
test("preflight stops if the legacy reservation table required by restore is absent", async () => {
  await fixture.pool.query("ALTER TABLE goal_reservations RENAME TO preflight_legacy_reservations");
  try {
    const state = await inspectMigrationState(createDb());
    expect(state.legacyReservationTablePresent).toBe(false);
    expect(state.baselineAlreadyApplied).toBe(false);
    expect(state.baselineReadyToApply).toBe(false);
  } finally {
    await fixture.pool.query(
      "ALTER TABLE preflight_legacy_reservations RENAME TO goal_reservations",
    );
  }
});
