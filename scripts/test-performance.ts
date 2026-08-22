import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { PrismaClient } from "@prisma/client";
import { addLocalDays } from "../src/lib/date-service";
import { getProgress, searchHistory } from "../src/lib/history-service";

const database = path.resolve("tmp/performance-step9.db");
const url = `file:${database.replaceAll("\\", "/")}`;
for (const suffix of ["", "-wal", "-shm", "-journal"]) fs.rmSync(`${database}${suffix}`, { force: true });
fs.mkdirSync(path.dirname(database), { recursive: true });
fs.closeSync(fs.openSync(database, "a"));
const migration = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
  cwd: process.cwd(), env: { ...process.env, DATABASE_URL: url }, encoding: "utf8", windowsHide: true
});
if (migration.status !== 0) throw new Error(migration.stderr || migration.stdout);

const client = new PrismaClient({ datasources: { db: { url } } });
const context = { systemDate: "2026-08-22", businessDate: "2026-08-22", clockWarning: false };
try {
  await client.$executeRawUnsafe(`
    WITH RECURSIVE hundreds(n) AS (SELECT 0 UNION ALL SELECT n + 1 FROM hundreds WHERE n < 99),
    tens(n) AS (SELECT 0 UNION ALL SELECT n + 1 FROM tens WHERE n < 9)
    INSERT INTO SearchDocument (id, sourceType, sourceId, localDate, taskCategory, originalText, normalizedText, updatedAt)
    SELECT
      printf('perf-%06d', a.n * 1000 + b.n * 10 + c.n),
      'TASK', printf('source-%06d', a.n * 1000 + b.n * 10 + c.n), '2026-08-21', 'WORK',
      CASE WHEN a.n * 1000 + b.n * 10 + c.n = 54321 THEN 'Уникальный маркер производительности' ELSE 'Обычная тестовая запись' END,
      CASE WHEN a.n * 1000 + b.n * 10 + c.n = 54321 THEN 'уникальный маркер производительности' ELSE 'обычная тестовая запись' END,
      CURRENT_TIMESTAMP
    FROM hundreds a CROSS JOIN hundreds b CROSS JOIN tens c
  `);
  if (await client.searchDocument.count() !== 100_000) throw new Error("Не создано 100000 поисковых документов");
  await searchHistory(client, context, { q: "уникальный маркер", period: "all", type: "all", category: "all" });
  const searchStarted = performance.now();
  const search = await searchHistory(client, context, { q: "уникальный маркер", period: "all", type: "all", category: "all" });
  const searchMilliseconds = performance.now() - searchStarted;
  if (search.results.length !== 1) throw new Error(`Поиск вернул ${search.results.length} результатов вместо одного`);
  if (searchMilliseconds > 500) throw new Error(`Поиск по 100000 строк занял ${searchMilliseconds.toFixed(1)} мс`);

  const startDate = addLocalDays(context.businessDate, -3649);
  const habit = await client.habit.create({ data: { type: "SIMPLE", name: "Нагрузочная привычка", normalizedName: "нагрузочная привычка", status: "ACTIVE", startDate } });
  await client.habitRevision.create({ data: { habitId: habit.id, effectiveFromDate: startDate, scheduleMask: 127, goalValue: 1, unit: "CHECK" } });
  const graphStarted = performance.now();
  const progress = await getProgress(client, context, "all");
  const graphMilliseconds = performance.now() - graphStarted;
  const points = progress.habits.find((item) => item.id === habit.id)?.calendar.length ?? 0;
  if (points !== 3650) throw new Error(`Расчёт вернул ${points} точек вместо 3650`);
  if (graphMilliseconds > 1000) throw new Error(`Расчёт 3650 точек занял ${graphMilliseconds.toFixed(1)} мс`);
  console.log(JSON.stringify({ searchDocuments: 100_000, searchMilliseconds: Number(searchMilliseconds.toFixed(1)), graphPoints: points, graphMilliseconds: Number(graphMilliseconds.toFixed(1)) }));
} finally {
  await client.$disconnect();
}
