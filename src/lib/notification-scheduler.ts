export type Clock = { now(): Date };
export type NotificationKind = "MORNING" | "WEEKLY" | "HABIT" | "WATER";
export type ScheduleRule = {
  id: string;
  kind: NotificationKind;
  habitId?: string | null;
  enabled: boolean;
  weekdaysMask?: number | null;
  timeMinutes?: number | null;
  repeatAfter15?: boolean;
  intervalMinutes?: number | null;
  windowStartMinutes?: number | null;
  windowEndMinutes?: number | null;
};

export type ScheduleSettings = {
  globallyPaused: boolean;
  quietHoursEnabled: boolean;
  quietStartMinutes: number | null;
  quietEndMinutes: number | null;
};

export function weekdayBit(date: Date): number {
  return 1 << ((date.getDay() + 6) % 7);
}

export function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

export function isQuietMinute(minute: number, start: number | null, end: number | null): boolean {
  if (start === null || end === null || start === end) return false;
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

export function ruleMatchesMinute(rule: ScheduleRule, date: Date): boolean {
  if (!rule.enabled) return false;
  const minute = minutesOfDay(date);
  if (rule.kind === "WATER") {
    const start = rule.windowStartMinutes;
    const end = rule.windowEndMinutes;
    const interval = rule.intervalMinutes;
    return ((rule.weekdaysMask ?? 127) & weekdayBit(date)) !== 0 && start != null && end != null && interval != null && interval > 0 && minute >= start && minute <= end && (minute - start) % interval === 0;
  }
  if (rule.timeMinutes == null) return false;
  if (minute === rule.timeMinutes && ((rule.weekdaysMask ?? 127) & weekdayBit(date)) !== 0) return true;
  if (rule.kind !== "MORNING" || rule.repeatAfter15 !== true || minute !== (rule.timeMinutes + 15) % 1440) return false;
  const sourceDate = new Date(date);
  if (rule.timeMinutes + 15 >= 1440) sourceDate.setDate(sourceDate.getDate() - 1);
  return ((rule.weekdaysMask ?? 127) & weekdayBit(sourceDate)) !== 0;
}

export function dueRules(rules: ScheduleRule[], settings: ScheduleSettings, clock: Clock): ScheduleRule[] {
  const now = clock.now();
  if (settings.globallyPaused) return [];
  if (settings.quietHoursEnabled && isQuietMinute(minutesOfDay(now), settings.quietStartMinutes, settings.quietEndMinutes)) return [];
  return rules.filter((rule) => ruleMatchesMinute(rule, now));
}

export const notificationTexts: Record<NotificationKind, string> = {
  MORNING: "Доброе утро. Выберите главное на сегодня",
  WEEKLY: "Можно спокойно наметить одну цель недели",
  HABIT: "Время для запланированной привычки",
  WATER: "Можно сделать паузу и выпить воды"
};
