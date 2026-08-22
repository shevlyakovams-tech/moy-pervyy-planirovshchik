import type { Habit, HabitExclusionInterval, HabitRevision, PlankSession, Prisma, PrismaClient, PushupSet, SimpleHabitLog, WaterEntry } from "@prisma/client";
import { ApiError } from "@/lib/api-response";
import { addLocalDays, localDate, parseLocalDate, startOfLocalWeek } from "@/lib/date-service";
import { normalizeSearch, normalizeSingleLine } from "@/lib/text-normalization";
import type { BusinessContext } from "@/lib/planner-service";

type DbClient = PrismaClient | Prisma.TransactionClient;
type HabitWithHistory = Habit & {
  revisions: HabitRevision[];
  exclusions: HabitExclusionInterval[];
  simpleLogs: SimpleHabitLog[];
  plankSessions: PlankSession[];
  pushupSets: PushupSet[];
  waterEntries: WaterEntry[];
};

const RESERVED_NAMES = new Set(["планка", "отжимания", "вода"]);
const STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"] as const;

function scheduleMask(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 127) return value;
  if (Array.isArray(value) && value.every((day) => Number.isInteger(day) && Number(day) >= 1 && Number(day) <= 7)) {
    return [...new Set(value.map(Number))].reduce((mask, day) => mask | (1 << (day - 1)), 0);
  }
  throw new ApiError(422, "INVALID_SCHEDULE", "Выберите дни недели");
}

function normalizeName(value: unknown) {
  const name = normalizeSingleLine(typeof value === "string" ? value : null);
  if (!name || name.length > 80) throw new ApiError(422, "INVALID_HABIT_NAME", "Введите название привычки от 1 до 80 символов");
  const normalizedName = normalizeSearch(name);
  if (RESERVED_NAMES.has(normalizedName)) throw new ApiError(409, "RESERVED_HABIT_NAME", "Это название зарезервировано для встроенной привычки");
  return { name, normalizedName };
}

function weekdayBit(localDate: string) {
  const parsed = parseLocalDate(localDate);
  if (!parsed) throw new ApiError(422, "INVALID_DATE", "Укажите корректную дату");
  const weekday = parsed.getDay() || 7;
  return 1 << (weekday - 1);
}

function revisionForDate(revisions: HabitRevision[], date: string) {
  const matches = revisions.filter((revision) => revision.effectiveFromDate <= date && (!revision.effectiveToDate || date <= revision.effectiveToDate));
  if (matches.length > 1) throw new ApiError(500, "OVERLAPPING_HABIT_REVISIONS", "Не удалось рассчитать историю привычки");
  return matches[0] ?? null;
}

function excludedOn(exclusions: HabitExclusionInterval[], date: string) {
  return exclusions.some((interval) => interval.startDate <= date && (!interval.endDate || date <= interval.endDate));
}

function isScheduled(habit: HabitWithHistory, date: string) {
  const revision = revisionForDate(habit.revisions, date);
  return Boolean(revision && date >= habit.startDate && !excludedOn(habit.exclusions, date) && (revision.scheduleMask & weekdayBit(date)) !== 0);
}

function enumerateDates(start: string, end: string) {
  const dates: string[] = [];
  for (let date = start; date <= end; date = addLocalDays(date, 1)) dates.push(date);
  return dates;
}

export function calculateSimpleHabitStats(habit: HabitWithHistory, businessDate: string) {
  const logByDate = new Map(habit.simpleLogs.map((log) => [log.localDate, log]));
  const calendar = enumerateDates(habit.startDate, businessDate).map((date) => {
    const log = logByDate.get(date);
    const revision = revisionForDate(habit.revisions, date);
    if (!revision) return { date, state: "NOT_STARTED" as const };
    if (excludedOn(habit.exclusions, date)) return { date, state: "EXCLUDED" as const };
    const scheduled = (revision.scheduleMask & weekdayBit(date)) !== 0;
    if (log?.isExtra) return { date, state: "EXTRA" as const };
    if (scheduled && log) return { date, state: "COMPLETED" as const };
    if (scheduled && date === businessDate) return { date, state: "IN_PROGRESS" as const };
    if (scheduled) return { date, state: "MISSED" as const };
    return { date, state: "REST" as const };
  });
  const elapsedScheduled = calendar.filter((day) => day.state === "COMPLETED" || day.state === "MISSED");
  const completed = elapsedScheduled.filter((day) => day.state === "COMPLETED").length;
  let bestStreak = 0;
  let running = 0;
  for (const day of elapsedScheduled) {
    running = day.state === "COMPLETED" ? running + 1 : 0;
    bestStreak = Math.max(bestStreak, running);
  }
  let currentStreak = 0;
  for (let index = elapsedScheduled.length - 1; index >= 0; index -= 1) {
    if (elapsedScheduled[index]?.state !== "COMPLETED") break;
    currentStreak += 1;
  }
  return {
    percentage: elapsedScheduled.length === 0 ? null : Math.round((completed / elapsedScheduled.length) * 1000) / 10,
    completedScheduledDays: completed,
    elapsedScheduledDays: elapsedScheduled.length,
    currentStreak,
    bestStreak,
    regularCompletions: habit.simpleLogs.filter((log) => !log.isExtra).length,
    extraCompletions: habit.simpleLogs.filter((log) => log.isExtra).length,
    calendar
  };
}

