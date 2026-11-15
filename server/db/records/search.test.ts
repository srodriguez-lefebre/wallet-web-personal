import { sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, test } from "vitest";

import { createPostgresTestDatabase } from "../../../scripts/sandbox/postgres-test.js";
import { normalizeGlobalSearch } from "../../../src/lib/global-search.js";
import { createDb } from "../client.js";
import { lowercaseSql, normalizedSearchSql } from "./search.js";

let fixture: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
beforeAll(async () => {
  fixture = await createPostgresTestDatabase();
}, 30_000);
afterAll(async () => fixture?.close());
const samples = [
  "ΟΣ",
  "ΟΣΑ",
  "Σ",
  "ΣΣ",
  "AΣ",
  "AΣ'A",
  "AΣ'",
  "AΣΣ",
  "ʰΣ",
  "AʰΣ",
  "中Σ",
  "AΣ中",
  "AΣ\u0301",
  "AΣ'Σ",
  "İSTANBUL",
  "Café",
  "CAFE\u{1d185}",
  "Ѐ",
  "𐐀𐐁",
  "Straße",
];

test("SQL wallet search preserves browser normalization including contextual final sigma", async () => {
  const rows = await createDb().execute<{ input: string; value: string }>(
    sql`SELECT input, ${normalizedSearchSql(sql`input`)} AS value FROM (VALUES ${sql.join(
      samples.map((input) => sql`(${input}::text)`),
      sql`, `,
    )}) samples(input)`,
  );
  for (const row of rows.rows) expect(row.value, row.input).toBe(normalizeGlobalSearch(row.input));
});

test("SQL default casing preserves all runtime lowercase mappings and note accents", async () => {
  const characters = [];
  for (let codePoint = 0; codePoint <= 0x10ffff; codePoint++) {
    const character = String.fromCodePoint(codePoint);
    if (character !== character.toLowerCase()) characters.push(character);
  }
  const inputs = [...samples, characters.join("|"), "ÉCOLE İΣ OΣ'Σ"];
  const rows = await createDb().execute<{ input: string; value: string }>(
    sql`SELECT input, ${lowercaseSql(sql`input`)} AS value FROM (VALUES ${sql.join(
      inputs.map((input) => sql`(${input}::text)`),
      sql`, `,
    )}) samples(input)`,
  );
  for (const row of rows.rows) expect(row.value, row.input).toBe(row.input.toLowerCase());
});
