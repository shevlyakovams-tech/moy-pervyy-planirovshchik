import type { Prisma, PrismaClient } from "@prisma/client";
import { APP_VERSION, SCHEMA_VERSION, SEED_VERSION } from "@/lib/versions";
import { ApiError } from "@/lib/api-response";
import { addLocalDays, dateAccess, isDateInWeek, localDate, resolveObservedBusinessDate, startOfLocalWeek, type DateAccess } from "@/lib/date-service";
import { chooseLeastShownId, chooseQuote, type RandomIndex } from "@/lib/quote-deck";
import { normalizeMultiline, normalizeSearch, normalizeSingleLine } from "@/lib/text-normalization";

type Tx = Prisma.TransactionClient;
export const TASK_CATEGORIES = ["WORK", "CLOSE_PEOPLE", "FAMILY", "HOBBY", "LEARNING"] as const;
export const MOODS = ["HARD", "BELOW_USUAL", "EVEN", "GOOD", "EXCELLENT"] as const;
export type BusinessContext = { systemDate: string; businessDate: string; clockWarning: boolean };

const searchableDayFields = {
  gratitude: "GRATITUDE", thought: "THOUGHT", intention: "INTENTION"
} as const;

function requireAccess(actual: DateAccess, allowed: DateAccess[]) {
  if (!allowed.includes(actual)) throw new ApiError(403, "DATE_LOCKED", "Эта дата доступна только для чтения");
}

function requireVersion(actual: number, supplied: number | undefined) {
  if (supplied === undefined || supplied !== actual) throw new ApiError(409, "STALE_VERSION", "Данные уже изменились. Обновите страницу и повторите действие");
}

async function syncSearchDocument(
  tx: Tx,
  input: { sourceType: string; sourceId: string; localDate: string; text: string | null; taskCategory?: string | null }
) {
  if (!input.text) {
    await tx.searchDocument.deleteMany({ where: { sourceType: input.sourceType, sourceId: input.sourceId } });
    return;
  }
  await tx.searchDocument.upsert({
    where: { sourceType_sourceId: { sourceType: input.sourceType, sourceId: input.sourceId } },
    create: {
      sourceType: input.sourceType, sourceId: input.sourceId, localDate: input.localDate,
      taskCategory: input.taskCategory ?? null, originalText: input.text, normalizedText: normalizeSearch(input.text)
    },
    update: {
      localDate: input.localDate, taskCategory: input.taskCategory ?? null,
      originalText: input.text, normalizedText: normalizeSearch(input.text)
    }
  });
}

async function syncQuoteSearch(tx: Tx, entryId: string, selectedDate: string, quote: { translationRu: string; sourceExcerpt: string; author: string } | null) {
  await syncSearchDocument(tx, {
    sourceType: "QUOTE", sourceId: entryId, localDate: selectedDate,
    text: quote ? `${quote.translationRu}\n${quote.sourceExcerpt}\n${quote.author}` : null
  });
}

export async function getBusinessContext(client: PrismaClient, now = new Date()): Promise<BusinessContext> {
  const systemDate = localDate(now);
  const metadata = await client.appMetadata.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", appVersion: APP_VERSION, schemaVersion: SCHEMA_VERSION, seedVersion: SEED_VERSION, maxObservedBusinessDate: systemDate },
    update: {}
  });
  const observed = resolveObservedBusinessDate(systemDate, metadata.maxObservedBusinessDate);
  if (systemDate > metadata.maxObservedBusinessDate) {
    await client.appMetadata.update({ where: { id: "singleton" }, data: { maxObservedBusinessDate: systemDate } });
  }
  return { systemDate, ...observed };
}

async function chooseAndAssignQuote(tx: Tx, entry: { id: string; localDate: string }, reason: "INITIAL" | "REPLACEMENT", randomIndex?: RandomIndex) {
  const active = await tx.quote.findMany({
    where: { OR: [{ userState: null }, { userState: { hiddenAt: null } }] },
    select: { id: true, category: true, author: true, translationRu: true, sourceExcerpt: true }
  });
  const historyRows = await tx.quoteDisplay.findMany({
    orderBy: { displayedAt: "asc" },
    include: { quote: { select: { author: true, category: true } } }
  });
  const history = historyRows.map((item) => ({ quoteId: item.quoteId, cycleNumber: item.cycleNumber, author: item.quote.author, category: item.quote.category }));
  const selected = chooseQuote(active, history, randomIndex);
  if (!selected) {
    await tx.dailyEntry.update({ where: { id: entry.id }, data: { quoteId: null, quoteAssignedAt: null, version: { increment: 1 } } });
    await syncQuoteSearch(tx, entry.id, entry.localDate, null);
    return null;
  }
  const previous = reason === "REPLACEMENT"
    ? await tx.quoteDisplay.findFirst({ where: { localDate: entry.localDate, replacedByDisplayId: null }, orderBy: { displayedAt: "desc" } })
    : null;
  const display = await tx.quoteDisplay.create({
    data: { quoteId: selected.quote.id, localDate: entry.localDate, cycleNumber: selected.cycleNumber, reason }
  });
  if (previous) await tx.quoteDisplay.update({ where: { id: previous.id }, data: { replacedByDisplayId: display.id } });
  await tx.dailyEntry.update({
    where: { id: entry.id },
    data: { quoteId: selected.quote.id, quoteAssignedAt: new Date(), version: { increment: 1 } }
  });
  await syncQuoteSearch(tx, entry.id, entry.localDate, selected.quote);
  return selected.quote.id;
}