export function calculatePlankStats(habit: HabitWithHistory, businessDate: string) {
  const sessionsByDate = new Map<string, PlankSession[]>();
  for (const session of habit.plankSessions) sessionsByDate.set(session.localDate, [...(sessionsByDate.get(session.localDate) ?? []), session]);
  const calendar = enumerateDates(habit.startDate, businessDate).map((date) => {
    const revision = revisionForDate(habit.revisions, date);
    const sessions = sessionsByDate.get(date) ?? [];
    const totalSeconds = sessions.reduce((sum, session) => sum + session.durationSeconds, 0);
    const regularSeconds = sessions.filter((session) => !session.isExtra).reduce((sum, session) => sum + session.durationSeconds, 0);
    if (!revision) return { date, state: "NOT_STARTED" as const, totalSeconds, goalValue: null };
    if (excludedOn(habit.exclusions, date)) return { date, state: "EXCLUDED" as const, totalSeconds, goalValue: revision.goalValue };
    const scheduled = (revision.scheduleMask & weekdayBit(date)) !== 0;
    if (!scheduled && totalSeconds > 0) return { date, state: "EXTRA" as const, totalSeconds, goalValue: revision.goalValue };
    if (scheduled && regularSeconds >= revision.goalValue) return { date, state: "COMPLETED" as const, totalSeconds, goalValue: revision.goalValue };
    if (scheduled && date === businessDate) return { date, state: "IN_PROGRESS" as const, totalSeconds, goalValue: revision.goalValue };
    if (scheduled) return { date, state: "MISSED" as const, totalSeconds, goalValue: revision.goalValue };
    return { date, state: "REST" as const, totalSeconds, goalValue: revision.goalValue };
  });
  const elapsedScheduled = calendar.filter((day) => day.state === "COMPLETED" || day.state === "MISSED");
  const completed = elapsedScheduled.filter((day) => day.state === "COMPLETED").length;
  let bestStreak = 0;
  let running = 0;
  for (const day of elapsedScheduled) {
    running = day.state === "COMPLETED" ? running + 1 : 0;
    bestStreak = Math.max(bestStreak, running);
  }
  let currentStreak = 0;
  for (let index = elapsedScheduled.length - 1; index >= 0; index -= 1) {
    if (elapsedScheduled[index]?.state !== "COMPLETED") break;
    currentStreak += 1;
  }
  const todaySessions = [...(sessionsByDate.get(businessDate) ?? [])].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  const todayTotal = todaySessions.reduce((sum, session) => sum + session.durationSeconds, 0);
  const weekStart = startOfLocalWeek(businessDate);
  return {
    percentage: elapsedScheduled.length === 0 ? null : Math.round((completed / elapsedScheduled.length) * 1000) / 10,
    completedScheduledDays: completed,
    elapsedScheduledDays: elapsedScheduled.length,
    currentStreak,
    bestStreak,
    todaySessions,
    todayTotal,
    todayBest: todaySessions.length ? Math.max(...todaySessions.map((session) => session.durationSeconds)) : 0,
    weekTotal: habit.plankSessions.filter((session) => session.localDate >= weekStart && session.localDate <= businessDate).reduce((sum, session) => sum + session.durationSeconds, 0),
    allTimeTotal: habit.plankSessions.reduce((sum, session) => sum + session.durationSeconds, 0),
    calendar,
    dailyGraph: calendar.map((day) => ({ date: day.date, seconds: day.totalSeconds }))
  };
}

export function calculatePushupStats(habit: HabitWithHistory, businessDate: string) {
  const setsByDate = new Map<string, PushupSet[]>();
  for (const set of habit.pushupSets) setsByDate.set(set.localDate, [...(setsByDate.get(set.localDate) ?? []), set]);
  const calendar = enumerateDates(habit.startDate, businessDate).map((date) => {
    const revision = revisionForDate(habit.revisions, date);
    const sets = setsByDate.get(date) ?? [];
    const total = sets.reduce((sum, set) => sum + set.repetitions, 0);
    const regular = sets.filter((set) => !set.isExtra).reduce((sum, set) => sum + set.repetitions, 0);
    if (!revision) return { date, state: "NOT_STARTED" as const, total, goalValue: null };
    if (excludedOn(habit.exclusions, date)) return { date, state: "EXCLUDED" as const, total, goalValue: revision.goalValue };
    const scheduled = (revision.scheduleMask & weekdayBit(date)) !== 0;
    if (!scheduled && total > 0) return { date, state: "EXTRA" as const, total, goalValue: revision.goalValue };
    if (scheduled && regular >= revision.goalValue) return { date, state: "COMPLETED" as const, total, goalValue: revision.goalValue };
    if (scheduled && date === businessDate) return { date, state: "IN_PROGRESS" as const, total, goalValue: revision.goalValue };
    if (scheduled) return { date, state: "MISSED" as const, total, goalValue: revision.goalValue };
    return { date, state: "REST" as const, total, goalValue: revision.goalValue };
  });
  const elapsed = calendar.filter((day) => day.state === "COMPLETED" || day.state === "MISSED");
  let bestStreak = 0; let running = 0;
  for (const day of elapsed) { running = day.state === "COMPLETED" ? running + 1 : 0; bestStreak = Math.max(bestStreak, running); }
  let currentStreak = 0;
  for (let index = elapsed.length - 1; index >= 0 && elapsed[index]?.state === "COMPLETED"; index -= 1) currentStreak += 1;
  const todaySets = [...(setsByDate.get(businessDate) ?? [])].sort((a, b) => a.setOrder - b.setOrder);
  const weekStart = startOfLocalWeek(businessDate);
  return {
    percentage: elapsed.length ? Math.round((elapsed.filter((day) => day.state === "COMPLETED").length / elapsed.length) * 1000) / 10 : null,
    currentStreak, bestStreak, todaySets,
    todayTotal: todaySets.reduce((sum, set) => sum + set.repetitions, 0),
    todayBest: todaySets.length ? Math.max(...todaySets.map((set) => set.repetitions)) : 0,
    todaySetCount: todaySets.length,
    weekTotal: habit.pushupSets.filter((set) => set.localDate >= weekStart && set.localDate <= businessDate).reduce((sum, set) => sum + set.repetitions, 0),
    allTimeTotal: habit.pushupSets.reduce((sum, set) => sum + set.repetitions, 0),
    calendar, dailyGraph: calendar.map((day) => ({ date: day.date, repetitions: day.total }))
  };
}

