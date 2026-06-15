import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export function createDb() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }

  const sql = neon(connectionString);
  return drizzle(sql, { schema });
}

export type DbClient = ReturnType<typeof createDb>;
