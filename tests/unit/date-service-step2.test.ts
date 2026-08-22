import { describe, expect, it } from "vitest";
import {
  addLocalDays, dateAccess, endOfLocalWeek, isDateInWeek, localDate, parseLocalDate,
  resolveObservedBusinessDate, startOfLocalWeek
} from "@/lib/date-service";

describe("business dates and weeks", () => {
  it("uses local calendar components and survives month/year boundaries", () => {
    expect(localDate(new Date(2026, 0, 1, 0, 0, 1))).toBe("2026-01-01");
    expect(addLocalDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addLocalDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(parseLocalDate("2026-02-29")).toBeNull();
  });

  it("always uses Monday through Sunday for the week", () => {
    expect(startOfLocalWeek("2026-08-15")).toBe("2026-08-10");
    expect(endOfLocalWeek("2026-08-15")).toBe("2026-08-16");
    expect(isDateInWeek("2026-08-16", "2026-08-10")).toBe(true);
    expect(isDateInWeek("2026-08-17", "2026-08-10")).toBe(false);
  });

  it("classifies past, today and future consistently", () => {
    expect(dateAccess("2026-08-14", "2026-08-15")).toBe("past");
    expect(dateAccess("2026-08-15", "2026-08-15")).toBe("today");
    expect(dateAccess("2026-08-16", "2026-08-15")).toBe("future");
  });

  it("never unlocks history when system clocks move backwards", () => {
    expect(resolveObservedBusinessDate("2026-08-14", "2026-08-15")).toEqual({ businessDate: "2026-08-15", clockWarning: true });
    expect(resolveObservedBusinessDate("2026-08-16", "2026-08-15")).toEqual({ businessDate: "2026-08-16", clockWarning: false });
  });
});