export function calculateWaterStats(habit: HabitWithHistory, businessDate: string) {
  const entriesByDate = new Map<string, WaterEntry[]>();
  for (const entry of habit.waterEntries) entriesByDate.set(entry.localDate, [...(entriesByDate.get(entry.localDate) ?? []), entry]);
  const calendar = enumerateDates(habit.startDate, businessDate).map((date) => {
    const revision = revisionForDate(habit.revisions, date);
    const entries = entriesByDate.get(date) ?? [];
    const total = entries.reduce((sum, entry) => sum + entry.milliliters, 0);
    const regular = entries.filter((entry) => !entry.isExtra).reduce((sum, entry) => sum + entry.milliliters, 0);
    if (!revision) return { date, state: "NOT_STARTED" as const, total, goalValue: null };
    if (excludedOn(habit.exclusions, date)) return { date, state: "EXCLUDED" as const, total, goalValue: revision.goalValue };
    const scheduled = (revision.scheduleMask & weekdayBit(date)) !== 0;
    if (!scheduled && total > 0) return { date, state: "EXTRA" as const, total, goalValue: revision.goalValue };
    if (scheduled && regular >= revision.goalValue) return { date, state: "COMPLETED" as const, total, goalValue: revision.goalValue };
    if (scheduled && date === businessDate) return { date, state: "IN_PROGRESS" as const, total, goalValue: revision.goalValue };
    if (scheduled) return { date, state: "MISSED" as const, total, goalValue: revision.goalValue };
    return { date, state: "REST" as const, total, goalValue: revision.goalValue };
  });
  const elapsed = calendar.filter((day) => day.state === "COMPLETED" || day.state === "MISSED");
  const completed = elapsed.filter((day) => day.state === "COMPLETED").length;
  let bestStreak = 0;
  let running = 0;
  for (const day of elapsed) { running = day.state === "COMPLETED" ? running + 1 : 0; bestStreak = Math.max(bestStreak, running); }
  let currentStreak = 0;
  for (let index = elapsed.length - 1; index >= 0 && elapsed[index]?.state === "COMPLETED"; index -= 1) currentStreak += 1;
  const todayEntries = [...(entriesByDate.get(businessDate) ?? [])].sort((a, b) => a.entryOrder - b.entryOrder);
  const daysWithWater = calendar.filter((day) => day.total > 0);
  const allTimeTotal = habit.waterEntries.reduce((sum, entry) => sum + entry.milliliters, 0);
  return {
    percentage: elapsed.length ? Math.round((completed / elapsed.length) * 1000) / 10 : null,
    completedScheduledDays: completed,
    elapsedScheduledDays: elapsed.length,
    currentStreak,
    bestStreak,
    todayEntries,
    todayTotal: todayEntries.reduce((sum, entry) => sum + entry.milliliters, 0),
    allTimeTotal,
    averageOnRecordedDays: daysWithWater.length ? Math.round((allTimeTotal / daysWithWater.length) * 10) / 10 : null,
    calendar,
    dailyGraph: calendar.map((day) => ({ date: day.date, milliliters: day.total }))
  };
}

function presentHabit(habit: HabitWithHistory, context: BusinessContext) {
  const todayRevision = revisionForDate(habit.revisions, context.businessDate);
  const todayLog = habit.simpleLogs.find((log) => log.localDate === context.businessDate) ?? null;
  return {
    id: habit.id,
    type: habit.type,
    name: habit.name,
    status: habit.status,
    startDate: habit.startDate,
    version: habit.version,
    currentRevision: todayRevision ?? habit.revisions.at(-1) ?? null,
    today: {
      scheduled: isScheduled(habit, context.businessDate),
      checked: Boolean(todayLog),
      isExtra: todayLog?.isExtra ?? false,
      excluded: excludedOn(habit.exclusions, context.businessDate)
    },
    hasHistory: habit.simpleLogs.length > 0 || habit.plankSessions.length > 0 || habit.pushupSets.length > 0 || habit.waterEntries.length > 0,
    stats: habit.type === "PLANK" ? calculatePlankStats(habit, context.businessDate) : habit.type === "PUSHUPS" ? calculatePushupStats(habit, context.businessDate) : habit.type === "WATER" ? calculateWaterStats(habit, context.businessDate) : calculateSimpleHabitStats(habit, context.businessDate)
  };
}

const habitInclude = {
  revisions: { orderBy: { effectiveFromDate: "asc" as const } },
  exclusions: { orderBy: { startDate: "asc" as const } },
  simpleLogs: { orderBy: { localDate: "asc" as const } },
  plankSessions: { orderBy: [{ localDate: "asc" as const }, { createdAt: "asc" as const }] }
  ,pushupSets: { orderBy: [{ localDate: "asc" as const }, { setOrder: "asc" as const }] },
  waterEntries: { orderBy: [{ localDate: "asc" as const }, { entryOrder: "asc" as const }] }
};

export async function listHabits(client: PrismaClient, context: BusinessContext) {
  const habits = await client.habit.findMany({ where: { type: { in: ["SIMPLE", "PLANK", "PUSHUPS", "WATER"] } }, include: habitInclude, orderBy: [{ status: "asc" }, { createdAt: "asc" }] });
  return habits.map((habit) => presentHabit(habit, context));
}

export async function getHabit(client: DbClient, id: string, context: BusinessContext) {
  const habit = await client.habit.findUnique({ where: { id }, include: habitInclude });
  if (!habit || !["SIMPLE", "PLANK", "PUSHUPS", "WATER"].includes(habit.type)) throw new ApiError(404, "HABIT_NOT_FOUND", "Привычка не найдена");
  return presentHabit(habit, context);
}

async function assertUniqueName(client: DbClient, normalizedName: string, excludeId?: string) {
  const duplicate = await client.habit.findFirst({ where: { normalizedName, status: { not: "ARCHIVED" }, ...(excludeId ? { id: { not: excludeId } } : {}) } });
  if (duplicate) throw new ApiError(409, "DUPLICATE_HABIT_NAME", "Привычка с таким названием уже существует");
}

function startDateFrom(value: unknown, context: BusinessContext) {
  const startDate = typeof value === "string" && value ? value : context.businessDate;
  if (!parseLocalDate(startDate) || startDate < context.businessDate) throw new ApiError(422, "INVALID_START_DATE", "Дата начала должна быть сегодня или позже");
  return startDate;
}

export async function createSimpleHabit(client: PrismaClient, context: BusinessContext, body: Record<string, unknown>) {
  if (Object.keys(body).some((key) => !["name", "weekdays", "scheduleMask", "startDate"].includes(key))) throw new ApiError(422, "INVALID_FIELDS", "Проверьте параметры привычки");
  const { name, normalizedName } = normalizeName(body.name);
  const mask = body.weekdays === undefined && body.scheduleMask === undefined ? 0 : scheduleMask(body.weekdays ?? body.scheduleMask);
  const startDate = startDateFrom(body.startDate, context);
  return client.$transaction(async (tx) => {
    await assertUniqueName(tx, normalizedName);
    const habit = await tx.habit.create({ data: { type: "SIMPLE", name, normalizedName, startDate, status: mask ? "ACTIVE" : "DRAFT" } });
    if (mask) await tx.habitRevision.create({ data: { habitId: habit.id, effectiveFromDate: startDate, scheduleMask: mask, goalValue: 1, unit: "CHECK" } });
    return getHabit(tx, habit.id, context);
  });
}

