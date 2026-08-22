import { PrismaClient } from "@prisma/client";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { applySeed } from "../src/lib/seed";
import { taskCategories } from "../src/lib/task-categories";

async function main(): Promise<void> {
  const root = process.cwd();
  const directory = path.join(root, "tmp");
  fs.mkdirSync(directory, { recursive: true });
  const database = path.join(directory, `database-lifecycle-${randomUUID()}.db`);
  fs.closeSync(fs.openSync(database, "a"));
  const databaseUrl = `file:${database.replaceAll("\\", "/")}`;
  const env = { ...process.env, DATABASE_URL: databaseUrl, NEXT_TELEMETRY_DISABLED: "1" };
  const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");
  const deploy = () => spawnSync(process.execPath, [prismaCli, "migrate", "deploy"], { cwd: root, env, encoding: "utf8", windowsHide: true });
  try {
    const first = deploy();
    if (first.status !== 0) throw new Error(first.stderr || first.stdout);
    const second = deploy();
    if (second.status !== 0 || !second.stdout.includes("No pending migrations")) throw new Error("Repeated migration was not idempotent");

    const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    try {
      await applySeed(client); await applySeed(client);
      const [prompts, quotes, foreignKeys, integrity] = await Promise.all([
        client.reflectionPrompt.count(), client.quote.count(),
        client.$queryRawUnsafe<unknown[]>("PRAGMA foreign_key_check"),
        client.$queryRawUnsafe<Array<{ integrity_check: string }>>("PRAGMA integrity_check")
      ]);
      if (prompts !== 13 || quotes !== 60 || foreignKeys.length || integrity[0]?.integrity_check !== "ok") throw new Error("Database invariant failed");
      if (taskCategories.length !== 5 || new Set(taskCategories.map((item) => item.value)).size !== 5) throw new Error("Task categories invariant failed");

      const firstTask = await client.task.create({ data: { localDate: "2026-08-15", title: "Первая", category: "WORK", priorityRank: 1, sortOrder: 0 } });
      await expectDatabaseError(() => client.task.create({ data: { localDate: "2026-08-15", title: "Вторая", category: "WORK", priorityRank: 1, sortOrder: 1 } }));
      await expectDatabaseError(() => client.task.create({ data: { localDate: "2026-08-15", title: "Ошибка", category: "UNKNOWN", sortOrder: 2 } }));
      await expectDatabaseError(() => client.task.update({ where: { id: firstTask.id }, data: { priorityRank: 9 } }));
      const habit = await client.habit.create({ data: { type: "SIMPLE", name: "Тест", normalizedName: "тест", status: "ACTIVE", startDate: "2026-08-15" } });
      await client.habitRevision.create({ data: { habitId: habit.id, effectiveFromDate: "2026-08-15", effectiveToDate: "2026-08-20", scheduleMask: 127, goalValue: 1, unit: "CHECK" } });
      await expectDatabaseError(() => client.habitRevision.create({ data: { habitId: habit.id, effectiveFromDate: "2026-08-20", scheduleMask: 1, goalValue: 1, unit: "CHECK" } }));
    } finally { await client.$disconnect(); }
    console.log("Fresh migration, repeated migration, repeated seed, 5 categories, constraints, foreign keys and integrity verified.");
  } finally {
    for (const suffix of ["", "-wal", "-shm", "-journal"]) { const target = `${database}${suffix}`; if (fs.existsSync(target)) fs.rmSync(target); }
  }
}

async function expectDatabaseError(operation: () => Promise<unknown>): Promise<void> {
  try { await operation(); }
  catch { return; }
  throw new Error("Expected SQLite constraint error");
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
