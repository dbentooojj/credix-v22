ALTER TABLE "FinanceTransaction" ADD COLUMN "requestKey" TEXT;
CREATE UNIQUE INDEX "FinanceTransaction_requestKey_key" ON "FinanceTransaction"("requestKey");
