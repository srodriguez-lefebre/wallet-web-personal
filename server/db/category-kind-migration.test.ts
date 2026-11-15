import { readFile } from "node:fs/promises";

import { PGlite } from "@electric-sql/pglite";
import { expect, test, vi } from "vitest";

import { installLocalTransport, LOCAL_DATABASE_URL } from "../../scripts/sandbox/database.js";
import { categorySchema } from "../../shared/schemas.js";
import { createCategory, listCategories, updateCategory } from "./categories.js";
import { createDb } from "./client.js";

test("category kind backfills income, expenses and mixed use and keeps legacy writes compatible", async () => {
  const pg = new PGlite();
  const restore = installLocalTransport(pg);
  vi.stubEnv("DATABASE_URL", LOCAL_DATABASE_URL);
  try {
    await pg.exec(`
      CREATE TABLE categories (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        name text NOT NULL, parent_id uuid, color text NOT NULL, icon text NOT NULL, system_key text,
        created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), deleted_at timestamptz
      );
      CREATE TABLE records (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, category_id uuid, type text, payment_status text, deleted_at timestamptz);
      CREATE TABLE credit_card_records (category_id uuid, wallet_record_id uuid, kind text, deleted_at timestamptz);
    `);
    const db = createDb();
    const style = { color: "#2563eb", icon: "tag" };
    const salary = await createCategory(db, categorySchema.parse({ ...style, name: "Salary" }));
    const regular = await createCategory(db, categorySchema.parse({ ...style, name: "Groceries" }));
    const mixed = await createCategory(db, categorySchema.parse({ ...style, name: "Utilities" }));
    const unused = await createCategory(db, categorySchema.parse({ ...style, name: "Unused" }));
    expect(salary.kind).toBeUndefined();
    expect((await updateCategory(db, salary.id, { color: "#c02020" }))?.color).toBe("#c02020");
    await expect(updateCategory(db, salary.id, { kind: "income" })).rejects.toMatchObject({
      status: 409,
    });
    await pg.query(
      `INSERT INTO records(category_id,type,payment_status)
      VALUES ($1,'income','cleared'),($2,'expense','cleared'),($2,'income','cleared'),($3,'expense','cancelled'),
      ($4,'income','cleared')`,
      [salary.id, mixed.id, unused.id, regular.id],
    );
    await pg.query(
      `INSERT INTO credit_card_records(category_id,wallet_record_id,kind)
      SELECT category_id,id,'refund' FROM records WHERE category_id=$1`,
      [regular.id],
    );
    await pg.exec(
      await readFile(
        new URL("../../drizzle/migrations/0024_category_kind.sql", import.meta.url),
        "utf8",
      ),
    );
    expect(
      Object.fromEntries((await listCategories(db)).map(({ name, kind }) => [name, kind])),
    ).toEqual({
      Salary: "income",
      Groceries: "expense",
      Utilities: "both",
      Unused: "both",
    });
    const explicit = await createCategory(
      db,
      categorySchema.parse({ ...style, name: "Refunds", kind: "expense" }),
    );
    expect(explicit.kind).toBe("expense");
    expect((await updateCategory(db, explicit.id, { kind: "both" }))?.kind).toBe("both");
  } finally {
    vi.unstubAllEnvs();
    restore();
    await pg.close();
  }
}, 30_000);