export async function createPlankHabit(client: PrismaClient, context: BusinessContext, body: Record<string, unknown>) {
  if (Object.keys(body).some((key) => !["weekdays", "scheduleMask", "goalValue", "startDate"].includes(key))) throw new ApiError(422, "INVALID_FIELDS", "Проверьте параметры планки");
  const mask = scheduleMask(body.weekdays ?? body.scheduleMask);
  const goalValue = Number(body.goalValue);
  if (!Number.isInteger(goalValue) || goalValue < 1 || goalValue > 600) throw new ApiError(422, "INVALID_PLANK_GOAL", "Цель планки должна быть от 1 до 600 секунд");
  const startDate = startDateFrom(body.startDate, context);
  return client.$transaction(async (tx) => {
    if (await tx.habit.findUnique({ where: { builtInKey: "PLANK" } })) throw new ApiError(409, "PLANK_ALREADY_EXISTS", "Планка уже добавлена");
    const habit = await tx.habit.create({ data: { type: "PLANK", builtInKey: "PLANK", name: "Планка", normalizedName: "планка", startDate, status: mask ? "ACTIVE" : "DRAFT" } });
    if (mask) await tx.habitRevision.create({ data: { habitId: habit.id, effectiveFromDate: startDate, scheduleMask: mask, goalValue, unit: "SECOND" } });
    return getHabit(tx, habit.id, context);
  });
}

export async function createPushupHabit(client: PrismaClient, context: BusinessContext, body: Record<string, unknown>) {
  if (Object.keys(body).some((key) => !["weekdays", "scheduleMask", "goalValue", "startDate"].includes(key))) throw new ApiError(422, "INVALID_FIELDS", "Проверьте параметры отжиманий");
  const mask = scheduleMask(body.weekdays ?? body.scheduleMask);
  const goalValue = Number(body.goalValue);
  if (!Number.isInteger(goalValue) || goalValue < 1 || goalValue > 100000) throw new ApiError(422, "INVALID_PUSHUP_GOAL", "Цель должна быть от 1 до 100000 повторений");
  const startDate = startDateFrom(body.startDate, context);
  return client.$transaction(async (tx) => {
    if (await tx.habit.findUnique({ where: { builtInKey: "PUSHUPS" } })) throw new ApiError(409, "PUSHUPS_ALREADY_EXISTS", "Отжимания уже добавлены");
    const habit = await tx.habit.create({ data: { type: "PUSHUPS", builtInKey: "PUSHUPS", name: "Отжимания", normalizedName: "отжимания", startDate, status: mask ? "ACTIVE" : "DRAFT" } });
    if (mask) await tx.habitRevision.create({ data: { habitId: habit.id, effectiveFromDate: startDate, scheduleMask: mask, goalValue, unit: "REPETITION" } });
    return getHabit(tx, habit.id, context);
  });
}

export async function createWaterHabit(client: PrismaClient, context: BusinessContext, body: Record<string, unknown>) {
  if (Object.keys(body).some((key) => !["weekdays", "scheduleMask", "goalValue", "startDate"].includes(key))) throw new ApiError(422, "INVALID_FIELDS", "Проверьте параметры воды");
  const mask = scheduleMask(body.weekdays ?? body.scheduleMask);
  const goalValue = Number(body.goalValue);
  if (!Number.isInteger(goalValue) || goalValue < 1 || goalValue > 100000) throw new ApiError(422, "INVALID_WATER_GOAL", "Цель должна быть от 1 до 100000 мл");
  const startDate = startDateFrom(body.startDate, context);
  return client.$transaction(async (tx) => {
    if (await tx.habit.findUnique({ where: { builtInKey: "WATER" } })) throw new ApiError(409, "WATER_ALREADY_EXISTS", "Вода уже добавлена");
    const habit = await tx.habit.create({ data: { type: "WATER", builtInKey: "WATER", name: "Вода", normalizedName: "вода", startDate, status: mask ? "ACTIVE" : "DRAFT" } });
    if (mask) await tx.habitRevision.create({ data: { habitId: habit.id, effectiveFromDate: startDate, scheduleMask: mask, goalValue, unit: "MILLILITER" } });
    return getHabit(tx, habit.id, context);
  });
}

function requireVersion(actual: number, supplied: unknown) {
  if (typeof supplied !== "number" || actual !== supplied) throw new ApiError(409, "STALE_VERSION", "Данные изменились. Обновите страницу и повторите действие");
}

async function replaceRevisionFromToday(tx: Prisma.TransactionClient, habit: HabitWithHistory, effectiveDate: string, mask: number, goalValue = 1, unit = "CHECK") {
  const sameDay = habit.revisions.find((revision) => revision.effectiveFromDate === effectiveDate);
  const prior = [...habit.revisions].reverse().find((revision) => revision.effectiveFromDate < effectiveDate && (!revision.effectiveToDate || revision.effectiveToDate >= effectiveDate));
  const future = habit.revisions.filter((revision) => revision.effectiveFromDate > effectiveDate);
  if (future.length) await tx.habitRevision.deleteMany({ where: { id: { in: future.map((revision) => revision.id) } } });
  if (prior) await tx.habitRevision.update({ where: { id: prior.id }, data: { effectiveToDate: addLocalDays(effectiveDate, -1), version: { increment: 1 } } });
  if (sameDay) await tx.habitRevision.update({ where: { id: sameDay.id }, data: { scheduleMask: mask, goalValue, unit, effectiveToDate: null, version: { increment: 1 } } });
  else await tx.habitRevision.create({ data: { habitId: habit.id, effectiveFromDate: effectiveDate, scheduleMask: mask, goalValue, unit } });
}

async function clearRevisionsFromDate(tx: Prisma.TransactionClient, habit: HabitWithHistory, effectiveDate: string) {
  const currentOrFuture = habit.revisions.filter((revision) => revision.effectiveFromDate >= effectiveDate);
  if (currentOrFuture.length) await tx.habitRevision.deleteMany({ where: { id: { in: currentOrFuture.map((revision) => revision.id) } } });
  const prior = [...habit.revisions].reverse().find((revision) => revision.effectiveFromDate < effectiveDate && (!revision.effectiveToDate || revision.effectiveToDate >= effectiveDate));
  if (prior) await tx.habitRevision.update({ where: { id: prior.id }, data: { effectiveToDate: addLocalDays(effectiveDate, -1), version: { increment: 1 } } });
}

async function loadHabitForMutation(client: DbClient, id: string, expectedType?: "SIMPLE" | "PLANK" | "PUSHUPS" | "WATER") {
  const habit = await client.habit.findUnique({ where: { id }, include: habitInclude });
  if (!habit || !["SIMPLE", "PLANK", "PUSHUPS", "WATER"].includes(habit.type) || (expectedType && habit.type !== expectedType)) throw new ApiError(404, "HABIT_NOT_FOUND", "Привычка не найдена");
  return habit;
}

