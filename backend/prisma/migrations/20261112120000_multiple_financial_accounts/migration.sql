-- A single transaction is provided by Prisma Migrate. The backfill changes no amounts or dates.
CREATE TABLE "FinancialAccount" (
  "id" SERIAL NOT NULL,
  "ownerUserId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "institution" TEXT,
  "color" TEXT NOT NULL DEFAULT '#4f46e5',
  "description" TEXT,
  "archived" BOOLEAN NOT NULL DEFAULT false,
  "isOriginal" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancialAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FinancialAccount_id_ownerUserId_key" ON "FinancialAccount"("id", "ownerUserId");
CREATE UNIQUE INDEX "FinancialAccount_original_owner_key" ON "FinancialAccount"("ownerUserId") WHERE "isOriginal" = true;
CREATE INDEX "FinancialAccount_ownerUserId_archived_idx" ON "FinancialAccount"("ownerUserId", "archived");
ALTER TABLE "FinancialAccount" ADD CONSTRAINT "FinancialAccount_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "FinancialAccount" ("ownerUserId", "name", "isOriginal")
SELECT "id", 'Caixa Original', true FROM "User";

CREATE FUNCTION create_original_financial_account() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "FinancialAccount" ("ownerUserId", "name", "isOriginal") VALUES (NEW."id", 'Caixa Original', true);
  RETURN NEW;
END;
$$;
CREATE TRIGGER user_original_financial_account AFTER INSERT ON "User"
FOR EACH ROW EXECUTE FUNCTION create_original_financial_account();

ALTER TABLE "FinanceTransaction" ADD COLUMN "financialAccountId" INTEGER;
ALTER TABLE "FinanceTransaction" ADD COLUMN "transferId" TEXT;
ALTER TABLE "FinanceTransaction" ADD COLUMN "reversalOfId" INTEGER;
UPDATE "FinanceTransaction" t SET "financialAccountId" = a."id"
FROM "FinancialAccount" a WHERE a."ownerUserId" = t."ownerUserId" AND a."isOriginal" = true;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "FinanceTransaction" WHERE "financialAccountId" IS NULL) THEN
    RAISE EXCEPTION 'Financial account backfill incomplete';
  END IF;
END $$;
ALTER TABLE "FinanceTransaction" ALTER COLUMN "financialAccountId" SET NOT NULL;
CREATE INDEX "FinanceTransaction_financialAccountId_status_idx" ON "FinanceTransaction"("financialAccountId", "status");
CREATE INDEX "FinanceTransaction_ownerUserId_transferId_idx" ON "FinanceTransaction"("ownerUserId", "transferId");
CREATE UNIQUE INDEX "FinanceTransaction_reversalOfId_key" ON "FinanceTransaction"("reversalOfId");
ALTER TABLE "FinanceTransaction" ADD CONSTRAINT "FinanceTransaction_financialAccountId_ownerUserId_fkey" FOREIGN KEY ("financialAccountId", "ownerUserId") REFERENCES "FinancialAccount"("id", "ownerUserId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceTransaction" ADD CONSTRAINT "FinanceTransaction_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "FinanceTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Loan" ADD COLUMN "financialAccountId" INTEGER;
ALTER TABLE "Payment" ADD COLUMN "financialAccountId" INTEGER;
ALTER TABLE "Payment" ADD COLUMN "requestKey" TEXT;
DROP INDEX IF EXISTS "Payment_installmentId_key";
CREATE UNIQUE INDEX "Payment_requestKey_key" ON "Payment"("requestKey");
UPDATE "Loan" l SET "financialAccountId" = a."id" FROM "FinancialAccount" a WHERE a."ownerUserId" = l."ownerUserId" AND a."isOriginal" = true;
UPDATE "Payment" p SET "financialAccountId" = a."id" FROM "FinancialAccount" a WHERE a."ownerUserId" = p."ownerUserId" AND a."isOriginal" = true;
CREATE INDEX "Loan_financialAccountId_idx" ON "Loan"("financialAccountId");
CREATE INDEX "Payment_financialAccountId_idx" ON "Payment"("financialAccountId");
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_financialAccountId_ownerUserId_fkey" FOREIGN KEY ("financialAccountId", "ownerUserId") REFERENCES "FinancialAccount"("id", "ownerUserId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_financialAccountId_ownerUserId_fkey" FOREIGN KEY ("financialAccountId", "ownerUserId") REFERENCES "FinancialAccount"("id", "ownerUserId") ON DELETE RESTRICT ON UPDATE CASCADE;
