import { describe, expect, it } from "vitest";
import { calculateSimpleHabitStats } from "@/lib/habit-service";

function habit(overrides: Record<string, unknown> = {}) {
  return {
    id: "habit-1", type: "SIMPLE", builtInKey: null, name: "Читать", normalizedName: "читать", status: "ACTIVE",
    startDate: "2026-08-10", statusChangedAt: new Date(), createdAt: new Date(), updatedAt: new Date(), version: 1,
    revisions: [{ id: "revision-1", habitId: "habit-1", effectiveFromDate: "2026-08-10", effectiveToDate: null, scheduleMask: 37, goalValue: 1, unit: "CHECK", createdAt: new Date(), version: 1 }],
    exclusions: [], simpleLogs: [], ...overrides
  } as never;
}

describe("simple habit statistics", () => {
  it("does not count an unfinished today as a miss and rounds half-up to one decimal", () => {
    const stats = calculateSimpleHabitStats(habit({ simpleLogs: [{ id: "l1", habitId: "habit-1", localDate: "2026-08-10", checkedAt: new Date(), isExtra: false, createdAt: new Date(), updatedAt: new Date(), version: 1 }] }), "2026-08-15");
    expect(stats).toMatchObject({ percentage: 50, completedScheduledDays: 1, elapsedScheduledDays: 2, currentStreak: 0, bestStreak: 1 });
    expect(stats.calendar.at(-1)).toEqual({ date: "2026-08-15", state: "IN_PROGRESS" });
  });

  it("counts completed today but keeps an earlier scheduled miss in the series", () => {
    const logs = ["2026-08-10", "2026-08-15"].map((localDate, index) => ({ id: `l${index}`, habitId: "habit-1", localDate, checkedAt: new Date(), isExtra: false, createdAt: new Date(), updatedAt: new Date(), version: 1 }));
    expect(calculateSimpleHabitStats(habit({ simpleLogs: logs }), "2026-08-15")).toMatchObject({ percentage: 66.7, currentStreak: 1, bestStreak: 1 });
  });

  it("excludes pauses and extra rest-day completions from percentage and streak", () => {
    const logs = [
      { id: "l1", habitId: "habit-1", localDate: "2026-08-10", checkedAt: new Date(), isExtra: false, createdAt: new Date(), updatedAt: new Date(), version: 1 },
      { id: "l2", habitId: "habit-1", localDate: "2026-08-11", checkedAt: new Date(), isExtra: true, createdAt: new Date(), updatedAt: new Date(), version: 1 }
    ];
    const exclusions = [{ id: "e1", habitId: "habit-1", kind: "PAUSE", startDate: "2026-08-12", endDate: "2026-08-12", createdAt: new Date(), endedAt: new Date() }];
    expect(calculateSimpleHabitStats(habit({ simpleLogs: logs, exclusions }), "2026-08-15")).toMatchObject({ percentage: 100, elapsedScheduledDays: 1, currentStreak: 1, extraCompletions: 1 });
  });

  it("uses the historical revision that applied on each date", () => {
    const revisions = [
      { id: "r1", habitId: "habit-1", effectiveFromDate: "2026-08-10", effectiveToDate: "2026-08-13", scheduleMask: 1, goalValue: 1, unit: "CHECK", createdAt: new Date(), version: 1 },
      { id: "r2", habitId: "habit-1", effectiveFromDate: "2026-08-14", effectiveToDate: null, scheduleMask: 32, goalValue: 1, unit: "CHECK", createdAt: new Date(), version: 1 }
    ];
    const logs = ["2026-08-10", "2026-08-15"].map((localDate, index) => ({ id: `l${index}`, habitId: "habit-1", localDate, checkedAt: new Date(), isExtra: false, createdAt: new Date(), updatedAt: new Date(), version: 1 }));
    expect(calculateSimpleHabitStats(habit({ revisions, simpleLogs: logs }), "2026-08-15")).toMatchObject({ percentage: 100, currentStreak: 2, bestStreak: 2 });
  });
});
