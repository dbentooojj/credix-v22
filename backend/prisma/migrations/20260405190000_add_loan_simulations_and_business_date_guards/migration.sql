-- CreateEnum
CREATE TYPE "LoanSimulationStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'EXPIRED', 'CANCELED');

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN "simulationId" TEXT;

-- CreateTable
CREATE TABLE "LoanSimulation" (
    "id" TEXT NOT NULL,
    "ownerUserId" INTEGER NOT NULL,
    "clientId" INTEGER NOT NULL,
    "clientName" TEXT,
    "clientPhone" TEXT,
    "principalAmount" DECIMAL(14,2) NOT NULL,
    "interestType" TEXT NOT NULL,
    "interestRate" DECIMAL(7,4) NOT NULL,
    "fixedFeeAmount" DECIMAL(14,2) NOT NULL,
    "installmentsCount" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "firstDueDate" DATE NOT NULL,
    "dueDates" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "observations" TEXT,
    "status" "LoanSimulationStatus" NOT NULL DEFAULT 'DRAFT',
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "installmentAmount" DECIMAL(14,2) NOT NULL,
    "expiresAt" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoanSimulation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Loan_simulationId_key" ON "Loan"("simulationId");

-- CreateIndex
CREATE INDEX "LoanSimulation_ownerUserId_idx" ON "LoanSimulation"("ownerUserId");

-- CreateIndex
CREATE INDEX "LoanSimulation_clientId_idx" ON "LoanSimulation"("clientId");

-- CreateIndex
CREATE INDEX "LoanSimulation_ownerUserId_status_expiresAt_idx" ON "LoanSimulation"("ownerUserId", "status", "expiresAt");

-- AddForeignKey
ALTER TABLE "Loan"
ADD CONSTRAINT "Loan_simulationId_fkey"
FOREIGN KEY ("simulationId") REFERENCES "LoanSimulation"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanSimulation"
ADD CONSTRAINT "LoanSimulation_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanSimulation"
ADD CONSTRAINT "LoanSimulation_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
