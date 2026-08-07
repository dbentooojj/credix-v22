import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/credix?schema=public";
process.env.JWT_SECRET ??= "chave-de-teste-com-pelo-menos-dezesseis-caracteres";

test("gera relatorio agrupado com telefone clicavel no WhatsApp", async () => {
  const { buildDueReceivablesEmailHtml, buildDueReceivablesEmailText } = await import("./email-reminder.service");
  const groups = [
    {
      clientId: 1,
      clientName: "Joao da Silva",
      clientPhone: "55 (47) 99999-8888",
      totalAmount: 950,
      installments: [
        { ownerUserId: 1, installmentId: 1, installmentNumber: 2, installmentTotal: 4, clientId: 1, clientName: "Joao da Silva", clientPhone: "55 (47) 99999-8888", amount: 350 },
        { ownerUserId: 1, installmentId: 2, installmentNumber: 1, installmentTotal: 3, clientId: 1, clientName: "Joao da Silva", clientPhone: "55 (47) 99999-8888", amount: 600 },
      ],
    },
  ];

  const html = buildDueReceivablesEmailHtml(groups, "2026-08-07", 950);
  const text = buildDueReceivablesEmailText(groups, "2026-08-07", 950);

  assert.match(html, /Joao da Silva/);
  assert.match(html, /href="https:\/\/wa\.me\/5547999998888"/);
  assert.doesNotMatch(html, /555547999998888/);
  assert.match(html, /\(47\) 99999-8888/);
  assert.match(html, /Parcela 2\/4/);
  assert.match(html, /Parcela 1\/3/);
  assert.match(html, /Total previsto para hoje: R\$\s?950,00/);
  assert.match(text, /Joao da Silva — \(47\) 99999-8888 — Total: R\$\s?950,00/);
});
