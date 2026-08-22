import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applySeed } from "@/lib/seed";
import { calculatePlankStats, createPlankHabit, createPlankSession, deletePlankSession, getHabit, getPlankSoundSetting, setPlankSoundSetting, updateHabit, updatePlankSession } from "@/lib/habit-service";

const databasePath = path.resolve("tmp/plank-step4-integration.db");
const databaseUrl = `file:${databasePath.replaceAll("\\", "/")}`;
process.env.DATABASE_URL = databaseUrl;
const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const friday = { systemDate: "2026-08-21", businessDate: "2026-08-21", clockWarning: false };

beforeAll(async () => {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) fs.rmSync(`${databasePath}${suffix}`, { force: true });
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  fs.closeSync(fs.openSync(databasePath, "a"));
  const migrated = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl }, encoding: "utf8", windowsHide: true });
  if (migrated.status !== 0) throw new Error(migrated.stderr || migrated.stdout);
  await applySeed(client);
}, 60_000);

afterAll(async () => { await client.$disconnect(); });

describe.sequential("plank step 4 transactions", () => {
  let habitId = "";
  let sessionId = "";

  it("creates the single built-in plank with a valid goal and schedule", async () => {
    const habit = await createPlankHabit(client, friday, { goalValue: 60, weekdays: [5] });
    habitId = habit.id;
    expect(habit).toMatchObject({ type: "PLANK", name: "Планка", status: "ACTIVE", currentRevision: { goalValue: 60, scheduleMask: 16, unit: "SECOND" } });
    await expect(createPlankHabit(client, friday, { goalValue: 60, weekdays: [5] })).rejects.toMatchObject({ code: "PLANK_ALREADY_EXISTS" });
    await expect(createPlankHabit(client, friday, { goalValue: 601, weekdays: [5] })).rejects.toMatchObject({ code: "INVALID_PLANK_GOAL" });
  });

  it("saves only a completed 1-599 second session and calculates daily sums", async () => {
    const saved = await createPlankSession(client, habitId, friday, { startedAt: "2026-08-21T06:00:00.000Z", stoppedAt: "2026-08-21T06:00:40.900Z", durationSeconds: 40 });
    sessionId = saved.session.id;
    expect(saved.habit.stats).toMatchObject({ todayTotal: 40, todayBest: 40, weekTotal: 40, allTimeTotal: 40, percentage: null });
    await createPlankSession(client, habitId, friday, { startedAt: "2026-08-21T06:05:00.000Z", stoppedAt: "2026-08-21T06:05:25.000Z", durationSeconds: 25 });
    expect((await getHabit(client, habitId, friday)).stats).toMatchObject({ todayTotal: 65, todayBest: 40, percentage: 100, currentStreak: 1 });
    await expect(createPlankSession(client, habitId, friday, { startedAt: "2026-08-21T06:10:00.000Z", stoppedAt: "2026-08-21T06:20:00.000Z", durationSeconds: 600 })).rejects.toMatchObject({ code: "INVALID_PLANK_DURATION" });
  });

  it("edits and deletes only today's sessions and preserves them across a new client", async () => {
    const session = await client.plankSession.findUniqueOrThrow({ where: { id: sessionId } });
    const edited = await updatePlankSession(client, sessionId, friday, { durationSeconds: 35, version: session.version });
    expect(edited.stats).toMatchObject({ todayTotal: 60 });
    const reopened = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    try { expect((await getHabit(reopened, habitId, friday)).stats).toMatchObject({ todaySessions: expect.arrayContaining([expect.objectContaining({ id: sessionId })]) }); } finally { await reopened.$disconnect(); }
    const saturday = { systemDate: "2026-08-22", businessDate: "2026-08-22", clockWarning: false };
    await expect(updatePlankSession(client, sessionId, saturday, { durationSeconds: 30, version: session.version + 1 })).rejects.toMatchObject({ code: "DATE_LOCKED" });
    await expect(deletePlankSession(client, sessionId, saturday)).rejects.toMatchObject({ code: "DATE_LOCKED" });
    await deletePlankSession(client, sessionId, friday);
    expect((await getHabit(client, habitId, friday)).stats).toMatchObject({ todayTotal: 25 });
  });

  it("creates a historical revision when the goal changes today", async () => {
    const saturday = { systemDate: "2026-08-22", businessDate: "2026-08-22", clockWarning: false };
    const current = await getHabit(client, habitId, saturday);
    await updateHabit(client, habitId, saturday, { version: current.version, goalValue: 90, weekdays: [6] });
    const revisions = await client.habitRevision.findMany({ where: { habitId }, orderBy: { effectiveFromDate: "asc" } });
    expect(revisions).toMatchObject([{ effectiveFromDate: "2026-08-21", effectiveToDate: "2026-08-21", goalValue: 60 }, { effectiveFromDate: "2026-08-22", effectiveToDate: null, goalValue: 90 }]);
  });

  it("calculates extra, week, all-time, goal calendar and historical goals", async () => {
    const raw = await client.habit.findUniqueOrThrow({ where: { id: habitId }, include: { revisions: true, exclusions: true, simpleLogs: true, plankSessions: true, pushupSets: true, waterEntries: true } });
    const stats = calculatePlankStats(raw, "2026-08-22");
    expect(stats.calendar.find((day) => day.date === "2026-08-21")).toMatchObject({ goalValue: 60, totalSeconds: 25, state: "MISSED" });
    expect(stats.calendar.find((day) => day.date === "2026-08-22")).toMatchObject({ goalValue: 90, state: "IN_PROGRESS" });
    expect(stats.allTimeTotal).toBe(25);
  });

  it("stores the sound preference with optimistic version protection", async () => {
    const original = await getPlankSoundSetting(client);
    const muted = await setPlankSoundSetting(client, false, original.version);
    expect(muted.enabled).toBe(false);
    await expect(setPlankSoundSetting(client, true, original.version)).rejects.toMatchObject({ code: "STALE_VERSION" });
  });
});
