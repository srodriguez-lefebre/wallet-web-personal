import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";

import { createPostgresTestDatabase } from "../../scripts/sandbox/postgres-test.js";
import {
  budgetSchema,
  creditCardRecordSchema,
  creditCardSchema,
  debtSchema,
  goalSchema,
  installmentPlanSchema,
  recordSchema,
  recurringDebtSchema,
  settingsSchema,
} from "../../shared/schemas.js";
import { createDb } from "./client.js";
import * as repository from "./index.js";
import { resolveCategory } from "../ingestion/category-resolution.js";
let fixture: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
let accountId: string,
  otherAccountId: string,
  categoryId: string,
  childId: string,
  grandchildId: string,
  tagId: string,
  goalId: string,
  cardId: string;
const occurredAt = "2026-10-12T12:00:00.000Z";
beforeAll(async () => {
  fixture = await createPostgresTestDatabase();
}, 60000);
afterAll(async () => {
  await fixture?.close();
});
beforeEach(async () => {
  await fixture.pool.query(
    "TRUNCATE accounts,credit_cards,settings,tags,goals,debts,recurring_debts,records,budgets,investments,installment_plans,merchants CASCADE",
  );
  await fixture.pool.query("DELETE FROM categories WHERE system_key IS NULL");
  const account = {
    name: "Synthetic bank",
    type: "bank" as const,
    currency: "UYU" as const,
    initialBalance: 1000,
    color: "blue",
    icon: "bank",
    isActive: true,
    isVisible: true,
  };
  accountId = (await repository.createAccount(createDb(), account)).id;
  otherAccountId = (await repository.createAccount(createDb(), { ...account, name: "Other bank" }))
    .id;
  const category = { name: "Synthetic category", color: "blue", icon: "tag" };
  categoryId = (await repository.createCategory(createDb(), category)).id;
  childId = (
    await repository.createCategory(createDb(), {
      ...category,
      name: "Child",
      parentId: categoryId,
    })
  ).id;
  grandchildId = (
    await repository.createCategory(createDb(), {
      ...category,
      name: "Grandchild",
      parentId: childId,
    })
  ).id;
  tagId = (
    await repository.createTag(createDb(), { name: "Synthetic tag", color: "blue", isActive: true })
  ).id;
  goalId = (
    await repository.createGoal(
      createDb(),
      goalSchema.parse({
        name: "Synthetic goal",
        targetAmount: 1000,
        currency: "UYU",
        accountId,
        color: "blue",
        icon: "flag",
      }),
    )
  ).id;
  cardId = (
    await repository.createCreditCard(
      createDb(),
      creditCardSchema.parse({
        name: "Synthetic card",
        issuer: "Test bank",
        lastFour: "1234",
        isActive: true,
        creditLimit: 5000,
        limitCurrency: "UYU",
        closingDay: 20,
        dueDay: 5,
        color: "blue",
        icon: "card",
      }),
    )
  ).id;
  await repository.upsertSettings(
    createDb(),
    settingsSchema.parse({
      primaryCurrency: "UYU",
      primaryAccountId: accountId,
      defaultAccountId: accountId,
      theme: "light",
      defaultDashboardPreset: "general",
      locale: "es-UY",
      includeHiddenAccountsInReports: false,
      defaultPaymentType: "debit",
      defaultPaymentStatus: "cleared",
    }),
  );
});
const recordInput = () =>
  recordSchema.parse({
    type: "expense",
    amount: 20,
    currency: "UYU",
    accountId,
    categoryId: grandchildId,
    tagIds: [tagId],
    paymentType: "debit",
    paymentStatus: "cleared",
    exchangeRateToPrimary: 1,
    occurredAt,
    counterpartyName: "Synthetic merchant",
    note: "Lunch note",
  });
const budgetInput = () =>
  budgetSchema.parse({
    name: "Synthetic budget",
    limitAmount: 200,
    currency: "UYU",
    period: "monthly",
    accountId,
    categoryId: grandchildId,
    tagId,
    color: "blue",
  });
