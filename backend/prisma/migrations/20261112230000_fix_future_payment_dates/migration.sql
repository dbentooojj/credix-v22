-- Payments cannot occur after the local business date on which they were recorded.
-- Keep the receipt transaction and the paid installment aligned before fixing Payment.
UPDATE "FinanceTransaction" AS ft
SET "date" = ((p."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::date
FROM "Payment" AS p
WHERE p."paymentDate" > ((p."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::date
  AND ft."ownerUserId" = p."ownerUserId"
  AND ft."category" = 'Recebimento de parcela'
  AND ft."description" LIKE '% pagamento #' || p."id"::text;

UPDATE "Installment" AS i
SET "paymentDate" = ((p."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::date
FROM "Payment" AS p
WHERE p."paymentDate" > ((p."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::date
  AND i."id" = p."installmentId"
  AND i."paymentDate" = p."paymentDate";

UPDATE "Payment" AS p
SET "paymentDate" = ((p."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::date
WHERE p."paymentDate" > ((p."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::date;
