SELECT 'users' AS metric, count(*)::numeric AS value FROM "User"
UNION ALL SELECT 'clients', count(*) FROM "Client"
UNION ALL SELECT 'loans', count(*) FROM "Loan"
UNION ALL SELECT 'installments', count(*) FROM "Installment"
UNION ALL SELECT 'payments', count(*) FROM "Payment"
UNION ALL SELECT 'finance_transactions', count(*) FROM "FinanceTransaction"
UNION ALL SELECT 'principal', coalesce(sum("principalAmount"),0) FROM "Loan"
UNION ALL SELECT 'payments_amount', coalesce(sum("amount"),0) FROM "Payment"
UNION ALL SELECT 'finance_income', coalesce(sum("amount"),0) FROM "FinanceTransaction" WHERE "type" = 'INCOME' AND "status" = 'COMPLETED'
UNION ALL SELECT 'finance_expense', coalesce(sum("amount"),0) FROM "FinanceTransaction" WHERE "type" = 'EXPENSE' AND "status" = 'COMPLETED'
ORDER BY metric;