const recurringInput = () =>
  recurringDebtSchema.parse({
    name: "Synthetic recurring",
    direction: "payable",
    amount: 30,
    currency: "UYU",
    counterpartyName: "Test",
    accountId,
    categoryId: grandchildId,
    dayOfMonth: 12,
    startedAt: occurredAt,
  });
test("normalized sibling names conflict even when created concurrently", async () => {
  const db = createDb();
  const input = { color: "blue", icon: "tag", parentId: categoryId };
  const results = await Promise.allSettled(
    ["Café", "CAFE"].map((name) => repository.createCategory(db, { ...input, name })),
  );
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(results.find((result) => result.status === "rejected")).toMatchObject({
    reason: { status: 409 },
  });
  await expect(repository.updateCategory(db, childId, { name: "cafe" })).rejects.toMatchObject({
    status: 409,
  });
  await repository.createCategory(db, { ...input, parentId: childId, name: "CAFE" });
});

test("merging moves subtree usage, templates and the active learned merchant rule", async () => {
  const db = createDb();
  const target = await repository.createCategory(db, {
    name: "Destination",
    color: "blue",
    icon: "tag",
  });
  await repository.createRecord(db, recordInput());
  await repository.createRecordTemplate(db, {
    name: "Merge template",
    type: "expense",
    amount: 10,
    currency: "UYU",
    accountId,
    categoryId: grandchildId,
    paymentType: "debit",
  });
  await fixture.pool.query(
    "WITH learned AS (INSERT INTO merchants(name,category_id,match_mode) VALUES('Canonical kiosk',$1,'exact') RETURNING id) INSERT INTO merchant_aliases(merchant_id,alias,normalized_alias) SELECT id,'Synthetic learned kiosk','SYNTHETIC LEARNED KIOSK' FROM learned",
    [grandchildId],
  );
  expect(await repository.categoryUsage(db, [grandchildId])).toEqual({
    [grandchildId]: expect.objectContaining({
      records: 1,
      templates: 1,
      merchants: 1,
      lastUsedAt: occurredAt,
    }),
  });
  await expect(repository.mergeCategory(db, categoryId, grandchildId)).rejects.toMatchObject({
    status: 409,
  });
  expect(await repository.mergeCategory(db, categoryId, target.id)).toMatchObject({
    targetId: target.id,
    reassigned: { records: 1, templates: 1, merchants: 1 },
  });
  expect(await resolveCategory(db, "Synthetic learned kiosk")).toMatchObject({
    categoryId: target.id,
    merchantName: "Canonical kiosk",
    needsReview: false,
  });
  await repository.deleteCategory(db, target.id);
  expect(await resolveCategory(db, "Synthetic learned kiosk")).toMatchObject({
    merchantName: "Canonical kiosk",
    needsReview: true,
  });
});
test("category deletion archives the entire tree and reassigns every existing financial reference", async () => {
  const record = await repository.createRecord(createDb(), recordInput());
  await repository.createCreditCardRecord(
    createDb(),
    cardId,
    creditCardRecordSchema.parse({
      kind: "purchase",
      amount: 30,
      currency: "UYU",
      amountInLimitCurrency: 30,
      exchangeRateToLimitCurrency: 1,
      categoryId: childId,
      occurredAt,
    }),
  );
  await repository.createBudget(createDb(), budgetInput());
  await repository.createDebt(
    createDb(),
    debtSchema.parse({
      name: "Synthetic debt",
      direction: "payable",
      originalAmount: 30,
      pendingAmount: 30,
      currency: "UYU",
      counterpartyName: "Test",
      accountId,
      categoryId: grandchildId,
      startedAt: occurredAt,
    }),
  );
  await repository.createRecurringDebt(createDb(), recurringInput());
  await repository.createInstallmentPlan(
    createDb(),
    installmentPlanSchema.parse({
      name: "Synthetic plan",
      totalAmount: 300,
      currency: "UYU",
      installmentsTotal: 3,
      installmentsPaid: 0,
      accountId,
      categoryId: childId,
    }),
  );
  await fixture.pool.query(
    "INSERT INTO merchants(name,category_id) VALUES('Synthetic merchant',$1)",
    [childId],
  );
  const result = await repository.deleteCategory(createDb(), categoryId);
  expect(result).toMatchObject({
    deleted: true,
    archivedCategoryIds: expect.arrayContaining([categoryId, childId, grandchildId]),
    reassigned: {
      records: 1,
      creditCardRecords: 1,
      budgets: 1,
      debts: 1,
      recurringDebts: 1,
      installmentPlans: 1,
      merchants: 1,
    },
  });
  if (!result.deleted) throw new Error("Expected archived category");
  expect((await repository.listRecords(createDb())).items).toContainEqual(
    expect.objectContaining({ id: record.id, categoryId: result.fallbackCategoryId, amount: 20 }),
  );
  expect(
    (await repository.listCategories(createDb())).some((category) =>
      [categoryId, childId, grandchildId].includes(category.id),
    ),
  ).toBe(false);
  expect(
    (await repository.getWalletBackup(createDb())).categories.filter((category) =>
      [categoryId, childId, grandchildId].includes(category.id),
    ),
  ).toHaveLength(3);
});
test("account archive preserves records and reservations and disables dependent active configuration", async () => {
  const record = await repository.createRecord(createDb(), recordInput());
  await repository.createGoalReservation(createDb(), {
    goalId,
    accountId,
    amount: 100,
    currency: "UYU",
    createdAt: occurredAt,
  });
  await repository.createBudget(createDb(), budgetInput());
  await repository.createRecurringDebt(createDb(), recurringInput());
  expect(await repository.deleteAccount(createDb(), accountId)).toBe(true);
  const dataset = await repository.getWalletDataset(createDb());
  expect(dataset.accounts.some((account) => account.id === accountId)).toBe(false);
  expect(dataset.records).toContainEqual(
    expect.objectContaining({ id: record.id, accountId, amount: 20 }),
  );
  expect(dataset.goalReservations).toContainEqual(
    expect.objectContaining({ goalId, accountId, amount: 100 }),
  );
  expect(dataset.goals).toContainEqual(expect.objectContaining({ id: goalId, status: "paused" }));
  expect(dataset.budgets).toContainEqual(expect.objectContaining({ isActive: false }));
  expect(dataset.recurringDebts).toContainEqual(expect.objectContaining({ isActive: false }));
  expect(dataset.settings).toMatchObject({
    primaryAccountId: otherAccountId,
    defaultAccountId: otherAccountId,
  });
  expect((await repository.getWalletBackup(createDb())).accounts).toContainEqual(
    expect.objectContaining({ id: accountId, deletedAt: expect.any(String) }),
  );
});
test("card archive clears its default while retaining purchases and statement history", async () => {
  await repository.patchSettings(createDb(), {
    defaultCreditCardId: cardId,
    defaultPaymentType: "credit",
  });
  const movement = await repository.createCreditCardRecord(
    createDb(),
    cardId,
    creditCardRecordSchema.parse({
      kind: "purchase",
      amount: 30,
      currency: "UYU",
      amountInLimitCurrency: 30,
      exchangeRateToLimitCurrency: 1,
      categoryId,
      occurredAt,
    }),
  );
  expect(await repository.archiveCreditCard(createDb(), cardId)).toBe(true);
  const settings = await repository.getSettings(createDb());
  expect(settings.defaultCreditCardId).toBeUndefined();
  expect(settings.defaultPaymentType).not.toBe("credit");
  expect(await repository.listCreditCards(createDb())).toContainEqual(
    expect.objectContaining({ id: cardId, isActive: false }),
  );
  expect(await repository.listCreditCardRecords(createDb(), cardId)).toContainEqual(
    expect.objectContaining({ id: movement.id, amount: 30 }),
  );
});
test("tag deletion removes both join tables and budget references without deleting history", async () => {
  const record = await repository.createRecord(createDb(), recordInput());
  await repository.createBudget(createDb(), budgetInput());
  await fixture.pool.query("INSERT INTO goal_tags(goal_id,tag_id) VALUES($1,$2)", [goalId, tagId]);
  expect(await repository.deleteTag(createDb(), tagId)).toBe(true);
  expect((await repository.listRecords(createDb())).items).toContainEqual(
    expect.objectContaining({ id: record.id, tagIds: [], amount: 20 }),
  );
  expect(
    (await repository.listGoals(createDb())).find((goal) => goal.id === goalId)?.tagIds,
  ).toEqual([]);
  expect((await repository.listBudgets(createDb()))[0]?.tagId).toBeUndefined();
  expect(
    (
      await fixture.pool.query(
        "SELECT * FROM record_tags UNION ALL SELECT goal_id,tag_id FROM goal_tags",
      )
    ).rows,
  ).toHaveLength(0);
});
test("concurrent settings replacement and partial updates preserve the existing singleton", async () => {
  const initial = await repository.getSettings(createDb());
  await Promise.all([
    repository.upsertSettings(createDb(), { ...initial, theme: "dark" }),
    repository.upsertSettings(createDb(), { ...initial, theme: "system" }),
  ]);
  await Promise.all([
    repository.patchSettings(createDb(), { theme: "dark" }),
    repository.patchSettings(createDb(), { defaultPaymentStatus: "needs_review" }),
  ]);
  expect((await fixture.pool.query("SELECT id FROM settings")).rows).toHaveLength(1);
  expect(await repository.getSettings(createDb())).toMatchObject({
    theme: "dark",
    defaultPaymentStatus: "needs_review",
  });
});
test("record filters and cursor pagination select only matching durable rows", async () => {
  const match = await repository.createRecord(createDb(), recordInput());
  await fixture.pool.query("INSERT INTO record_goals(record_id,goal_id) VALUES($1,$2)", [
    match.id,
    goalId,
  ]);
  const other = await repository.createRecord(createDb(), {
    ...recordInput(),
    accountId: otherAccountId,
    categoryId,
    tagIds: [],
    counterpartyName: "Other merchant",
    note: "Other",
    paymentStatus: "pending",
    occurredAt: "2026-09-01T12:00:00.000Z",
  });
  const checks = [
    { accountId },
    { categoryId: grandchildId },
    { tagId },
    { goalId },
    { paymentStatus: "cleared" },
    { search: "Synthetic merchant" },
    { search: "Lunch note" },
    { from: "2026-10-01", to: "2026-10-31" },
  ];
  for (const filter of checks)
    expect(
      (await repository.listRecords(createDb(), filter)).items.map((record) => record.id),
    ).toEqual([match.id]);
  expect((await repository.listRecords(createDb(), { type: "income" })).items).toEqual([]);
  expect((await repository.listRecords(createDb(), { creditCardId: cardId })).items).toEqual([]);
  const first = await repository.listRecords(createDb(), { type: "expense", limit: 1 });
  expect(first).toMatchObject({
    hasMore: true,
    items: [expect.objectContaining({ id: match.id })],
  });
  expect(first.nextCursor).toBeTruthy();
  const second = await repository.listRecords(createDb(), {
    limit: 1,
    cursor: first.nextCursor ?? undefined,
  });
  expect(second).toMatchObject({
    hasMore: false,
    nextCursor: null,
    items: [expect.objectContaining({ id: other.id })],
  });
});
test("account archive detaches every template destination and auto-reservation configuration atomically", async () => {
  const template = await repository.createRecordTemplate(createDb(), {
    name: "Archive account template",
    type: "transfer",
    amount: 10,
    currency: "UYU",
    accountId: otherAccountId,
    destinationAccountId: accountId,
    categoryId,
    paymentType: "transfer",
  });
  await repository.updateGoal(createDb(), goalId, { autoReservationAccountId: accountId });
  expect(await repository.deleteAccount(createDb(), accountId)).toBe(true);
  expect(
    (await repository.listRecordTemplates(createDb())).find((row) => row.id === template.id)
      ?.destinationAccountId,
  ).toBeUndefined();
  expect(
    (await repository.listGoals(createDb())).find((row) => row.id === goalId)
      ?.autoReservationAccountId,
  ).toBeUndefined();
});
test("category archive reassigns reusable templates as well as financial rows", async () => {
  const template = await repository.createRecordTemplate(createDb(), {
    name: "Archive category template",
    type: "expense",
    amount: 10,
    currency: "UYU",
    accountId,
    categoryId: grandchildId,
    paymentType: "debit",
  });
  const result = await repository.deleteCategory(createDb(), categoryId);
  if (!result.deleted) throw new Error("Expected archived category");
  expect(
    (await repository.listRecordTemplates(createDb())).find((row) => row.id === template.id)
      ?.categoryId,
  ).toBe(result.fallbackCategoryId);
});
test("card archive detaches templates and defaults to debit without erasing their draft amounts", async () => {
  const template = await repository.createRecordTemplate(createDb(), {
    name: "Archive card template",
    type: "expense",
    amount: 10,
    currency: "UYU",
    creditCardId: cardId,
    categoryId,
    paymentType: "credit",
  });
  await repository.patchSettings(createDb(), {
    defaultCreditCardId: cardId,
    defaultPaymentType: "credit",
  });
  await repository.archiveCreditCard(createDb(), cardId);
  expect(await repository.getSettings(createDb())).toMatchObject({
    defaultPaymentType: "debit",
    defaultCreditCardId: undefined,
  });
  expect(
    (await repository.listRecordTemplates(createDb())).find((row) => row.id === template.id),
  ).toMatchObject({ amount: 10, paymentType: "debit", creditCardId: undefined });
});
test("a card default patch does not implicitly rewrite the selected payment type", async () => {
  await repository.patchSettings(createDb(), { defaultPaymentType: "cash" });
  await repository.patchSettings(createDb(), { defaultCreditCardId: cardId });
  expect(await repository.getSettings(createDb())).toMatchObject({
    defaultPaymentType: "cash",
    defaultCreditCardId: cardId,
  });
});

