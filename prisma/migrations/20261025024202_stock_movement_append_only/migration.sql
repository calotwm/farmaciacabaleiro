-- Stock movements are an append-only ledger: corrections are compensating movements.
CREATE FUNCTION stock_movements_reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'stock_movements is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stock_movements_append_only
  BEFORE UPDATE OR DELETE ON "stock_movements"
  FOR EACH ROW EXECUTE FUNCTION stock_movements_reject_mutation();

CREATE TRIGGER stock_movements_no_truncate
  BEFORE TRUNCATE ON "stock_movements"
  FOR EACH STATEMENT EXECUTE FUNCTION stock_movements_reject_mutation();

-- Lot quantity invariants: no negative stock, blocked never exceeds on-hand.
ALTER TABLE "lots"
  ADD CONSTRAINT "lots_current_quantity_non_negative" CHECK ("current_quantity" >= 0),
  ADD CONSTRAINT "lots_blocked_quantity_non_negative" CHECK ("blocked_quantity" >= 0),
  ADD CONSTRAINT "lots_blocked_within_current" CHECK ("blocked_quantity" <= "current_quantity"),
  ADD CONSTRAINT "lots_initial_quantity_non_negative" CHECK ("initial_quantity" >= 0);

-- Movements carry a positive quantity (direction comes from the type) and a non-negative balance.
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "stock_movements_balance_non_negative" CHECK ("balance_after" >= 0);

-- Catalog and receiving sanity checks.
ALTER TABLE "products"
  ADD CONSTRAINT "products_min_stock_non_negative" CHECK ("min_stock" >= 0),
  ADD CONSTRAINT "products_max_stock_valid" CHECK ("max_stock" IS NULL OR "max_stock" >= "min_stock"),
  ADD CONSTRAINT "products_prices_non_negative" CHECK ("cost_price" >= 0 AND ("sale_price" IS NULL OR "sale_price" >= 0));

ALTER TABLE "receipt_lines"
  ADD CONSTRAINT "receipt_lines_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "receipt_lines_damaged_within_quantity" CHECK ("damaged_quantity" >= 0 AND "damaged_quantity" <= "quantity");

ALTER TABLE "suppliers"
  ADD CONSTRAINT "suppliers_visit_days_valid" CHECK ("visit_days" <@ ARRAY[0, 1, 2, 3, 4, 5, 6]);
