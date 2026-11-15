import { expect, test } from "vitest";

import { prepareMerchantImport, merchantSourcePath } from "./merchant-rules";

test("catalog path is explicit and any validated rule count is supported", () => {
  expect(() => merchantSourcePath([], {})).toThrow(/path/i);
  expect(merchantSourcePath(["synthetic.json"], {})).toBe("synthetic.json");
  expect(merchantSourcePath([], { WALLET_MERCHANT_RULES_PATH: "fixture.json" })).toBe(
    "fixture.json",
  );
  const prepared = prepareMerchantImport(
    {
      reglas: [
        { nombre: "Synthetic Market", categoria: "Supermercado", aliases: ["SYNTHETIC*MARKET"] },
      ],
    },
    [
      { id: "synthetic-groceries", systemKey: "groceries" },
      { id: "synthetic-review", systemKey: "unknown_expense" },
    ],
  );
  expect(prepared.rules).toHaveLength(1);
  expect(prepared.rules[0]?.categoryId).toBe("synthetic-groceries");
  expect(prepared.aliases).toHaveLength(1);
});
test("catalog preparation rejects an unresolved alias collision before reset", () => {
  expect(() =>
    prepareMerchantImport(
      {
        reglas: [
          { nombre: "Synthetic A", categoria: "Otros", aliases: ["DUPLICATE"] },
          { nombre: "Synthetic B", categoria: "Otros", aliases: ["duplicate"] },
        ],
      },
      [{ id: "synthetic-review", systemKey: "unknown_expense" }],
    ),
  ).toThrow(/conflict/i);
});
