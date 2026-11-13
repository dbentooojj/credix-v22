-- FinanceTransaction.date is a business date, while createdAt is stored as a UTC timestamp.
-- Reversals previously copied the UTC calendar date into date, advancing late-night
-- operations in America/Sao_Paulo to the following day.
UPDATE "FinanceTransaction"
SET "date" = (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::date
WHERE "reversalOfId" IS NOT NULL;
