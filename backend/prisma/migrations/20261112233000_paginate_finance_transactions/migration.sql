CREATE INDEX "FinanceTransaction_ownerUserId_status_date_id_idx"
ON "FinanceTransaction"("ownerUserId", "status", "date", "id");
