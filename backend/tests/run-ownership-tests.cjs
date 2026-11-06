const { PrismaClient } = require("@prisma/client");
const { spawnSync } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const path = require("node:path");

async function main() {
  if (process.env.NODE_ENV === "production" || !process.env.DATABASE_URL) {
    throw new Error("Execute este teste no ambiente local com DATABASE_URL configurada.");
  }

  const databaseName = `credix_ownership_test_${Date.now()}_${randomBytes(4).toString("hex")}`;
  if (!/^credix_ownership_test_[0-9]+_[a-f0-9]+$/.test(databaseName)) {
    throw new Error("Nome de banco temporario invalido.");
  }
  const adminUrl = new URL(process.env.DATABASE_URL);
  adminUrl.pathname = "/postgres";
  const testUrl = new URL(process.env.DATABASE_URL);
  testUrl.pathname = `/${databaseName}`;
  const admin = new PrismaClient({ datasourceUrl: adminUrl.toString() });
  let created = false;

  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
    created = true;
    const migration = spawnSync(process.execPath, [
      path.join(path.dirname(require.resolve("prisma/package.json")), "build/index.js"), "migrate", "deploy",
      "--schema", path.resolve(__dirname, "../prisma/schema.prisma"),
    ], {
      env: { ...process.env, DATABASE_URL: testUrl.toString() },
      encoding: "utf8",
    });
    if (migration.status !== 0) {
      console.error(migration.stdout, migration.stderr);
      throw new Error("Falha ao preparar o banco temporario.");
    }

    console.log("Banco temporario preparado; dados da aplicacao preservados.");
    const result = spawnSync(process.execPath, [
      require.resolve("tsx/cli"), "--test", path.join(__dirname, "installment-ownership.test.ts"),
    ], {
      env: { ...process.env, TEST_DATABASE_URL: testUrl.toString() },
      stdio: "inherit",
    });
    process.exitCode = result.status ?? 1;
  } finally {
    try {
      if (created) {
        await admin.$executeRawUnsafe(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
        console.log("Banco temporario removido.");
      }
    } finally {
      await admin.$disconnect();
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
