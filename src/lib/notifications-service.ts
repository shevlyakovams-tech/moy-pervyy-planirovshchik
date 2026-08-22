import type { PrismaClient } from "@prisma/client";
import { dueRules, notificationTexts, minutesOfDay, type NotificationKind } from "@/lib/notification-scheduler";

function dateKey(date: Date) {
  const year = date.getFullYear(); const month = String(date.getMonth() + 1).padStart(2, "0"); const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function habitGoalReached(client: PrismaClient, habitId: string, localDate: string) {
  const habit = await client.habit.findUnique({ where: { id: habitId }, include: { revisions: { where: { effectiveFromDate: { lte: localDate }, OR: [{ effectiveToDate: null }, { effectiveToDate: { gte: localDate } }] } }, exclusions: { where: { startDate: { lte: localDate }, OR: [{ endDate: null }, { endDate: { gte: localDate } }] } } } });
  if (!habit || habit.status !== "ACTIVE" || habit.exclusions.length > 0) return true;
  const revision = habit.revisions[0];
  if (!revision) return true;
  if (habit.type === "SIMPLE") return Boolean(await client.simpleHabitLog.findUnique({ where: { habitId_localDate: { habitId, localDate } } }));
  if (habit.type === "PLANK") return (await client.plankSession.aggregate({ where: { habitId, localDate }, _sum: { durationSeconds: true } }))._sum.durationSeconds! >= revision.goalValue;
  if (habit.type === "PUSHUPS") return (await client.pushupSet.aggregate({ where: { habitId, localDate }, _sum: { repetitions: true } }))._sum.repetitions! >= revision.goalValue;
  return (await client.waterEntry.aggregate({ where: { habitId, localDate }, _sum: { milliliters: true } }))._sum.milliliters! >= revision.goalValue;
}

export async function collectDueNotifications(client: PrismaClient, at: Date) {
  const settings = await client.appSettings.upsert({ where: { id: "singleton" }, create: { id: "singleton" }, update: {} });
  const rules = await client.notificationRule.findMany();
  const matches = dueRules(rules.map((rule) => ({ ...rule, kind: rule.kind as NotificationKind })), {
    globallyPaused: settings.notificationsGloballyPaused,
    quietHoursEnabled: settings.quietHoursEnabled,
    quietStartMinutes: settings.quietStartMinutes,
    quietEndMinutes: settings.quietEndMinutes
  }, { now: () => at });
  const localDate = dateKey(at);
  const result: Array<{ occurrenceId: string; kind: NotificationKind; text: string; canSnooze: boolean }> = [];
  for (const rule of matches) {
    let suppressedReason = "NONE";
    if (rule.kind === "MORNING" && await client.dailyEntry.findFirst({ where: { localDate, morningCompletedAt: { not: null } } })) suppressedReason = "GOAL_REACHED";
    if ((rule.kind === "HABIT" || rule.kind === "WATER") && (!rule.habitId || await habitGoalReached(client, rule.habitId, localDate))) suppressedReason = "GOAL_REACHED";
    const scheduledFor = new Date(at); scheduledFor.setSeconds(0, 0);
    const isRepeat = rule.kind === "MORNING" && rule.repeatAfter15 && rule.timeMinutes != null && minutesOfDay(at) === (rule.timeMinutes + 15) % 1440;
    const occurrenceKind = isRepeat ? "MORNING_REPEAT" : rule.kind;
    const existing = await client.notificationOccurrence.findUnique({ where: { notificationRuleId_scheduledFor_kind: { notificationRuleId: rule.id, scheduledFor, kind: occurrenceKind } } });
    if (existing) continue;
    const occurrence = await client.notificationOccurrence.create({ data: { notificationRuleId: rule.id, scheduledFor, kind: occurrenceKind, suppressedReason, deliveredAt: suppressedReason === "NONE" ? at : null } });
    if (suppressedReason === "NONE") result.push({ occurrenceId: occurrence.id, kind: rule.kind, text: notificationTexts[rule.kind], canSnooze: !isRepeat });
  }
  return result;
}

export async function actOnNotification(client: PrismaClient, occurrenceId: string, action: "OPEN" | "SNOOZE" | "CLOSE") {
  const occurrence = await client.notificationOccurrence.findUnique({ where: { id: occurrenceId }, include: { notificationRule: true } });
  if (!occurrence) return null;
  await client.notificationOccurrence.update({ where: { id: occurrenceId }, data: { action } });
  if (action !== "SNOOZE" || occurrence.snoozeOfOccurrenceId) return { action };
  const scheduledFor = new Date(Date.now() + 15 * 60_000); scheduledFor.setSeconds(0, 0);
  const snooze = await client.notificationOccurrence.create({ data: { notificationRuleId: occurrence.notificationRuleId, kind: `${occurrence.notificationRule.kind}_SNOOZE`, scheduledFor, snoozeOfOccurrenceId: occurrence.id } });
  return { action, snoozeAt: snooze.scheduledFor };
}

export async function collectDueSnoozes(client: PrismaClient, at: Date) {
  const start = new Date(at); start.setSeconds(0, 0); const end = new Date(start.getTime() + 60_000);
  const settings = await client.appSettings.findUnique({ where: { id: "singleton" } });
  if (!settings || settings.notificationsGloballyPaused) return [];
  const rows = await client.notificationOccurrence.findMany({ where: { scheduledFor: { gte: start, lt: end }, kind: { endsWith: "_SNOOZE" }, deliveredAt: null, action: "NONE" }, include: { notificationRule: true } });
  const result = [];
  for (const row of rows) {
    const kind = row.notificationRule.kind as NotificationKind;
    await client.notificationOccurrence.update({ where: { id: row.id }, data: { deliveredAt: at } });
    result.push({ occurrenceId: row.id, kind, text: notificationTexts[kind], canSnooze: false });
  }
  return result;
}
