import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

import { sql } from "drizzle-orm";

import { createDb, type DbClient } from "../server/db/client.js";
import { pgErrorDetails } from "../server/db/pg-error.js";
import { inspectMigrationState, migrationManifest, verifyEndpoint } from "./db-preflight.js";

const tag = "0023_ingestion_policy_state";
class MigrationInputError extends Error {}
async function migrationPlan() {
  const manifest = await migrationManifest();
  const index = manifest.findIndex((entry) => entry.tag === tag);
  const entry = manifest[index],
    previous = manifest[index - 1];
  if (
    entry?.tag !== tag ||
    previous?.tag !== "0022_repository_baseline" ||
    !/^[a-f0-9]{64}$/.test(previous.hash) ||
    !Number.isSafeInteger(previous.when)
  )
    throw new MigrationInputError("Unexpected migration manifest; stop for review");
  const source = await readFile(
    new URL(`../drizzle/migrations/${tag}.sql`, import.meta.url),
    "utf8",
  );
  if (createHash("sha256").update(source).digest("hex") !== entry.hash)
    throw new MigrationInputError("Migration source changed during preparation; stop for review");
  const expectedFunctions = new Map(
    [...source.matchAll(/CREATE FUNCTION (wallet_\w+)\([\s\S]*?AS \$\$([\s\S]*?)\$\$;/g)].map(
      (match) => [match[1]!, match[2]!.trim()],
    ),
  );
  if (
    !expectedFunctions.has("wallet_normalize_merchant") ||
    !expectedFunctions.has("wallet_assign_category_keys")
  )
    throw new MigrationInputError("Missing versioned ingestion functions");
  return { entry, previous, source, expectedFunctions, countBefore: index };
}

const expectedColumns: Record<string, { type: string; nullable: string; default?: string }> = {
  "merchant_category_rules.id": { type: "uuid", nullable: "NO", default: "gen_random_uuid()" },
  "merchant_category_rules.normalized_alias": { type: "text", nullable: "NO" },
  "merchant_category_rules.category_system_key": { type: "text", nullable: "NO" },
  "merchant_category_rules.priority": { type: "integer", nullable: "NO", default: "0" },
  "merchant_category_rules.override_merchant": { type: "text", nullable: "YES" },
  "merchant_category_rules.override_from_category_key": { type: "text", nullable: "YES" },
  "merchant_category_rules.review_when_missing": {
    type: "boolean",
    nullable: "NO",
    default: "false",
  },
  "provider_state.name": { type: "text", nullable: "NO" },
  "provider_state.open_until": { type: "timestamp with time zone", nullable: "YES" },
  "provider_state.failures": { type: "integer", nullable: "NO", default: "0" },
  "provider_state.generation": { type: "integer", nullable: "NO", default: "0" },
};
const expectedIndexes: Record<string, { table: string; unique: boolean }> = {
  merchant_aliases_search_idx: { table: "merchant_aliases", unique: false },
  record_merchant_correction_search_idx: { table: "records", unique: false },
  merchant_category_rules_pkey: { table: "merchant_category_rules", unique: true },
  merchant_category_rules_normalized_alias_unique: {
    table: "merchant_category_rules",
    unique: true,
  },
  provider_state_pkey: { table: "provider_state", unique: true },
};
export async function inspectIngestionMigration(db: DbClient) {
  const plan = await migrationPlan();
  const baseline = await inspectMigrationState(db);
  const results = await db.batch([
    db.execute(sql`SET TRANSACTION READ ONLY`),
    db.execute(
      sql`SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('merchant_category_rules','provider_state')`,
    ),
    db.execute(
      sql`SELECT p.indexname,p.tablename,i.indisvalid,i.indisunique,a.amname FROM pg_indexes p JOIN pg_class c ON c.relname=p.indexname JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname=p.schemaname JOIN pg_index i ON i.indexrelid=c.oid JOIN pg_am a ON a.oid=c.relam WHERE p.schemaname='public' AND p.indexname IN (${sql.join(
        Object.keys(expectedIndexes).map((name) => sql`${name}`),
        sql`, `,
      )})`,
    ),
    db.execute(
      sql`SELECT proname,prosrc,provolatile,proisstrict,proparallel,format_type(prorettype,NULL) AS return_type FROM pg_proc WHERE oid IN (to_regprocedure('public.wallet_normalize_merchant(text)'),to_regprocedure('public.wallet_assign_category_keys(boolean)'))`,
    ),
    db.execute(
      sql`SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id`,
    ),
  ]);
  const columns = new Map(
    results[1].rows.map((row) => [`${String(row.table_name)}.${String(row.column_name)}`, row]),
  );
  const columnDrift = Object.entries(expectedColumns)
    .filter(([name, expected]) => {
      const row = columns.get(name);
      return (
        !row ||
        row.data_type !== expected.type ||
        row.is_nullable !== expected.nullable ||
        (expected.default !== undefined
          ? row.column_default !== expected.default
          : row.column_default !== null)
      );
    })
    .map(([name]) => name);
  const indexDrift = Object.entries(expectedIndexes)
    .filter(([name, expected]) => {
      const row = results[2].rows.find((row) => row.indexname === name);
      return (
        !row ||
        row.tablename !== expected.table ||
        row.indisvalid !== true ||
        row.indisunique !== expected.unique ||
        row.amname !== "btree"
      );
    })
    .map(([name]) => name);
  const normalizer = results[3].rows.find((row) => row.proname === "wallet_normalize_merchant");
  const assigner = results[3].rows.find((row) => row.proname === "wallet_assign_category_keys");
  const functionReady =
    results[3].rows.length === 2 &&
    results[3].rows.every(
      (row) =>
        typeof row.prosrc === "string" &&
        row.prosrc.trim() === plan.expectedFunctions.get(String(row.proname)),
    ) &&
    normalizer?.provolatile === "i" &&
    normalizer.proisstrict === true &&
    normalizer.proparallel === "s" &&
    normalizer.return_type === "text" &&
    assigner?.provolatile === "v" &&
    assigner.proisstrict === false &&
    assigner.proparallel === "u" &&
    assigner.return_type === "void";
  // Historical orphan debt references are deliberately supported; 0023 adds no FK or data repair.
  const saneBaseline =
    baseline.journalPresent &&
    !baseline.unknownMigrationHashes &&
    baseline.settingsSingletonReady &&
    baseline.singletonConstraintReady &&
    baseline.legacyReservationTablePresent &&
    [
      baseline.missingBaselineColumns,
      baseline.invalidBaselineColumns,
      baseline.missingBaselineIndexes,
      baseline.invalidBaselineIndexes,
    ].every((rows) => rows.length === 0);
  const additionsAbsent =
    columns.size === 0 && results[2].rows.length === 0 && results[3].rows.length === 0;
  const readyToApply = saneBaseline && baseline.pendingMigrations[0] === tag && additionsAbsent;
  const alreadyApplied =
    saneBaseline &&
    baseline.pendingMigrations.every((pending) => pending > tag) &&
    columnDrift.length === 0 &&
    indexDrift.length === 0 &&
    functionReady;
  return {
    database: baseline.database,
    readyToApply,
    alreadyApplied,
    saneBaseline,
    pendingMigrations: baseline.pendingMigrations,
    legacyCrlfMigrations: baseline.legacyCrlfMigrations,
    historicalOrphanDebtsPresent: baseline.hasOrphanDebts,
    columnDrift,
    indexDrift,
    functionReady,
    journal: results[4].rows,
  };
}

/** Only the reviewed 0023 DDL and its journal entry are executed, in one real Neon HTTP transaction. */
export async function applyIngestionMigration(db: DbClient) {
  const before = await inspectIngestionMigration(db);
  if (before.alreadyApplied) return { status: "already_applied" as const };
  if (!before.readyToApply)
    throw new MigrationInputError(
      "Migration state is partial, unknown or inconsistent; no DDL attempted",
    );
  const plan = await migrationPlan();
  // Anonymous DO blocks cannot bind parameters. These literals are validated repository hashes/integers only.
  const guard = sql.raw(`DO $$ BEGIN
    IF (SELECT count(*) FROM drizzle.__drizzle_migrations) <> ${plan.countBefore}
      OR NOT EXISTS(SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash='${plan.previous.hash}' AND created_at=${plan.previous.when})
      OR to_regclass('public.provider_state') IS NOT NULL OR to_regclass('public.merchant_category_rules') IS NOT NULL
    THEN RAISE EXCEPTION 'Migration state changed; rerun the read-only preflight'; END IF;
  END $$;`);
  const queries: [...Parameters<DbClient["batch"]>[0]] = [
    db.execute(sql`SELECT pg_advisory_xact_lock(1794715773)`),
    db.execute(sql`LOCK TABLE drizzle.__drizzle_migrations IN SHARE ROW EXCLUSIVE MODE`),
    db.execute(guard),
  ];
  for (const statement of plan.source
    .split("--> statement-breakpoint")
    .map((text) => text.trim())
    .filter(Boolean))
    queries.push(db.execute(sql.raw(statement)));
  queries.push(
    db.execute(
      sql`INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES(${plan.entry.hash},${plan.entry.when})`,
    ),
  );
  let uncertainResponse = false;
  try {
    await db.batch(queries);
  } catch (error) {
    // A lost response can follow a committed transaction. Inspect; never replay DDL here.
    const observed = await inspectIngestionMigration(db).catch(() => undefined);
    if (
      !observed?.alreadyApplied ||
      observed.journal.length !== before.journal.length + 1 ||
      JSON.stringify(observed.journal.slice(0, -1)) !== JSON.stringify(before.journal)
    )
      throw error;
    uncertainResponse = true;
  }
  const after = await inspectIngestionMigration(db);
  if (
    !after.alreadyApplied ||
    after.journal.length !== before.journal.length + 1 ||
    JSON.stringify(after.journal.slice(0, -1)) !== JSON.stringify(before.journal)
  )
    throw new MigrationInputError(
      "Post-migration verification failed; preserve schema and inspect before any retry",
    );
  return {
    status: "applied" as const,
    hash: plan.entry.hash,
    journalRows: after.journal.length,
    uncertainResponseRecovered: uncertainResponse,
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
    throw new MigrationInputError(
      "--expected-endpoint-sha256 is required; no connection attempted",
    );
  const envFile = value("--env-file");
  if (envFile) process.loadEnvFile(envFile);
  const connection = process.env.DATABASE_URL;
  if (!connection) throw new MigrationInputError("DATABASE_URL is not configured");
  verifyEndpoint(connection, expected);
  const db = createDb();
  const state = await inspectIngestionMigration(db);
  if (state.database !== decodeURIComponent(new URL(connection).pathname.slice(1)))
    throw new MigrationInputError("Database identity mismatch; no DDL attempted");
  if (args.includes("--apply"))
    console.log(JSON.stringify(await applyIngestionMigration(db), null, 2));
  else {
    console.log(
      JSON.stringify(
        { ...state, journal: undefined, journalRows: state.journal.length, targetVerified: true },
        null,
        2,
      ),
    );
    if (!state.readyToApply && !state.alreadyApplied) process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: unknown) => {
    console.error(
      JSON.stringify({
        error:
          error instanceof MigrationInputError
            ? error.message
            : "Guarded migration failed; inspect the state before retrying",
        code: pgErrorDetails(error).code ?? null,
      }),
    );
    process.exitCode = 1;
  });
}
