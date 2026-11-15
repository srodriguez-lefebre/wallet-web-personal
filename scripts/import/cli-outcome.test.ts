import { neonConfig } from "@neondatabase/serverless";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

import { createPostgresTestDatabase } from "../sandbox/postgres-test";
import { createDb } from "../../server/db/client";
import { prepareWalletImport, importWalletRecords } from "./wallet-records";
import { prepareMerchantImport, importMerchantRules } from "./merchant-rules";
import { runImportCli } from "./cli-outcome";

let fixture: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
beforeAll(async () => {
  fixture = await createPostgresTestDatabase();
}, 60000);
afterAll(async () => {
  await fixture?.close();
});

test.each(["Wallet", "Merchant"] as const)(
  "lost %s commit response reports an uncertain outcome without replay",
  async (kind) => {
    const prepared = prepareWalletImport(
      "type;amount;currency;category;date;payee;payment_type;labels;note;ref_currency_amount\nincome;5000;UYU;Wage, invoices;2026-01-01T12:00:00Z;Synthetic salary;transfer;;;5000",
    );
    await importWalletRecords(createDb(), prepared);
    const categories = (
      await fixture.pool.query('SELECT id,system_key AS "systemKey" FROM categories')
    ).rows as { id: string; systemKey: string | null }[];
    const merchant = prepareMerchantImport(
      { reglas: [{ nombre: "Synthetic committed merchant", categoria: "Otros", aliases: [] }] },
      categories,
    );
    const transport = neonConfig.fetchFunction!;
    let commits = 0;
    neonConfig.fetchFunction = async (input: string, options: RequestInit) => {
      const response = await transport(input, options);
      const body = JSON.parse(options.body as string) as { queries?: { query: string }[] };
      if (response.ok && body.queries?.some((q) => q.query.includes("LOCK TABLE"))) {
        commits++;
        throw new Error("Synthetic response lost after commit");
      }
      return response;
    };
    const report = vi.fn();
    try {
      expect(
        await runImportCli(
          () =>
            kind === "Wallet"
              ? importWalletRecords(createDb(), prepared)
              : importMerchantRules(createDb(), merchant),
          kind,
          report,
        ),
      ).toBe(1);
    } finally {
      neonConfig.fetchFunction = transport;
    }
    expect(commits).toBe(1);
    expect(report).toHaveBeenCalledWith(
      expect.stringMatching(/outcome.*unconfirmed.*inspect.*before.*repeat/i),
    );
    expect(report.mock.calls.flat().join(" ")).not.toMatch(
      /not committed|no replacement was committed/i,
    );
    if (kind === "Wallet")
      expect((await fixture.pool.query("SELECT id FROM records")).rows).toEqual([
        { id: prepared.records[0]!.id },
      ]);
    else
      expect((await fixture.pool.query("SELECT id FROM merchants")).rows).toEqual([
        { id: merchant.rules[0]!.id },
      ]);
  },
);