async function ensureTodayEntry(tx: Tx, selectedDate: string, randomIndex?: RandomIndex) {
  let entry = await tx.dailyEntry.findUnique({ where: { localDate: selectedDate } });
  if (!entry) {
    const prompts = await tx.reflectionPrompt.findMany({ where: { kind: "ROTATING", active: true }, orderBy: { id: "asc" } });
    const shown = await tx.dailyEntry.findMany({ where: { rotatingPromptId: { not: null } }, select: { rotatingPromptId: true } });
    const rotatingPromptId = chooseLeastShownId(prompts.map((item) => item.id), shown.flatMap((item) => item.rotatingPromptId ? [item.rotatingPromptId] : []), randomIndex);
    entry = await tx.dailyEntry.create({ data: { localDate: selectedDate, rotatingPromptId } });
  }
  if (!entry.quoteId) {
    await chooseAndAssignQuote(tx, entry, "INITIAL", randomIndex);
    entry = await tx.dailyEntry.findUniqueOrThrow({ where: { id: entry.id } });
  }
  return entry;
}

export async function getDay(client: PrismaClient, selectedDate: string, context: BusinessContext, randomIndex?: RandomIndex) {
  const access = dateAccess(selectedDate, context.businessDate);
  if (access === "today") await client.$transaction((tx) => ensureTodayEntry(tx, selectedDate, randomIndex));
  const [entry, prompts, tasks, week, unresolved, hiddenCount] = await Promise.all([
    client.dailyEntry.findUnique({
      where: { localDate: selectedDate },
      include: {
        rotatingPrompt: true,
        quote: { include: { userState: true } },
        reflectionAnswers: { orderBy: { orderIndex: "asc" } }
      }
    }),
    client.reflectionPrompt.findMany({ where: { kind: "FIXED", active: true }, orderBy: { orderIndex: "asc" } }),
    client.task.findMany({ where: { localDate: selectedDate }, orderBy: [{ priorityRank: "asc" }, { sortOrder: "asc" }] }),
    client.weeklyPlan.findUnique({ where: { weekStart: startOfLocalWeek(selectedDate) }, include: { steps: { orderBy: { orderIndex: "asc" } } } }),
    access === "today" ? client.task.findMany({ where: { localDate: { lt: context.businessDate }, status: "PLANNED" }, orderBy: [{ localDate: "desc" }, { sortOrder: "asc" }] }) : Promise.resolve([]),
    client.quoteUserState.count({ where: { hiddenAt: { not: null } } })
  ]);
  return {
    selectedDate, access, businessDate: context.businessDate, systemDate: context.systemDate, clockWarning: context.clockWarning,
    entry, fixedPrompts: prompts, tasks, unresolved, hiddenCount,
    weeklyContext: week ? { weekStart: week.weekStart, goal: week.goal, steps: week.steps.filter((step) => step.assignedDate === selectedDate && step.text) } : { weekStart: startOfLocalWeek(selectedDate), goal: null, steps: [] },
    permissions: {
      editJournal: access === "today", editTasks: access !== "past", useTaskStatuses: access === "today",
      completeMorning: access === "today", replaceQuote: access === "today"
    }
  };
}

const dailyLimits: Record<string, number> = {
  gratitude: 2000, moodNote: 500, thought: 2000, intention: 2000,
  mainResult: 500, selfAction: 500, closeAction: 500
};

export async function patchDay(client: PrismaClient, selectedDate: string, context: BusinessContext, body: Record<string, unknown>) {
  requireAccess(dateAccess(selectedDate, context.businessDate), ["today"]);
  const allowed = Object.keys(dailyLimits);
  const supplied = Object.keys(body).filter((key) => key !== "version");
  if (supplied.length === 0 || supplied.some((key) => !allowed.includes(key) && key !== "mood")) throw new ApiError(422, "INVALID_FIELDS", "Проверьте изменяемые поля");
  return client.$transaction(async (tx) => {
    const entry = await ensureTodayEntry(tx, selectedDate);
    requireVersion(entry.version, typeof body.version === "number" ? body.version : undefined);
    const data: Record<string, unknown> = {};
    for (const field of allowed) {
      if (!(field in body)) continue;
      if (typeof body[field] !== "string" && body[field] !== null) throw new ApiError(422, "VALIDATION_ERROR", "Проверьте заполненные поля");
      const normalized = normalizeMultiline(body[field] as string | null);
      if (normalized && normalized.length > (dailyLimits[field] ?? 0)) throw new ApiError(422, "TEXT_TOO_LONG", "Текст превышает допустимую длину");
      data[field] = normalized;
      if ((field === "selfAction" || field === "closeAction") && !normalized) data[`${field}CompletedAt`] = null;
    }
    if ("mood" in body) {
      if (body.mood !== null && (typeof body.mood !== "string" || !MOODS.includes(body.mood as typeof MOODS[number]))) throw new ApiError(422, "INVALID_MOOD", "Выберите настроение из списка");
      data.mood = body.mood;
    }
    const updated = await tx.dailyEntry.update({ where: { id: entry.id }, data: { ...data, version: { increment: 1 } } });
    for (const [field, sourceType] of Object.entries(searchableDayFields)) {
      if (field in data) await syncSearchDocument(tx, { sourceType, sourceId: entry.id, localDate: selectedDate, text: data[field] as string | null });
    }
    return updated;
  });
}

