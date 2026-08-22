"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest, InlineMessage } from "@/components/planner-ui";
import { formatRussianDate } from "@/lib/date-service";
import { formatPlankDuration, PlankTimerEngine, type PlankTimerSnapshot } from "@/lib/plank-timer";

type Status = "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
type CalendarState = "NOT_STARTED" | "EXCLUDED" | "EXTRA" | "COMPLETED" | "IN_PROGRESS" | "MISSED" | "REST";
const calendarLabels: Record<CalendarState, string> = { NOT_STARTED: "Ещё не началась", EXCLUDED: "Пауза или архив", EXTRA: "Выполнено дополнительно", COMPLETED: "Цель выполнена", IN_PROGRESS: "Сегодня в процессе", MISSED: "Цель не выполнена", REST: "День отдыха" };

export type PlankHabitView = {
  id: string;
  type: "PLANK";
  name: "Планка";
  status: Status;
  startDate: string;
  version: number;
  currentRevision: { scheduleMask: number; goalValue: number; effectiveFromDate: string } | null;
  today: { scheduled: boolean; excluded: boolean };
  hasHistory: boolean;
  stats: {
    percentage: number | null;
    completedScheduledDays: number;
    elapsedScheduledDays: number;
    currentStreak: number;
    bestStreak: number;
    todaySessions: Array<{ id: string; durationSeconds: number; version: number; isExtra: boolean }>;
    todayTotal: number;
    todayBest: number;
    weekTotal: number;
    allTimeTotal: number;
    calendar: Array<{ date: string; state: CalendarState; totalSeconds: number; goalValue: number | null }>;
    dailyGraph: Array<{ date: string; seconds: number }>;
  };
};

const weekdays = [
  { value: 1, short: "Пн", full: "Понедельник" }, { value: 2, short: "Вт", full: "Вторник" },
  { value: 3, short: "Ср", full: "Среда" }, { value: 4, short: "Чт", full: "Четверг" },
  { value: 5, short: "Пт", full: "Пятница" }, { value: 6, short: "Сб", full: "Суббота" },
  { value: 7, short: "Вс", full: "Воскресенье" }
];

function maskToDays(mask: number) {
  return weekdays.filter((day) => (mask & (1 << (day.value - 1))) !== 0).map((day) => day.value);
}

function WeekdayPicker({ selected, onChange }: { selected: number[]; onChange: (days: number[]) => void }) {
  return <fieldset className="weekday-picker"><legend>Дни недели</legend><div>{weekdays.map((day) => <label key={day.value} title={day.full}>
    <input type="checkbox" checked={selected.includes(day.value)} onChange={(event) => onChange(event.target.checked ? [...selected, day.value].sort() : selected.filter((value) => value !== day.value))} />
    <span>{day.short}</span>
  </label>)}</div></fieldset>;
}

export function CreatePlankForm({ today, busy, onCancel, onCreate }: { today: string; busy: boolean; onCancel: () => void; onCreate: (body: Record<string, unknown>) => Promise<unknown> }) {
  const [goalValue, setGoalValue] = useState(60);
  const [days, setDays] = useState<number[]>([]);
  const [startDate, setStartDate] = useState(today);
  return <section className="habit-editor" aria-labelledby="create-plank-heading"><p className="eyebrow">Встроенный трекер</p><h2 id="create-plank-heading">Добавить планку</h2>
    <label className="planner-field compact-field"><span>Цель на день, секунд</span><input type="number" min={1} max={600} value={goalValue} onChange={(event) => setGoalValue(Number(event.target.value))} /></label>
    <WeekdayPicker selected={days} onChange={setDays} />
    <label className="planner-field compact-field"><span>Дата начала</span><input type="date" min={today} value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
    <div className="habit-actions"><button disabled={busy || days.length === 0 || !Number.isInteger(goalValue) || goalValue < 1 || goalValue > 600} onClick={() => void onCreate({ goalValue, weekdays: days, startDate })}>Добавить планку</button><button className="button-secondary" disabled={busy} onClick={onCancel}>Отмена</button></div>
  </section>;
}

