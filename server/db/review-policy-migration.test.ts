import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";

test("review policy migration restores only matching live linked purchases and reconciles existing debt payments",async()=>{
  const pg=new PGlite();
  try {
    const folder=new URL("../../drizzle/migrations/",import.meta.url);
    const journal=JSON.parse(await readFile(new URL("meta/_journal.json",folder),"utf8")) as {entries:{tag:string}[]};
    for (const entry of journal.entries.filter(entry=>entry.tag!=="0019_review_activity_accounting")) {
      await pg.exec(await readFile(new URL(`${entry.tag}.sql`,folder),"utf8"));
    }
    const accountId=randomUUID(),categoryId=randomUUID(),cardId=randomUUID(),debtId=randomUUID(),unknownDebtId=randomUUID();
    await pg.query("INSERT INTO accounts(id,name,type,currency,initial_balance,color,icon) VALUES($1,'Bank','bank','UYU',1000,'blue','bank')",[accountId]);
    await pg.query("INSERT INTO categories(id,name,color,icon) VALUES($1,'Test','blue','bank')",[categoryId]);
    await pg.query("INSERT INTO credit_cards(id,name,issuer,last_four,credit_limit,limit_currency,closing_day,due_day,color,icon) VALUES($1,'Card','Bank','1234',1000,'UYU',20,5,'blue','bank')",[cardId]);
    await pg.query("INSERT INTO debts(id,name,direction,currency,original_amount,pending_amount,counterparty_name,category_id,status,started_at) VALUES($1,'Debt','payable','UYU',100,100,'Test',$3,'active',now()),($2,'Unknown debt','payable','UYU',NULL,NULL,'Test',$3,'active',now())",[debtId,unknownDebtId,categoryId]);
    const reviewId=randomUUID(),cancelledId=randomUUID(),deletedId=randomUUID(),detachedId=randomUUID();
    for (const [id,status,isDeleted,linkedCard] of [
      [reviewId,"needs_review",false,cardId],
      [cancelledId,"cancelled",false,cardId],
      [deletedId,"needs_review",true,cardId],
      [detachedId,"needs_review",false,null],
    ] as const) {
      await pg.query("INSERT INTO records(id,type,amount,currency,account_id,account_amount,credit_card_id,category_id,payment_type,payment_status,exchange_rate_to_primary,amount_in_limit_currency,exchange_rate_to_limit_currency,occurred_at,deleted_at) VALUES($1,'expense',20,'UYU',$2,20,$3,$4,'credit',$5,1,20,1,now(),$6)",[id,accountId,linkedCard,categoryId,status,isDeleted?new Date():null]);
      await pg.query("INSERT INTO credit_card_records(credit_card_id,wallet_record_id,kind,amount,currency,category_id,amount_in_limit_currency,exchange_rate_to_limit_currency,account_impact_at_creation,occurred_at,deleted_at) VALUES($1,$2,'purchase',20,'UYU',$3,20,1,false,now(),now())",[cardId,id,categoryId]);
    }
    await pg.query("INSERT INTO credit_card_records(credit_card_id,kind,amount,currency,category_id,amount_in_limit_currency,exchange_rate_to_limit_currency,account_impact_at_creation,occurred_at,deleted_at) VALUES($1,'purchase',30,'UYU',$2,30,1,false,now(),now())",[cardId,categoryId]);
    const debtRecord=randomUUID();
    await pg.query("INSERT INTO records(id,type,amount,currency,account_id,category_id,payment_type,payment_status,exchange_rate_to_primary,occurred_at,debt_id) VALUES($1,'expense',20,'UYU',$2,$3,'debit','needs_review',1,now(),$4)",[debtRecord,accountId,categoryId,debtId]);
    await pg.query("INSERT INTO records(type,amount,currency,account_id,category_id,payment_type,payment_status,exchange_rate_to_primary,occurred_at,debt_id) VALUES('expense',10,'UYU',$1,$2,'debit','needs_review',1,now(),$3)",[accountId,categoryId,unknownDebtId]);
    const migration=await readFile(new URL("0019_review_activity_accounting.sql",folder),"utf8");
    await pg.query("UPDATE debts SET pending_amount=10 WHERE id=$1",[debtId]);
    await expect(pg.transaction(async tx=>{await tx.exec(migration);})).rejects.toThrow(/exceeds a debt pending balance/);
    expect((await pg.query("SELECT id FROM credit_card_records WHERE deleted_at IS NULL")).rows).toEqual([]);
    expect((await pg.query<{pending_amount:string|null}>("SELECT pending_amount FROM debts WHERE id=$1",[debtId])).rows[0].pending_amount).toBe("10.00");
    await pg.query("UPDATE debts SET pending_amount=100 WHERE id=$1",[debtId]);
    await pg.transaction(async tx=>{await tx.exec(migration);});
    expect((await pg.query<{wallet_record_id:string|null}>("SELECT wallet_record_id FROM credit_card_records WHERE deleted_at IS NULL")).rows).toEqual([{wallet_record_id:reviewId}]);
    expect((await pg.query<{pending_amount:string|number|null}>("SELECT pending_amount FROM debts WHERE id=$1",[debtId])).rows[0].pending_amount).toBe("80.00");
    expect((await pg.query<{pending_amount:string|null}>("SELECT pending_amount FROM debts WHERE id=$1",[unknownDebtId])).rows[0].pending_amount).toBeNull();
    await pg.query("UPDATE records SET payment_status='cleared' WHERE id=$1",[debtRecord]);
    expect((await pg.query<{pending_amount:string|null}>("SELECT pending_amount FROM debts WHERE id=$1",[debtId])).rows[0].pending_amount).toBe("80.00");
    await pg.query("UPDATE records SET payment_status='cancelled' WHERE id=$1",[debtRecord]);
    expect((await pg.query<{pending_amount:string|null}>("SELECT pending_amount FROM debts WHERE id=$1",[debtId])).rows[0].pending_amount).toBe("100.00");
  } finally {await pg.close();}
},30_000);
