import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

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

const legacyCrlfTags = [
  "0015_financial_integrity",
  "0016_credit_card_payment_idempotency",
  "0017_review_financial_guards",
  "0018_amusing_union_jack",
  "0019_review_activity_accounting",
  "0020_merchant_match_mode",
];
async function crlfHash(tag: string, bom = false) {
  const text = await readFile(new URL(`../drizzle/migrations/${tag}.sql`, import.meta.url), "utf8");
  return createHash("sha256")
    .update((bom ? "\uFEFF" : "") + text.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n"))
    .digest("hex");
}
test("preflight recognizes the six byte-exact historical CRLF migrations without replaying or rewriting journal", async () => {
  const manifest = await migrationManifest();
  try {
    for (const tag of legacyCrlfTags) {
      const entry = manifest.find((e) => e.tag === tag)!;
      await fixture.pool.query("UPDATE drizzle.__drizzle_migrations SET hash=$1 WHERE hash=$2", [
        await crlfHash(tag),
        entry.hash,
      ]);
    }
    const state = await inspectMigrationState(createDb());
    expect(state.unknownMigrationHashes).toBe(false);
    expect(state.pendingMigrations).toEqual([]);
    expect(state.baselineAlreadyApplied).toBe(true);
    expect((state as unknown as { legacyCrlfMigrations: string[] }).legacyCrlfMigrations).toEqual(
      legacyCrlfTags,
    );
    const rows = await fixture.pool.query<{ hash: string }>(
      "SELECT hash FROM drizzle.__drizzle_migrations",
    );
    for (const tag of legacyCrlfTags) {
      const legacy = await crlfHash(tag);
      expect(rows.rows.some((row) => row.hash === legacy)).toBe(true);
    }
  } finally {
    for (const tag of legacyCrlfTags) {
      const entry = manifest.find((e) => e.tag === tag)!;
      await fixture.pool.query("UPDATE drizzle.__drizzle_migrations SET hash=$1 WHERE hash=$2", [
        entry.hash,
        await crlfHash(tag),
      ]);
    }
  }
});
test("preflight rejects a duplicate canonical and CRLF migration identity", async () => {
  const entry = (await migrationManifest()).find((e) => e.tag === legacyCrlfTags[0])!;
  const legacy = await crlfHash(entry.tag);
  await fixture.pool.query(
    "INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES($1,$2)",
    [legacy, entry.when],
  );
  try {
    const state = await inspectMigrationState(createDb());
    expect(state.unknownMigrationHashes).toBe(true);
    expect(state.baselineAlreadyApplied).toBe(false);
  } finally {
    await fixture.pool.query("DELETE FROM drizzle.__drizzle_migrations WHERE hash=$1", [legacy]);
  }
});
test.each(["timestamp", "bom", "new-migration"])(
  "preflight does not generalize legacy encoding acceptance to %s",
  async (kind) => {
    const entry = (await migrationManifest()).find(
      (e) => e.tag === (kind === "new-migration" ? "0022_repository_baseline" : legacyCrlfTags[0]),
    )!;
    const legacy = await crlfHash(entry.tag, kind === "bom");
    await fixture.pool.query(
      "UPDATE drizzle.__drizzle_migrations SET hash=$1,created_at=$2 WHERE hash=$3",
      [legacy, entry.when + (kind === "timestamp" ? 1 : 0), entry.hash],
    );
    try {
      const state = await inspectMigrationState(createDb());
      expect(state.unknownMigrationHashes).toBe(true);
      expect(state.baselineAlreadyApplied).toBe(false);
    } finally {
      await fixture.pool.query(
        "UPDATE drizzle.__drizzle_migrations SET hash=$1,created_at=$2 WHERE hash=$3",
        [entry.hash, entry.when, legacy],
      );
    }
  },
);

test("the next category-kind migration can be planned without altering the target", async () => {
  const entry = (await migrationManifest()).find(({ tag }) => tag === "0024_category_kind")!;
  await fixture.pool.query("DELETE FROM drizzle.__drizzle_migrations WHERE hash=$1", [entry.hash]);
  await fixture.pool.query("ALTER TABLE categories DROP COLUMN kind");
  try {
    expect(await inspectMigrationState(createDb())).toMatchObject({
      pendingMigrations: [entry.tag],
      categoryKindReadyToApply: true,
      categoryKindSchemaReady: false,
    });
  } finally {
    await fixture.pool.query(
      await readFile(new URL(`../drizzle/migrations/${entry.tag}.sql`, import.meta.url), "utf8"),
    );
    await fixture.pool.query(
      "INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES($1,$2)",
      [entry.hash, entry.when],
    );
  }
  expect(await inspectMigrationState(createDb())).toMatchObject({
    pendingMigrations: [],
    categoryKindReadyToApply: false,
    categoryKindSchemaReady: true,
  });
});

test("preflight detects category-kind constraint drift", async () => {
  await fixture.pool.query("ALTER TABLE categories DROP CONSTRAINT categories_kind_check");
  try {
    expect(await inspectMigrationState(createDb())).toMatchObject({
      pendingMigrations: [],
      categoryKindSchemaReady: false,
      baselineAlreadyApplied: false,
    });
  } finally {
    await fixture.pool.query(
      "ALTER TABLE categories ADD CONSTRAINT categories_kind_check CHECK (kind IN ('expense', 'income', 'both'))",
    );
  }
});