export async function updateHabit(client: PrismaClient, id: string, context: BusinessContext, body: Record<string, unknown>) {
  return client.$transaction(async (tx) => {
    const habit = await loadHabitForMutation(tx, id);
    if (habit.status === "ARCHIVED") throw new ApiError(409, "HABIT_ARCHIVED", "Сначала восстановите привычку");
    requireVersion(habit.version, body.version);
    if (habit.type === "PLANK") {
      if (Object.keys(body).some((key) => !["version", "weekdays", "scheduleMask", "goalValue", "startDate"].includes(key))) throw new ApiError(422, "INVALID_FIELDS", "Проверьте параметры планки");
      const currentRevision = revisionForDate(habit.revisions, context.businessDate) ?? habit.revisions.at(-1) ?? null;
      const mask = "weekdays" in body || "scheduleMask" in body ? scheduleMask(body.weekdays ?? body.scheduleMask) : (currentRevision?.scheduleMask ?? 0);
      const goalValue = "goalValue" in body ? Number(body.goalValue) : (currentRevision?.goalValue ?? 0);
      if (!Number.isInteger(goalValue) || goalValue < 1 || goalValue > 600) throw new ApiError(422, "INVALID_PLANK_GOAL", "Цель планки должна быть от 1 до 600 секунд");
      if ("startDate" in body && (habit.status !== "DRAFT" || habit.plankSessions.length > 0)) throw new ApiError(409, "START_DATE_LOCKED", "Дату начала можно изменить только у черновика без истории");
      const startDate = "startDate" in body ? startDateFrom(body.startDate, context) : habit.startDate;
      const effectiveDate = startDate > context.businessDate ? startDate : context.businessDate;
      if (mask) await replaceRevisionFromToday(tx, habit, effectiveDate, mask, goalValue, "SECOND");
      else await clearRevisionsFromDate(tx, habit, context.businessDate);
      const status = habit.status === "PAUSED" ? "PAUSED" : mask ? "ACTIVE" : "DRAFT";
      await tx.habit.update({ where: { id }, data: { startDate, status, statusChangedAt: status === habit.status ? habit.statusChangedAt : new Date(), version: { increment: 1 } } });
      return getHabit(tx, id, context);
    }
    if (habit.type === "PUSHUPS") {
      if (Object.keys(body).some((key) => !["version", "weekdays", "scheduleMask", "goalValue", "startDate"].includes(key))) throw new ApiError(422, "INVALID_FIELDS", "Проверьте параметры отжиманий");
      const current = revisionForDate(habit.revisions, context.businessDate) ?? habit.revisions.at(-1) ?? null;
      const mask = "weekdays" in body || "scheduleMask" in body ? scheduleMask(body.weekdays ?? body.scheduleMask) : (current?.scheduleMask ?? 0);
      const goalValue = "goalValue" in body ? Number(body.goalValue) : (current?.goalValue ?? 0);
      if (!Number.isInteger(goalValue) || goalValue < 1 || goalValue > 100000) throw new ApiError(422, "INVALID_PUSHUP_GOAL", "Цель должна быть от 1 до 100000 повторений");
      if ("startDate" in body && (habit.status !== "DRAFT" || habit.pushupSets.length > 0)) throw new ApiError(409, "START_DATE_LOCKED", "Дату начала можно изменить только у черновика без истории");
      const startDate = "startDate" in body ? startDateFrom(body.startDate, context) : habit.startDate;
      const effectiveDate = startDate > context.businessDate ? startDate : context.businessDate;
      if (mask) await replaceRevisionFromToday(tx, habit, effectiveDate, mask, goalValue, "REPETITION"); else await clearRevisionsFromDate(tx, habit, context.businessDate);
      const status = habit.status === "PAUSED" ? "PAUSED" : mask ? "ACTIVE" : "DRAFT";
      await tx.habit.update({ where: { id }, data: { startDate, status, statusChangedAt: status === habit.status ? habit.statusChangedAt : new Date(), version: { increment: 1 } } });
      return getHabit(tx, id, context);
    }
    if (habit.type === "WATER") {
      if (Object.keys(body).some((key) => !["version", "weekdays", "scheduleMask", "goalValue", "startDate"].includes(key))) throw new ApiError(422, "INVALID_FIELDS", "Проверьте параметры воды");
      const current = revisionForDate(habit.revisions, context.businessDate) ?? habit.revisions.at(-1) ?? null;
      const mask = "weekdays" in body || "scheduleMask" in body ? scheduleMask(body.weekdays ?? body.scheduleMask) : (current?.scheduleMask ?? 0);
      const goalValue = "goalValue" in body ? Number(body.goalValue) : (current?.goalValue ?? 0);
      if (!Number.isInteger(goalValue) || goalValue < 1 || goalValue > 100000) throw new ApiError(422, "INVALID_WATER_GOAL", "Цель должна быть от 1 до 100000 мл");
      if ("startDate" in body && (habit.status !== "DRAFT" || habit.waterEntries.length > 0)) throw new ApiError(409, "START_DATE_LOCKED", "Дату начала можно изменить только у черновика без истории");
      const startDate = "startDate" in body ? startDateFrom(body.startDate, context) : habit.startDate;
      const effectiveDate = startDate > context.businessDate ? startDate : context.businessDate;
      if (mask) await replaceRevisionFromToday(tx, habit, effectiveDate, mask, goalValue, "MILLILITER"); else await clearRevisionsFromDate(tx, habit, context.businessDate);
      const status = habit.status === "PAUSED" ? "PAUSED" : mask ? "ACTIVE" : "DRAFT";
      await tx.habit.update({ where: { id }, data: { startDate, status, statusChangedAt: status === habit.status ? habit.statusChangedAt : new Date(), version: { increment: 1 } } });
      return getHabit(tx, id, context);
    }
    if (Object.keys(body).some((key) => !["version", "name", "weekdays", "scheduleMask", "startDate"].includes(key))) throw new ApiError(422, "INVALID_FIELDS", "Проверьте параметры привычки");
    const named = "name" in body ? normalizeName(body.name) : { name: habit.name, normalizedName: habit.normalizedName };
    await assertUniqueName(tx, named.normalizedName, habit.id);
    const hasSchedule = "weekdays" in body || "scheduleMask" in body;
    const mask = hasSchedule ? scheduleMask(body.weekdays ?? body.scheduleMask) : (revisionForDate(habit.revisions, context.businessDate)?.scheduleMask ?? habit.revisions.at(-1)?.scheduleMask ?? 0);
    if ("startDate" in body && (habit.status !== "DRAFT" || habit.simpleLogs.length > 0)) throw new ApiError(409, "START_DATE_LOCKED", "Дату начала можно изменить только у черновика без истории");
    const startDate = "startDate" in body ? startDateFrom(body.startDate, context) : habit.startDate;
    const effectiveDate = startDate > context.businessDate ? startDate : context.businessDate;
    if (hasSchedule && mask) await replaceRevisionFromToday(tx, habit, effectiveDate, mask);
    if (hasSchedule && !mask) await clearRevisionsFromDate(tx, habit, context.businessDate);
    const status = habit.status === "PAUSED" ? "PAUSED" : mask ? "ACTIVE" : "DRAFT";
    await tx.habit.update({ where: { id }, data: { name: named.name, normalizedName: named.normalizedName, startDate, status, statusChangedAt: status === habit.status ? habit.statusChangedAt : new Date(), version: { increment: 1 } } });
    return getHabit(tx, id, context);
  });
}

