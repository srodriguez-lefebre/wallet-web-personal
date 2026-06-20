import fs from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI may provide DATABASE_URL directly. */
}

const defaultSource =
  "\\\\wsl$\\Ubuntu-22.04\\home\\santig14\\personal\\wallet-automation\\data\\categorias_comercios_uruguay.json";
const source = process.argv[2] || defaultSource;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not configured");

const CATEGORY_MAP = {
  Supermercado: "Groceries",
  "Estacion de servicio": "Service station",
  Comida: "Restaurant, fast-food",
  "Farmacia y salud": "Drug-store, chemist",
  "Servicios publicos": "Services",
  "Red de cobranza": "Money services",
  Transporte: "Public transport",
  Vehiculo: "Car",
  "Ropa y calzado": "Clothes & Footwear",
  Tecnologia: "Software, apps, games",
  "Hogar y ferreteria": "Hardware",
  Mascotas: "Unknown expense",
  Entretenimiento: "Culture, sport events",
  "Suscripciones digitales": "Subscriptions",
  "Bancos y finanzas": "Bank",
  Educacion: "Education, development",
  Delivery: "Restaurant, fast-food",
  "Belleza y cuidado personal": "Wellness, beauty",
  "Deporte y gimnasio": "Active sport, fitness",
  "Viajes y turismo": "Holiday, trips, hotels",
  "Procesador de pago": "Money services",
  Otros: "Unknown expense",
};

function normalize(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const payload = JSON.parse(await fs.readFile(source, "utf8"));
if (!Array.isArray(payload.reglas) || payload.reglas.length !== 254) {
  throw new Error(
    `Expected 254 merchant rules, received ${payload.reglas?.length ?? 0}`,
  );
}

const sql = neon(connectionString);
const categoryRows = await sql.query("select id, name from categories");
const categoryIdByName = new Map(categoryRows.map((row) => [row.name, row.id]));
for (const [sourceCategory, targetCategory] of Object.entries(CATEGORY_MAP)) {
  if (!categoryIdByName.has(targetCategory))
    throw new Error(
      `Missing category mapping target ${sourceCategory} -> ${targetCategory}`,
    );
}

const usedTerms = new Map();
const prepared = payload.reglas.map((rule, priority) => {
  const rawTerms = [rule.nombre, ...(rule.aliases || [])];
  const terms = [];
  for (const rawTerm of rawTerms) {
    const normalized = normalize(rawTerm);
    if (!normalized) continue;
    if (normalized === "PUMA" && rule.categoria === "Estacion de servicio")
      continue;
    if (normalized === "PATENTE" && normalize(rule.nombre) !== "SUCIVE")
      continue;
    const owner = usedTerms.get(normalized);
    if (owner && owner !== rule.nombre)
      throw new Error(
        `Unresolved alias conflict: ${normalized} (${owner} / ${rule.nombre})`,
      );
    if (!owner) {
      usedTerms.set(normalized, rule.nombre);
      terms.push({ alias: rawTerm, normalized });
    }
  }
  return {
    ...rule,
    priority: payload.reglas.length - priority,
    categoryId: categoryIdByName.get(
      CATEGORY_MAP[rule.categoria] || "Unknown expense",
    ),
    terms,
  };
});

const queries = [sql`delete from merchant_aliases`, sql`delete from merchants`];
for (const rule of prepared) {
  const merchantId = crypto.randomUUID();
  queries.push(
    sql`insert into merchants (id, name, category_id, priority) values (${merchantId}, ${rule.nombre}, ${rule.categoryId}, ${rule.priority})`,
  );
  for (const term of rule.terms) {
    queries.push(
      sql`insert into merchant_aliases (merchant_id, alias, normalized_alias) values (${merchantId}, ${term.alias}, ${term.normalized})`,
    );
  }
}
await sql.transaction(queries);

const [counts] = await Promise.all([
  sql.query(
    "select (select count(*)::int from merchants) merchants, (select count(*)::int from merchant_aliases) aliases",
  ),
]);
if (counts[0].merchants !== 254)
  throw new Error(`Import verification failed: ${JSON.stringify(counts[0])}`);
console.log(
  `Imported ${counts[0].merchants} merchants and ${counts[0].aliases} unique matching terms.`,
);
