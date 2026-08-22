import type { NextRequest } from "next/server";
import { ApiError, dataResponse, errorResponse } from "@/lib/api-response";
import { parseLocalDate } from "@/lib/date-service";
import {
  changeTaskStatus, completeMorning, createTask, deleteTask, getBusinessContext, getDay, getWeek,
  hideQuote, listHiddenQuotes, patchDay, patchWeek, quoteSource, reorderTasks, replaceTodayQuote,
  resolveWeek, restoreQuote, saveReflection, saveWeekStep, setActionCompleted, setQuoteFavorite,
  setWeekStepCompleted, transferTask, transferWeek, unresolvedWeeks, updateTask
} from "@/lib/planner-service";
import { configureSqlite, prisma } from "@/lib/prisma";
import { validateLocalMutation } from "@/lib/security";
import { getArchiveMonth, getProgress, listArchiveWeeks, listFavoriteQuotes, searchHistory } from "@/lib/history-service";
import {
  changeHabitLifecycle, createPlankHabit, createPlankSession, createPushupHabit, createPushupSet, createSimpleHabit, createWaterEntry, createWaterHabit, deleteHabit,
  deletePlankSession, deletePushupSet, deleteWaterEntry, getHabit, getPlankSoundSetting, listHabits, removeSimpleHabitCheck,
  setPlankSoundSetting, setSimpleHabitCheck, setWeeklyHabitFocus, undoLastWaterEntry, updateHabit, updatePlankSession, updatePushupSet, updateWaterEntry
} from "@/lib/habit-service";
import { getSettings, patchSettings, resetAllData, saveNotificationRule } from "@/lib/settings-service";
import { actOnNotification, collectDueNotifications, collectDueSnoozes } from "@/lib/notifications-service";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ segments: string[] }> };

function apiDate(value: string) {
  const parsed = parseLocalDate(value);
  if (!parsed) throw new ApiError(422, "INVALID_DATE", "Укажите корректную календарную дату");
  return value;
}