async function closeInterval(tx: Prisma.TransactionClient, habitId: string, kind: "PAUSE" | "ARCHIVE", today: string) {
  const interval = await tx.habitExclusionInterval.findFirst({ where: { habitId, kind, endDate: null }, orderBy: { createdAt: "desc" } });
  if (!interval) return;
  if (interval.startDate === today) await tx.habitExclusionInterval.delete({ where: { id: interval.id } });
  else await tx.habitExclusionInterval.update({ where: { id: interval.id }, data: { endDate: addLocalDays(today, -1), endedAt: new Date() } });
}

export async function changeHabitLifecycle(client: PrismaClient, id: string, action: "pause" | "resume" | "archive" | "restore", context: BusinessContext, version?: number) {
  return client.$transaction(async (tx) => {
    const habit = await loadHabitForMutation(tx, id);
    requireVersion(habit.version, version);
    if (action === "pause") {
      if (habit.status !== "ACTIVE") throw new ApiError(409, "INVALID_HABIT_STATE", "Поставить на паузу можно активную привычку");
      await tx.habitExclusionInterval.create({ data: { habitId: id, kind: "PAUSE", startDate: context.businessDate } });
      await tx.habit.update({ where: { id }, data: { status: "PAUSED", statusChangedAt: new Date(), version: { increment: 1 } } });
    } else if (action === "resume") {
      if (habit.status !== "PAUSED") throw new ApiError(409, "INVALID_HABIT_STATE", "Привычка не находится на паузе");
      await closeInterval(tx, id, "PAUSE", context.businessDate);
      await tx.habit.update({ where: { id }, data: { status: habit.revisions.length ? "ACTIVE" : "DRAFT", statusChangedAt: new Date(), version: { increment: 1 } } });
    } else if (action === "archive") {
      if (habit.status === "ARCHIVED") throw new ApiError(409, "INVALID_HABIT_STATE", "Привычка уже в архиве");
      if (habit.status === "PAUSED") await closeInterval(tx, id, "PAUSE", context.businessDate);
      await tx.habitExclusionInterval.create({ data: { habitId: id, kind: "ARCHIVE", startDate: context.businessDate } });
      await tx.habit.update({ where: { id }, data: { status: "ARCHIVED", statusChangedAt: new Date(), version: { increment: 1 } } });
    } else {
      if (habit.status !== "ARCHIVED") throw new ApiError(409, "INVALID_HABIT_STATE", "Привычка не находится в архиве");
      await assertUniqueName(tx, habit.normalizedName, habit.id);
      await closeInterval(tx, id, "ARCHIVE", context.businessDate);
      const latest = habit.revisions.at(-1);
      if (latest) await replaceRevisionFromToday(tx, habit, habit.startDate > context.businessDate ? habit.startDate : context.businessDate, latest.scheduleMask, latest.goalValue, latest.unit);
      await tx.habit.update({ where: { id }, data: { status: latest ? "ACTIVE" : "DRAFT", statusChangedAt: new Date(), version: { increment: 1 } } });
    }
    return getHabit(tx, id, context);
  });
}

export async function deleteHabit(client: PrismaClient, id: string) {
  return client.$transaction(async (tx) => {
    const habit = await loadHabitForMutation(tx, id);
    const historyCount = (await tx.simpleHabitLog.count({ where: { habitId: id } })) + (await tx.plankSession.count({ where: { habitId: id } })) + (await tx.pushupSet.count({ where: { habitId: id } })) + (await tx.waterEntry.count({ where: { habitId: id } }));
    if (historyCount > 0) throw new ApiError(409, "HABIT_HAS_HISTORY", "Привычку с историей нельзя удалить. Её можно архивировать");
    await tx.weeklyHabitFocus.deleteMany({ where: { habitId: id } });
    await tx.habitExclusionInterval.deleteMany({ where: { habitId: id } });
    await tx.habitRevision.deleteMany({ where: { habitId: id } });
    await tx.habit.delete({ where: { id } });
    return habit.id;
  });
}

export async function setSimpleHabitCheck(client: PrismaClient, id: string, context: BusinessContext, extra: boolean) {
  return client.$transaction(async (tx) => {
    const habit = await loadHabitForMutation(tx, id, "SIMPLE");
    if (habit.status !== "ACTIVE") throw new ApiError(409, "HABIT_NOT_ACTIVE", "Эта привычка сейчас не активна");
    if (context.businessDate < habit.startDate) throw new ApiError(409, "HABIT_NOT_STARTED", "Дата начала привычки ещё не наступила");
    const scheduled = isScheduled(habit, context.businessDate);
    if (extra && scheduled) throw new ApiError(409, "HABIT_SCHEDULED_TODAY", "Сегодня привычка уже запланирована");
    if (!extra && !scheduled) throw new ApiError(409, "HABIT_NOT_SCHEDULED", "Сегодня день отдыха. Используйте дополнительное выполнение");
    await tx.simpleHabitLog.upsert({
      where: { habitId_localDate: { habitId: id, localDate: context.businessDate } },
      create: { habitId: id, localDate: context.businessDate, checkedAt: new Date(), isExtra: extra },
      update: { checkedAt: new Date(), isExtra: extra, version: { increment: 1 } }
    });
    return getHabit(tx, id, context);
  });
}

export async function removeSimpleHabitCheck(client: PrismaClient, id: string, context: BusinessContext) {
  return client.$transaction(async (tx) => {
    await loadHabitForMutation(tx, id, "SIMPLE");
    const existing = await tx.simpleHabitLog.findUnique({ where: { habitId_localDate: { habitId: id, localDate: context.businessDate } } });
    if (existing) await tx.simpleHabitLog.delete({ where: { id: existing.id } });
    return getHabit(tx, id, context);
  });
}

function plankDuration(value: unknown) {
  const duration = Number(value);
  if (!Number.isInteger(duration) || duration < 1 || duration > 599) throw new ApiError(422, "INVALID_PLANK_DURATION", "Длительность подхода должна быть от 1 до 599 секунд");
  return duration;
}

