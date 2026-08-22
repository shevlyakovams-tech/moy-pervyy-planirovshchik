export type Clock = { now(): number };

export type PlankTimerSnapshot =
  | { phase: "IDLE"; countdown: null; elapsedSeconds: 0; reason?: "LIMIT" | "CLOCK" | "DAY_CHANGED" }
  | { phase: "COUNTDOWN"; countdown: 1 | 2 | 3; elapsedSeconds: 0 }
  | { phase: "RUNNING"; countdown: null; elapsedSeconds: number };

export type CompletedPlankAttempt = {
  startedAt: string;
  stoppedAt: string;
  durationSeconds: number;
};

const COUNTDOWN_MS = 3_000;
const LIMIT_SECONDS = 600;

export class PlankTimerEngine {
  private countdownStartedAt: number | null = null;
  private runningStartedAt: number | null = null;
  private lastObservedAt: number | null = null;
  private startedLocalDate: string | null = null;
  private goalSignalPlayed = false;
  private resetReason: "LIMIT" | "CLOCK" | "DAY_CHANGED" | undefined;

  constructor(
    private readonly clock: Clock,
    private readonly goalSeconds: number,
    private readonly savedTodaySeconds: number,
    private readonly signalEnabled: boolean,
    private readonly onGoalSignal: () => void
  ) {}

  start() {
    const now = this.clock.now();
    this.countdownStartedAt = now;
    this.runningStartedAt = null;
    this.lastObservedAt = now;
    this.startedLocalDate = localDateKey(now);
    this.goalSignalPlayed = this.savedTodaySeconds >= this.goalSeconds;
    this.resetReason = undefined;
    return this.snapshot();
  }

  cancel() {
    this.clear();
    return this.snapshot();
  }

  tick() {
    if (this.countdownStartedAt === null) return this.snapshot();
    const now = this.clock.now();
    if (this.startedLocalDate !== localDateKey(now)) {
      this.clear("DAY_CHANGED");
      return this.snapshot();
    }
    if (this.lastObservedAt !== null && now < this.lastObservedAt) {
      this.clear("CLOCK");
      return this.snapshot();
    }
    this.lastObservedAt = now;
    if (this.runningStartedAt === null) {
      const countdownElapsed = now - this.countdownStartedAt;
      if (countdownElapsed < COUNTDOWN_MS) return this.snapshot();
      this.runningStartedAt = this.countdownStartedAt + COUNTDOWN_MS;
    }
    const elapsedSeconds = Math.floor((now - this.runningStartedAt) / 1_000);
    if (elapsedSeconds >= LIMIT_SECONDS) {
      this.clear("LIMIT");
      return this.snapshot();
    }
    if (!this.goalSignalPlayed && this.savedTodaySeconds < this.goalSeconds && this.savedTodaySeconds + elapsedSeconds >= this.goalSeconds) {
      this.goalSignalPlayed = true;
      if (this.signalEnabled) this.onGoalSignal();
    }
    return this.snapshot();
  }

  stop(): CompletedPlankAttempt | null {
    const state = this.tick();
    if (state.phase !== "RUNNING" || state.elapsedSeconds < 1 || state.elapsedSeconds >= LIMIT_SECONDS || this.runningStartedAt === null) return null;
    const stoppedAt = this.lastObservedAt ?? this.clock.now();
    const result = {
      startedAt: new Date(this.runningStartedAt).toISOString(),
      stoppedAt: new Date(stoppedAt).toISOString(),
      durationSeconds: state.elapsedSeconds
    };
    this.clear();
    return result;
  }

  snapshot(): PlankTimerSnapshot {
    if (this.countdownStartedAt === null) return { phase: "IDLE", countdown: null, elapsedSeconds: 0, ...(this.resetReason ? { reason: this.resetReason } : {}) };
    const now = this.clock.now();
    if (this.runningStartedAt === null) {
      const remaining = Math.max(1, Math.ceil((COUNTDOWN_MS - (now - this.countdownStartedAt)) / 1_000)) as 1 | 2 | 3;
      return { phase: "COUNTDOWN", countdown: remaining, elapsedSeconds: 0 };
    }
    return { phase: "RUNNING", countdown: null, elapsedSeconds: Math.max(0, Math.floor((now - this.runningStartedAt) / 1_000)) };
  }

  get active() {
    return this.countdownStartedAt !== null;
  }

  private clear(reason?: "LIMIT" | "CLOCK" | "DAY_CHANGED") {
    this.countdownStartedAt = null;
    this.runningStartedAt = null;
    this.lastObservedAt = null;
    this.startedLocalDate = null;
    this.goalSignalPlayed = false;
    this.resetReason = reason;
  }
}

function localDateKey(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

export function formatPlankDuration(seconds: number) {
  if (seconds < 60) return `${seconds} сек`;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
