import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFinanceReport,
  buildFinanceReportCsv,
  buildLoansReport,
  buildLoansReportCsv,
  classifyFinanceOrigin,
  type FinanceReportFilters,
  type FinanceReportSourceRow,
  type LoanReportInstallmentInput,
  type LoanReportLoanInput,
  type LoanReportPaymentInput,
  type LoansReportFilters,
} from "./reports";

test("classifica origem financeira automatica e manual", () => {
  assert.equal(classifyFinanceOrigin("Recebimento de parcela"), "installment_payment");
  assert.equal(classifyFinanceOrigin("Desembolso de emprestimo"), "loan_disbursement");
  assert.equal(classifyFinanceOrigin("Ajuste de caixa"), "cash_adjustment");
  assert.equal(classifyFinanceOrigin("Marketing"), "manual");
});

test("calcula resumo financeiro, links automaticos e paginacao", () => {
  const rows: FinanceReportSourceRow[] = [
    {
      id: 1,
      type: "income",
      amount: 100,
      category: "Servicos",
      categoryId: "cat-1",
      date: "2026-03-01",
      description: "Receita manual",
      status: "completed",
    },
    {
      id: 2,
      type: "expense",
      amount: 40,
      category: "Marketing",
      categoryId: "cat-2",
      date: "2026-03-05",
      description: "Campanha",
      status: "completed",
    },
    {
      id: 3,
      type: "income",
      amount: 60,
      category: "Recebimento de parcela",
      categoryId: null,
      date: "2026-03-06",
      description: "Recebimento da parcela #5 do emprestimo #2",
      status: "completed",
    },
    {
      id: 4,
      type: "expense",
      amount: 200,
      category: "Desembolso de emprestimo",
      categoryId: null,
      date: "2026-02-28",
      description: "Desembolso do emprestimo #2",
      status: "completed",
    },
    {
      id: 5,
      type: "income",
      amount: 80,
      category: "Servicos",
      categoryId: "cat-1",
      date: "2026-03-20",
      description: "Recebimento pendente",
      status: "pending",
    },
    {
      id: 6,
      type: "expense",
      amount: 20,
      category: "Marketing",
      categoryId: "cat-2",
      date: "2026-03-22",
      description: "Conta agendada",
      status: "scheduled",
    },
  ];

  const filters: FinanceReportFilters = {
    startDate: "2026-03-01",
    endDate: "2026-03-31",
    origin: "all",
    direction: "all",
    status: "all",
    categoryId: "all",
    groupBy: "day",
    page: 1,
    pageSize: 20,
  };

  const report = buildFinanceReport(rows, filters);

  assert.equal(report.summary.openingBalance, -200);
  assert.equal(report.summary.cashIn, 160);
  assert.equal(report.summary.cashOut, 40);
  assert.equal(report.summary.closingBalance, -80);
  assert.equal(report.summary.openToReceive, 80);
  assert.equal(report.summary.openToPay, 20);
  assert.equal(report.summary.projectedBalance, -20);
  assert.equal(report.pagination.totalItems, 5);
  assert.equal(report.rows[0]?.id, "6");

  const installmentIncome = report.allRows.find((row) => row.id === "3");
  assert.equal(installmentIncome?.origin, "installment_payment");
  assert.equal(installmentIncome?.linkedLoanId, "2");
  assert.equal(installmentIncome?.linkedInstallmentId, "5");

  const csv = buildFinanceReportCsv(report.allRows);
  assert.match(csv, /^﻿"id","data","descricao"/);
  assert.match(csv, /"Recebimento da parcela #5 do emprestimo #2"/);
});

test("calcula snapshot de emprestimos, inadimplencia e csv", () => {
  const loans: LoanReportLoanInput[] = [
    {
      id: 1,
      clientName: "Ana",
      principalAmount: 100,
      totalAmount: 120,
      installmentsCount: 2,
      startDate: "2026-03-01",
      dueDate: "2026-04-01",
    },
    {
      id: 2,
      clientName: "Bia",
      principalAmount: 200,
      totalAmount: 260,
      installmentsCount: 2,
      startDate: "2026-04-10",
      dueDate: "2026-05-10",
    },
    {
      id: 3,
      clientName: "Caio",
      principalAmount: 150,
      totalAmount: 180,
      installmentsCount: 2,
      startDate: "2026-06-20",
      dueDate: "2026-07-20",
    },
  ];

  const installments: LoanReportInstallmentInput[] = [
    { id: 11, loanId: 1, installmentNumber: 1, amount: 60, dueDate: "2026-03-15", principalAmount: 50, interestAmount: 10 },
    { id: 12, loanId: 1, installmentNumber: 2, amount: 60, dueDate: "2026-04-01", principalAmount: 50, interestAmount: 10 },
    { id: 21, loanId: 2, installmentNumber: 1, amount: 130, dueDate: "2026-04-20", principalAmount: 100, interestAmount: 30 },
    { id: 22, loanId: 2, installmentNumber: 2, amount: 130, dueDate: "2026-05-10", principalAmount: 100, interestAmount: 30 },
    { id: 31, loanId: 3, installmentNumber: 1, amount: 90, dueDate: "2026-07-05", principalAmount: 75, interestAmount: 15 },
    { id: 32, loanId: 3, installmentNumber: 2, amount: 90, dueDate: "2026-07-20", principalAmount: 75, interestAmount: 15 },
  ];

  const payments: LoanReportPaymentInput[] = [
    { id: 1001, loanId: 1, installmentId: 11, amount: 60, paymentDate: "2026-03-16" },
  ];

  const filters: LoansReportFilters = {
    startDate: "2026-03-01",
    endDate: "2026-06-01",
    loanStatus: "all",
    groupBy: "month",
  };

  const report = buildLoansReport(loans, installments, payments, filters);

  assert.equal(report.summary.loanedInPeriod, 300);
  assert.equal(report.summary.receivedInPeriod, 60);
  assert.equal(report.summary.profitInPeriod, 10);
  assert.equal(report.summary.openPortfolioAtEnd, 320);
  assert.equal(report.summary.overduePortfolioAtEnd, 320);
  assert.equal(report.summary.delinquencyRateAtEnd, 100);
  assert.equal(report.summary.roiAccumulatedToEnd, 3.33);
  assert.equal(report.portfolioStatus.totalContracts, 3);

  const pending = report.portfolioStatus.items.find((item) => item.status === "PENDENTE");
  const overdue = report.portfolioStatus.items.find((item) => item.status === "ATRASADO");
  assert.equal(pending?.count, 1);
  assert.equal(overdue?.count, 2);

  const csv = buildLoansReportCsv(report.exportRows);
  assert.match(csv, /^﻿"emprestimo_id","cliente","status"/);
  assert.match(csv, /"Ana"/);
  assert.match(csv, /"Caio","PENDENTE"/);
});