test.each(["budget", "installment"] as const)(
  "concurrent disjoint %s patches never overwrite omitted columns",
  async (kind) => {
    const { neonConfig } = await import("@neondatabase/serverless");
    const previous: unknown = neonConfig.fetchFunction;
    const original = previous as (input: string, options: RequestInit) => Promise<Response>;
    const db = createDb();
    const entity =
      kind === "budget"
        ? await repository.createBudget(db, budgetInput())
        : await repository.createInstallmentPlan(
            db,
            installmentPlanSchema.parse({
              name: "Original plan",
              totalAmount: 100,
              currency: "UYU",
              installmentsTotal: 5,
              installmentsPaid: 0,
              accountId,
              categoryId,
            }),
          );
    let reads = 0;
    let release!: () => void;
    const bothRead = new Promise<void>((resolve) => {
      release = resolve;
    });
    const table = kind === "budget" ? "budgets" : "installment_plans";
    neonConfig.fetchFunction = async (url: string, options: RequestInit) => {
      const request = JSON.parse(options.body as string) as { query?: string };
      const response = await original(url, options);
      if (request.query?.includes(`from "${table}"`) && request.query.startsWith("select")) {
        reads++;
        if (reads === 2) release();
        await bothRead;
      }
      return response;
    };
    try {
      if (kind === "budget") {
        await Promise.all([
          repository.updateBudget(db, entity.id, { name: "Concurrent name" }),
          repository.updateBudget(db, entity.id, { limitAmount: 345 }),
        ]);
      } else {
        await Promise.all([
          repository.updateInstallmentPlan(db, entity.id, { name: "Concurrent name" }),
          repository.updateInstallmentPlan(db, entity.id, { installmentsPaid: 1 }),
        ]);
      }
    } finally {
      release();
      neonConfig.fetchFunction = previous;
    }
    const rows =
      kind === "budget"
        ? await repository.listBudgets(db)
        : await repository.listInstallmentPlans(db);
    expect(rows.find((row) => row.id === entity.id)).toMatchObject(
      kind === "budget"
        ? { name: "Concurrent name", limitAmount: 345 }
        : { name: "Concurrent name", installmentsPaid: 1 },
    );
  },
);