export async function saveReflection(client: PrismaClient, selectedDate: string, promptId: string, context: BusinessContext, body: Record<string, unknown>) {
  requireAccess(dateAccess(selectedDate, context.businessDate), ["today"]);
  if (typeof body.answer !== "string" && body.answer !== null) throw new ApiError(422, "VALIDATION_ERROR", "Проверьте ответ");
  const answer = normalizeMultiline(body.answer as string | null);
  if (answer && answer.length > 2000) throw new ApiError(422, "TEXT_TOO_LONG", "Ответ превышает 2000 символов");
  return client.$transaction(async (tx) => {
    const [entry, prompt] = await Promise.all([ensureTodayEntry(tx, selectedDate), tx.reflectionPrompt.findUnique({ where: { id: promptId } })]);
    if (!prompt || !prompt.active) throw new ApiError(404, "PROMPT_NOT_FOUND", "Вопрос не найден");
    const existing = await tx.dailyReflectionAnswer.findUnique({ where: { dailyEntryId_promptId: { dailyEntryId: entry.id, promptId } } });
    if (existing) requireVersion(existing.version, typeof body.version === "number" ? body.version : undefined);
    if (!answer) {
      if (existing) {
        await tx.dailyReflectionAnswer.delete({ where: { id: existing.id } });
        await syncSearchDocument(tx, { sourceType: "REFLECTION", sourceId: existing.id, localDate: selectedDate, text: null });
      }
      return null;
    }
    const orderIndex = prompt.kind === "FIXED" ? (prompt.orderIndex ?? 0) : 4;
    const saved = existing
      ? await tx.dailyReflectionAnswer.update({ where: { id: existing.id }, data: { answer, promptTextSnapshot: prompt.textRu, version: { increment: 1 } } })
      : await tx.dailyReflectionAnswer.create({ data: { dailyEntryId: entry.id, promptId, promptTextSnapshot: prompt.textRu, answer, orderIndex } });
    await syncSearchDocument(tx, { sourceType: "REFLECTION", sourceId: saved.id, localDate: selectedDate, text: `${saved.promptTextSnapshot}\n${answer}` });
    return saved;
  });
}

export async function setActionCompleted(client: PrismaClient, selectedDate: string, kind: "self" | "close", context: BusinessContext, completed: boolean) {
  requireAccess(dateAccess(selectedDate, context.businessDate), ["today"]);
  return client.$transaction(async (tx) => {
    const entry = await ensureTodayEntry(tx, selectedDate);
    const text = kind === "self" ? entry.selfAction : entry.closeAction;
    if (completed && !text) throw new ApiError(409, "ACTION_EMPTY", "Сначала запишите действие");
    return tx.dailyEntry.update({ where: { id: entry.id }, data: { [kind === "self" ? "selfActionCompletedAt" : "closeActionCompletedAt"]: completed ? new Date() : null, version: { increment: 1 } } });
  });
}

export async function completeMorning(client: PrismaClient, selectedDate: string, context: BusinessContext) {
  requireAccess(dateAccess(selectedDate, context.businessDate), ["today"]);
  return client.$transaction(async (tx) => {
    const priority = await tx.task.findFirst({ where: { localDate: selectedDate, priorityRank: 1, status: { in: ["PLANNED", "COMPLETED"] } } });
    if (!priority) throw new ApiError(409, "PRIORITY_REQUIRED", "Добавьте хотя бы одну важную задачу — этого уже достаточно");
    const entry = await ensureTodayEntry(tx, selectedDate);
    if (entry.morningCompletedAt) return entry;
    return tx.dailyEntry.update({ where: { id: entry.id }, data: { morningCompletedAt: new Date(), version: { increment: 1 } } });
  });
}

async function assertCanRemovePriority(tx: Tx, task: { id: string; localDate: string; priorityRank: number | null; status: string }) {
  if (!task.priorityRank || !["PLANNED", "COMPLETED"].includes(task.status)) return;
  const entry = await tx.dailyEntry.findUnique({ where: { localDate: task.localDate } });
  if (!entry?.morningCompletedAt) return;
  const activeCount = await tx.task.count({ where: { localDate: task.localDate, priorityRank: { not: null }, status: { in: ["PLANNED", "COMPLETED"] } } });
  if (activeCount <= 1) throw new ApiError(409, "LAST_PRIORITY_REQUIRED", "Сначала назначьте другую важную задачу");
}

