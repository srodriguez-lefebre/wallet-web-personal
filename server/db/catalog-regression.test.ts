import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";

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
import * as repository from "./wallet-repository.js";

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
}, 60_000);
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
  accountId = (await repository.createAccount(account)).id;
  otherAccountId = (await repository.createAccount({ ...account, name: "Other bank" })).id;
  const category = { name: "Synthetic category", color: "blue", icon: "tag" };
  categoryId = (await repository.createCategory(category)).id;
  childId = (await repository.createCategory({ ...category, name: "Child", parentId: categoryId }))
    .id;
  grandchildId = (
    await repository.createCategory({ ...category, name: "Grandchild", parentId: childId })
  ).id;
  tagId = (await repository.createTag({ name: "Synthetic tag", color: "blue", isActive: true })).id;
  goalId = (
    await repository.createGoal(
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

test("category deletion archives the entire tree and reassigns every existing financial reference", async () => {
  const record = await repository.createRecord(recordInput());
  await repository.createCreditCardRecord(
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
  await repository.createBudget(budgetInput());
  await repository.createDebt(
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
  await repository.createRecurringDebt(recurringInput());
  await repository.createInstallmentPlan(
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
  const result = await repository.deleteCategory(categoryId);
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
  expect((await repository.listRecords()).items).toContainEqual(
    expect.objectContaining({ id: record.id, categoryId: result.fallbackCategoryId, amount: 20 }),
  );
  expect(
    (await repository.listCategories()).some((category) =>
      [categoryId, childId, grandchildId].includes(category.id),
    ),
  ).toBe(false);
  expect(
    (await repository.getWalletBackup()).categories.filter((category) =>
      [categoryId, childId, grandchildId].includes(category.id),
    ),
  ).toHaveLength(3);
});

test("account archive preserves records and reservations and disables dependent active configuration", async () => {
  const record = await repository.createRecord(recordInput());
  await repository.createGoalReservation({
    goalId,
    accountId,
    amount: 100,
    currency: "UYU",
    createdAt: occurredAt,
  });
  await repository.createBudget(budgetInput());
  await repository.createRecurringDebt(recurringInput());
  expect(await repository.deleteAccount(accountId)).toBe(true);
  const dataset = await repository.getWalletDataset();
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
  expect((await repository.getWalletBackup()).accounts).toContainEqual(
    expect.objectContaining({ id: accountId, deletedAt: expect.any(String) }),
  );
});

test("card archive clears its default while retaining purchases and statement history", async () => {
  await repository.patchSettings({ defaultCreditCardId: cardId, defaultPaymentType: "credit" });
  const movement = await repository.createCreditCardRecord(
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
  expect(await repository.archiveCreditCard(cardId)).toBe(true);
  const settings = await repository.getSettings();
  expect(settings.defaultCreditCardId).toBeUndefined();
  expect(settings.defaultPaymentType).not.toBe("credit");
  expect(await repository.listCreditCards()).toContainEqual(
    expect.objectContaining({ id: cardId, isActive: false }),
  );
  expect(await repository.listCreditCardRecords(cardId)).toContainEqual(
    expect.objectContaining({ id: movement.id, amount: 30 }),
  );
});

test("tag deletion removes both join tables and budget references without deleting history", async () => {
  const record = await repository.createRecord(recordInput());
  await repository.createBudget(budgetInput());
  await fixture.pool.query("INSERT INTO goal_tags(goal_id,tag_id) VALUES($1,$2)", [goalId, tagId]);
  expect(await repository.deleteTag(tagId)).toBe(true);
  expect((await repository.listRecords()).items).toContainEqual(
    expect.objectContaining({ id: record.id, tagIds: [], amount: 20 }),
  );
  expect((await repository.listGoals()).find((goal) => goal.id === goalId)?.tagIds).toEqual([]);
  expect((await repository.listBudgets())[0]?.tagId).toBeUndefined();
  expect(
    (
      await fixture.pool.query(
        "SELECT * FROM record_tags UNION ALL SELECT goal_id,tag_id FROM goal_tags",
      )
    ).rows,
  ).toHaveLength(0);
});

test("concurrent settings replacement and partial updates preserve the existing singleton", async () => {
  const initial = await repository.getSettings();
  await Promise.all([
    repository.upsertSettings({ ...initial, theme: "dark" }),
    repository.upsertSettings({ ...initial, theme: "system" }),
  ]);
  await Promise.all([
    repository.patchSettings({ theme: "dark" }),
    repository.patchSettings({ defaultPaymentStatus: "needs_review" }),
  ]);
  expect((await fixture.pool.query("SELECT id FROM settings")).rows).toHaveLength(1);
  expect(await repository.getSettings()).toMatchObject({
    theme: "dark",
    defaultPaymentStatus: "needs_review",
  });
});

test("record filters and cursor pagination select only matching durable rows", async () => {
  const match = await repository.createRecord(recordInput());
  await fixture.pool.query("INSERT INTO record_goals(record_id,goal_id) VALUES($1,$2)", [
    match.id,
    goalId,
  ]);
  const other = await repository.createRecord({
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
    expect((await repository.listRecords(filter)).items.map((record) => record.id)).toEqual([
      match.id,
    ]);
  expect((await repository.listRecords({ type: "income" })).items).toEqual([]);
  expect((await repository.listRecords({ creditCardId: cardId })).items).toEqual([]);
  const first = await repository.listRecords({ type: "expense", limit: 1 });
  expect(first).toMatchObject({
    hasMore: true,
    items: [expect.objectContaining({ id: match.id })],
  });
  expect(first.nextCursor).toBeTruthy();
  const second = await repository.listRecords({ limit: 1, cursor: first.nextCursor ?? undefined });
  expect(second).toMatchObject({
    hasMore: false,
    nextCursor: null,
    items: [expect.objectContaining({ id: other.id })],
  });
});