test("reservation balances aggregate PostgreSQL decimals before converting the response to numbers", async () => {
  const db = createDb();
  for (const amount of [0.1, 0.2])
    await repository.createGoalReservation(db, {
      goalId,
      accountId,
      amount,
      currency: "UYU",
      createdAt: occurredAt,
    });
  expect(
    (await repository.listGoalReservations(db)).find((row) => row.goalId === goalId)?.amount,
  ).toBe(0.3);
  expect(
    (await repository.getWalletDataset(db)).goalReservations.find((row) => row.goalId === goalId)
      ?.amount,
  ).toBe(0.3);
});

test("empty record batches do not execute database work", async () => {
  const db = createDb();
  const batch = vi.spyOn(db, "batch");
  expect(await repository.createRecordsBulk(db, [])).toEqual([]);
  expect(batch).not.toHaveBeenCalled();
});

test("single debt creation still rejects duplicate recurring instances", async () => {
  const rule = await repository.createRecurringDebt(createDb(), recurringInput());
  const input = debtSchema.parse({
    name: "Test instance",
    direction: "payable",
    startedAt: occurredAt,
    currency: "UYU",
    counterpartyName: "Test",
    categoryId,
    originalAmount: 30,
    pendingAmount: 30,
    recurringDebtId: rule.id,
    recurringMonth: "2026-10",
  });
  await repository.createDebt(createDb(), input);
  await expect(repository.createDebt(createDb(), input)).rejects.toThrow();
  expect(await repository.createDebts(createDb(), [input])).toEqual([]);
});

