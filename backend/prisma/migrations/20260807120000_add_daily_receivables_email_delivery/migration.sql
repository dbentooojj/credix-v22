CREATE TYPE "DailyReceivablesEmailStatus" AS ENUM ('SENDING', 'SENT', 'FAILED');

CREATE TABLE "DailyReceivablesEmailDelivery" (
    "id" SERIAL NOT NULL,
    "ownerUserId" INTEGER NOT NULL,
    "referenceDate" DATE NOT NULL,
    "status" "DailyReceivablesEmailStatus" NOT NULL DEFAULT 'SENDING',
    "sentAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyReceivablesEmailDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyReceivablesEmailDelivery_ownerUserId_referenceDate_key"
ON "DailyReceivablesEmailDelivery"("ownerUserId", "referenceDate");

CREATE INDEX "DailyReceivablesEmailDelivery_referenceDate_status_idx"
ON "DailyReceivablesEmailDelivery"("referenceDate", "status");

ALTER TABLE "DailyReceivablesEmailDelivery"
ADD CONSTRAINT "DailyReceivablesEmailDelivery_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
