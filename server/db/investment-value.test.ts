import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, test } from "vitest";
import { installLocalTransport, LOCAL_DATABASE_URL, applyMigrations } from "../../scripts/sandbox/database.js";
import { investmentPatchSchema, investmentSchema } from "../../shared/schemas.js";
import { getWalletDataset, updateInvestment } from "./wallet-repository.js";

let pg: PGlite;
let restore: () => void;
const id = "00000000-0000-4000-8000-000000000001";
beforeAll(async () => {
  pg = new PGlite();
  await applyMigrations(pg);
  restore = installLocalTransport(pg);
  process.env.DATABASE_URL = LOCAL_DATABASE_URL;
  await pg.query("insert into investments(id,name,type,amount_invested,current_value,currency,is_visible,started_at,note) values ($1,'Fund','fund',100,120,'USD',true,'2026-01-02T12:00:00Z','Original note')", [id]);
}, 60_000);
afterAll(async () => { restore?.(); await pg?.close(); });
test("a zero valuation persists through the real SQL repository and reload without changing cost or date", async () => {
  await updateInvestment(id, { currentValue: 0 });
  expect((await getWalletDataset()).investments.find((item) => item.id === id)).toMatchObject({ currentValue: 0, amountInvested: 100, currency: "USD", startedAt: "2026-01-02T12:00:00.000Z", note: "Original note" });
});
test.each([-1, Number.NaN, Number.POSITIVE_INFINITY])("invalid valuation %s cannot change persisted history", async (currentValue) => {
  expect(investmentPatchSchema.safeParse({ currentValue }).success).toBe(false);
  await expect(updateInvestment(id, { currentValue })).rejects.toThrow();
  expect((await getWalletDataset()).investments.find((item) => item.id === id)?.amountInvested).toBe(100);
});
test("creating a complete loss is valid while a zero acquisition cost remains invalid", () => {
  const input = { name: "Fund", type: "fund", amountInvested: 100, currentValue: 0, currency: "USD", startedAt: "2026-01-02" };
  expect(investmentSchema.safeParse(input).success).toBe(true);
  expect(investmentSchema.safeParse({ ...input, amountInvested: 0 }).success).toBe(false);
  expect(investmentPatchSchema.safeParse({ amountInvested: 0 }).success).toBe(false);
});