test("recurring generation keeps UTC noon, clamps month ends and is retry safe", async () => {
  const rule = await repository.createRecurringDebt(createDb(), {
    ...recurringInput(),
    dayOfMonth: 31,
    startedAt: "2024-01-31T12:00:01.000Z",
  });
  await repository.createRecurringDebt(createDb(), { ...recurringInput(), isActive: false });
  expect(
    await repository.generateDueRecurringDebts(createDb(), new Date("2024-02-29T11:59:59Z")),
  ).toEqual([]);
  const outputs = await Promise.all(
    [1, 2].map(() =>
      repository.generateDueRecurringDebts(createDb(), new Date("2024-04-30T12:00:00Z")),
    ),
  );
  const instances = outputs.flat().sort((a, b) => a.dueAt!.localeCompare(b.dueAt!));
  expect(instances.map((d) => d.dueAt)).toEqual([
    "2024-02-29T12:00:00.000Z",
    "2024-03-31T12:00:00.000Z",
    "2024-04-30T12:00:00.000Z",
  ]);
  expect(instances.every((d) => d.recurringDebtId === rule.id && d.pendingAmount === 30)).toBe(
    true,
  );
  expect(
    await repository.generateDueRecurringDebts(createDb(), new Date("2024-04-30T12:00:00Z")),
  ).toEqual([]);
});

