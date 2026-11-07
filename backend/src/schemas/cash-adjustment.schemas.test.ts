import assert from 'node:assert/strict';
import test from 'node:test';
import { cashAdjustmentCreateSchema } from './cash-adjustment.schemas';

test('aceita uma data passada real e preserva o suporte a clientes sem data explícita', () => {
  const input = { type: 'income', amount: 100 };
  assert.equal(cashAdjustmentCreateSchema.parse({ ...input, date: '2024-02-29' }).date, '2024-02-29');
  assert.equal(cashAdjustmentCreateSchema.parse(input).date, undefined);
});

test('recusa datas impossíveis e datas futuras para adições e retiradas', () => {
  for (const type of ['income', 'expense']) {
    for (const date of ['2025-02-29', '2026-02-30', '2026-13-01', '2099-01-01', '']) {
      assert.equal(cashAdjustmentCreateSchema.safeParse({ type, amount: 100, date }).success, false, `${type} ${date}`);
    }
  }
});
