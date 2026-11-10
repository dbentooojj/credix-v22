CREATE TYPE "PaymentFrequency" AS ENUM ('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY');

ALTER TABLE "Loan"
ADD COLUMN "paymentFrequency" "PaymentFrequency";

ALTER TABLE "LoanSimulation"
ADD COLUMN "paymentFrequency" "PaymentFrequency";