test("concurrent first settings writes create one row and disjoint first patches keep both fields", async () => {
  const initial = await repository.getSettings(createDb());
  await fixture.pool.query("TRUNCATE settings");
  const writes = await Promise.all([
    repository.upsertSettings(createDb(), { ...initial, theme: "dark" }),
    repository.upsertSettings(createDb(), { ...initial, theme: "system" }),
  ]);
  expect((await fixture.pool.query("SELECT id FROM settings")).rows).toHaveLength(1);
  expect(writes.map((row) => row.primaryCurrency)).toEqual(["UYU", "UYU"]);
  await fixture.pool.query("TRUNCATE settings");
  await Promise.all([
    repository.patchSettings(createDb(), { theme: "dark" }),
    repository.patchSettings(createDb(), { defaultPaymentStatus: "needs_review" }),
  ]);
  expect((await fixture.pool.query("SELECT id FROM settings")).rows).toHaveLength(1);
  expect(await repository.getSettings(createDb())).toMatchObject({
    theme: "dark",
    defaultPaymentStatus: "needs_review",
  });
});

test("wallet record search keeps descendant categories, Unicode labels and literal note filters across pages", async () => {
  const db = createDb();
  await fixture.pool.query("UPDATE categories SET name='Café' WHERE id=$1", [categoryId]);
  await fixture.pool.query("UPDATE categories SET name='Comida' WHERE id=$1", [childId]);
  await fixture.pool.query("UPDATE tags SET name='Viajé' WHERE id=$1", [tagId]);
  const first = await repository.createRecord(db, {
    ...recordInput(),
    categoryId: childId,
    note: "Literal 100%_\\ receipt",
    occurredAt: "2026-10-02T02:30:00Z",
  });
  const second = await repository.createRecord(db, {
    ...recordInput(),
    categoryId: childId,
    note: "Other 100%_\\ receipt",
    occurredAt: "2026-10-01T02:30:00Z",
  });
  await fixture.pool.query(
    "UPDATE records SET import_merchant='Amélie Synthetic' WHERE id=ANY($1::uuid[])",
    [[first.id, second.id]],
  );
  for (const search of ["CAFE / COMIDA", "viaje", "amelie", "100%_\\"]) {
    const page = await repository.listRecords(db, {
      search,
      searchMode: "wallet",
      categoryId,
      categoryMode: "descendants",
      limit: 1,
    });
    expect(page.items.map((row) => row.id)).toEqual([first.id]);
    expect(page.hasMore).toBe(true);
    expect(
      (
        await repository.listRecords(db, {
          search,
          searchMode: "wallet",
          categoryId,
          categoryMode: "descendants",
          limit: 1,
          cursor: page.nextCursor!,
        })
      ).items.map((row) => row.id),
    ).toEqual([second.id]);
  }
  expect((await repository.listRecords(db, { categoryId })).items).toEqual([]);
  expect((await repository.listRecords(db, { search: "viaje" })).items).toEqual([]);
  expect(
    (await repository.listRecords(db, { search: "100%_\\" })).items.map((row) => row.id),
  ).toEqual([first.id, second.id]);
  expect(
    (
      await repository.listRecords(db, {
        search: "amelie",
        searchMode: "wallet",
        note: "literal 100%_\\",
      })
    ).items.map((row) => row.id),
  ).toEqual([first.id]);
  expect(
    (
      await repository.listRecords(db, {
        from: "2026-10-01",
        to: "2026-10-01",
        timeZone: "America/Montevideo",
      })
    ).items.map((row) => row.id),
  ).toEqual([first.id]);
  expect(
    (await repository.listRecords(db, { from: "2026-10-01", to: "2026-10-01" })).items.map(
      (row) => row.id,
    ),
  ).toEqual([second.id]);
});