function utcTimestamp(value: unknown, field: string) {
  if (typeof value !== "string") throw new ApiError(422, "INVALID_PLANK_TIME", `Проверьте время: ${field}`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) throw new ApiError(422, "INVALID_PLANK_TIME", `Проверьте время: ${field}`);
  return date;
}

export async function createPlankSession(client: PrismaClient, id: string, context: BusinessContext, body: Record<string, unknown>) {
  if (Object.keys(body).some((key) => !["startedAt", "stoppedAt", "durationSeconds"].includes(key))) throw new ApiError(422, "INVALID_FIELDS", "Проверьте завершённый подход");
  const durationSeconds = plankDuration(body.durationSeconds);
  const startedAt = utcTimestamp(body.startedAt, "начала");
  const stoppedAt = utcTimestamp(body.stoppedAt, "остановки");
  if (stoppedAt.getTime() < startedAt.getTime() || Math.floor((stoppedAt.getTime() - startedAt.getTime()) / 1_000) !== durationSeconds) throw new ApiError(422, "INVALID_PLANK_TIME", "Длительность не соответствует времени подхода");
  if (localDate(startedAt) !== context.businessDate || localDate(stoppedAt) !== context.businessDate) throw new ApiError(409, "PLANK_DAY_CHANGED", "Наступил другой день. Незавершённый подход не записан");
  return client.$transaction(async (tx) => {
    const habit = await loadHabitForMutation(tx, id, "PLANK");
    if (habit.status !== "ACTIVE") throw new ApiError(409, "HABIT_NOT_ACTIVE", "Планка сейчас не активна");
    if (context.businessDate < habit.startDate) throw new ApiError(409, "HABIT_NOT_STARTED", "Дата начала планки ещё не наступила");
    const session = await tx.plankSession.create({ data: { habitId: id, localDate: context.businessDate, startedAt, stoppedAt, durationSeconds, isExtra: !isScheduled(habit, context.businessDate) } });
    return { session, habit: await getHabit(tx, id, context) };
  });
}

export async function updatePlankSession(client: PrismaClient, sessionId: string, context: BusinessContext, body: Record<string, unknown>) {
  if (Object.keys(body).some((key) => !["durationSeconds", "version"].includes(key))) throw new ApiError(422, "INVALID_FIELDS", "Проверьте исправление подхода");
  const durationSeconds = plankDuration(body.durationSeconds);
  return client.$transaction(async (tx) => {
    const session = await tx.plankSession.findUnique({ where: { id: sessionId }, include: { habit: true } });
    if (!session || session.habit.type !== "PLANK") throw new ApiError(404, "PLANK_SESSION_NOT_FOUND", "Подход не найден");
    if (session.localDate !== context.businessDate) throw new ApiError(403, "DATE_LOCKED", "Прошлые подходы нельзя изменять");
    requireVersion(session.version, body.version);
    const stoppedAt = new Date(session.startedAt.getTime() + durationSeconds * 1_000);
    await tx.plankSession.update({ where: { id: sessionId }, data: { durationSeconds, stoppedAt, version: { increment: 1 } } });
    return getHabit(tx, session.habitId, context);
  });
}

export async function deletePlankSession(client: PrismaClient, sessionId: string, context: BusinessContext) {
  return client.$transaction(async (tx) => {
    const session = await tx.plankSession.findUnique({ where: { id: sessionId }, include: { habit: true } });
    if (!session || session.habit.type !== "PLANK") throw new ApiError(404, "PLANK_SESSION_NOT_FOUND", "Подход не найден");
    if (session.localDate !== context.businessDate) throw new ApiError(403, "DATE_LOCKED", "Прошлые подходы нельзя удалять");
    await tx.plankSession.delete({ where: { id: sessionId } });
    return getHabit(tx, session.habitId, context);
  });
}

function pushupRepetitions(value: unknown) {
  const repetitions = Number(value);
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 10000) throw new ApiError(422, "INVALID_PUSHUP_REPETITIONS", "Введите целое число от 1 до 10000");
  return repetitions;
}

export async function createPushupSet(client: PrismaClient, id: string, context: BusinessContext, body: Record<string, unknown>) {
  if (Object.keys(body).some((key) => key !== "repetitions")) throw new ApiError(422, "INVALID_FIELDS", "Проверьте подход");
  const repetitions = pushupRepetitions(body.repetitions);
  return client.$transaction(async (tx) => {
    const habit = await loadHabitForMutation(tx, id, "PUSHUPS");
    if (habit.status !== "ACTIVE") throw new ApiError(409, "HABIT_NOT_ACTIVE", "Отжимания сейчас не активны");
    if (context.businessDate < habit.startDate) throw new ApiError(409, "HABIT_NOT_STARTED", "Дата начала ещё не наступила");
    const last = await tx.pushupSet.findFirst({ where: { habitId: id, localDate: context.businessDate }, orderBy: { setOrder: "desc" } });
    const set = await tx.pushupSet.create({ data: { habitId: id, localDate: context.businessDate, recordedAt: new Date(), repetitions, setOrder: (last?.setOrder ?? 0) + 1, isExtra: !isScheduled(habit, context.businessDate) } });
    return { set, habit: await getHabit(tx, id, context) };
  });
}

export async function updatePushupSet(client: PrismaClient, setId: string, context: BusinessContext, body: Record<string, unknown>) {
  if (Object.keys(body).some((key) => !["repetitions", "version"].includes(key))) throw new ApiError(422, "INVALID_FIELDS", "Проверьте подход");
  const repetitions = pushupRepetitions(body.repetitions);
  return client.$transaction(async (tx) => {
    const set = await tx.pushupSet.findUnique({ where: { id: setId }, include: { habit: true } });
    if (!set || set.habit.type !== "PUSHUPS") throw new ApiError(404, "PUSHUP_SET_NOT_FOUND", "Подход не найден");
    if (set.localDate !== context.businessDate) throw new ApiError(403, "DATE_LOCKED", "Прошлые подходы нельзя изменять");
    requireVersion(set.version, body.version);
    await tx.pushupSet.update({ where: { id: setId }, data: { repetitions, version: { increment: 1 } } });
    return getHabit(tx, set.habitId, context);
  });
}

export async function deletePushupSet(client: PrismaClient, setId: string, context: BusinessContext) {
  return client.$transaction(async (tx) => {
    const set = await tx.pushupSet.findUnique({ where: { id: setId }, include: { habit: true } });
    if (!set || set.habit.type !== "PUSHUPS") throw new ApiError(404, "PUSHUP_SET_NOT_FOUND", "Подход не найден");
    if (set.localDate !== context.businessDate) throw new ApiError(403, "DATE_LOCKED", "Прошлые подходы нельзя удалять");
    await tx.pushupSet.delete({ where: { id: setId } });
    return getHabit(tx, set.habitId, context);
  });
}

