import { sql, type SQL } from "drizzle-orm";

import {
  caseIgnorable,
  casedLetters,
  lowercaseCharacters,
  unicodeMarks,
  uppercaseCharacters,
} from "./search-unicode.js";

const finalSigma = `(${casedLetters}${caseIgnorable}*)Σ(?!${caseIgnorable}*${casedLetters})`;

/** JavaScript default casing, independent of the database's locale/Unicode version. */
export function lowercaseSql(value: SQL): SQL {
  const input = sql`wallet_lower_value.value`;
  const contextual = sql`regexp_replace(${input} COLLATE "C", ${finalSigma}, ${"\\1ς"}, 'g')`;
  return sql`(SELECT CASE WHEN octet_length(${input})=char_length(${input}) THEN lower(${input} COLLATE "C")
    ELSE translate(replace(${contextual}, 'İ', ${"i\u0307"}), ${uppercaseCharacters}, ${lowercaseCharacters}) END
    FROM (SELECT ${value}::text AS value) wallet_lower_value)`;
}

export function normalizedSearchSql(value: SQL) {
  return lowercaseSql(
    sql`regexp_replace(normalize(${value}, NFD) COLLATE "C", ${unicodeMarks}, '', 'g')`,
  );
}
