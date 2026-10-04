-- Review marks attention without reversing valid financial activity.
-- Unresolved foreign account conversions may remain in review; consumers must
-- use only known account amounts and never assume a 1:1 currency conversion.
-- Generic linked purchases could only be hidden by their wallet record's
-- cancellation/review/detach lifecycle; dedicated Cards deletion is limited to
-- unlinked rows. Restore only a live review record's matching purchase.
UPDATE credit_card_records AS movement
SET deleted_at = NULL, updated_at = now()
FROM records AS record
WHERE movement.wallet_record_id = record.id
  AND movement.deleted_at IS NOT NULL
  AND record.deleted_at IS NULL AND record.payment_status = 'needs_review'
  AND record.type = 'expense' AND movement.kind = 'purchase'
  AND movement.credit_card_id = record.credit_card_id
  AND movement.category_id = record.category_id
  AND movement.currency = record.currency AND movement.amount = record.amount
  AND movement.amount_in_limit_currency = record.amount_in_limit_currency
  AND movement.exchange_rate_to_limit_currency = record.exchange_rate_to_limit_currency
  AND movement.amount_in_limit_currency > 0 AND movement.exchange_rate_to_limit_currency > 0;
--> statement-breakpoint
-- The previous trigger restored debt balances when a payment entered review.
-- Apply the policy change once to existing, valid review payments. Unknown
-- pending balances remain unknown; inconsistent overpayments abort migration.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM debts AS debt
    JOIN (SELECT record.debt_id, sum(record.amount) AS amount FROM records AS record
      JOIN debts AS matching ON matching.id = record.debt_id
      WHERE record.deleted_at IS NULL AND record.payment_status = 'needs_review'
        AND record.currency = matching.currency
        AND record.type::text = CASE WHEN matching.direction = 'receivable' THEN 'income' ELSE 'expense' END
      GROUP BY record.debt_id) AS reviewed ON reviewed.debt_id = debt.id
    WHERE debt.pending_amount IS NOT NULL AND debt.pending_amount < reviewed.amount
  ) THEN
    RAISE EXCEPTION 'Review payment history exceeds a debt pending balance; reconcile history before applying the review policy' USING ERRCODE = '23514';
  END IF;
END $$;
--> statement-breakpoint
UPDATE debts AS debt
SET pending_amount = debt.pending_amount - reviewed.amount,
  status = CASE WHEN debt.pending_amount - reviewed.amount = 0 THEN 'paid'::debt_status
    WHEN debt.status = 'paid' THEN 'active'::debt_status ELSE debt.status END
FROM (SELECT record.debt_id, sum(record.amount) AS amount FROM records AS record
  JOIN debts AS matching ON matching.id = record.debt_id
  WHERE record.deleted_at IS NULL AND record.payment_status = 'needs_review'
    AND record.currency = matching.currency
    AND record.type::text = CASE WHEN matching.direction = 'receivable' THEN 'income' ELSE 'expense' END
  GROUP BY record.debt_id) AS reviewed
WHERE reviewed.debt_id = debt.id AND debt.pending_amount IS NOT NULL;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION wallet_reconcile_debt_payment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_amount numeric := 0; new_amount numeric := 0; debt_currency text; debt_direction text; new_pending numeric;
BEGIN
  IF NEW.debt_id IS DISTINCT FROM OLD.debt_id THEN
    RAISE EXCEPTION 'A debt payment cannot be reassigned' USING ERRCODE = '23514';
  END IF;
  IF OLD.debt_id IS NULL THEN RETURN NEW; END IF;
  SELECT currency, direction INTO debt_currency, debt_direction FROM debts WHERE id = OLD.debt_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF NEW.currency <> debt_currency OR NEW.type::text <> (CASE WHEN debt_direction = 'receivable' THEN 'income' ELSE 'expense' END) THEN
    RAISE EXCEPTION 'Debt payment currency and direction must match the debt' USING ERRCODE = '23514';
  END IF;
  IF OLD.deleted_at IS NULL AND OLD.payment_status <> 'cancelled' THEN old_amount := OLD.amount; END IF;
  IF NEW.deleted_at IS NULL AND NEW.payment_status <> 'cancelled' THEN new_amount := NEW.amount; END IF;
  IF old_amount = new_amount THEN RETURN NEW; END IF;
  SELECT pending_amount + old_amount - new_amount INTO new_pending FROM debts WHERE id = OLD.debt_id;
  IF new_pending < 0 THEN RAISE EXCEPTION 'Payment exceeds the pending debt' USING ERRCODE = '23514'; END IF;
  UPDATE debts SET pending_amount = new_pending,
    status = CASE WHEN new_pending = 0 THEN 'paid'::debt_status WHEN status = 'paid' THEN 'active'::debt_status ELSE status END
    WHERE id = OLD.debt_id;
  RETURN NEW;
END $$;
