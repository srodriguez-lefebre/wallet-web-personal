import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { neon } from "@neondatabase/serverless";

const envPath = resolve(".env.local");
const csvPath = resolve("wallet_records.csv");

function loadEnvFile(path) {
  const content = readFileSync(path, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    const value = rawValue.trim().replace(/^["']|["']$/g, "");
    process.env[key] ??= value;
  }
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let field = "";
  let insideQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const nextChar = content[index + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        field += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === ";" && !insideQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && nextChar === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [headers, ...records] = rows;
  return records.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])),
  );
}

function normalizeCategory(value) {
  return value.trim();
}

function normalizeType(value) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "income") return "income";
  if (normalized === "transfer") return "transfer";
  return "expense";
}

function normalizePaymentType(value) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "cash") return "cash";
  if (normalized === "debit card" || normalized === "debit") return "debit";
  if (normalized === "credit card" || normalized === "credit") return "credit";
  if (normalized === "transfer") return "transfer";
  return "other";
}

function normalizeCurrency(value) {
  const currency = value.trim().toUpperCase();
  return ["UYU", "USD", "EUR", "BRL", "ARS"].includes(currency) ? currency : "UYU";
}

function exchangeRateToPrimary(row) {
  const amount = Number(row.amount || 0);
  const refAmount = Number(row.ref_currency_amount || 0);
  if (!amount || !refAmount) return 1;
  return refAmount / amount;
}