function playGoalSound() {
  const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const audio = new AudioContextClass();
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.frequency.value = 660;
  gain.gain.setValueAtTime(0.035, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.35);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start();
  oscillator.stop(audio.currentTime + 0.35);
  oscillator.addEventListener("ended", () => void audio.close(), { once: true });
}

type Act = (task: () => Promise<unknown>, success: string) => Promise<boolean>;

export function PlankDetails({ habit, busy, csrfToken, onClose, act, onActiveChange }: { habit: PlankHabitView; busy: boolean; csrfToken: string; onClose: () => void; act: Act; onActiveChange: (active: boolean) => void }) {
  const [editing, setEditing] = useState(habit.status === "DRAFT");
  const [goalValue, setGoalValue] = useState(habit.currentRevision?.goalValue ?? 60);
  const [days, setDays] = useState(maskToDays(habit.currentRevision?.scheduleMask ?? 0));
  const [snapshot, setSnapshot] = useState<PlankTimerSnapshot>({ phase: "IDLE", countdown: null, elapsedSeconds: 0 });
  const [timerMessage, setTimerMessage] = useState("");
  const [sound, setSound] = useState({ enabled: true, version: 0 });
  const [editedSessions, setEditedSessions] = useState<Record<string, number>>({});
  const engine = useRef<PlankTimerEngine | null>(null);
  const request = useCallback((path: string, method = "POST", body?: unknown) => apiRequest<PlankHabitView>(path, csrfToken, { method, body }), [csrfToken]);

  useEffect(() => { void apiRequest<{ enabled: boolean; version: number }>("/api/v1/settings/plank-sound", csrfToken).then(setSound).catch(() => undefined); }, [csrfToken]);
  useEffect(() => {
    if (snapshot.phase === "IDLE") return;
    const interval = window.setInterval(() => {
      const next = engine.current?.tick() ?? { phase: "IDLE", countdown: null, elapsedSeconds: 0 };
      setSnapshot(next);
      if (next.phase === "IDLE" && next.reason) {
        setTimerMessage(next.reason === "LIMIT" ? "Таймер достиг предела 10 минут и был сброшен. Подход не записан" : next.reason === "DAY_CHANGED" ? "Наступил новый день. Незавершённый подход сброшен и не записан" : "Время изменилось некорректно. Подход сброшен и не записан");
        engine.current = null;
      }
    }, 100);
    return () => window.clearInterval(interval);
  }, [snapshot.phase]);
  useEffect(() => { onActiveChange(snapshot.phase !== "IDLE"); }, [onActiveChange, snapshot.phase]);
  useEffect(() => {
    const preventLoss = (event: BeforeUnloadEvent) => { if (engine.current?.active) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", preventLoss);
    return () => { window.removeEventListener("beforeunload", preventLoss); onActiveChange(false); };
  }, [onActiveChange]);

  function startTimer() {
    setTimerMessage("");
    const nextEngine = new PlankTimerEngine({ now: () => Date.now() }, habit.currentRevision?.goalValue ?? 1, habit.stats.todayTotal, sound.enabled, playGoalSound);
    engine.current = nextEngine;
    setSnapshot(nextEngine.start());
  }

  function cancelTimer() {
    setSnapshot(engine.current?.cancel() ?? { phase: "IDLE", countdown: null, elapsedSeconds: 0 });
    engine.current = null;
    setTimerMessage("Подход отменён и не записан");
  }

  async function stopTimer() {
    const result = engine.current?.stop() ?? null;
    engine.current = null;
    setSnapshot({ phase: "IDLE", countdown: null, elapsedSeconds: 0 });
    if (!result) { setTimerMessage("Подход короче одной полной секунды не записан"); return; }
    await act(() => request(`/api/v1/habits/${habit.id}/plank-sessions`, "POST", result), `Подход ${formatPlankDuration(result.durationSeconds)} сохранён`);
  }

  const graph = useMemo(() => habit.stats.dailyGraph.slice(-14), [habit.stats.dailyGraph]);
  const graphMax = Math.max(habit.currentRevision?.goalValue ?? 1, ...graph.map((day) => day.seconds));
  return <section className="habit-details plank-details"><button className="button-link" onClick={onClose}>← Ко всем привычкам</button>
    <div className="habit-detail-heading"><div><span className={`habit-status status-${habit.status.toLowerCase()}`}>{habit.status === "ACTIVE" ? "Активные" : habit.status === "DRAFT" ? "Черновики" : habit.status === "PAUSED" ? "На паузе" : "Архив"}</span><h2>Планка</h2><p>Цель — {formatPlankDuration(habit.currentRevision?.goalValue ?? 0)} в выбранные дни</p></div>{habit.status !== "ARCHIVED" && <button className="button-secondary" disabled={busy || snapshot.phase !== "IDLE"} onClick={() => setEditing(!editing)}>{editing ? "Закрыть настройку" : "Настроить"}</button>}</div>
    {editing && habit.status !== "ARCHIVED" && <div className="habit-editor inset"><InlineMessage>Изменения действуют с сегодняшнего дня. Прошлая статистика останется прежней.</InlineMessage><label className="planner-field compact-field"><span>Цель на день, секунд</span><input type="number" min={1} max={600} value={goalValue} onChange={(event) => setGoalValue(Number(event.target.value))} /></label><WeekdayPicker selected={days} onChange={setDays} /><div className="habit-actions"><button disabled={busy || days.length === 0 || goalValue < 1 || goalValue > 600 || !Number.isInteger(goalValue)} onClick={() => void act(() => request(`/api/v1/habits/${habit.id}`, "PATCH", { version: habit.version, goalValue, weekdays: days }), "Настройки планки сохранены").then((saved) => saved && setEditing(false))}>Сохранить</button></div></div>}
    {habit.status === "ACTIVE" && <section className="plank-timer" aria-live="polite"><p className="eyebrow">{habit.today.scheduled ? "Сегодня по плану" : "Дополнительно сегодня"}</p>{snapshot.phase === "COUNTDOWN" && <><strong className="plank-countdown" aria-label={`До начала ${snapshot.countdown}`}>{snapshot.countdown}</strong><p>Приготовьтесь</p><button className="button-secondary" onClick={cancelTimer}>Отмена</button></>}{snapshot.phase === "RUNNING" && <><strong className="plank-clock">{formatPlankDuration(snapshot.elapsedSeconds)}</strong><p>Таймер идёт без паузы</p><button className="plank-stop" onClick={() => void stopTimer()}>Остановить</button></>}{snapshot.phase === "IDLE" && <><strong className="plank-clock">{formatPlankDuration(habit.stats.todayTotal)}</strong><p>{habit.stats.todayTotal >= (habit.currentRevision?.goalValue ?? 1) ? "Цель на сегодня достигнута" : `Осталось ${formatPlankDuration(Math.max(0, (habit.currentRevision?.goalValue ?? 0) - habit.stats.todayTotal))}`}</p><button onClick={startTimer}>{habit.today.scheduled ? "Начать подход" : "Выполнить дополнительно сегодня"}</button></>}{timerMessage && <InlineMessage kind={timerMessage.includes("сохранён") ? undefined : "error"}>{timerMessage}</InlineMessage>}</section>}
    <label className="plank-sound-setting"><input type="checkbox" checked={sound.enabled} disabled={busy || sound.version === 0} onChange={(event) => { const enabled = event.target.checked; const previous = sound; setSound({ ...sound, enabled }); void act(async () => { const updated = await apiRequest<{ enabled: boolean; version: number }>("/api/v1/settings/plank-sound", csrfToken, { method: "PATCH", body: { enabled, version: sound.version } }); setSound(updated); }, enabled ? "Звук цели включён" : "Звук цели выключен").then((saved) => { if (!saved) setSound(previous); }); }} /><span>Мягкий звук при достижении цели</span></label>
    <section className="plank-summary"><h3>Результат</h3><div className="stat-grid"><article><span>Сегодня</span><strong>{formatPlankDuration(habit.stats.todayTotal)}</strong><small>цель {formatPlankDuration(habit.currentRevision?.goalValue ?? 0)}</small></article><article><span>Лучший подход</span><strong>{habit.stats.todayBest ? formatPlankDuration(habit.stats.todayBest) : "—"}</strong><small>сегодня</small></article><article><span>За неделю</span><strong>{formatPlankDuration(habit.stats.weekTotal)}</strong><small>с понедельника</small></article><article><span>За всё время</span><strong>{formatPlankDuration(habit.stats.allTimeTotal)}</strong><small>все сохранённые подходы</small></article></div></section>
    <section className="plank-sessions"><h3>Сегодняшние подходы</h3>{habit.stats.todaySessions.length === 0 ? <p className="muted">Пока нет сохранённых подходов.</p> : <ol>{habit.stats.todaySessions.map((session, index) => <li key={session.id}><span>Подход {index + 1}{session.isExtra ? " · дополнительно" : ""}</span><input aria-label={`Длительность подхода ${index + 1}, секунд`} type="number" min={1} max={599} value={editedSessions[session.id] ?? session.durationSeconds} onChange={(event) => setEditedSessions((current) => ({ ...current, [session.id]: Number(event.target.value) }))} /><span>сек</span><button className="button-secondary" disabled={busy || (editedSessions[session.id] ?? session.durationSeconds) === session.durationSeconds} onClick={() => void act(() => request(`/api/v1/plank-sessions/${session.id}`, "PATCH", { durationSeconds: editedSessions[session.id], version: session.version }), "Подход исправлен")}>Сохранить</button><button className="button-link danger-link" disabled={busy} onClick={() => window.confirm("Удалить сегодняшний подход?") && void act(() => request(`/api/v1/plank-sessions/${session.id}`, "DELETE"), "Подход удалён")}>Удалить</button></li>)}</ol>}</section>
    <section className="habit-statistics"><h3>Динамика</h3><div className="plank-graph" role="img" aria-label={`Длительность планки по дням: ${graph.map((day)=>`${formatRussianDate(day.date)} — ${formatPlankDuration(day.seconds)}`).join("; ")}`}>{graph.map((day) => <span key={day.date} title={`${formatRussianDate(day.date)}: ${formatPlankDuration(day.seconds)}`}><i style={{ height: `${Math.max(day.seconds ? 6 : 1, (day.seconds / graphMax) * 100)}%` }} /><small>{Number(day.date.slice(-2))}</small></span>)}</div><p>По расписанию: {habit.stats.percentage === null ? "—" : `${habit.stats.percentage.toFixed(1)}%`} · текущая серия: {habit.stats.currentStreak} · лучшая: {habit.stats.bestStreak}</p><h4>Календарь выполнения цели</h4><div className="habit-calendar" role="list" aria-label="Календарь планки">{habit.stats.calendar.slice(-35).map((day) => <span role="listitem" className={`calendar-${day.state.toLowerCase()}`} key={day.date} title={`${formatRussianDate(day.date)}: ${calendarLabels[day.state]}, ${formatPlankDuration(day.totalSeconds)}`} aria-label={`${formatRussianDate(day.date)}: ${calendarLabels[day.state]}, ${formatPlankDuration(day.totalSeconds)}`}>{Number(day.date.slice(-2))}</span>)}</div></section>
    <section className="habit-lifecycle"><h3>Управление привычкой</h3><div className="habit-actions">{habit.status === "ACTIVE" && <button className="button-secondary" disabled={busy || snapshot.phase !== "IDLE"} onClick={() => window.confirm("Поставить планку на паузу с сегодняшнего дня?") && void act(() => request(`/api/v1/habits/${habit.id}/pause`, "POST", { version: habit.version }), "Планка поставлена на паузу")}>Пауза</button>}{habit.status === "PAUSED" && <button disabled={busy} onClick={() => void act(() => request(`/api/v1/habits/${habit.id}/resume`, "POST", { version: habit.version }), "Планка возобновлена")}>Возобновить</button>}{habit.status !== "ARCHIVED" && <button className="button-secondary" disabled={busy || snapshot.phase !== "IDLE"} onClick={() => window.confirm("Архивировать планку с сегодняшнего дня? История сохранится.") && void act(() => request(`/api/v1/habits/${habit.id}/archive`, "POST", { version: habit.version }), "Планка перенесена в архив")}>Архивировать</button>}{habit.status === "ARCHIVED" && <button disabled={busy} onClick={() => void act(() => request(`/api/v1/habits/${habit.id}/restore`, "POST", { version: habit.version }), "Планка восстановлена")}>Восстановить</button>}</div></section>
  </section>;
}
