import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("frontend e backend usam a mesma versao do calculo de emprestimos", () => {
  for (const file of ["loanCalculator.ts", "currencyInput.ts"]) {
    const backend = readFileSync(resolve(__dirname, file), "utf8");
    const frontend = readFileSync(resolve(__dirname, "../../../frontend/utils", file), "utf8");
    assert.equal(backend, frontend, `${file} precisa ser atualizado nas duas camadas`);
  }
});
