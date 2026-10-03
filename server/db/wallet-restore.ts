import { getTableColumns, getTableName, sql, type Table } from "drizzle-orm";
import { createDb, type DbClient } from "./client.js";
import * as schema from "./schema.js";
import { walletBackupSchema } from "../../shared/schemas.js";
import { getWalletDataset } from "./wallet-repository.js";
import { validationError } from "../api/errors.js";

const collections: Array<[string, Table, string?]> = [
  ["accounts",schema.accounts],["categories",schema.categories,"parentId"],["tags",schema.tags],["creditCards",schema.creditCards],
  ["merchants",schema.merchants],["merchantAliases",schema.merchantAliases],
  ["goals",schema.goals],["recurringDebts",schema.recurringDebts],["debts",schema.debts],["creditCardStatements",schema.creditCardStatements],
  ["records",schema.records],["creditCardRecords",schema.creditCardRecords,"originalRecordId"],["creditCardPayments",schema.creditCardPayments],
  ["creditCardPaymentAllocations",schema.creditCardPaymentAllocations],["goalReservationMovements",schema.goalReservationMovements,"reversesMovementId"],
  ["budgets",schema.budgets],["exchangeRates",schema.exchangeRates],["investments",schema.investments],["installmentPlans",schema.installmentPlans],
];

/** Explicitly replaces a complete backup in one Neon transaction. No individual write can escape rollback. */
export async function restoreWalletBackup(input: unknown, db: DbClient = createDb()) {
  const dataset = walletBackupSchema.parse(input);
  const snapshot = dataset as unknown as Record<string, unknown>;
  if(dataset.merchants === undefined){
    const [currentCategories,currentMerchants,currentAliases] = await db.batch([
      db.select().from(schema.categories),db.select().from(schema.merchants),db.select().from(schema.merchantAliases),
    ]);
    const normalize = (name:string)=>name.normalize("NFKC").trim().toLocaleLowerCase("es");
    snapshot.merchants=currentMerchants.map(merchant=>{
      const oldCategory=currentCategories.find(category=>category.id===merchant.categoryId);
      const exact=dataset.categories.find(category=>category.id===merchant.categoryId);
      const matches=exact?[exact]:dataset.categories.filter(category=>
        oldCategory?.systemKey ? category.systemKey===oldCategory.systemKey : oldCategory && normalize(category.name)===normalize(oldCategory.name));
      if(matches.length!==1) throw validationError("The backup cannot preserve a merchant category; include merchant rules or restore matching categories");
      return {...merchant,categoryId:matches[0].id};
    });
    snapshot.merchantAliases=currentAliases;
  }
  const tables = [schema.ingestionEvents,schema.recordTags,schema.recordGoals,schema.goalTags,schema.settings,schema.goalReservations,...collections.map(([,table])=>table)];
  const queries: unknown[] = [db.execute(sql`LOCK TABLE ${sql.join(tables.map(table=>sql.identifier(getTableName(table))),sql`, `)} IN ACCESS EXCLUSIVE MODE`)];
  for (const table of tables.slice(0,6)) queries.push(db.execute(sql`DELETE FROM ${table}`));
  for (const [,table] of [...collections].reverse()) queries.push(db.execute(sql`DELETE FROM ${table}`));
  const insert = (table:Table,row:Record<string,unknown>,defer?:string) => {
    const columns=getTableColumns(table);
    const entries=Object.entries(row).filter(([key,value])=>columns[key]&&value!==undefined);
    const values=entries.map(([key,value])=>key===defer?null:columns[key].dataType==="json"?JSON.stringify(value):value);
    queries.push(db.execute(sql`INSERT INTO ${table} (${sql.join(entries.map(([key])=>sql.identifier(columns[key].name)),sql`, `)}) VALUES (${sql.join(values.map(value=>sql`${value}`),sql`, `)})`));
  };
  for(const [key,table,defer] of collections){
    let rows=(snapshot[key]??[]) as Record<string,unknown>[];
    if(key==="goalReservationMovements"&&!rows.length) rows=dataset.goalReservations.map(row=>({...row,type:"reserve"}));
    for(const row of rows) insert(table,row,defer);
    if(defer) for(const row of rows) if(row[defer]) queries.push(db.execute(sql`UPDATE ${table} SET ${sql.identifier(getTableColumns(table)[defer].name)} = ${row[defer]} WHERE id = ${row.id}`));
  }
  insert(schema.settings,dataset.settings as unknown as Record<string,unknown>);
  for(const record of dataset.records){
    for(const tagId of record.tagIds) insert(schema.recordTags,{recordId:record.id,tagId});
    const links=record.goalAssociations.length?record.goalAssociations:record.goalIds.map(goalId=>({goalId}));
    for(const link of links) insert(schema.recordGoals,{...link,recordId:record.id});
  }
  for(const goal of dataset.goals) for(const tagId of goal.tagIds) insert(schema.goalTags,{goalId:goal.id,tagId});
  await db.batch(queries as unknown as Parameters<DbClient["batch"]>[0]);
  return getWalletDataset(db);
}
