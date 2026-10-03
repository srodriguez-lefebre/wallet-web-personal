ALTER TABLE records ADD COLUMN destination_amount numeric(14,2);
--> statement-breakpoint
CREATE FUNCTION wallet_validate_record_money() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_currency text; destination_currency text;
BEGIN
  IF NEW.deleted_at IS NOT NULL OR NEW.payment_status = 'cancelled' THEN RETURN NEW; END IF;
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
CREATE TRIGGER records_validate_money BEFORE INSERT OR UPDATE ON records
FOR EACH ROW EXECUTE FUNCTION wallet_validate_record_money();
--> statement-breakpoint
CREATE FUNCTION wallet_reconcile_debt_payment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_amount numeric := 0; new_amount numeric := 0; debt_currency text; debt_direction text; new_pending numeric;
BEGIN
  IF OLD.debt_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.debt_id IS DISTINCT FROM OLD.debt_id THEN
    RAISE EXCEPTION 'A debt payment cannot be reassigned' USING ERRCODE = '23514';
  END IF;
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
--> statement-breakpoint
CREATE TRIGGER records_reconcile_debt BEFORE UPDATE ON records
FOR EACH ROW EXECUTE FUNCTION wallet_reconcile_debt_payment();
--> statement-breakpoint
CREATE FUNCTION wallet_guard_primary_currency() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.primary_currency <> OLD.primary_currency AND (
    EXISTS (SELECT 1 FROM records) OR EXISTS (SELECT 1 FROM credit_card_records) OR EXISTS (SELECT 1 FROM goal_reservation_movements)
  ) THEN
    RAISE EXCEPTION 'Primary currency cannot change while financial history exists' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER settings_guard_currency BEFORE UPDATE ON settings
FOR EACH ROW EXECUTE FUNCTION wallet_guard_primary_currency();