const categories = [
  { name: "Food & Drinks", color: "#14B8A6", icon: "utensils" },
  { name: "Restaurant, fast-food", parent: "Food & Drinks", color: "#0F766E", icon: "chef-hat" },
  { name: "Groceries", parent: "Food & Drinks", color: "#10B981", icon: "shopping-cart" },
  { name: "Frutas, verduras y saludables", parent: "Food & Drinks", color: "#22C55E", icon: "apple" },
  { name: "Bar, cafe", parent: "Food & Drinks", color: "#A16207", icon: "coffee" },
  { name: "Alcohol y previa", parent: "Food & Drinks", color: "#BE123C", icon: "wine" },
  { name: "Barbacoa", parent: "Food & Drinks", color: "#DC2626", icon: "beef" },

  { name: "Housing", color: "#F59E0B", icon: "home" },
  { name: "Alquiler", parent: "Housing", color: "#D97706", icon: "key" },
  { name: "Gastos Comunes", parent: "Housing", color: "#F97316", icon: "building-2" },
  { name: "Luz", parent: "Housing", color: "#EAB308", icon: "lightbulb" },
  { name: "Wifi", parent: "Housing", color: "#FBBF24", icon: "wifi" },
  { name: "Maintenance, repairs", parent: "Housing", color: "#EA580C", icon: "wrench" },
  { name: "Services", parent: "Housing", color: "#F59E0B", icon: "plug" },
  { name: "Telephony, mobile phone", parent: "Housing", color: "#FDBA74", icon: "phone" },
  { name: "Tributos", parent: "Housing", color: "#B45309", icon: "receipt-text" },

  { name: "Transportation", color: "#64748B", icon: "bus" },
  { name: "Taxi", parent: "Transportation", color: "#475569", icon: "car" },
  { name: "Public transport", parent: "Transportation", color: "#64748B", icon: "train" },
  { name: "Long distance", parent: "Transportation", color: "#94A3B8", icon: "plane" },
  { name: "Service station", parent: "Transportation", color: "#475569", icon: "fuel" },
  { name: "Parking", parent: "Transportation", color: "#94A3B8", icon: "parking-circle" },

  { name: "Life & Entertainment", color: "#8B5CF6", icon: "sparkles" },
  { name: "Active sport, fitness", parent: "Life & Entertainment", color: "#7C3AED", icon: "dumbbell" },
  { name: "Books, audio, subscriptions", parent: "Life & Entertainment", color: "#6366F1", icon: "book-open" },
  { name: "Charity, gifts", parent: "Life & Entertainment", color: "#EC4899", icon: "gift" },
  { name: "Culture, sport events", parent: "Life & Entertainment", color: "#A855F7", icon: "ticket" },
  { name: "Education, development", parent: "Life & Entertainment", color: "#4F46E5", icon: "graduation-cap" },
  { name: "Entradas", parent: "Life & Entertainment", color: "#9333EA", icon: "ticket" },
  { name: "Gifts, joy", parent: "Life & Entertainment", color: "#D946EF", icon: "gift" },
  { name: "Holiday, trips, hotels", parent: "Life & Entertainment", color: "#0EA5E9", icon: "plane" },
  { name: "Salidas", parent: "Life & Entertainment", color: "#A855F7", icon: "sparkles" },
  { name: "Software, apps, games", parent: "Life & Entertainment", color: "#7C3AED", icon: "gamepad-2" },
  { name: "TV, Streaming", parent: "Life & Entertainment", color: "#6366F1", icon: "tv" },

  { name: "Shopping", color: "#38BDF8", icon: "shopping-bag" },
  { name: "Clothes & Footwear", parent: "Shopping", color: "#0EA5E9", icon: "shirt" },
  { name: "Hardware", parent: "Shopping", color: "#0284C7", icon: "hammer" },

  { name: "Health care, doctor", color: "#EF4444", icon: "heart-pulse" },
  { name: "Drug-store, chemist", parent: "Health care, doctor", color: "#F87171", icon: "stethoscope" },
  { name: "Wellness, beauty", parent: "Health care, doctor", color: "#FB7185", icon: "scissors" },

  { name: "Financial expenses", color: "#334155", icon: "landmark" },
  { name: "Bank", parent: "Financial expenses", color: "#475569", icon: "landmark" },
  { name: "Credito Volar", parent: "Financial expenses", color: "#64748B", icon: "credit-card" },
  { name: "Money services", parent: "Financial expenses", color: "#64748B", icon: "circle-dollar-sign" },

  { name: "Income", color: "#22C55E", icon: "coins" },
  { name: "Pago Amigo", parent: "Income", color: "#16A34A", icon: "wallet" },
  { name: "Ayuda Familiar", parent: "Income", color: "#65A30D", icon: "gift" },
  { name: "Parte mama", parent: "Income", color: "#84CC16", icon: "wallet" },
  { name: "Parte papa", parent: "Income", color: "#4ADE80", icon: "wallet" },
  { name: "Wage, invoices", parent: "Income", color: "#15803D", icon: "briefcase" },

  { name: "Family", color: "#F472B6", icon: "baby" },
  { name: "Fam", parent: "Family", color: "#EC4899", icon: "baby" },

  { name: "Savings", color: "#0F766E", icon: "piggy-bank" },

  { name: "Otros", color: "#71717A", icon: "tag" },
  { name: "Unknown expense", parent: "Otros", color: "#A1A1AA", icon: "tag" },
];

async function resetWallet(sql) {
  await sql`delete from record_tags`;
  await sql`delete from goal_tags`;
  await sql`delete from goal_reservations`;
  await sql`delete from installment_plans`;
  await sql`delete from budgets`;
  await sql`delete from records`;
  await sql`delete from goals`;
  await sql`delete from investments`;
  await sql`delete from debts`;
  await sql`delete from exchange_rates`;
  await sql`delete from settings`;
  await sql`delete from tags`;
  await sql`delete from categories`;
  await sql`delete from accounts`;
}

async function insertAccount(sql) {
  const [account] = await sql`
    insert into accounts (name, type, currency, initial_balance, color, icon, is_visible, is_active, note)
    values ('Banco', 'bank', 'UYU', 0, '#2563EB', 'landmark', true, true, 'Cuenta unica importada desde wallet_records.csv')
    returning id
  `;
  return account.id;
}

async function insertSettings(sql, accountId) {
  await sql`
    insert into settings (
      primary_currency,
      primary_account_id,
      theme,
      default_dashboard_preset,
      locale,
      include_hidden_accounts_in_reports
    )
    values ('UYU', ${accountId}, 'light', 'general', 'es-UY', false)
  `;
}

