import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applySeed } from "@/lib/seed";
import {
  changeHabitLifecycle, createSimpleHabit, deleteHabit, getHabit, listHabits, removeSimpleHabitCheck,
  setSimpleHabitCheck, setWeeklyHabitFocus, updateHabit
} from "@/lib/habit-service";

const databasePath = path.resolve("tmp/habits-step3-integration.db");
const databaseUrl = `file:${databasePath.replaceAll("\\", "/")}`;
process.env.DATABASE_URL = databaseUrl;
const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const saturday = { systemDate: "2026-08-15", businessDate: "2026-08-15", clockWarning: false };

beforeAll(async () => {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) fs.rmSync(`${databasePath}${suffix}`, { force: true });
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  fs.closeSync(fs.openSync(databasePath, "a"));
  const migrated = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl }, encoding: "utf8", windowsHide: true });
  if (migrated.status !== 0) throw new Error(migrated.stderr || migrated.stdout);
  await applySeed(client);
}, 60_000);

afterAll(async () => { await client.$disconnect(); });

describe.sequential("habit step 3 transactions", () => {
  it("creates a draft, completes its setup and rejects duplicate and reserved names", async () => {
    const draft = await createSimpleHabit(client, saturday, { name: "  Вечернее чтение  ", weekdays: [] });
    expect(draft).toMatchObject({ name: "Вечернее чтение", status: "DRAFT", currentRevision: null });
    const active = await updateHabit(client, draft.id, saturday, { version: draft.version, weekdays: [6] });
    expect(active).toMatchObject({ status: "ACTIVE", currentRevision: { scheduleMask: 32, goalValue: 1 } });
    await expect(createSimpleHabit(client, saturday, { name: "вечернее ЧТЕНИЕ", weekdays: [6] })).rejects.toMatchObject({ code: "DUPLICATE_HABIT_NAME" });
    await expect(createSimpleHabit(client, saturday, { name: "Планка", weekdays: [6] })).rejects.toMatchObject({ code: "RESERVED_HABIT_NAME" });
  });

  it("checks and unchecks a scheduled day idempotently", async () => {
    const habit = (await listHabits(client, saturday)).find((item) => item.name === "Вечернее чтение")!;
    await setSimpleHabitCheck(client, habit.id, saturday, false);
    await setSimpleHabitCheck(client, habit.id, saturday, false);
    expect(await client.simpleHabitLog.count({ where: { habitId: habit.id } })).toBe(1);
    expect((await getHabit(client, habit.id, saturday)).stats).toMatchObject({ percentage: 100, currentStreak: 1, regularCompletions: 1 });
    await removeSimpleHabitCheck(client, habit.id, saturday);
    expect((await getHabit(client, habit.id, saturday)).stats.percentage).toBeNull();
  });

  it("allows only an explicit extra completion on a rest day", async () => {
    const habit = await createSimpleHabit(client, saturday, { name: "По будням", weekdays: [1] });
    await expect(setSimpleHabitCheck(client, habit.id, saturday, false)).rejects.toMatchObject({ code: "HABIT_NOT_SCHEDULED" });
    const extra = await setSimpleHabitCheck(client, habit.id, saturday, true);
    expect(extra).toMatchObject({ today: { checked: true, isExtra: true }, stats: { percentage: null, extraCompletions: 1, currentStreak: 0 } });
  });

  it("creates a new revision today without changing historical settings", async () => {
    const original = await createSimpleHabit(client, saturday, { name: "Ревизии", weekdays: [6] });
    const sunday = { systemDate: "2026-08-16", businessDate: "2026-08-16", clockWarning: false };
    const changed = await updateHabit(client, original.id, sunday, { version: original.version, weekdays: [7] });
    const revisions = await client.habitRevision.findMany({ where: { habitId: original.id }, orderBy: { effectiveFromDate: "asc" } });
    expect(revisions).toMatchObject([{ effectiveFromDate: "2026-08-15", effectiveToDate: "2026-08-15", scheduleMask: 32 }, { effectiveFromDate: "2026-08-16", effectiveToDate: null, scheduleMask: 64 }]);
    expect(changed.today.scheduled).toBe(true);
  });

  it("turns an active habit into a real draft when its schedule is cleared", async () => {
    const original = await createSimpleHabit(client, saturday, { name: "Очистить расписание", weekdays: [6] });
    const draft = await updateHabit(client, original.id, saturday, { version: original.version, weekdays: [] });
    expect(draft).toMatchObject({ status: "DRAFT", today: { scheduled: false }, currentRevision: null });
    expect(await client.habitRevision.count({ where: { habitId: original.id } })).toBe(0);
  });

  it("pauses, resumes on the same day, archives and restores without losing history", async () => {
    const habit = await createSimpleHabit(client, saturday, { name: "Жизненный цикл", weekdays: [6] });
    await setSimpleHabitCheck(client, habit.id, saturday, false);
    const paused = await changeHabitLifecycle(client, habit.id, "pause", saturday, habit.version);
    expect(paused.status).toBe("PAUSED");
    await expect(changeHabitLifecycle(client, habit.id, "resume", saturday, habit.version)).rejects.toMatchObject({ code: "STALE_VERSION" });
    const resumed = await changeHabitLifecycle(client, habit.id, "resume", saturday, paused.version);
    expect(resumed.status).toBe("ACTIVE");
    expect(await client.habitExclusionInterval.count({ where: { habitId: habit.id, kind: "PAUSE" } })).toBe(0);
    const archived = await changeHabitLifecycle(client, habit.id, "archive", saturday, resumed.version);
    expect(archived.status).toBe("ARCHIVED");
    expect((await changeHabitLifecycle(client, habit.id, "restore", saturday, archived.version)).status).toBe("ACTIVE");
    expect(await client.simpleHabitLog.count({ where: { habitId: habit.id } })).toBe(1);
  });

  it("deletes only a habit without history", async () => {
    const empty = await createSimpleHabit(client, saturday, { name: "Удаляемая", weekdays: [] });
    await deleteHabit(client, empty.id);
    expect(await client.habit.findUnique({ where: { id: empty.id } })).toBeNull();
    const withHistory = (await listHabits(client, saturday)).find((habit) => habit.name === "Жизненный цикл")!;
    await expect(deleteHabit(client, withHistory.id)).rejects.toMatchObject({ code: "HABIT_HAS_HISTORY" });
  });

  it("stores any active habits as a visual weekly focus", async () => {
    const active = (await listHabits(client, saturday)).filter((habit) => habit.status === "ACTIVE").slice(0, 2);
    const focus = await setWeeklyHabitFocus(client, "2026-08-10", active.map((habit) => habit.id), saturday);
    expect(focus.map((item) => item.habitId).sort()).toEqual(active.map((habit) => habit.id).sort());
    expect(await setWeeklyHabitFocus(client, "2026-08-10", [], saturday)).toEqual([]);
  });

  it("returns at least 200 active simple habits without changing their data", async () => {
    const items = Array.from({ length: 200 }, (_, index) => ({ id: `load-habit-${index}`, type: "SIMPLE", name: `Тестовая привычка ${index}`, normalizedName: `тестовая привычка ${index}`, status: "ACTIVE", startDate: saturday.businessDate }));
    await client.habit.createMany({ data: items });
    await client.habitRevision.createMany({ data: items.map((habit) => ({ habitId: habit.id, effectiveFromDate: saturday.businessDate, scheduleMask: 32, goalValue: 1, unit: "CHECK" })) });
    const listed = await listHabits(client, saturday);
    expect(listed.filter((habit) => habit.id.startsWith("load-habit-")).length).toBe(200);
    expect(listed.find((habit) => habit.id === "load-habit-199")).toMatchObject({ name: "Тестовая привычка 199", today: { scheduled: true } });
  });
});
