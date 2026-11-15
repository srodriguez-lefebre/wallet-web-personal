import fs from "node:fs";
const marks = [],
  ignorable = [],
  cased = [],
  upper = [],
  lower = [];
for (let cp = 0; cp <= 0x10ffff; cp++) {
  const value = String.fromCodePoint(cp);
  if (/\p{M}/u.test(value)) marks.push(cp);
  const ignored = /\p{Case_Ignorable}/u.test(value);
  if (ignored) ignorable.push(cp);
  if (!ignored && /\p{Cased}/u.test(value)) cased.push(cp);
  const next = value.toLowerCase();
  if (next !== value && [...next].length === 1) {
    upper.push(cp);
    lower.push(next.codePointAt(0));
  }
}
const esc = (cp) =>
  cp <= 0xffff ? "\\u" + cp.toString(16).padStart(4, "0") : "\\u{" + cp.toString(16) + "}";
function rangeParts(values) {
  const result = [];
  let from = values[0],
    last = from;
  for (const cp of values.slice(1)) {
    if (cp === last + 1) {
      last = cp;
      continue;
    }
    result.push(esc(from) + (last === from ? "" : "-" + esc(last)));
    from = last = cp;
  }
  result.push(esc(from) + (last === from ? "" : "-" + esc(last)));
  return ["[", ...result, "]"];
}
function declaration(name, parts) {
  const chunks = [];
  let chunk = "";
  for (const part of parts) {
    if (chunk.length + part.length > 90) {
      chunks.push(chunk);
      chunk = "";
    }
    chunk += part;
  }
  if (chunk) chunks.push(chunk);
  return `export const ${name} =\n${chunks.map((p) => '  "' + p + '"').join(" +\n")};\n`;
}
fs.writeFileSync(
  new URL("../server/db/records/search-unicode.ts", import.meta.url),
  `// Generated with Node's Unicode ${process.versions.unicode} properties and default lowercase mappings.\n// Used only by server SQL; no extension, collation installation or financial data.\n// Contextual Final_Sigma and the one-to-many dotted I are handled in search.ts.\n// https://www.unicode.org/Public/${process.versions.unicode}.0/ucd/SpecialCasing.txt\n\n` +
    declaration("unicodeMarks", rangeParts(marks)) +
    "\n" +
    declaration("caseIgnorable", rangeParts(ignorable)) +
    "\n" +
    declaration("casedLetters", rangeParts(cased)) +
    "\n" +
    declaration("uppercaseCharacters", upper.map(esc)) +
    "\n" +
    declaration("lowercaseCharacters", lower.map(esc)),
);
