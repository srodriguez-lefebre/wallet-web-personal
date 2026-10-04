CREATE OR REPLACE FUNCTION wallet_validate_record_money() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_currency text; destination_currency text;
BEGIN
  PERFORM id FROM accounts WHERE id IN (NEW.account_id, NEW.destination_account_id) ORDER BY id FOR SHARE;
  IF NEW.deleted_at IS NOT NULL OR NEW.payment_status IN ('cancelled', 'needs_review') THEN RETURN NEW; END IF;
  SELECT currency INTO source_currency FROM accounts WHERE id = NEW.account_id;
  IF source_currency IS DISTINCT FROM NEW.currency AND NEW.account_id IS NOT NULL AND NEW.account_amount IS NULL THEN
    RAISE EXCEPTION 'Account amount is required for different currencies' USING ERRCODE = '23514';
  END IF;
  IF NEW.type = 'transfer' THEN
    SELECT currency INTO destination_currency FROM accounts WHERE id = NEW.destination_account_id;
    IF destination_currency IS DISTINCT FROM NEW.currency AND NEW.destination_amount IS NULL THEN
      RAISE EXCEPTION 'Destination amount is required for different currencies' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION wallet_guard_account_currency() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.currency <> OLD.currency AND (
    OLD.initial_balance <> 0 OR
    EXISTS (SELECT 1 FROM records WHERE account_id = OLD.id OR destination_account_id = OLD.id) OR
    EXISTS (SELECT 1 FROM credit_card_records WHERE account_id = OLD.id) OR
    EXISTS (SELECT 1 FROM credit_card_payments WHERE account_id = OLD.id) OR
    EXISTS (SELECT 1 FROM goal_reservation_movements WHERE account_id = OLD.id)
  ) THEN RAISE EXCEPTION 'Account currency cannot change while financial history exists' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER accounts_guard_currency BEFORE UPDATE ON accounts
FOR EACH ROW EXECUTE FUNCTION wallet_guard_account_currency();
--> statement-breakpoint
CREATE FUNCTION wallet_guard_card_currency() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.limit_currency <> OLD.limit_currency AND (
    EXISTS (SELECT 1 FROM credit_card_records WHERE credit_card_id = OLD.id) OR
    EXISTS (SELECT 1 FROM credit_card_payments WHERE credit_card_id = OLD.id)
  ) THEN RAISE EXCEPTION 'Card limit currency cannot change while financial history exists' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER credit_cards_guard_currency BEFORE UPDATE ON credit_cards
FOR EACH ROW EXECUTE FUNCTION wallet_guard_card_currency();
--> statement-breakpoint
CREATE FUNCTION wallet_lock_financial_currencies() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME IN ('credit_card_records', 'credit_card_payments') THEN
    PERFORM id FROM credit_cards WHERE id = NEW.credit_card_id FOR SHARE;
  END IF;
  PERFORM id FROM accounts WHERE id = NEW.account_id FOR SHARE;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER card_records_lock_currencies BEFORE INSERT OR UPDATE ON credit_card_records
FOR EACH ROW EXECUTE FUNCTION wallet_lock_financial_currencies();
--> statement-breakpoint
CREATE TRIGGER card_payments_lock_currencies BEFORE INSERT OR UPDATE ON credit_card_payments
FOR EACH ROW EXECUTE FUNCTION wallet_lock_financial_currencies();
--> statement-breakpoint
CREATE TRIGGER goal_movements_lock_currencies BEFORE INSERT OR UPDATE ON goal_reservation_movements
FOR EACH ROW EXECUTE FUNCTION wallet_lock_financial_currencies();
--> statement-breakpoint
CREATE TRIGGER legacy_reserves_lock_currencies BEFORE INSERT OR UPDATE ON goal_reservations
FOR EACH ROW EXECUTE FUNCTION wallet_lock_financial_currencies();
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
  IF OLD.deleted_at IS NULL AND OLD.payment_status NOT IN ('cancelled', 'needs_review') THEN old_amount := OLD.amount; END IF;
  IF NEW.deleted_at IS NULL AND NEW.payment_status NOT IN ('cancelled', 'needs_review') THEN new_amount := NEW.amount; END IF;
  IF old_amount = new_amount THEN RETURN NEW; END IF;
  SELECT pending_amount + old_amount - new_amount INTO new_pending FROM debts WHERE id = OLD.debt_id;
  IF new_pending < 0 THEN RAISE EXCEPTION 'Payment exceeds the pending debt' USING ERRCODE = '23514'; END IF;
  UPDATE debts SET pending_amount = new_pending,
    status = CASE WHEN new_pending = 0 THEN 'paid'::debt_status WHEN status = 'paid' THEN 'active'::debt_status ELSE status END
    WHERE id = OLD.debt_id;
  RETURN NEW;
END $$;
