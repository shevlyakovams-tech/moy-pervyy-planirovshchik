import { describe, expect, it, vi } from "vitest";
import { formatPlankDuration, PlankTimerEngine } from "@/lib/plank-timer";

function setup(goal = 60, saved = 0, signalEnabled = true) {
  let now = Date.parse("2026-08-21T06:00:00.000Z");
  const signal = vi.fn();
  const engine = new PlankTimerEngine({ now: () => now }, goal, saved, signalEnabled, signal);
  return { engine, signal, advance: (milliseconds: number) => { now += milliseconds; return engine.tick(); }, setNow: (value: number) => { now = value; } };
}

describe("plank timer step 4", () => {
  it("keeps the fixed 3-2-1 countdown outside the result and saves full seconds only", () => {
    const timer = setup();
    expect(timer.engine.start()).toMatchObject({ phase: "COUNTDOWN", countdown: 3, elapsedSeconds: 0 });
    expect(timer.advance(1_000)).toMatchObject({ phase: "COUNTDOWN", countdown: 2, elapsedSeconds: 0 });
    expect(timer.advance(1_000)).toMatchObject({ phase: "COUNTDOWN", countdown: 1, elapsedSeconds: 0 });
    expect(timer.advance(1_000)).toMatchObject({ phase: "RUNNING", elapsedSeconds: 0 });
    expect(timer.advance(12_999)).toMatchObject({ phase: "RUNNING", elapsedSeconds: 12 });
    expect(timer.engine.stop()).toMatchObject({ durationSeconds: 12, startedAt: "2026-08-21T06:00:03.000Z", stoppedAt: "2026-08-21T06:00:15.999Z" });
  });

  it("has no pause, saves 599 seconds and resets exactly at 600 without a result", () => {
    const timer = setup();
    timer.engine.start(); timer.advance(3_000); timer.advance(599_000);
    expect(timer.engine.snapshot()).toMatchObject({ phase: "RUNNING", elapsedSeconds: 599 });
    expect(timer.engine.stop()?.durationSeconds).toBe(599);
    const expired = setup();
    expired.engine.start(); expired.advance(3_000);
    expect(expired.advance(600_000)).toEqual({ phase: "IDLE", countdown: null, elapsedSeconds: 0, reason: "LIMIT" });
    expect(expired.engine.stop()).toBeNull();
    expect("pause" in expired.engine).toBe(false);
  });

  it("signals once when the goal is crossed, keeps running, and respects the sound setting", () => {
    const timer = setup(10, 4, true);
    timer.engine.start(); timer.advance(3_000); timer.advance(6_000); timer.advance(20_000);
    expect(timer.signal).toHaveBeenCalledTimes(1);
    expect(timer.engine.snapshot()).toMatchObject({ phase: "RUNNING", elapsedSeconds: 26 });
    const muted = setup(10, 4, false);
    muted.engine.start(); muted.advance(3_000); muted.advance(10_000);
    expect(muted.signal).not.toHaveBeenCalled();
    const alreadyReached = setup(10, 10, true);
    alreadyReached.engine.start(); alreadyReached.advance(3_000); alreadyReached.advance(10_000);
    expect(alreadyReached.signal).not.toHaveBeenCalled();
  });

  it("cancels without a result and rejects a backward clock jump", () => {
    const timer = setup();
    timer.engine.start(); timer.advance(3_000); timer.advance(5_000);
    expect(timer.engine.cancel()).toMatchObject({ phase: "IDLE" });
    expect(timer.engine.stop()).toBeNull();
    const shifted = setup();
    shifted.engine.start(); shifted.advance(3_000); shifted.advance(2_000);
    shifted.setNow(Date.parse("2026-08-21T05:00:00.000Z"));
    expect(shifted.engine.tick()).toMatchObject({ phase: "IDLE", reason: "CLOCK" });
  });

  it("drops an unfinished attempt when local midnight arrives", () => {
    let now = new Date(2026, 7, 21, 23, 59, 55).getTime();
    const engine = new PlankTimerEngine({ now: () => now }, 60, 0, true, vi.fn());
    engine.start();
    now += 3_000;
    expect(engine.tick().phase).toBe("RUNNING");
    now += 2_000;
    expect(engine.tick()).toMatchObject({ phase: "IDLE", reason: "DAY_CHANGED" });
    expect(engine.stop()).toBeNull();
  });

  it("formats seconds as specified", () => {
    expect(formatPlankDuration(59)).toBe("59 сек");
    expect(formatPlankDuration(60)).toBe("1:00");
    expect(formatPlankDuration(125)).toBe("2:05");
  });
});