async function route(request: NextRequest, context: RouteContext) {
  await configureSqlite();
  const { segments } = await context.params;
  const method = request.method;
  if (method !== "GET") {
    const security = validateLocalMutation(request);
    if (!security.ok) throw new ApiError(security.status, "FORBIDDEN", security.message);
  }
  const business = await getBusinessContext(prisma);
  let body: Record<string, unknown> = {};
  if (method !== "GET" && method !== "DELETE") {
    const rawBody = await request.text();
    if (rawBody) {
      try { body = JSON.parse(rawBody) as Record<string, unknown>; }
      catch { throw new ApiError(400, "INVALID_JSON", "Некорректный формат запроса"); }
    }
  }

  if (segments[0] === "days" && segments[1]) {
    const selectedDate = apiDate(segments[1]);
    if (segments.length === 2 && method === "GET") return dataResponse(await getDay(prisma, selectedDate, business));
    if (segments.length === 2 && method === "PATCH") return dataResponse(await patchDay(prisma, selectedDate, business, body));
    if (segments[2] === "reflections" && segments[3] && method === "PUT") return dataResponse(await saveReflection(prisma, selectedDate, segments[3], business, body));
    if (segments[2] === "complete-morning" && method === "POST") return dataResponse(await completeMorning(prisma, selectedDate, business));
    if (segments[2] === "self-action-status" && method === "PATCH") return dataResponse(await setActionCompleted(prisma, selectedDate, "self", business, body.completed === true));
    if (segments[2] === "close-action-status" && method === "PATCH") return dataResponse(await setActionCompleted(prisma, selectedDate, "close", business, body.completed === true));
  }

  if (segments[0] === "tasks") {
    if (segments.length === 1 && method === "GET") {
      const selectedDate = request.nextUrl.searchParams.get("date");
      if (!selectedDate) throw new ApiError(422, "INVALID_DATE", "Укажите дату");
      const day = await getDay(prisma, apiDate(selectedDate), business);
      return dataResponse(day.tasks);
    }
    if (segments.length === 1 && method === "POST") return dataResponse(await createTask(prisma, business, body), 201);
    if (segments[1] === "unresolved" && method === "GET") return dataResponse(await prisma.task.findMany({ where: { localDate: { lt: business.businessDate }, status: "PLANNED" }, orderBy: [{ localDate: "desc" }, { sortOrder: "asc" }] }));
    if (segments[1] === "reorder" && method === "POST") {
      if (typeof body.localDate !== "string" || !Array.isArray(body.ids) || body.ids.some((id) => typeof id !== "string")) throw new ApiError(422, "INVALID_ORDER", "Проверьте порядок задач");
      return dataResponse(await reorderTasks(prisma, body.localDate, body.ids as string[], business));
    }
    const id = segments[1];
    if (id && segments.length === 2 && method === "PATCH") return dataResponse(await updateTask(prisma, id, business, body));
    if (id && segments.length === 2 && method === "DELETE") { await deleteTask(prisma, id, business); return new Response(null, { status: 204 }); }
    if (id && segments[2] === "complete" && method === "POST") return dataResponse(await changeTaskStatus(prisma, id, "complete", business));
    if (id && segments[2] === "reopen" && method === "POST") return dataResponse(await changeTaskStatus(prisma, id, "reopen", business));
    if (id && segments[2] === "let-go" && method === "POST") return dataResponse(await changeTaskStatus(prisma, id, "let-go", business));
    if (id && segments[2] === "complete-yesterday" && method === "POST") return dataResponse(await changeTaskStatus(prisma, id, "complete-yesterday", business));
    if (id && segments[2] === "transfer" && method === "POST") {
      if (typeof body.targetDate !== "string") throw new ApiError(422, "INVALID_TARGET_DATE", "Выберите дату переноса");
      return dataResponse(await transferTask(prisma, id, apiDate(body.targetDate), business));
    }
  }

  if (segments[0] === "weeks") {
    if (segments[1] === "unresolved" && method === "GET") return dataResponse(await unresolvedWeeks(prisma, business));
    const weekStart = segments[1] ? apiDate(segments[1]) : null;
    if (weekStart && segments.length === 2 && method === "GET") return dataResponse(await getWeek(prisma, weekStart, business));
    if (weekStart && segments.length === 2 && method === "PATCH") return dataResponse(await patchWeek(prisma, weekStart, business, body));
    if (weekStart && segments[2] === "habit-focus" && method === "PUT") {
      if (!Array.isArray(body.habitIds) || body.habitIds.some((id) => typeof id !== "string")) throw new ApiError(422, "INVALID_HABIT_FOCUS", "Проверьте выбранные привычки");
      return dataResponse(await setWeeklyHabitFocus(prisma, weekStart, body.habitIds as string[], business));
    }
    if (weekStart && segments[2] === "steps" && segments[3]) {
      const orderIndex = Number(segments[3]);
      if (segments.length === 4 && method === "PUT") return dataResponse(await saveWeekStep(prisma, weekStart, orderIndex, business, body));
      if (segments[4] === "status" && method === "PATCH") return dataResponse(await setWeekStepCompleted(prisma, weekStart, orderIndex, business, body.completed === true));
    }
    if (weekStart && segments[2] === "resolve" && method === "POST") {
      if (typeof body.outcome !== "string") throw new ApiError(422, "INVALID_OUTCOME", "Выберите результат");
      return dataResponse(await resolveWeek(prisma, weekStart, business, body.outcome));
    }
    if (weekStart && segments[2] === "transfer" && method === "POST") return dataResponse(await transferWeek(prisma, weekStart, business, body));
  }

  if (segments[0] === "habits") {
    if (segments.length === 1 && method === "GET") return dataResponse(await listHabits(prisma, business));
    if (segments[1] === "simple" && segments.length === 2 && method === "POST") return dataResponse(await createSimpleHabit(prisma, business, body), 201);
    if (segments[1] === "plank" && segments.length === 2 && method === "POST") return dataResponse(await createPlankHabit(prisma, business, body), 201);
    if (segments[1] === "pushups" && segments.length === 2 && method === "POST") return dataResponse(await createPushupHabit(prisma, business, body), 201);
    if (segments[1] === "water" && segments.length === 2 && method === "POST") return dataResponse(await createWaterHabit(prisma, business, body), 201);
    const id = segments[1];
    if (id && segments.length === 2 && method === "GET") return dataResponse(await getHabit(prisma, id, business));
    if (id && segments.length === 2 && method === "PATCH") return dataResponse(await updateHabit(prisma, id, business, body));
    if (id && segments.length === 2 && method === "DELETE") { await deleteHabit(prisma, id); return new Response(null, { status: 204 }); }
    if (id && ["pause", "resume", "archive", "restore"].includes(segments[2] ?? "") && method === "POST") {
      return dataResponse(await changeHabitLifecycle(prisma, id, segments[2] as "pause" | "resume" | "archive" | "restore", business, typeof body.version === "number" ? body.version : undefined));
    }
    if (id && segments[2] === "simple-check" && method === "POST") return dataResponse(await setSimpleHabitCheck(prisma, id, business, false));
    if (id && segments[2] === "simple-check" && segments[3] === "today" && method === "DELETE") return dataResponse(await removeSimpleHabitCheck(prisma, id, business));
    if (id && segments[2] === "extra" && segments[3] === "today" && method === "POST") return dataResponse(await setSimpleHabitCheck(prisma, id, business, true));
    if (id && segments[2] === "plank-sessions" && method === "POST") return dataResponse(await createPlankSession(prisma, id, business, body), 201);
    if (id && segments[2] === "pushup-sets" && method === "POST") return dataResponse(await createPushupSet(prisma, id, business, body), 201);
    if (id && segments[2] === "water-entries" && segments[3] === "undo-last" && method === "POST") return dataResponse(await undoLastWaterEntry(prisma, id, business));
    if (id && segments[2] === "water-entries" && segments.length === 3 && method === "POST") return dataResponse(await createWaterEntry(prisma, id, business, body), 201);
  }

  if (segments[0] === "plank-sessions" && segments[1]) {
    if (method === "PATCH") return dataResponse(await updatePlankSession(prisma, segments[1], business, body));
    if (method === "DELETE") return dataResponse(await deletePlankSession(prisma, segments[1], business));
  }

  if (segments[0] === "pushup-sets" && segments[1]) {
    if (method === "PATCH") return dataResponse(await updatePushupSet(prisma, segments[1], business, body));
    if (method === "DELETE") return dataResponse(await deletePushupSet(prisma, segments[1], business));
  }

  if (segments[0] === "water-entries" && segments[1]) {
    if (method === "PATCH") return dataResponse(await updateWaterEntry(prisma, segments[1], business, body));
    if (method === "DELETE") return dataResponse(await deleteWaterEntry(prisma, segments[1], business));
  }

  if (segments[0] === "settings" && segments[1] === "plank-sound") {
    if (method === "GET") return dataResponse(await getPlankSoundSetting(prisma));
    if (method === "PATCH") {
      if (typeof body.enabled !== "boolean") throw new ApiError(422, "INVALID_SOUND_SETTING", "Выберите, включён ли звук цели");
      return dataResponse(await setPlankSoundSetting(prisma, body.enabled, body.version));
    }
  }

  if (segments[0] === "settings") {
    if (segments.length === 1 && method === "GET") return dataResponse(await getSettings(prisma));
    if (segments.length === 1 && method === "PATCH") return dataResponse(await patchSettings(prisma, body));
    if (segments[1] === "notification-rules" && method === "PUT") return dataResponse(await saveNotificationRule(prisma, body));
    if (segments[1] === "reset" && method === "POST") return dataResponse(await resetAllData(prisma, body.phrase, process.env.UTRENNIY_TEST_RESET_FAILURE === "1"));
  }

  if (segments[0] === "system" && segments[1] === "notifications") {
    if (segments[2] === "due" && method === "GET") {
      const at = new Date(request.nextUrl.searchParams.get("at") ?? Date.now());
      if (Number.isNaN(at.getTime())) throw new ApiError(422, "INVALID_TIME", "Не удалось определить время уведомления");
      return dataResponse([...(await collectDueNotifications(prisma, at)), ...(await collectDueSnoozes(prisma, at))]);
    }
    if (segments[2] === "actions" && segments[3] && method === "POST") {
      if (!["OPEN", "SNOOZE", "CLOSE"].includes(String(body.action))) throw new ApiError(422, "INVALID_ACTION", "Неизвестное действие уведомления");
      return dataResponse(await actOnNotification(prisma, segments[3], body.action as "OPEN" | "SNOOZE" | "CLOSE"));
    }
  }

  if (segments[0] === "progress" && method === "GET") return dataResponse(await getProgress(prisma, business, request.nextUrl.searchParams.get("range") ?? "week"));

  if (segments[0] === "archive" && method === "GET") {
    if (segments[1] === "weeks") return dataResponse(await listArchiveWeeks(prisma));
    if (segments[1] === "favorites") return dataResponse(await listFavoriteQuotes(prisma));
    if (segments.length === 1) return dataResponse(await getArchiveMonth(prisma, request.nextUrl.searchParams.get("month") ?? business.businessDate.slice(0, 7), business));
  }

  if (segments[0] === "search" && method === "GET") return dataResponse(await searchHistory(prisma, business, {
    q: request.nextUrl.searchParams.get("q") ?? "", period: request.nextUrl.searchParams.get("period") ?? "all",
    from: request.nextUrl.searchParams.get("from"), to: request.nextUrl.searchParams.get("to"),
    category: request.nextUrl.searchParams.get("category"), type: request.nextUrl.searchParams.get("type")
  }));

  if (segments[0] === "quotes") {
    if (segments[1] === "today" && segments.length === 2 && method === "GET") {
      const day = await getDay(prisma, business.businessDate, business);
      return dataResponse(day.entry?.quote ?? null);
    }
    if (segments[1] === "today" && segments[2] === "replace" && method === "POST") return dataResponse(await replaceTodayQuote(prisma, business));
    if (segments[1] === "favorites" && method === "GET") return dataResponse(await prisma.quote.findMany({ where: { userState: { favoriteAt: { not: null } } }, include: { userState: true }, orderBy: { author: "asc" } }));
    if (segments[1] === "hidden" && method === "GET") return dataResponse(await listHiddenQuotes(prisma));
    const quoteId = segments[1];
    if (quoteId && segments[2] === "source" && method === "GET") return dataResponse(await quoteSource(prisma, quoteId));
    if (quoteId && segments[2] === "favorite" && method === "POST") return dataResponse(await setQuoteFavorite(prisma, quoteId, true));
    if (quoteId && segments[2] === "favorite" && method === "DELETE") return dataResponse(await setQuoteFavorite(prisma, quoteId, false));
    if (quoteId && segments[2] === "hide" && method === "POST") return dataResponse(await hideQuote(prisma, quoteId, business));
    if (quoteId && segments[2] === "hide" && method === "DELETE") return dataResponse(await restoreQuote(prisma, quoteId));
  }

  throw new ApiError(404, "ROUTE_NOT_FOUND", "Запрошенный адрес не найден");
}

export async function GET(request: NextRequest, context: RouteContext) { try { return await route(request, context); } catch (error) { return errorResponse(error); } }
export async function POST(request: NextRequest, context: RouteContext) { try { return await route(request, context); } catch (error) { return errorResponse(error); } }
export async function PATCH(request: NextRequest, context: RouteContext) { try { return await route(request, context); } catch (error) { return errorResponse(error); } }
export async function PUT(request: NextRequest, context: RouteContext) { try { return await route(request, context); } catch (error) { return errorResponse(error); } }
export async function DELETE(request: NextRequest, context: RouteContext) { try { return await route(request, context); } catch (error) { return errorResponse(error); } }
