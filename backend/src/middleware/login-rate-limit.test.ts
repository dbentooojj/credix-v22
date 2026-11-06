import assert from "node:assert/strict";
import { AddressInfo } from "node:net";
import { after, test } from "node:test";
import express from "express";
import { createLoginRateLimiter } from "./login-rate-limit";

const servers: ReturnType<express.Express["listen"]>[] = [];

after(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function startServer(trustProxy: number, now: () => number): Promise<string> {
  const app = express();
  app.set("trust proxy", trustProxy);
  app.use(express.json());
  app.post("/auth/login", createLoginRateLimiter(now), (_req, res) => res.sendStatus(200));
  const server = app.listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/auth/login`;
}

test("bloqueia a decima primeira tentativa e libera apos 15 minutos", async () => {
  let currentTime = 0;
  const url = await startServer(0, () => currentTime);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    assert.equal((await fetch(url, { method: "POST" })).status, 200);
  }

  const blocked = await fetch(url, { method: "POST" });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get("retry-after"), "900");

  currentTime += 15 * 60 * 1000;
  assert.equal((await fetch(url, { method: "POST" })).status, 200);
});

test("separa os clientes pelo IP fornecido pelo proxy confiavel", async () => {
  const url = await startServer(1, () => 0);
  const postAs = (ip: string) => fetch(url, { method: "POST", headers: { "X-Forwarded-For": ip } });

  for (let attempt = 0; attempt < 10; attempt += 1) {
    assert.equal((await postAs("198.51.100.10")).status, 200);
  }

  assert.equal((await postAs("198.51.100.10")).status, 429);
  assert.equal((await postAs("198.51.100.11")).status, 200);
});

test("ignora X-Forwarded-For quando o proxy nao e confiavel", async () => {
  const url = await startServer(0, () => 0);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    assert.equal((await fetch(url, { method: "POST", headers: { "X-Forwarded-For": `198.51.100.${attempt}` } })).status, 200);
  }

  assert.equal((await fetch(url, { method: "POST", headers: { "X-Forwarded-For": "198.51.100.99" } })).status, 429);
});

test("nao permite contornar o limite da conta alterando X-Forwarded-For", async () => {
  const url = await startServer(1, () => 0);
  const postAs = (ip: string, email: string) => fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
    body: JSON.stringify({ email, password: "invalid" }),
  });

  for (let attempt = 0; attempt < 10; attempt += 1) {
    assert.equal((await postAs(`198.51.100.${attempt}`, " OWNER@EXAMPLE.COM ")).status, 200);
  }

  assert.equal((await postAs("198.51.100.99", "owner@example.com")).status, 429);
  assert.equal((await postAs("198.51.100.99", "other@example.com")).status, 200);
});
