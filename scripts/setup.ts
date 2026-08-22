import { PrismaClient } from "@prisma/client";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { randomUUID } from "node:crypto";
import packageJson from "../package.json";
import { applySeed } from "../src/lib/seed";
import { databaseUrlFromPath, getAppPaths } from "../src/lib/paths";
import { APP_PORT, APP_VERSION, SCHEMA_VERSION, SEED_VERSION } from "../src/lib/versions";
import { localDate } from "../src/lib/date-service";

const root = process.cwd();
const paths = getAppPaths();
const node = process.execPath;
const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");

function run(command: string, args: string[], env: NodeJS.ProcessEnv = process.env): void {
  const result = spawnSync(command, args, { cwd: root, env, stdio: "inherit", windowsHide: true, shell: false });
  if (result.status !== 0) throw new Error(`Command failed: ${path.basename(command)} ${args[0] ?? ""}`);
}

function compareSemver(left: string, right: string): number {
  const a = left.split(".").map(Number); const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) { const difference = (a[index] ?? 0) - (b[index] ?? 0); if (difference) return difference; }
  return 0;
}

async function isPortFree(): Promise<boolean> {
  return await new Promise((resolve) => {
    const server = net.createServer(); server.once("error", () => resolve(false));
    server.listen(APP_PORT, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

async function verifyHealth(databaseUrl: string): Promise<void> {
  const standalone = path.join(root, ".next", "standalone");
  const server = spawn(node, [path.join(standalone, "server.js")], {
    cwd: standalone, windowsHide: true, detached: false, stdio: "ignore",
    env: { ...process.env, DATABASE_URL: databaseUrl, HOSTNAME: "127.0.0.1", PORT: String(APP_PORT), NEXT_TELEMETRY_DISABLED: "1" }
  });
  try {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      try {
        const response = await fetch(`http://127.0.0.1:${APP_PORT}/api/health`);
        const body = await response.json() as { status?: string; appVersion?: string; schemaVersion?: number };
        if (response.ok && body.status === "ok" && body.appVersion === APP_VERSION && body.schemaVersion === SCHEMA_VERSION) return;
      } catch { /* server is still starting */ }
    }
    throw new Error("Health-check timed out");
  } finally { server.kill(); }
}

async function seedAndVerify(database: string): Promise<void> {
  const env = { ...process.env, DATABASE_URL: databaseUrlFromPath(database), NEXT_TELEMETRY_DISABLED: "1" };
  if (!fs.existsSync(database)) fs.closeSync(fs.openSync(database, "a"));
  run(node, [prismaCli, "migrate", "deploy"], env);
  const client = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  try {
    await applySeed(client);
    await applySeed(client);
    const [prompts, quotes, integrity, foreignKeys] = await Promise.all([
      client.reflectionPrompt.count(), client.quote.count(),
      client.$queryRawUnsafe<Array<{ integrity_check: string }>>("PRAGMA integrity_check"),
      client.$queryRawUnsafe<unknown[]>("PRAGMA foreign_key_check")
    ]);
    if (prompts !== 13 || quotes !== 60 || integrity[0]?.integrity_check !== "ok" || foreignKeys.length) throw new Error("Database verification failed");
  } finally { await client.$disconnect(); }
}

async function assertNoDowngrade(database: string): Promise<void> {
  if (!fs.existsSync(database) || fs.statSync(database).size === 0) return;
  const client = new PrismaClient({ datasources: { db: { url: databaseUrlFromPath(database) } } });
  try {
    const metadata = await client.appMetadata.findUnique({ where: { id: "singleton" } });
    if (metadata && (compareSemver(APP_VERSION, metadata.appVersion) < 0 || SCHEMA_VERSION < metadata.schemaVersion || SEED_VERSION < metadata.seedVersion)) {
      throw new Error("Downgrade is forbidden");
    }
  } catch (error) {
    if (error instanceof Error && error.message === "Downgrade is forbidden") throw error;
  } finally { await client.$disconnect(); }
}

async function main(): Promise<void> {
  if (!(await isPortFree())) throw new Error("Приложение запущено. Завершите его через значок в трее и повторите setup.bat.");
  for (const directory of [paths.data, paths.logs, paths.config]) fs.mkdirSync(directory, { recursive: true });
  await assertNoDowngrade(paths.database);

  const validationDatabase = path.join(paths.config, `validation-${randomUUID()}.db`);
  try {
    run(node, [path.join(root, "scripts", "build.mjs")], { ...process.env, DATABASE_URL: databaseUrlFromPath(validationDatabase), NEXT_TELEMETRY_DISABLED: "1" });
    await seedAndVerify(validationDatabase);
    await verifyHealth(databaseUrlFromPath(validationDatabase));
    await seedAndVerify(paths.database);

    const client = new PrismaClient({ datasources: { db: { url: databaseUrlFromPath(paths.database) } } });
    try {
      await client.appMetadata.upsert({
        where: { id: "singleton" },
        create: { id: "singleton", appVersion: APP_VERSION, schemaVersion: SCHEMA_VERSION, seedVersion: SEED_VERSION, maxObservedBusinessDate: localDate() },
        update: { appVersion: APP_VERSION, schemaVersion: SCHEMA_VERSION, seedVersion: SEED_VERSION }
      });
    } finally { await client.$disconnect(); }

    const manifest = { appVersion: packageJson.version, schemaVersion: SCHEMA_VERSION, seedVersion: SEED_VERSION, builtAt: new Date().toISOString() };
    const temporaryManifest = path.join(root, `build-manifest.${process.pid}.tmp`);
    fs.writeFileSync(temporaryManifest, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    fs.renameSync(temporaryManifest, path.join(root, "build-manifest.json"));
    console.log("Настройка завершена. Для обычного запуска используйте start.bat.");
  } finally {
    for (const suffix of ["", "-wal", "-shm", "-journal"]) {
      const target = `${validationDatabase}${suffix}`; if (fs.existsSync(target)) fs.rmSync(target);
    }
  }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Настройка не завершена"); process.exitCode = 1; });
