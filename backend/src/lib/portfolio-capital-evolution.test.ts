import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPortfolioCapitalEvolution } from './portfolio-capital-evolution';

test('separa aportes, ganhos, retiradas e despesas no histórico do capital', () => {
  const points = buildPortfolioCapitalEvolution([
    { date: '2026-01-10', investedChange: 1000, resultChange: 0 },
    { date: '2026-02-12', investedChange: 0, resultChange: 200 },
    { date: '2026-03-01', investedChange: -100, resultChange: 0 },
    { date: '2026-03-03', investedChange: 0, resultChange: -30 },
  ], '2026-03-07');
  assert.deepEqual(points, [
    { month: '2026-01', invested: 1000, result: 0, capital: 1000 },
    { month: '2026-02', invested: 1000, result: 200, capital: 1200 },
    { month: '2026-03', invested: 900, result: 170, capital: 1070 },
  ]);
});

test('preserva meses sem movimento e exclui movimentos posteriores à data de referência', () => {
  const points = buildPortfolioCapitalEvolution([
    { date: '2025-12-31', investedChange: 500, resultChange: 0 },
    { date: '2026-02-07', investedChange: 0, resultChange: 20 },
    { date: '2026-02-08', investedChange: 2000, resultChange: 0 },
  ], '2026-02-07');
  assert.deepEqual(points.map((point) => [point.month, point.capital]), [
    ['2025-12', 500], ['2026-01', 500], ['2026-02', 520],
  ]);
});

test('recuperar principal não gera ganho nem altera o dinheiro próprio investido', () => {
  assert.deepEqual(buildPortfolioCapitalEvolution([
    { date: '2026-01-01', investedChange: 1000, resultChange: 0 },
    { date: '2026-02-01', investedChange: 0, resultChange: 0 },
  ], '2026-02-15').at(-1), { month: '2026-02', invested: 1000, result: 0, capital: 1000 });
});

test('mantém retiradas superiores aos aportes e faz somas em centavos', () => {
  const movements = Array.from({ length: 10 }, () => ({ date: '2026-01-01', investedChange: 0.1, resultChange: 0 }));
  movements.push({ date: '2026-01-02', investedChange: -2, resultChange: 0 });
  assert.equal(buildPortfolioCapitalEvolution(movements, '2026-01-07')[0].invested, -1);
  assert.deepEqual(buildPortfolioCapitalEvolution([], '2026-01-07'), []);
});
