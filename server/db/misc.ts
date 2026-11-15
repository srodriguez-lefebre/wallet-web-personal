import { and, desc, eq, isNull } from "drizzle-orm";

import { writeCategoryReferences } from "./category-references.js";
import {
  type BudgetPatch,
  budgetSchema,
  type InstallmentPlanPatch,
  installmentPlanSchema,
  type InvestmentPatch,
  investmentSchema,
} from "../../shared/schemas.js";
import { mapBudget, mapInstallmentPlan, mapInvestment, toDate, toNumeric } from "./mappers.js";
import { changedColumns, hasOwn, mergePatch } from "./patch.js";
import { budgets, installmentPlans, investments } from "./schema.js";

import type { Db, NewBudget, NewInstallmentPlan, NewInvestment } from "./input-types.js";

export async function listBudgets(db: Db) {
  const rows = await db
    .select()
    .from(budgets)
    .where(isNull(budgets.deletedAt))
    .orderBy(desc(budgets.createdAt));
  return rows.map(mapBudget);
}

export async function createBudget(db: Db, input: NewBudget) {
  const [row] = await writeCategoryReferences(
    db,
    [input.categoryId],
    db
      .insert(budgets)
      .values({
        ...input,
        limitAmount: toNumeric(input.limitAmount),
        categoryId: input.categoryId ?? null,
        tagId: input.tagId ?? null,
        accountId: input.accountId ?? null,
        goalId: input.goalId ?? null,
      })
      .returning(),
  );
  return mapBudget(row);
}

export async function updateBudget(db: Db, id: string, input: BudgetPatch) {
  const [current] = await db
    .select()
    .from(budgets)
    .where(and(eq(budgets.id, id), isNull(budgets.deletedAt)))
    .limit(1);
  if (!current) return null;
  const mapped = mapBudget(current);
  const merged = mergePatch(budgetSchema, mapped, input, [
    "categoryId",
    "tagId",
    "accountId",
    "goalId",
  ]);
  const [row] = await writeCategoryReferences(
    db,
    [input.categoryId],
    db
      .update(budgets)
      .set({
        ...changedColumns(input, merged, {
          name: (row) => row.name,
          limitAmount: (row) => toNumeric(row.limitAmount),
          currency: (row) => row.currency,
          period: (row) => row.period,
          categoryId: (row) => row.categoryId ?? null,
          tagId: (row) => row.tagId ?? null,
          accountId: (row) => row.accountId ?? null,
          goalId: (row) => row.goalId ?? null,
          color: (row) => row.color,
          isActive: (row) => row.isActive,
        }),
        updatedAt: new Date(),
      })
      .where(and(eq(budgets.id, id), isNull(budgets.deletedAt)))
      .returning(),
  );
  return row ? mapBudget(row) : null;
}

export async function deleteBudget(db: Db, id: string) {
  return (
    (
      await db
        .delete(budgets)
        .where(and(eq(budgets.id, id), isNull(budgets.deletedAt)))
        .returning()
    ).length > 0
  );
}

export async function listInstallmentPlans(db: Db) {
  return (await db.select().from(installmentPlans).where(isNull(installmentPlans.deletedAt))).map(
    mapInstallmentPlan,
  );
}

export async function createInstallmentPlan(db: Db, input: NewInstallmentPlan) {
  const [row] = await writeCategoryReferences(
    db,
    [input.categoryId],
    db
      .insert(installmentPlans)
      .values({
        ...input,
        totalAmount: toNumeric(input.totalAmount),
        installmentsTotal: toNumeric(input.installmentsTotal),
        installmentsPaid: toNumeric(input.installmentsPaid),
        nextPaymentAt: toDate(input.nextPaymentAt),
        note: input.note ?? null,
      })
      .returning(),
  );
  return mapInstallmentPlan(row);
}

export async function updateInstallmentPlan(db: Db, id: string, input: InstallmentPlanPatch) {
  const [current] = await db
    .select()
    .from(installmentPlans)
    .where(and(eq(installmentPlans.id, id), isNull(installmentPlans.deletedAt)))
    .limit(1);
  if (!current) return null;
  const mapped = mapInstallmentPlan(current);
  const merged = mergePatch(installmentPlanSchema, mapped, input, ["nextPaymentAt", "note"]);
  const [row] = await writeCategoryReferences(
    db,
    [input.categoryId],
    db
      .update(installmentPlans)
      .set({
        updatedAt: new Date(),
        ...changedColumns(input, merged, {
          name: (row) => row.name,
          totalAmount: (row) => toNumeric(row.totalAmount),
          currency: (row) => row.currency,
          installmentsTotal: (row) => toNumeric(row.installmentsTotal),
          installmentsPaid: (row) => toNumeric(row.installmentsPaid),
          accountId: (row) => row.accountId,
          categoryId: (row) => row.categoryId,
          nextPaymentAt: (row) => toDate(row.nextPaymentAt),
          note: (row) => row.note ?? null,
        }),
      })
      .where(and(eq(installmentPlans.id, id), isNull(installmentPlans.deletedAt)))
      .returning(),
  );
  return row ? mapInstallmentPlan(row) : null;
}

export async function deleteInstallmentPlan(db: Db, id: string) {
  return (
    (
      await db
        .delete(installmentPlans)
        .where(and(eq(installmentPlans.id, id), isNull(installmentPlans.deletedAt)))
        .returning()
    ).length > 0
  );
}

export async function listInvestments(db: Db) {
  const rows = await db
    .select()
    .from(investments)
    .where(isNull(investments.deletedAt))
    .orderBy(desc(investments.startedAt));
  return rows.map(mapInvestment);
}

export async function createInvestment(db: Db, input: NewInvestment) {
  const [row] = await db
    .insert(investments)
    .values({
      name: input.name,
      type: input.type,
      amountInvested: toNumeric(input.amountInvested),
      currentValue: toNumeric(input.currentValue),
      currency: input.currency,
      isVisible: input.isVisible,
      startedAt: new Date(input.startedAt ?? new Date().toISOString()),
      note: input.note ?? null,
    })
    .returning();
  return mapInvestment(row);
}

export async function updateInvestment(db: Db, id: string, input: InvestmentPatch) {
  const [current] = await db
    .select()
    .from(investments)
    .where(and(eq(investments.id, id), isNull(investments.deletedAt)))
    .limit(1);
  if (!current) return null;
  const mapped = mapInvestment(current);
  const merged = mergePatch(investmentSchema, mapped, input, ["note"]);
  const values: Partial<typeof investments.$inferInsert> = { updatedAt: new Date() };
  for (const key of ["name", "type", "currency", "isVisible"] as const) {
    if (hasOwn(input, key)) Object.assign(values, { [key]: merged[key] });
  }
  if (hasOwn(input, "amountInvested")) values.amountInvested = toNumeric(merged.amountInvested);
  if (hasOwn(input, "currentValue")) values.currentValue = toNumeric(merged.currentValue);
  if (hasOwn(input, "startedAt")) values.startedAt = new Date(merged.startedAt);
  if (hasOwn(input, "note")) values.note = merged.note ?? null;
  const [row] = await db
    .update(investments)
    .set(values)
    .where(and(eq(investments.id, id), isNull(investments.deletedAt)))
    .returning();
  return row ? mapInvestment(row) : null;
}

export async function deleteInvestment(db: Db, id: string) {
  const rows = await db
    .delete(investments)
    .where(and(eq(investments.id, id), isNull(investments.deletedAt)))
    .returning();
  return rows.length > 0;
}
