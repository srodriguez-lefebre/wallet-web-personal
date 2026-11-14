import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { sql } from "drizzle-orm";

import { createDb, type DbClient } from "../server/db/client.js";
import { pgErrorDetails } from "../server/db/pg-error.js";

class PreflightInputError extends Error {}
export function endpointFingerprint(connection: string) {
  let url: URL;
  try {
    url = new URL(connection);
  } catch {
    throw new PreflightInputError("Invalid PostgreSQL connection URL");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname.endsWith(".neon.tech"))
    throw new PreflightInputError("Expected a Neon PostgreSQL endpoint");
  return createHash("sha256")
    .update(url.hostname.replace("-pooler.", ".").toLowerCase())
    .digest("hex");
}
export function verifyEndpoint(connection: string, expected: string) {
  if (!/^[a-f0-9]{64}$/.test(expected) || endpointFingerprint(connection) !== expected)
    throw new PreflightInputError(
      "Endpoint fingerprint mismatch; no database connection attempted",
    );
}
export async function migrationManifest() {
  const folder = new URL("../drizzle/migrations/", import.meta.url);
  const journal = JSON.parse(await readFile(new URL("meta/_journal.json", folder), "utf8")) as {
    entries: { tag: string; when: number }[];
  };
  return Promise.all(
    journal.entries.map(async (entry) => ({
      ...entry,
      hash: createHash("sha256")
        .update(await readFile(new URL(`${entry.tag}.sql`, folder), "utf8"))
        .digest("hex"),
    })),
  );
}
const baselineColumns = Object.fromEntries([
  ...[
    "budgets.deleted_at",
    "credit_card_payments.deleted_at",
    "debts.deleted_at",
    "installment_plans.deleted_at",
    "investments.deleted_at",
    "recurring_debts.deleted_at",
    "settings.auth_attempts_pruned_at",
    "tags.deleted_at",
  ].map((name) => [name, { type: "timestamp with time zone", nullable: "YES", default: null }]),
  ...[
    "debts.created_at",
    "debts.updated_at",
    "installment_plans.created_at",
    "installment_plans.updated_at",
  ].map((name) => [name, { type: "timestamp with time zone", nullable: "NO", default: "now()" }]),
  ["settings.singleton", { type: "boolean", nullable: "NO", default: "true" }],
  ["settings.session_version", { type: "integer", nullable: "NO", default: "1" }],
] as [string, { type: string; nullable: string; default: string | null }][]);
const baselineIndexes = {
  credit_card_records_original_record_idx: ["credit_card_records", "original_record_id"],
  credit_card_records_category_idx: ["credit_card_records", "category_id"],
  records_category_idx: ["records", "category_id"],
  records_destination_account_idx: ["records", "destination_account_id"],
  records_payment_status_active_idx: ["records", "payment_status"],
  records_debt_idx: ["records", "debt_id"],
  settings_singleton_idx: ["settings", "singleton"],
};
/** Read-only metadata and aggregate guards. Never returns records, credentials or financial amounts. */
export async function inspectMigrationState(db: DbClient) {
  const results = await db.batch([
    db.execute(sql`SET TRANSACTION READ ONLY`),
    db.execute(
      sql`SELECT current_database() AS database,to_regclass('drizzle.__drizzle_migrations')::text AS journal`,
    ),
    db.execute(
      sql`SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public'`,
    ),
    db.execute(sql`SELECT count(*)<=1 AS singleton_ready FROM settings`),
    db.execute(
      sql`SELECT EXISTS(SELECT 1 FROM records r WHERE r.debt_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM debts d WHERE d.id=r.debt_id)) AS orphan_debts`,
    ),
    db.execute(
      sql`SELECT p.indexname,p.indexdef,p.tablename,i.indisvalid FROM pg_indexes p JOIN pg_class c ON c.relname=p.indexname JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname=p.schemaname JOIN pg_index i ON i.indexrelid=c.oid WHERE p.schemaname='public' AND p.indexname IN (${sql.join(
        Object.keys(baselineIndexes).map((name) => sql`${name}`),
        sql`, `,
      )})`,
    ),
    db.execute(
      sql`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='settings'::regclass AND conname='settings_singleton_true'`,
    ),
  ]);
  const columnDetails = new Map(
    results[2].rows.map((row) => [`${String(row.table_name)}.${String(row.column_name)}`, row]),
  );
  const columns = new Set(columnDetails.keys());
  const missingBaseline = Object.keys(baselineColumns).filter((column) => !columns.has(column));
  const invalidColumns = Object.entries(baselineColumns)
    .filter(([name, expected]) => {
      const row = columnDetails.get(name);
      return (
        row &&
        (row.data_type !== expected.type ||
          row.is_nullable !== expected.nullable ||
          row.column_default !== expected.default)
      );
    })
    .map(([name]) => name);
  const indexDefinitions = new Map(
    results[5].rows.map((row) => [
      String(row.indexname),
      {
        definition: String(row.indexdef).replaceAll('"', "").replace(/\s+/g, "").toLowerCase(),
        table: row.tablename,
        valid: row.indisvalid,
      },
    ]),
  );
  const missingIndexes = Object.keys(baselineIndexes).filter((name) => !indexDefinitions.has(name));
  const invalidIndexes = Object.entries(baselineIndexes)
    .filter(([name, [table, column]]) => {
      const index = indexDefinitions.get(name);
      if (!index) return false;
      const unique = name === "settings_singleton_idx" ? "unique" : "";
      const predicate =
        name === "records_payment_status_active_idx" ? "where(deleted_atisnull)" : "";
      const expected = `create${unique}index${name}onpublic.${table}usingbtree(${column})${predicate}`;
      return !index.valid || index.table !== table || index.definition !== expected;
    })
    .map(([name]) => name);
  const singletonConstraint = results[6].rows[0]?.definition;
  const singletonConstraintReady =
    typeof singletonConstraint === "string" &&
    singletonConstraint.replace(/\s+/g, "").toLowerCase() === "check(singleton)";
  const manifest = await migrationManifest();
  const hasJournal = Boolean(results[1].rows[0]?.journal);
  const applied = hasJournal
    ? (
        await db.batch([
          db.execute(sql`SET TRANSACTION READ ONLY`),
          db.execute(
            sql`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`,
          ),
        ])
      )[1].rows
    : [];
  const appliedHashes = new Set(applied.map((row) => String(row.hash)));
  const known = new Set(manifest.map((entry) => entry.hash));
  const unknownHashes =
    appliedHashes.size !== applied.length ||
    applied.some(
      (row) =>
        !known.has(String(row.hash)) ||
        String(row.created_at) !==
          String(manifest.find((entry) => entry.hash === String(row.hash))?.when),
    );
  const pending = manifest
    .filter((entry) => !appliedHashes.has(entry.hash))
    .map((entry) => entry.tag);
  const singletonReady = results[3].rows[0]?.singleton_ready === true;
  const ready =
    hasJournal &&
    !unknownHashes &&
    singletonReady &&
    columns.has("goal_reservations.id") &&
    pending.length === 1 &&
    pending[0] === "0022_repository_baseline" &&
    missingBaseline.length === Object.keys(baselineColumns).length &&
    missingIndexes.length === Object.keys(baselineIndexes).length &&
    !singletonConstraint;
  const complete =
    hasJournal &&
    !unknownHashes &&
    singletonReady &&
    columns.has("goal_reservations.id") &&
    pending.length === 0 &&
    missingBaseline.length === 0 &&
    invalidColumns.length === 0 &&
    missingIndexes.length === 0 &&
    invalidIndexes.length === 0 &&
    singletonConstraintReady;
  const database = results[1].rows[0]?.database;
  return {
    database: typeof database === "string" ? database : "",
    targetVerified: false,
    journalPresent: hasJournal,
    unknownMigrationHashes: unknownHashes,
    pendingMigrations: pending,
    missingBaselineColumns: missingBaseline,
    invalidBaselineColumns: invalidColumns,
    missingBaselineIndexes: missingIndexes,
    invalidBaselineIndexes: invalidIndexes,
    singletonConstraintReady,
    settingsSingletonReady: singletonReady,
    legacyReservationTablePresent: columns.has("goal_reservations.id"),
    hasOrphanDebts: results[4].rows[0]?.orphan_debts === true,
    baselineReadyToApply: ready,
    baselineAlreadyApplied: complete,
  };
}
async function main() {
  const args = process.argv.slice(2);
  const value = (flag: string) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const expected = value("--expected-endpoint-sha256");
  if (!expected)
    throw new PreflightInputError(
      "--expected-endpoint-sha256 is required; no database connection attempted",
    );
  const envFile = value("--env-file");
  if (envFile) {
    try {
      process.loadEnvFile(envFile);
    } catch {
      throw new PreflightInputError("Could not load the explicit environment file");
    }
  }
  const connection = process.env.DATABASE_URL;
  if (!connection) throw new PreflightInputError("DATABASE_URL is not configured");
  verifyEndpoint(connection, expected);
  const state = await inspectMigrationState(createDb());
  const configured = decodeURIComponent(new URL(connection).pathname.slice(1));
  const { database, ...report } = state;
  console.log(
    JSON.stringify(
      { ...report, targetVerified: true, databaseMatchesConfiguredPath: database === configured },
      null,
      2,
    ),
  );
  if (database !== configured || (!state.baselineReadyToApply && !state.baselineAlreadyApplied))
    process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: unknown) => {
    console.error(
      JSON.stringify({
        error: error instanceof PreflightInputError ? error.message : "Database preflight failed",
        code: pgErrorDetails(error).code ?? null,
      }),
    );
    process.exitCode = 1;
  });
}