async function insertCategories(sql) {
  const idsByName = new Map();
  const parents = categories.filter((category) => !category.parent);
  const children = categories.filter((category) => category.parent);

  for (const category of parents) {
    const [row] = await sql`
      insert into categories (name, color, icon)
      values (${category.name}, ${category.color}, ${category.icon})
      returning id
    `;
    idsByName.set(category.name, row.id);
  }

  for (const category of children) {
    const parentId = idsByName.get(category.parent);
    if (!parentId) {
      throw new Error(`Missing parent category: ${category.parent}`);
    }

    const [row] = await sql`
      insert into categories (name, parent_id, color, icon)
      values (${category.name}, ${parentId}, ${category.color}, ${category.icon})
      returning id
    `;
    idsByName.set(category.name, row.id);
  }

  return idsByName;
}

async function insertTags(sql, rows) {
  const names = new Set();
  for (const row of rows) {
    for (const label of row.labels.split(",").map((item) => item.trim()).filter(Boolean)) {
      names.add(label);
    }
  }

  const idsByName = new Map();
  const colors = ["#2563EB", "#16A34A", "#DC2626", "#7C3AED", "#EA580C", "#0891B2"];
  let index = 0;
  for (const name of [...names].sort((a, b) => a.localeCompare(b))) {
    const [row] = await sql`
      insert into tags (name, color, is_active)
      values (${name}, ${colors[index % colors.length]}, true)
      returning id
    `;
    idsByName.set(name, row.id);
    index += 1;
  }

  return idsByName;
}

async function insertRecords(sql, rows, accountId, categoryIds, tagIds) {
  let inserted = 0;
  const missingCategories = new Set();

  for (const row of rows) {
    const categoryName = normalizeCategory(row.category);
    const categoryId = categoryIds.get(categoryName);
    if (!categoryId) {
      missingCategories.add(categoryName);
      continue;
    }

    const type = normalizeType(row.type);
    const paymentType = normalizePaymentType(row.payment_type);
    const labels = row.labels.split(",").map((item) => item.trim()).filter(Boolean);
    const [record] = await sql`
      insert into records (
        type,
        amount,
        currency,
        account_id,
        category_id,
        counterparty_name,
        payment_type,
        payment_status,
        exchange_rate_to_primary,
        occurred_at,
        note,
        is_fixed
      )
      values (
        ${type},
        ${Number(row.amount || 0)},
        ${normalizeCurrency(row.currency)},
        ${accountId},
        ${categoryId},
        ${row.payee.trim() || null},
        ${paymentType},
        'cleared',
        ${exchangeRateToPrimary(row)},
        ${new Date(row.date)},
        ${row.note.trim() || null},
        false
      )
      returning id
    `;

    for (const label of labels) {
      const tagId = tagIds.get(label);
      if (tagId) {
        await sql`
          insert into record_tags (record_id, tag_id)
          values (${record.id}, ${tagId})
        `;
      }
    }

    inserted += 1;
  }

  if (missingCategories.size > 0) {
    throw new Error(`Missing categories: ${[...missingCategories].join(", ")}`);
  }

  return inserted;
}

loadEnvFile(envPath);

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing. Configure .env.local before importing.");
}

const sql = neon(process.env.DATABASE_URL);
const rows = parseCsv(readFileSync(csvPath, "utf8"));

console.log("Resetting wallet tables...");
await resetWallet(sql);

console.log("Creating Banco account...");
const accountId = await insertAccount(sql);
await insertSettings(sql, accountId);

console.log("Creating categories...");
const categoryIds = await insertCategories(sql);

console.log("Creating tags...");
const tagIds = await insertTags(sql, rows);

console.log("Importing records...");
const insertedRecords = await insertRecords(sql, rows, accountId, categoryIds, tagIds);

console.log(
  JSON.stringify(
    {
      account: "Banco",
      categories: categoryIds.size,
      tags: tagIds.size,
      records: insertedRecords,
    },
    null,
    2,
  ),
);
