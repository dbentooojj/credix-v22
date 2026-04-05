-- Financial categories catalog per user and transaction type.

CREATE TABLE IF NOT EXISTS "FinanceCategory" (
  "id" SERIAL NOT NULL,
  "ownerUserId" INTEGER NOT NULL,
  "type" "FinanceTransactionType" NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "emoji" TEXT NOT NULL DEFAULT '',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "isPreset" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 1000,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceCategory_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'FinanceCategory_ownerUserId_fkey'
  ) THEN
    ALTER TABLE "FinanceCategory"
    ADD CONSTRAINT "FinanceCategory_ownerUserId_fkey"
      FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'FinanceTransaction'
      AND column_name = 'categoryId'
  ) THEN
    ALTER TABLE "FinanceTransaction"
    ADD COLUMN "categoryId" INTEGER;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'FinanceTransaction_categoryId_fkey'
  ) THEN
    ALTER TABLE "FinanceTransaction"
    ADD CONSTRAINT "FinanceTransaction_categoryId_fkey"
      FOREIGN KEY ("categoryId") REFERENCES "FinanceCategory"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "FinanceCategory_ownerUserId_idx" ON "FinanceCategory"("ownerUserId");
CREATE INDEX IF NOT EXISTS "FinanceCategory_ownerUserId_type_active_sortOrder_idx" ON "FinanceCategory"("ownerUserId", "type", "active", "sortOrder");
CREATE UNIQUE INDEX IF NOT EXISTS "FinanceCategory_ownerUserId_type_normalizedName_key" ON "FinanceCategory"("ownerUserId", "type", "normalizedName");
CREATE INDEX IF NOT EXISTS "FinanceTransaction_categoryId_idx" ON "FinanceTransaction"("categoryId");
