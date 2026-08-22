import { describe, expect, it } from "vitest";
import { dueRules, isQuietMinute, notificationTexts, type ScheduleRule } from "@/lib/notification-scheduler";

const morning: ScheduleRule = { id: "morning", kind: "MORNING", enabled: true, weekdaysMask: 127, timeMinutes: 8 * 60, repeatAfter15: true };
const settings = { globallyPaused: false, quietHoursEnabled: false, quietStartMinutes: null, quietEndMinutes: null };
const clock = (iso: string) => ({ now: () => new Date(iso) });

describe("notification scheduler step 8", () => {
  it("keeps every rule disabled by default and selects only the exact future minute", () => {
    expect(dueRules([{ ...morning, enabled: false }], settings, clock("2026-08-21T08:00:00"))).toEqual([]);
    expect(dueRules([morning], settings, clock("2026-08-21T08:00:00"))).toHaveLength(1);
    expect(dueRules([morning], settings, clock("2026-08-21T08:01:00"))).toEqual([]);
  });
  it("creates exactly the configured morning repeat", () => {
    expect(dueRules([morning], settings, clock("2026-08-21T08:15:00"))).toHaveLength(1);
    expect(dueRules([morning], settings, clock("2026-08-21T08:16:00"))).toEqual([]);
    const late = { ...morning, weekdaysMask: 1 << 3, timeMinutes: 23 * 60 + 50 };
    expect(dueRules([late], settings, clock("2026-08-21T00:05:00"))).toHaveLength(1);
  });
  it("handles quiet hours through midnight without moving an event", () => {
    expect(isQuietMinute(23 * 60, 22 * 60, 7 * 60)).toBe(true);
    expect(isQuietMinute(6 * 60, 22 * 60, 7 * 60)).toBe(true);
    expect(isQuietMinute(12 * 60, 22 * 60, 7 * 60)).toBe(false);
    expect(dueRules([morning], { ...settings, quietHoursEnabled: true, quietStartMinutes: 22 * 60, quietEndMinutes: 9 * 60 }, clock("2026-08-21T08:00:00"))).toEqual([]);
  });
  it("calculates water intervals and respects global pause", () => {
    const water: ScheduleRule = { id: "water", kind: "WATER", enabled: true, weekdaysMask: 127, intervalMinutes: 90, windowStartMinutes: 9 * 60, windowEndMinutes: 21 * 60 };
    expect(dueRules([water], settings, clock("2026-08-21T10:30:00"))).toHaveLength(1);
    expect(dueRules([water], settings, clock("2026-08-21T10:31:00"))).toEqual([]);
    expect(dueRules([water], { ...settings, globallyPaused: true }, clock("2026-08-21T10:30:00"))).toEqual([]);
  });
  it("uses only fixed anonymous texts", () => {
    expect(Object.values(notificationTexts).join(" ")).not.toMatch(/задача пользователя|планка пользователя/i);
    expect(notificationTexts).toEqual({ MORNING: "Доброе утро. Выберите главное на сегодня", WEEKLY: "Можно спокойно наметить одну цель недели", HABIT: "Время для запланированной привычки", WATER: "Можно сделать паузу и выпить воды" });
  });
});
