import { describe, expect, it } from "vitest";
import { onboardingDraftSchema, scheduleMask } from "@/lib/onboarding";

describe("onboarding validation", () => {
  it("uses Sunday and no trackers by default", () => {
    const draft = onboardingDraftSchema.parse({});
    expect(draft.weeklyPlanningWeekday).toBe(7);
    expect(draft.trackers).toEqual({ plank: false, pushups: false, water: false });
  });

  it("converts weekdays to a stable bit mask", () => {
    expect(scheduleMask([1, 3, 7])).toBe(69);
    expect(scheduleMask([7, 1, 1])).toBe(65);
  });

  it("rejects invalid goals and oversized text", () => {
    expect(() => onboardingDraftSchema.parse({ weeklyPlanningWeekday: 0 })).toThrow();
    expect(() => onboardingDraftSchema.parse({ weeklyGoal: "x".repeat(501) })).toThrow();
  });
});
