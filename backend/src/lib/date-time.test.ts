import assert from "node:assert/strict";
import test from "node:test";
import { getDateOnlyTodayInTimeZone, getIsoTodayInTimeZone } from "./date-time";

test("data civil de Sao Paulo nao avanca quando o UTC ja esta no dia seguinte", () => {
  const lateEveningInSaoPaulo = new Date("2026-11-13T00:47:00.000Z");

  assert.equal(getIsoTodayInTimeZone("America/Sao_Paulo", lateEveningInSaoPaulo), "2026-11-12");
  assert.equal(getDateOnlyTodayInTimeZone("America/Sao_Paulo", lateEveningInSaoPaulo).toISOString(), "2026-11-12T00:00:00.000Z");
});

test("data civil de Sao Paulo avanca depois da meia-noite local", () => {
  const afterMidnightInSaoPaulo = new Date("2026-11-13T03:01:00.000Z");

  assert.equal(getIsoTodayInTimeZone("America/Sao_Paulo", afterMidnightInSaoPaulo), "2026-11-13");
});