test("record pages expose linked refund kind without loading the card ledger", async () => {
  const db = createDb();
  const walletPurchase = await repository.createRecord(db, {
    ...recordInput(),
    creditCardId: cardId,
    paymentType: "credit",
    accountAmount: 20,
    amountInLimitCurrency: 20,
    exchangeRateToLimitCurrency: 1,
  });
  const purchase = (await repository.listCreditCardRecords(db, cardId)).find(
    (row) => row.walletRecordId === walletPurchase.id,
  )!;
  const refund = await repository.createCreditCardRecord(
    db,
    cardId,
    creditCardRecordSchema.parse({
      kind: "refund",
      originalRecordId: purchase.id,
      amount: 10,
      currency: "UYU",
      amountInLimitCurrency: 10,
      exchangeRateToLimitCurrency: 1,
      categoryId,
      occurredAt,
    }),
  );
  const page = await repository.listRecords(db, { creditCardId: cardId });
  expect(page.items.find((row) => row.id === purchase.walletRecordId)).toMatchObject({
    linkedCardRecordKind: "purchase",
  });
  expect(page.items.find((row) => row.id === refund.walletRecordId)).toMatchObject({
    linkedCardRecordKind: "refund",
  });
});

test("local date pagination includes both ends of a 25-hour daylight-saving day", async () => {
  const db = createDb();
  const early = await repository.createRecord(db, {
    ...recordInput(),
    occurredAt: "2026-11-01T04:30:00Z",
  });
  const late = await repository.createRecord(db, {
    ...recordInput(),
    occurredAt: "2026-11-02T04:30:00Z",
  });
  await repository.createRecord(db, { ...recordInput(), occurredAt: "2026-11-02T05:00:00Z" });
  const first = await repository.listRecords(db, {
    from: "2026-11-01",
    to: "2026-11-01",
    timeZone: "America/New_York",
    limit: 1,
  });
  expect(first.items.map((row) => row.id)).toEqual([late.id]);
  expect(
    (
      await repository.listRecords(db, {
        from: "2026-11-01",
        to: "2026-11-01",
        timeZone: "America/New_York",
        limit: 1,
        cursor: first.nextCursor!,
      })
    ).items.map((row) => row.id),
  ).toEqual([early.id]);
});
