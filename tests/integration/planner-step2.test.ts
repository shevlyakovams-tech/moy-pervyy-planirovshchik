import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addLocalDays, startOfLocalWeek } from "@/lib/date-service";
import { applySeed } from "@/lib/seed";
import {
  changeTaskStatus, completeMorning, createTask, deleteTask, getBusinessContext, getDay, getWeek, hideQuote,
  patchDay, patchWeek, reorderTasks, replaceTodayQuote, resolveWeek, saveReflection, saveWeekStep,
  setActionCompleted, setWeekStepCompleted, transferTask, transferWeek, updateTask
} from "@/lib/planner-service";

const databasePath = path.resolve("tmp/planner-step2-integration.db");
const databaseUrl = `file:${databasePath.replaceAll("\\", "/")}`;
process.env.DATABASE_URL = databaseUrl;
const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const today = "2026-08-15";
const context = { systemDate: today, businessDate: today, clockWarning: false };

beforeAll(async () => {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) fs.rmSync(`${databasePath}${suffix}`, { force: true });
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  fs.closeSync(fs.openSync(databasePath, "a"));
  const migrated = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
    cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl }, encoding: "utf8", windowsHide: true
  });
  if (migrated.status !== 0) throw new Error(migrated.stderr || migrated.stdout);
  await applySeed(client);
});

afterAll(async () => { await client.$disconnect(); });