export async function createTask(client: PrismaClient, context: BusinessContext, body: Record<string, unknown>) {
  if (typeof body.localDate !== "string") throw new ApiError(422, "INVALID_DATE", "Укажите дату задачи");
  requireAccess(dateAccess(body.localDate, context.businessDate), ["today", "future"]);
  const title = normalizeSingleLine(typeof body.title === "string" ? body.title : "");
  if (!title || title.length > 240) throw new ApiError(422, "INVALID_TITLE", "Название задачи должно содержать от 1 до 240 символов");
  if (typeof body.category !== "string" || !TASK_CATEGORIES.includes(body.category as typeof TASK_CATEGORIES[number])) throw new ApiError(422, "INVALID_CATEGORY", "Выберите категорию задачи");
  return client.$transaction(async (tx) => {
    const last = await tx.task.aggregate({ where: { localDate: body.localDate as string }, _max: { sortOrder: true } });
    const task = await tx.task.create({ data: { localDate: body.localDate as string, title, category: body.category as string, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
    await syncSearchDocument(tx, { sourceType: "TASK", sourceId: task.id, localDate: task.localDate, taskCategory: task.category, text: task.title });
    return task;
  });
}

export async function updateTask(client: PrismaClient, id: string, context: BusinessContext, body: Record<string, unknown>) {
  return client.$transaction(async (tx) => {
    const task = await tx.task.findUnique({ where: { id } });
    if (!task) throw new ApiError(404, "TASK_NOT_FOUND", "Задача не найдена");
    const access = dateAccess(task.localDate, context.businessDate);
    requireAccess(access, ["today", "future"]);
    requireVersion(task.version, typeof body.version === "number" ? body.version : undefined);
    if (task.status !== "PLANNED" && access === "future") throw new ApiError(409, "INVALID_TASK_STATE", "Будущую задачу нельзя изменить в этом состоянии");
    const data: Record<string, unknown> = {};
    if ("title" in body) {
      const title = normalizeSingleLine(typeof body.title === "string" ? body.title : "");
      if (!title || title.length > 240) throw new ApiError(422, "INVALID_TITLE", "Название задачи должно содержать от 1 до 240 символов");
      data.title = title;
    }
    if ("category" in body) {
      if (typeof body.category !== "string" || !TASK_CATEGORIES.includes(body.category as typeof TASK_CATEGORIES[number])) throw new ApiError(422, "INVALID_CATEGORY", "Выберите категорию задачи");
      data.category = body.category;
    }
    if ("localDate" in body) {
      if (access !== "future" || typeof body.localDate !== "string" || dateAccess(body.localDate, context.businessDate) !== "future") throw new ApiError(403, "DATE_LOCKED", "Будущую задачу можно перенести только на другую будущую дату");
      data.localDate = body.localDate;
    }
    if ("priorityRank" in body) {
      if (access !== "today") throw new ApiError(403, "DATE_LOCKED", "Приоритет доступен только сегодня");
      const desired = body.priorityRank === null ? null : Number(body.priorityRank);
      if (desired !== null && ![1, 2, 3].includes(desired)) throw new ApiError(422, "INVALID_PRIORITY", "Приоритет должен быть от 1 до 3");
      if (desired === null) await assertCanRemovePriority(tx, task);
      if (desired !== task.priorityRank) {
        const occupied = desired ? await tx.task.findFirst({ where: { localDate: task.localDate, priorityRank: desired, status: { in: ["PLANNED", "COMPLETED"] }, id: { not: task.id } } }) : null;
        if (occupied) await tx.task.update({ where: { id: occupied.id }, data: { priorityRank: null, version: { increment: 1 } } });
        await tx.task.update({ where: { id: task.id }, data: { priorityRank: desired, version: { increment: 1 } } });
        if (occupied && task.priorityRank) await tx.task.update({ where: { id: occupied.id }, data: { priorityRank: task.priorityRank, version: { increment: 1 } } });
        const swapped = await tx.task.findUniqueOrThrow({ where: { id: task.id } });
        await syncSearchDocument(tx, { sourceType: "TASK", sourceId: swapped.id, localDate: swapped.localDate, taskCategory: swapped.category, text: swapped.title });
        return swapped;
      }
    }
    const updated = await tx.task.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
    await syncSearchDocument(tx, { sourceType: "TASK", sourceId: updated.id, localDate: updated.localDate, taskCategory: updated.category, text: updated.title });
    return updated;
  });
}

export async function changeTaskStatus(client: PrismaClient, id: string, action: "complete" | "reopen" | "let-go" | "complete-yesterday", context: BusinessContext) {
  return client.$transaction(async (tx) => {
    const task = await tx.task.findUnique({ where: { id } });
    if (!task) throw new ApiError(404, "TASK_NOT_FOUND", "Задача не найдена");
    if (action === "complete-yesterday") {
      if (task.localDate !== addLocalDays(context.businessDate, -1) || task.status !== "PLANNED") throw new ApiError(403, "DATE_LOCKED", "Задним числом можно отметить только вчерашнюю задачу");
      return tx.task.update({ where: { id }, data: { status: "COMPLETED", resolvedAt: new Date(), resolvedByNextMorning: true, version: { increment: 1 } } });
    }
    if (action === "let-go") {
      if (task.localDate > context.businessDate || task.status !== "PLANNED") throw new ApiError(409, "INVALID_TASK_STATE", "Эту задачу сейчас нельзя отметить как неактуальную");
      await assertCanRemovePriority(tx, task);
      return tx.task.update({ where: { id }, data: { status: "LET_GO", resolvedAt: new Date(), version: { increment: 1 } } });
    }
    requireAccess(dateAccess(task.localDate, context.businessDate), ["today"]);
    if (action === "complete" && task.status !== "PLANNED") throw new ApiError(409, "INVALID_TASK_STATE", "Задача уже разобрана");
    if (action === "reopen" && task.status !== "COMPLETED") throw new ApiError(409, "INVALID_TASK_STATE", "Вернуть можно только выполненную сегодня задачу");
    return tx.task.update({
      where: { id }, data: action === "complete"
        ? { status: "COMPLETED", resolvedAt: new Date(), version: { increment: 1 } }
        : { status: "PLANNED", resolvedAt: null, resolvedByNextMorning: false, version: { increment: 1 } }
    });
  });
}

export async function transferTask(client: PrismaClient, id: string, targetDate: string, context: BusinessContext) {
  const targetAccess = dateAccess(targetDate, context.businessDate);
  requireAccess(targetAccess, ["today", "future"]);
  return client.$transaction(async (tx) => {
    const task = await tx.task.findUnique({ where: { id } });
    if (!task) throw new ApiError(404, "TASK_NOT_FOUND", "Задача не найдена");
    if (task.status === "TRANSFERRED") {
      const child = await tx.task.findFirst({ where: { sourceTaskId: task.id } });
      if (child) return child;
    }
    if (task.status !== "PLANNED" || task.localDate > context.businessDate || task.localDate === targetDate) throw new ApiError(409, "INVALID_TASK_STATE", "Эту задачу нельзя перенести на выбранную дату");
    if (task.localDate === context.businessDate && targetAccess !== "future") throw new ApiError(422, "INVALID_TARGET_DATE", "Сегодняшнюю задачу можно перенести только в будущее");
    await assertCanRemovePriority(tx, task);
    const last = await tx.task.aggregate({ where: { localDate: targetDate }, _max: { sortOrder: true } });
    const child = await tx.task.create({ data: {
      localDate: targetDate, title: task.title, category: task.category, sortOrder: (last._max.sortOrder ?? -1) + 1,
      sourceTaskId: task.id, chainRootTaskId: task.chainRootTaskId ?? task.id
    } });
    await tx.task.update({ where: { id: task.id }, data: { status: "TRANSFERRED", resolvedAt: new Date(), version: { increment: 1 } } });
    await syncSearchDocument(tx, { sourceType: "TASK", sourceId: child.id, localDate: child.localDate, taskCategory: child.category, text: child.title });
    return child;
  });
}

export async function deleteTask(client: PrismaClient, id: string, context: BusinessContext) {
  return client.$transaction(async (tx) => {
    const task = await tx.task.findUnique({ where: { id } });
    if (!task) throw new ApiError(404, "TASK_NOT_FOUND", "Задача не найдена");
    requireAccess(dateAccess(task.localDate, context.businessDate), ["today", "future"]);
    if (task.status !== "PLANNED") throw new ApiError(409, "INVALID_TASK_STATE", "Удалить можно только запланированную задачу");
    await assertCanRemovePriority(tx, task);
    await tx.searchDocument.deleteMany({ where: { sourceType: "TASK", sourceId: task.id } });
    await tx.task.delete({ where: { id } });
  });
}

export async function reorderTasks(client: PrismaClient, selectedDate: string, ids: string[], context: BusinessContext) {
  requireAccess(dateAccess(selectedDate, context.businessDate), ["today", "future"]);
  if (ids.length !== new Set(ids).size) throw new ApiError(422, "INVALID_ORDER", "Порядок содержит повторяющиеся задачи");
  return client.$transaction(async (tx) => {
    const tasks = await tx.task.findMany({ where: { localDate: selectedDate, status: "PLANNED" }, orderBy: { sortOrder: "asc" } });
    const ordinary = tasks.filter((task) => task.priorityRank === null);
    if (ordinary.length !== ids.length || ordinary.some((task) => !ids.includes(task.id))) throw new ApiError(409, "TASK_SET_CHANGED", "Список задач изменился. Обновите страницу");
    for (const [sortOrder, id] of ids.entries()) await tx.task.update({ where: { id }, data: { sortOrder, version: { increment: 1 } } });
    return tx.task.findMany({ where: { localDate: selectedDate }, orderBy: [{ priorityRank: "asc" }, { sortOrder: "asc" }] });
  });
}

async function ensureWeekSlots(tx: Tx, weekStart: string) {
  let plan = await tx.weeklyPlan.findUnique({ where: { weekStart } });
  if (!plan) plan = await tx.weeklyPlan.create({ data: { weekStart } });
  for (const orderIndex of [1, 2, 3]) await tx.weeklyStep.upsert({
    where: { weeklyPlanId_orderIndex: { weeklyPlanId: plan.id, orderIndex } }, update: {}, create: { weeklyPlanId: plan.id, orderIndex }
  });
  return plan;
}

export async function getWeek(client: PrismaClient, weekStartInput: string, context: BusinessContext) {
  const weekStart = startOfLocalWeek(weekStartInput);
  if (weekStart !== weekStartInput) throw new ApiError(422, "INVALID_WEEK", "Неделя должна начинаться в понедельник");
  const access = dateAccess(weekStart, startOfLocalWeek(context.businessDate));
  const plan = await client.weeklyPlan.findUnique({ where: { weekStart }, include: { steps: { orderBy: { orderIndex: "asc" } }, habitFocuses: true } });
  return {
    weekStart, access, businessWeekStart: startOfLocalWeek(context.businessDate), plan,
    steps: plan?.steps ?? [1, 2, 3].map((orderIndex) => ({ id: null, orderIndex, text: null, assignedDate: null, completedAt: null, version: 1 })),
    permissions: { editGoalAndSteps: access !== "past", editFullPlan: access === "today", completeSteps: access === "today", resolvePast: access === "past" }
  };
}

const weekLimits: Record<string, number> = {
  goal: 500, whyImportant: 2000, successCriterion: 2000, obstacle: 2000,
  fallbackPlan: 2000, selfAction: 500, closeAction: 500
};

export async function patchWeek(client: PrismaClient, weekStartInput: string, context: BusinessContext, body: Record<string, unknown>) {
  const weekStart = startOfLocalWeek(weekStartInput);
  if (weekStart !== weekStartInput) throw new ApiError(422, "INVALID_WEEK", "Неделя должна начинаться в понедельник");
  const access = dateAccess(weekStart, startOfLocalWeek(context.businessDate));
  requireAccess(access, ["today", "future"]);
  const fields = Object.keys(body).filter((key) => key !== "version");
  if (fields.some((field) => !(field in weekLimits)) || (access === "future" && fields.some((field) => field !== "goal"))) throw new ApiError(403, "DATE_LOCKED", "Для будущей недели доступны только цель и три шага");
  return client.$transaction(async (tx) => {
    const existing = await tx.weeklyPlan.findUnique({ where: { weekStart } });
    if (existing) requireVersion(existing.version, typeof body.version === "number" ? body.version : undefined);
    const data: Record<string, unknown> = {};
    for (const field of fields) {
      if (typeof body[field] !== "string" && body[field] !== null) throw new ApiError(422, "VALIDATION_ERROR", "Проверьте заполненные поля");
      const value = normalizeMultiline(body[field] as string | null);
      if (value && value.length > (weekLimits[field] ?? 0)) throw new ApiError(422, "TEXT_TOO_LONG", "Текст превышает допустимую длину");
      data[field] = value;
      if (field === "goal" && !value) { data.outcome = "UNRESOLVED"; data.outcomeResolvedAt = null; data.sourceWeeklyPlanId = null; }
    }
    const plan = existing
      ? await tx.weeklyPlan.update({ where: { id: existing.id }, data: { ...data, version: { increment: 1 } } })
      : await ensureWeekSlots(tx, weekStart).then((created) => tx.weeklyPlan.update({ where: { id: created.id }, data }));
    if (fields.includes("goal")) await syncSearchDocument(tx, { sourceType: "WEEKLY_GOAL", sourceId: plan.id, localDate: weekStart, text: plan.goal });
    return plan;
  });
}

export async function saveWeekStep(client: PrismaClient, weekStartInput: string, orderIndex: number, context: BusinessContext, body: Record<string, unknown>) {
  const weekStart = startOfLocalWeek(weekStartInput);
  const access = dateAccess(weekStart, startOfLocalWeek(context.businessDate));
  requireAccess(access, ["today", "future"]);
  if (![1, 2, 3].includes(orderIndex)) throw new ApiError(422, "INVALID_STEP", "Номер шага должен быть от 1 до 3");
  const text = normalizeMultiline(typeof body.text === "string" ? body.text : null);
  if (text && text.length > 500) throw new ApiError(422, "TEXT_TOO_LONG", "Шаг превышает 500 символов");
  const assignedDate = typeof body.assignedDate === "string" && body.assignedDate ? body.assignedDate : null;
  if (assignedDate && !isDateInWeek(assignedDate, weekStart)) throw new ApiError(422, "DATE_OUTSIDE_WEEK", "Дата шага должна находиться внутри выбранной недели");
  return client.$transaction(async (tx) => {
    const plan = await ensureWeekSlots(tx, weekStart);
    const step = await tx.weeklyStep.findUniqueOrThrow({ where: { weeklyPlanId_orderIndex: { weeklyPlanId: plan.id, orderIndex } } });
    requireVersion(step.version, typeof body.version === "number" ? body.version : undefined);
    return tx.weeklyStep.update({ where: { id: step.id }, data: { text, assignedDate: text ? assignedDate : null, completedAt: text ? step.completedAt : null, version: { increment: 1 } } });
  });
}

export async function setWeekStepCompleted(client: PrismaClient, weekStart: string, orderIndex: number, context: BusinessContext, completed: boolean) {
  requireAccess(dateAccess(startOfLocalWeek(weekStart), startOfLocalWeek(context.businessDate)), ["today"]);
  return client.$transaction(async (tx) => {
    const plan = await tx.weeklyPlan.findUnique({ where: { weekStart }, include: { steps: true } });
    const step = plan?.steps.find((item) => item.orderIndex === orderIndex);
    if (!step?.text) throw new ApiError(409, "STEP_EMPTY", "Сначала запишите шаг");
    return tx.weeklyStep.update({ where: { id: step.id }, data: { completedAt: completed ? new Date() : null, version: { increment: 1 } } });
  });
}

export async function unresolvedWeeks(client: PrismaClient, context: BusinessContext) {
  return client.weeklyPlan.findMany({ where: { weekStart: { lt: startOfLocalWeek(context.businessDate) }, goal: { not: null }, outcome: "UNRESOLVED" }, include: { steps: { orderBy: { orderIndex: "asc" } } }, orderBy: { weekStart: "desc" } });
}

export async function resolveWeek(client: PrismaClient, weekStart: string, context: BusinessContext, outcome: string) {
  requireAccess(dateAccess(weekStart, startOfLocalWeek(context.businessDate)), ["past"]);
  if (!["ACHIEVED", "NOT_RELEVANT"].includes(outcome)) throw new ApiError(422, "INVALID_OUTCOME", "Выберите результат недели");
  const plan = await client.weeklyPlan.findUnique({ where: { weekStart } });
  if (!plan?.goal || plan.outcome !== "UNRESOLVED") throw new ApiError(409, "INVALID_WEEK_STATE", "Эта цель уже разобрана");
  return client.weeklyPlan.update({ where: { id: plan.id }, data: { outcome, outcomeResolvedAt: new Date(), version: { increment: 1 } } });
}

export async function transferWeek(client: PrismaClient, weekStart: string, context: BusinessContext, body: Record<string, unknown>) {
  requireAccess(dateAccess(weekStart, startOfLocalWeek(context.businessDate)), ["past"]);
  if (typeof body.targetWeekStart !== "string") throw new ApiError(422, "INVALID_TARGET_WEEK", "Выберите неделю для переноса");
  const target = startOfLocalWeek(body.targetWeekStart);
  requireAccess(dateAccess(target, startOfLocalWeek(context.businessDate)), ["today", "future"]);
  const goal = normalizeMultiline(typeof body.goal === "string" ? body.goal : "");
  if (!goal || goal.length > 500) throw new ApiError(422, "INVALID_GOAL", "Запишите цель до 500 символов");
  const requestedSteps = Array.isArray(body.steps) ? body.steps : [];
  if (requestedSteps.length > 3) throw new ApiError(422, "TOO_MANY_STEPS", "Можно перенести не больше трёх шагов");
  const parsedSteps = requestedSteps.map((value) => {
    if (!value || typeof value !== "object") throw new ApiError(422, "INVALID_STEP", "Проверьте выбранные шаги");
    const item = value as Record<string, unknown>;
    const orderIndex = Number(item.orderIndex);
    const assignedDate = typeof item.assignedDate === "string" && item.assignedDate ? item.assignedDate : null;
    if (![1, 2, 3].includes(orderIndex) || (assignedDate && !isDateInWeek(assignedDate, target))) throw new ApiError(422, "INVALID_STEP", "Дата перенесённого шага должна быть внутри выбранной недели");
    return { orderIndex, assignedDate };
  });
  if (new Set(parsedSteps.map((step) => step.orderIndex)).size !== parsedSteps.length) throw new ApiError(422, "DUPLICATE_STEP", "Один шаг выбран несколько раз");
  return client.$transaction(async (tx) => {
    const [source, targetExisting] = await Promise.all([
      tx.weeklyPlan.findUnique({ where: { weekStart }, include: { steps: true } }),
      tx.weeklyPlan.findUnique({ where: { weekStart: target } })
    ]);
    if (!source?.goal || source.outcome !== "UNRESOLVED") throw new ApiError(409, "INVALID_WEEK_STATE", "Эта цель уже разобрана");
    if (targetExisting?.goal) throw new ApiError(409, "TARGET_WEEK_HAS_GOAL", "В выбранной неделе уже есть цель");
    const selectedSteps = parsedSteps.map((requested) => {
      const step = source.steps.find((candidate) => candidate.orderIndex === requested.orderIndex);
      if (!step?.text || step.completedAt) throw new ApiError(409, "STEP_NOT_TRANSFERABLE", "Перенести можно только незавершённый непустой шаг");
      return { text: step.text, assignedDate: requested.assignedDate };
    });
    const targetPlan = await ensureWeekSlots(tx, target);
    const updated = await tx.weeklyPlan.update({ where: { id: targetPlan.id }, data: { goal, sourceWeeklyPlanId: source.id, outcome: "UNRESOLVED", version: { increment: 1 } } });
    for (const [index, step] of selectedSteps.entries()) await tx.weeklyStep.update({
      where: { weeklyPlanId_orderIndex: { weeklyPlanId: targetPlan.id, orderIndex: index + 1 } },
      data: { text: step.text, assignedDate: step.assignedDate, completedAt: null, version: { increment: 1 } }
    });
    await tx.weeklyPlan.update({ where: { id: source.id }, data: { outcome: "TRANSFERRED", outcomeResolvedAt: new Date(), version: { increment: 1 } } });
    await syncSearchDocument(tx, { sourceType: "WEEKLY_GOAL", sourceId: updated.id, localDate: target, text: goal });
    return updated;
  });
}

export async function replaceTodayQuote(client: PrismaClient, context: BusinessContext) {
  return client.$transaction(async (tx) => {
    const entry = await ensureTodayEntry(tx, context.businessDate);
    const activeCount = await tx.quote.count({ where: { id: { not: entry.quoteId ?? undefined }, OR: [{ userState: null }, { userState: { hiddenAt: null } }] } });
    if (activeCount === 0) throw new ApiError(409, "NO_OTHER_QUOTES", "Других доступных цитат пока нет");
    if (entry.quoteId) {
      await tx.quoteUserState.upsert({ where: { quoteId: entry.quoteId }, create: { quoteId: entry.quoteId }, update: {} });
      const state = await tx.quoteUserState.findUnique({ where: { quoteId: entry.quoteId } });
      await tx.quoteUserState.update({ where: { quoteId: entry.quoteId }, data: { hiddenAt: state?.hiddenAt ?? new Date(0) } });
      const chosen = await chooseAndAssignQuote(tx, entry, "REPLACEMENT");
      await tx.quoteUserState.update({ where: { quoteId: entry.quoteId }, data: { hiddenAt: state?.hiddenAt ?? null } });
      return chosen ? tx.dailyEntry.findUnique({ where: { id: entry.id }, include: { quote: { include: { userState: true } } } }) : null;
    }
    await chooseAndAssignQuote(tx, entry, "REPLACEMENT");
    return tx.dailyEntry.findUnique({ where: { id: entry.id }, include: { quote: { include: { userState: true } } } });
  });
}

export async function setQuoteFavorite(client: PrismaClient, quoteId: string, favorite: boolean) {
  if (!await client.quote.findUnique({ where: { id: quoteId } })) throw new ApiError(404, "QUOTE_NOT_FOUND", "Цитата не найдена");
  return client.quoteUserState.upsert({ where: { quoteId }, create: { quoteId, favoriteAt: favorite ? new Date() : null }, update: { favoriteAt: favorite ? new Date() : null } });
}

export async function hideQuote(client: PrismaClient, quoteId: string, context: BusinessContext) {
  return client.$transaction(async (tx) => {
    if (!await tx.quote.findUnique({ where: { id: quoteId } })) throw new ApiError(404, "QUOTE_NOT_FOUND", "Цитата не найдена");
    await tx.quoteUserState.upsert({ where: { quoteId }, create: { quoteId, hiddenAt: new Date() }, update: { hiddenAt: new Date() } });
    const entry = await tx.dailyEntry.findUnique({ where: { localDate: context.businessDate } });
    if (entry?.quoteId === quoteId) await chooseAndAssignQuote(tx, entry, "REPLACEMENT");
    return tx.quoteUserState.findUnique({ where: { quoteId } });
  });
}

export async function restoreQuote(client: PrismaClient, quoteId: string) {
  const state = await client.quoteUserState.findUnique({ where: { quoteId } });
  if (!state) throw new ApiError(404, "QUOTE_STATE_NOT_FOUND", "Скрытая цитата не найдена");
  return client.quoteUserState.update({ where: { quoteId }, data: { hiddenAt: null } });
}

export async function listHiddenQuotes(client: PrismaClient) {
  return client.quote.findMany({ where: { userState: { hiddenAt: { not: null } } }, include: { userState: true }, orderBy: { author: "asc" } });
}

export function isAllowedQuoteSource(sourceUrl: string) {
  try {
    const parsed = new URL(sourceUrl);
    return parsed.protocol === "https:" && parsed.hostname === "www.gutenberg.org" && !parsed.username && !parsed.password && !parsed.port;
  } catch { return false; }
}

export async function quoteSource(client: PrismaClient, quoteId: string) {
  const quote = await client.quote.findUnique({ where: { id: quoteId } });
  if (!quote) throw new ApiError(404, "QUOTE_NOT_FOUND", "Цитата не найдена");
  if (!isAllowedQuoteSource(quote.sourceUrl)) throw new ApiError(409, "SOURCE_NOT_ALLOWED", "Ссылка источника не прошла локальную проверку");
  return quote;
}
