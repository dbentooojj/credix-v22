import assert from "node:assert/strict";
import test from "node:test";
import { getSimulationDisplayStatusLabel, resolveSimulationDisplayStatus } from "./simulation-status";

test("simulação aceita sem empréstimo permanece simulada", () => {
  assert.equal(resolveSimulationDisplayStatus("ACCEPTED", null), "SIMULATED");
});

test("empréstimo vinculado determina a conversão, independente do status armazenado", () => {
  assert.equal(resolveSimulationDisplayStatus("ACCEPTED", 42), "CONVERTED");
  assert.equal(resolveSimulationDisplayStatus("DRAFT", 42), "CONVERTED");
});

test("cancelamento sem empréstimo é descartado e estados intermediários são simulados", () => {
  assert.equal(resolveSimulationDisplayStatus("CANCELED", null), "DISCARDED");
  for (const status of ["DRAFT", "SENT", "EXPIRED"]) {
    assert.equal(resolveSimulationDisplayStatus(status, null), "SIMULATED");
  }
  assert.equal(getSimulationDisplayStatusLabel("SIMULATED"), "Simulada");
  assert.equal(getSimulationDisplayStatusLabel("CONVERTED"), "Convertida");
  assert.equal(getSimulationDisplayStatusLabel("DISCARDED"), "Descartada");
});