describe.sequential("planner step 2 transactions", () => {
  it("observes a monotonic business date", async () => {
    const first = await getBusinessContext(client, new Date(2026, 7, 15, 8));
    const backwards = await getBusinessContext(client, new Date(2026, 7, 14, 8));
    expect(first.businessDate).toBe(today);
    expect(backwards).toMatchObject({ businessDate: today, clockWarning: true });
  });

  it("opens today once, assigns prompt/quote and stores searchable journal data transactionally", async () => {
    const opened = await getDay(client, today, context, () => 0);
    expect(opened.entry?.quoteId).toBeTruthy();
    expect(opened.entry?.rotatingPromptId).toBeTruthy();
    const reopened = await getDay(client, today, context, () => 1);
    expect(reopened.entry?.quoteId).toBe(opened.entry?.quoteId);
    expect(await client.quoteDisplay.count({ where: { localDate: today } })).toBe(1);
    const updated = await patchDay(client, today, context, { version: opened.entry!.version, gratitude: "  Спасибо себе  ", mainResult: "Финиш" });
    expect(updated.gratitude).toBe("Спасибо себе");
    const search = await client.searchDocument.findUnique({ where: { sourceType_sourceId: { sourceType: "GRATITUDE", sourceId: opened.entry!.id } } });
    expect(search?.normalizedText).toBe("спасибо себе");
    const prompt = opened.fixedPrompts[0]!;
    const answer = await saveReflection(client, today, prompt.id, context, { answer: "Мой ответ" });
    expect(await client.searchDocument.findUnique({ where: { sourceType_sourceId: { sourceType: "REFLECTION", sourceId: answer!.id } } })).not.toBeNull();
  });

  it("enforces priority uniqueness, morning completion and task status rules", async () => {
    const first = await createTask(client, context, { localDate: today, title: "Первая", category: "WORK" });
    const second = await createTask(client, context, { localDate: today, title: "Вторая", category: "FAMILY" });
    const rankedFirst = await updateTask(client, first.id, context, { version: first.version, priorityRank: 1 });
    const rankedSecond = await updateTask(client, second.id, context, { version: second.version, priorityRank: 1 });
    expect(rankedSecond.priorityRank).toBe(1);
    expect((await client.task.findUniqueOrThrow({ where: { id: rankedFirst.id } })).priorityRank).toBeNull();
    const morning = await completeMorning(client, today, context);
    expect(morning.morningCompletedAt).not.toBeNull();
    await expect(updateTask(client, second.id, context, { version: rankedSecond.version, priorityRank: null })).rejects.toMatchObject({ code: "LAST_PRIORITY_REQUIRED" });
    const completed = await changeTaskStatus(client, second.id, "complete", context);
    expect(completed.status).toBe("COMPLETED");
    expect((await changeTaskStatus(client, second.id, "reopen", context)).status).toBe("PLANNED");
  });

  it("transfers a task atomically and makes repeated transfer idempotent", async () => {
    const task = await createTask(client, context, { localDate: today, title: "Перенести", category: "LEARNING" });
    await updateTask(client, task.id, context, { version: task.version, priorityRank: 2 });
    const target = addLocalDays(today, 2);
    const child = await transferTask(client, task.id, target, context);
    const repeated = await transferTask(client, task.id, target, context);
    expect(repeated.id).toBe(child.id);
    expect(await client.task.count({ where: { sourceTaskId: task.id } })).toBe(1);
    expect(await client.task.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({ status: "TRANSFERRED", priorityRank: 2 });
  });

  it("rejects normal writes to the past and limits future fields", async () => {
    const past = addLocalDays(today, -2);
    await expect(createTask(client, context, { localDate: past, title: "Назад", category: "WORK" })).rejects.toMatchObject({ code: "DATE_LOCKED" });
    await expect(patchDay(client, past, context, { version: 1, gratitude: "Нельзя" })).rejects.toMatchObject({ code: "DATE_LOCKED" });
    const future = await createTask(client, context, { localDate: addLocalDays(today, 3), title: "Будущее", category: "HOBBY" });
    await expect(updateTask(client, future.id, context, { version: future.version, priorityRank: 1 })).rejects.toMatchObject({ code: "DATE_LOCKED" });
  });

  it("validates text limits, enums, required values and personal action state", async () => {
    await expect(createTask(client, context, { localDate: today, title: " ", category: "WORK" })).rejects.toMatchObject({ code: "INVALID_TITLE" });
    await expect(createTask(client, context, { localDate: today, title: "x".repeat(241), category: "WORK" })).rejects.toMatchObject({ code: "INVALID_TITLE" });
    await expect(createTask(client, context, { localDate: today, title: "Задача", category: "OTHER" })).rejects.toMatchObject({ code: "INVALID_CATEGORY" });
    const opened = await getDay(client, today, context);
    await expect(patchDay(client, today, context, { version: opened.entry!.version, gratitude: "x".repeat(2001) })).rejects.toMatchObject({ code: "TEXT_TOO_LONG" });
    await expect(patchDay(client, today, context, { version: opened.entry!.version, mood: "UNKNOWN" })).rejects.toMatchObject({ code: "INVALID_MOOD" });
    await expect(saveReflection(client, today, opened.fixedPrompts[0]!.id, context, { answer: "x".repeat(2001) })).rejects.toMatchObject({ code: "TEXT_TOO_LONG" });
    await expect(setActionCompleted(client, today, "self", context, true)).rejects.toMatchObject({ code: "ACTION_EMPTY" });
    const withAction = await patchDay(client, today, context, { version: opened.entry!.version, selfAction: "Погулять" });
    expect((await setActionCompleted(client, today, "self", context, true)).selfActionCompletedAt).not.toBeNull();
    const completedEntry = await client.dailyEntry.findUniqueOrThrow({ where: { localDate: today } });
    const cleared = await patchDay(client, today, context, { version: completedEntry.version, selfAction: "" });
    expect(cleared).toMatchObject({ selfAction: null, selfActionCompletedAt: null });
    expect(withAction.selfAction).toBe("Погулять");
  });

  it("handles yesterday, older tasks, ordering and a transfer chain", async () => {
    const yesterday = addLocalDays(today, -1);
    const older = addLocalDays(today, -2);
    const yesterdayTask = await client.task.create({ data: { localDate: yesterday, title: "Вчера", category: "WORK", sortOrder: 0 } });
    const oldTask = await client.task.create({ data: { localDate: older, title: "Давно", category: "WORK", sortOrder: 0 } });
    expect((await getDay(client, today, context)).unresolved.map((task) => task.id)).toEqual(expect.arrayContaining([yesterdayTask.id, oldTask.id]));
    expect((await changeTaskStatus(client, yesterdayTask.id, "complete-yesterday", context)).resolvedByNextMorning).toBe(true);
    await expect(changeTaskStatus(client, oldTask.id, "complete-yesterday", context)).rejects.toMatchObject({ code: "DATE_LOCKED" });
    await expect(deleteTask(client, oldTask.id, context)).rejects.toMatchObject({ code: "DATE_LOCKED" });
    expect((await changeTaskStatus(client, oldTask.id, "let-go", context)).status).toBe("LET_GO");

    const ordinary = (await client.task.findMany({ where: { localDate: today, status: "PLANNED", priorityRank: null }, orderBy: { sortOrder: "asc" } })).map((task) => task.id);
    await reorderTasks(client, today, [...ordinary].reverse(), context);
    expect((await client.task.findMany({ where: { id: { in: ordinary } }, orderBy: { sortOrder: "asc" }, select: { id: true } })).map((task) => task.id)).toEqual([...ordinary].reverse());

    const root = await createTask(client, context, { localDate: today, title: "Цепочка", category: "HOBBY" });
    const dayTwo = addLocalDays(today, 3);
    const firstChild = await transferTask(client, root.id, dayTwo, context);
    const laterContext = { systemDate: dayTwo, businessDate: dayTwo, clockWarning: false };
    const secondChild = await transferTask(client, firstChild.id, addLocalDays(dayTwo, 1), laterContext);
    expect(secondChild).toMatchObject({ sourceTaskId: firstChild.id, chainRootTaskId: root.id, priorityRank: null });
    const arrived = await createTask(client, context, { localDate: dayTwo, title: "Наступившая дата", category: "LEARNING" });
    expect((await updateTask(client, arrived.id, laterContext, { version: arrived.version, priorityRank: 1 })).priorityRank).toBe(1);
  });

  it("stores current/future week rules and transfers an unresolved past goal without overwriting", async () => {
    const currentWeek = startOfLocalWeek(today);
    const current = await patchWeek(client, currentWeek, context, { goal: "Текущая цель" });
    const step = await saveWeekStep(client, currentWeek, 1, context, { version: 1, text: "Первый шаг", assignedDate: today });
    expect(step.text).toBe("Первый шаг");
    expect((await setWeekStepCompleted(client, currentWeek, 1, context, true)).completedAt).not.toBeNull();
    expect((await getWeek(client, currentWeek, context)).plan?.goal).toBe("Текущая цель");
    const futureWeek = addLocalDays(currentWeek, 14);
    await patchWeek(client, futureWeek, context, { goal: "Будущая цель" });
    await expect(patchWeek(client, futureWeek, context, { version: 1, whyImportant: "Рано" })).rejects.toMatchObject({ code: "DATE_LOCKED" });
    await expect(saveWeekStep(client, futureWeek, 1, context, { version: 1, text: "За пределами", assignedDate: currentWeek })).rejects.toMatchObject({ code: "DATE_OUTSIDE_WEEK" });
    const pastWeek = addLocalDays(currentWeek, -7);
    await client.weeklyPlan.create({ data: { weekStart: pastWeek, goal: "Старая цель", steps: { create: [
      { orderIndex: 1, text: "Незавершённый шаг" },
      { orderIndex: 2, text: "Готовый шаг", completedAt: new Date() },
      { orderIndex: 3 }
    ] } } });
    await expect(transferWeek(client, pastWeek, context, { targetWeekStart: currentWeek, goal: "Не перезаписывать" })).rejects.toMatchObject({ code: "TARGET_WEEK_HAS_GOAL" });
    const emptyTarget = addLocalDays(currentWeek, 21);
    const transferred = await transferWeek(client, pastWeek, context, { targetWeekStart: emptyTarget, goal: "Новая формулировка", steps: [{ orderIndex: 1, assignedDate: addLocalDays(emptyTarget, 2) }] });
    expect(transferred.sourceWeeklyPlanId).toBeTruthy();
    expect(await client.weeklyStep.findMany({ where: { weeklyPlanId: transferred.id, text: { not: null } } })).toEqual([expect.objectContaining({ orderIndex: 1, text: "Незавершённый шаг", assignedDate: addLocalDays(emptyTarget, 2) })]);
    await expect(transferWeek(client, addLocalDays(currentWeek, -14), context, { targetWeekStart: addLocalDays(currentWeek, 28), goal: "Нет источника", steps: [{ orderIndex: 1 }] })).rejects.toMatchObject({ code: "INVALID_WEEK_STATE" });
    expect(current.goal).toBe("Текущая цель");
    const resolvedWeek = addLocalDays(currentWeek, -21);
    await client.weeklyPlan.create({ data: { weekStart: resolvedWeek, goal: "Другая старая цель" } });
    expect((await resolveWeek(client, resolvedWeek, context, "ACHIEVED")).outcome).toBe("ACHIEVED");
    await expect(patchWeek(client, resolvedWeek, context, { version: 1, goal: "Переписать прошлое" })).rejects.toMatchObject({ code: "DATE_LOCKED" });
  });

  it("replaces, favorites, hides and clears the final active quote without looping", async () => {
    const before = await getDay(client, today, context);
    const firstQuote = before.entry!.quoteId!;
    await replaceTodayQuote(client, context);
    expect((await client.dailyEntry.findUniqueOrThrow({ where: { localDate: today } })).quoteId).not.toBe(firstQuote);
    const active = await client.quote.findMany({ where: { OR: [{ userState: null }, { userState: { hiddenAt: null } }] }, select: { id: true } });
    for (const quote of active) await hideQuote(client, quote.id, context);
    expect((await client.dailyEntry.findUniqueOrThrow({ where: { localDate: today } })).quoteId).toBeNull();
  });

  it("reads the same journal, task and week data through a new database connection", async () => {
    const reopened = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    try {
      const day = await getDay(reopened, today, context);
      expect(day.entry?.gratitude).toBe("Спасибо себе");
      expect(day.tasks.some((task) => task.title === "Первая")).toBe(true);
      expect((await getWeek(reopened, startOfLocalWeek(today), context)).plan?.goal).toBe("Текущая цель");
    } finally { await reopened.$disconnect(); }
  });
});