function waterMilliliters(value: unknown) {
  const milliliters = Number(value);
  if (!Number.isInteger(milliliters) || milliliters < 1 || milliliters > 10000) throw new ApiError(422, "INVALID_WATER_VOLUME", "Введите целое число от 1 до 10000 мл");
  return milliliters;
}

export async function createWaterEntry(client: PrismaClient, id: string, context: BusinessContext, body: Record<string, unknown>) {
  if (Object.keys(body).some((key) => key !== "milliliters")) throw new ApiError(422, "INVALID_FIELDS", "Проверьте объём воды");
  const milliliters = waterMilliliters(body.milliliters);
  return client.$transaction(async (tx) => {
    const habit = await loadHabitForMutation(tx, id, "WATER");
    if (habit.status !== "ACTIVE") throw new ApiError(409, "HABIT_NOT_ACTIVE", "Трекер воды сейчас не активен");
    if (context.businessDate < habit.startDate) throw new ApiError(409, "HABIT_NOT_STARTED", "Дата начала ещё не наступила");
    const last = await tx.waterEntry.findFirst({ where: { habitId: id, localDate: context.businessDate }, orderBy: { entryOrder: "desc" } });
    const entry = await tx.waterEntry.create({ data: { habitId: id, localDate: context.businessDate, recordedAt: new Date(), milliliters, entryOrder: (last?.entryOrder ?? 0) + 1, isExtra: !isScheduled(habit, context.businessDate) } });
    return { entry, habit: await getHabit(tx, id, context) };
  });
}

export async function updateWaterEntry(client: PrismaClient, entryId: string, context: BusinessContext, body: Record<string, unknown>) {
  if (Object.keys(body).some((key) => !["milliliters", "version"].includes(key))) throw new ApiError(422, "INVALID_FIELDS", "Проверьте объём воды");
  const milliliters = waterMilliliters(body.milliliters);
  return client.$transaction(async (tx) => {
    const entry = await tx.waterEntry.findUnique({ where: { id: entryId }, include: { habit: true } });
    if (!entry || entry.habit.type !== "WATER") throw new ApiError(404, "WATER_ENTRY_NOT_FOUND", "Запись воды не найдена");
    if (entry.localDate !== context.businessDate) throw new ApiError(403, "DATE_LOCKED", "Прошлые записи воды нельзя изменять");
    requireVersion(entry.version, body.version);
    await tx.waterEntry.update({ where: { id: entryId }, data: { milliliters, version: { increment: 1 } } });
    return getHabit(tx, entry.habitId, context);
  });
}

export async function deleteWaterEntry(client: PrismaClient, entryId: string, context: BusinessContext) {
  return client.$transaction(async (tx) => {
    const entry = await tx.waterEntry.findUnique({ where: { id: entryId }, include: { habit: true } });
    if (!entry || entry.habit.type !== "WATER") throw new ApiError(404, "WATER_ENTRY_NOT_FOUND", "Запись воды не найдена");
    if (entry.localDate !== context.businessDate) throw new ApiError(403, "DATE_LOCKED", "Прошлые записи воды нельзя удалять");
    await tx.waterEntry.delete({ where: { id: entryId } });
    return getHabit(tx, entry.habitId, context);
  });
}

export async function undoLastWaterEntry(client: PrismaClient, id: string, context: BusinessContext) {
  return client.$transaction(async (tx) => {
    await loadHabitForMutation(tx, id, "WATER");
    const entry = await tx.waterEntry.findFirst({ where: { habitId: id, localDate: context.businessDate }, orderBy: { entryOrder: "desc" } });
    if (!entry) throw new ApiError(409, "NO_WATER_ENTRY_TO_UNDO", "Сегодня ещё нет записи, которую можно отменить");
    await tx.waterEntry.delete({ where: { id: entry.id } });
    return getHabit(tx, id, context);
  });
}

export async function getPlankSoundSetting(client: PrismaClient) {
  const settings = await client.appSettings.upsert({ where: { id: "singleton" }, create: { id: "singleton" }, update: {} });
  return { enabled: settings.plankGoalSoundEnabled, version: settings.version };
}

export async function setPlankSoundSetting(client: PrismaClient, enabled: boolean, version: unknown) {
  return client.$transaction(async (tx) => {
    const settings = await tx.appSettings.upsert({ where: { id: "singleton" }, create: { id: "singleton" }, update: {} });
    requireVersion(settings.version, version);
    const updated = await tx.appSettings.update({ where: { id: "singleton" }, data: { plankGoalSoundEnabled: enabled, version: { increment: 1 } } });
    return { enabled: updated.plankGoalSoundEnabled, version: updated.version };
  });
}

export async function setWeeklyHabitFocus(client: PrismaClient, weekStart: string, habitIds: string[], context: BusinessContext) {
  if (weekStart < context.businessDate.slice(0, 10) && addLocalDays(weekStart, 6) < context.businessDate) throw new ApiError(403, "DATE_LOCKED", "Прошлую неделю нельзя редактировать");
  if (new Set(habitIds).size !== habitIds.length) throw new ApiError(422, "DUPLICATE_HABIT", "Одна привычка выбрана несколько раз");
  return client.$transaction(async (tx) => {
    const habits = await tx.habit.findMany({ where: { id: { in: habitIds }, status: "ACTIVE" } });
    if (habits.length !== habitIds.length) throw new ApiError(422, "INVALID_HABIT_FOCUS", "В фокус можно добавить только активные привычки");
    let plan = await tx.weeklyPlan.findUnique({ where: { weekStart } });
    if (!plan) {
      plan = await tx.weeklyPlan.create({ data: { weekStart } });
      await tx.weeklyStep.createMany({ data: [1, 2, 3].map((orderIndex) => ({ weeklyPlanId: plan!.id, orderIndex })) });
    }
    await tx.weeklyHabitFocus.deleteMany({ where: { weeklyPlanId: plan.id } });
    if (habits.length) await tx.weeklyHabitFocus.createMany({ data: habits.map((habit) => ({ weeklyPlanId: plan!.id, habitId: habit.id, habitNameSnapshot: habit.name })) });
    return tx.weeklyHabitFocus.findMany({ where: { weeklyPlanId: plan.id }, orderBy: { habitNameSnapshot: "asc" } });
  });
}

export const habitStatuses = STATUSES;
