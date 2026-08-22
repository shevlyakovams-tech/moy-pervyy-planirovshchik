"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, InlineMessage } from "@/components/planner-ui";
import { formatRussianDate } from "@/lib/date-service";
import { CreatePlankForm, PlankDetails, type PlankHabitView } from "@/components/plank-view";
import { formatPlankDuration } from "@/lib/plank-timer";
import { CreatePushupForm, PushupDetails, type PushupHabitView } from "@/components/pushup-view";
import { CreateWaterForm, WaterDetails, type WaterHabitView } from "@/components/water-view";

export type SimpleHabitView = {
  id: string;
  type: "SIMPLE";
  name: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
  startDate: string;
  version: number;
  currentRevision: { scheduleMask: number; goalValue: number; effectiveFromDate: string } | null;
  today: { scheduled: boolean; checked: boolean; isExtra: boolean; excluded: boolean };
  hasHistory: boolean;
  stats: {
    percentage: number | null;
    completedScheduledDays: number;
    elapsedScheduledDays: number;
    currentStreak: number;
    bestStreak: number;
    regularCompletions: number;
    extraCompletions: number;
    calendar: Array<{ date: string; state: "NOT_STARTED" | "EXCLUDED" | "EXTRA" | "COMPLETED" | "IN_PROGRESS" | "MISSED" | "REST" }>;
  };
};

export type HabitViewItem = SimpleHabitView | PlankHabitView | PushupHabitView | WaterHabitView;

const weekdays = [
  { value: 1, short: "Пн", full: "Понедельник" }, { value: 2, short: "Вт", full: "Вторник" },
  { value: 3, short: "Ср", full: "Среда" }, { value: 4, short: "Чт", full: "Четверг" },
  { value: 5, short: "Пт", full: "Пятница" }, { value: 6, short: "Сб", full: "Суббота" },
  { value: 7, short: "Вс", full: "Воскресенье" }
];

const statusLabels = { ACTIVE: "Активные", DRAFT: "Черновики", PAUSED: "На паузе", ARCHIVED: "Архив" } as const;
const calendarLabels: Record<SimpleHabitView["stats"]["calendar"][number]["state"], string> = {
  NOT_STARTED: "Ещё не началась", EXCLUDED: "Пауза или архив", EXTRA: "Выполнено дополнительно",
  COMPLETED: "Выполнено", IN_PROGRESS: "Сегодня ещё в процессе", MISSED: "Не выполнено", REST: "День отдыха"
};

function maskToDays(mask: number) {
  return weekdays.filter((day) => (mask & (1 << (day.value - 1))) !== 0).map((day) => day.value);
}

function WeekdayPicker({ selected, onChange, disabled = false }: { selected: number[]; onChange: (days: number[]) => void; disabled?: boolean }) {
  return <fieldset className="weekday-picker" disabled={disabled}><legend>Дни недели</legend><div>{weekdays.map((day) => <label key={day.value} title={day.full}>
    <input type="checkbox" checked={selected.includes(day.value)} onChange={(event) => onChange(event.target.checked ? [...selected, day.value].sort() : selected.filter((value) => value !== day.value))} />
    <span>{day.short}</span>
  </label>)}</div></fieldset>;
}

export function HabitView({ today, csrfToken, initialSelectedId, onPlankActiveChange }: { today: string; csrfToken: string; initialSelectedId?: string | null; onPlankActiveChange: (active: boolean) => void }) {
  const [habits, setHabits] = useState<HabitViewItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState<"simple" | "plank" | "pushups" | "water" | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiRequest<HabitViewItem[]>("/api/v1/habits", csrfToken);
      setHabits(data);
      setSelectedId((current) => current && data.some((habit) => habit.id === current) ? current : null);
      setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Не удалось открыть привычки"); }
  }, [csrfToken]);

  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  async function act(task: () => Promise<unknown>, success: string) {
    setBusy(true); setError(""); setNotice("");
    try { await task(); await load(); setNotice(success); return true; }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Не удалось выполнить действие"); return false; }
    finally { setBusy(false); }
  }

  const selected = habits.find((habit) => habit.id === selectedId) ?? null;
  return <section className="habit-screen" aria-labelledby="habits-heading">
    <div className="habit-heading"><div><p className="eyebrow">Небольшие действия без давления</p><h1 id="habits-heading">Привычки</h1><p>Вы сами выбираете привычки и дни. Пропуск остаётся фактом, а не поводом ругать себя.</p></div><div className="habit-heading-actions">
      {!habits.some((habit) => habit.type === "PLANK") && <button className="button-secondary" onClick={() => { setShowCreate("plank"); setSelectedId(null); setNotice(""); }}>Добавить планку</button>}{!habits.some((habit) => habit.type === "PUSHUPS") && <button className="button-secondary" onClick={() => { setShowCreate("pushups"); setSelectedId(null); setNotice(""); }}>Добавить отжимания</button>}{!habits.some((habit) => habit.type === "WATER") && <button className="button-secondary" onClick={() => { setShowCreate("water"); setSelectedId(null); setNotice(""); }}>Добавить воду</button>}<button onClick={() => { setShowCreate("simple"); setSelectedId(null); setNotice(""); }}>Новая привычка</button></div></div>
    {error && <InlineMessage kind="error">{error}</InlineMessage>}
    {notice && <InlineMessage>{notice}</InlineMessage>}
    {showCreate === "simple" && <CreateHabitForm today={today} busy={busy} onCancel={() => setShowCreate(null)} onCreate={(body) => act(async () => {
      const created = await apiRequest<SimpleHabitView>("/api/v1/habits/simple", csrfToken, { method: "POST", body });
      setShowCreate(null); setSelectedId(created.id);
    }, "Привычка сохранена")} />}
    {showCreate === "plank" && <CreatePlankForm today={today} busy={busy} onCancel={() => setShowCreate(null)} onCreate={(body) => act(async () => { const created = await apiRequest<PlankHabitView>("/api/v1/habits/plank", csrfToken, { method: "POST", body }); setShowCreate(null); setSelectedId(created.id); }, "Планка добавлена")} />}
    {showCreate === "pushups" && <CreatePushupForm today={today} busy={busy} onCancel={() => setShowCreate(null)} onCreate={(body) => act(async () => { const created = await apiRequest<PushupHabitView>("/api/v1/habits/pushups", csrfToken, { method: "POST", body }); setShowCreate(null); setSelectedId(created.id); }, "Отжимания добавлены")} />}
    {showCreate === "water" && <CreateWaterForm today={today} busy={busy} onCancel={() => setShowCreate(null)} onCreate={(body) => act(async () => { const created = await apiRequest<WaterHabitView>("/api/v1/habits/water", csrfToken, { method: "POST", body }); setShowCreate(null); setSelectedId(created.id); }, "Вода добавлена")} />}
    {!showCreate && selected?.type === "SIMPLE" && <HabitDetails key={`${selected.id}:${selected.version}:${selected.status}`} habit={selected} busy={busy} csrfToken={csrfToken} onClose={() => setSelectedId(null)} act={act} />}
    {!showCreate && selected?.type === "PLANK" && <PlankDetails key={`${selected.id}:${selected.version}:${selected.status}`} habit={selected} busy={busy} csrfToken={csrfToken} onClose={() => setSelectedId(null)} act={act} onActiveChange={onPlankActiveChange} />}
    {!showCreate && selected?.type === "PUSHUPS" && <PushupDetails key={`${selected.id}:${selected.version}:${selected.status}`} habit={selected} busy={busy} csrfToken={csrfToken} onClose={() => setSelectedId(null)} act={act} />}
    {!showCreate && selected?.type === "WATER" && <WaterDetails key={`${selected.id}:${selected.version}:${selected.status}`} habit={selected} busy={busy} csrfToken={csrfToken} onClose={() => setSelectedId(null)} act={act} />}
    {!showCreate && !selected && <HabitLists habits={habits} onOpen={setSelectedId} />}
  </section>;
}

function CreateHabitForm({ today, busy, onCancel, onCreate }: { today: string; busy: boolean; onCancel: () => void; onCreate: (body: Record<string, unknown>) => Promise<unknown> }) {
  const [name, setName] = useState("");
  const [days, setDays] = useState<number[]>([]);
  const [startDate, setStartDate] = useState(today);
  return <section className="habit-editor" aria-labelledby="create-habit-heading"><p className="eyebrow">Новая простая привычка</p><h2 id="create-habit-heading">Что хочется поддерживать?</h2>
    <label className="planner-field"><span>Название</span><input autoFocus value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="Например, читать перед сном" /></label>
    <WeekdayPicker selected={days} onChange={setDays} />
    <label className="planner-field compact-field"><span>Дата начала</span><input type="date" min={today} value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
    {days.length === 0 && <InlineMessage>Можно сохранить черновик и выбрать дни позже. На странице «Сегодня» он пока не появится.</InlineMessage>}
    <div className="habit-actions"><button disabled={busy || !name.trim()} onClick={() => void onCreate({ name, weekdays: days, startDate })}>{days.length ? "Создать привычку" : "Сохранить черновик"}</button><button className="button-secondary" disabled={busy} onClick={onCancel}>Отмена</button></div>
  </section>;
}

function HabitLists({ habits, onOpen }: { habits: HabitViewItem[]; onOpen: (id: string) => void }) {
  if (habits.length === 0) return <div className="paper-empty"><span>○</span><p>Пока нет привычек. Начните с одного небольшого действия, которое хочется поддерживать.</p></div>;
  return <div className="habit-groups">{(["ACTIVE", "DRAFT", "PAUSED", "ARCHIVED"] as const).map((status) => {
    const group = habits.filter((habit) => habit.status === status);
    return <section key={status}><h2>{statusLabels[status]}</h2>{group.length === 0 ? <p className="muted">Пока пусто</p> : <div className="habit-card-grid">{group.map((habit) => <HabitCard key={habit.id} habit={habit} onOpen={onOpen} />)}</div>}</section>;
  })}</div>;
}

function HabitCard({ habit, onOpen }: { habit: HabitViewItem; onOpen: (id: string) => void }) {
  const days = maskToDays(habit.currentRevision?.scheduleMask ?? 0);
  if (habit.type === "PLANK") return <article className="habit-card plank-card"><div><span className={`habit-status status-${habit.status.toLowerCase()}`}>{statusLabels[habit.status]}</span><h3>Планка</h3><p>{days.length ? days.map((value) => weekdays[value - 1]?.short).join(" · ") : "Дни ещё не выбраны"}</p></div><dl><div><dt>Сегодня</dt><dd>{habit.stats.todayTotal ? `${habit.stats.todayTotal} сек` : habit.today.scheduled ? "В процессе" : "День отдыха"}</dd></div><div><dt>Лучший подход</dt><dd>{habit.stats.todayBest ? `${habit.stats.todayBest} сек` : "—"}</dd></div><div><dt>По расписанию</dt><dd>{habit.stats.percentage === null ? "—" : `${habit.stats.percentage.toFixed(1)}%`}</dd></div></dl><button className="button-secondary" onClick={() => onOpen(habit.id)}>Открыть таймер</button></article>;
  if (habit.type === "PUSHUPS") return <article className="habit-card"><div><span className={`habit-status status-${habit.status.toLowerCase()}`}>{statusLabels[habit.status]}</span><h3>Отжимания</h3><p>{days.length ? days.map((value) => weekdays[value - 1]?.short).join(" · ") : "Дни ещё не выбраны"}</p></div><dl><div><dt>Сегодня</dt><dd>{habit.stats.todayTotal} повторений</dd></div><div><dt>Подходов</dt><dd>{habit.stats.todaySetCount}</dd></div><div><dt>Лучший</dt><dd>{habit.stats.todayBest || "—"}</dd></div></dl><button className="button-secondary" onClick={() => onOpen(habit.id)}>Открыть</button></article>;
  if (habit.type === "WATER") return <article className="habit-card water-card"><div><span className={`habit-status status-${habit.status.toLowerCase()}`}>{statusLabels[habit.status]}</span><h3>Вода</h3><p>{days.length ? days.map((value) => weekdays[value - 1]?.short).join(" · ") : "Дни ещё не выбраны"}</p></div><dl><div><dt>Сегодня</dt><dd>{habit.stats.todayTotal} мл</dd></div><div><dt>Цель</dt><dd>{habit.currentRevision?.goalValue ?? 0} мл</dd></div><div><dt>По расписанию</dt><dd>{habit.stats.percentage === null ? "—" : `${habit.stats.percentage.toFixed(1)}%`}</dd></div></dl><button className="button-secondary" onClick={() => onOpen(habit.id)}>Добавить воду</button></article>;
  return <article className="habit-card"><div><span className={`habit-status status-${habit.status.toLowerCase()}`}>{statusLabels[habit.status]}</span><h3>{habit.name}</h3><p>{days.length ? days.map((value) => weekdays[value - 1]?.short).join(" · ") : "Дни ещё не выбраны"}</p></div>
    <dl><div><dt>Сегодня</dt><dd>{habit.today.checked ? "Выполнено" : habit.today.scheduled ? "В процессе" : "День отдыха"}</dd></div><div><dt>Серия</dt><dd>{habit.stats.currentStreak}</dd></div><div><dt>По расписанию</dt><dd>{habit.stats.percentage === null ? "—" : `${habit.stats.percentage.toFixed(1)}%`}</dd></div></dl>
    <button className="button-secondary" onClick={() => onOpen(habit.id)}>Открыть</button></article>;
}

function HabitDetails({ habit, busy, csrfToken, onClose, act }: { habit: SimpleHabitView; busy: boolean; csrfToken: string; onClose: () => void; act: (task: () => Promise<unknown>, success: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(habit.status === "DRAFT");
  const [name, setName] = useState(habit.name);
  const [days, setDays] = useState(maskToDays(habit.currentRevision?.scheduleMask ?? 0));
  const [todayChecked, setTodayChecked] = useState(habit.today.checked);
  const calendar = useMemo(() => habit.stats.calendar.slice(-35), [habit.stats.calendar]);
  const request = (path: string, method = "POST", body?: unknown) => apiRequest<SimpleHabitView>(path, csrfToken, { method, body });
  const checked = todayChecked;
  return <section className="habit-details"><button className="button-link" onClick={onClose}>← Ко всем привычкам</button>
    <div className="habit-detail-heading"><div><span className={`habit-status status-${habit.status.toLowerCase()}`}>{statusLabels[habit.status]}</span><h2>{habit.name}</h2><p>Простая привычка · цель — одна отметка в запланированный день</p></div>{habit.status !== "ARCHIVED" && <button className="button-secondary" disabled={busy} onClick={() => setEditing(!editing)}>{editing ? "Закрыть настройку" : "Настроить"}</button>}</div>
    {editing && habit.status !== "ARCHIVED" && <div className="habit-editor inset"><InlineMessage>Изменения действуют с сегодняшнего дня. Прошлая статистика останется прежней.</InlineMessage>
      <label className="planner-field"><span>Название</span><input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></label><WeekdayPicker selected={days} onChange={setDays} />
      <div className="habit-actions"><button disabled={busy || !name.trim()} onClick={() => void act(() => request(`/api/v1/habits/${habit.id}`, "PATCH", { version: habit.version, name, weekdays: days }), "Настройки привычки сохранены").then(() => setEditing(false))}>{days.length ? "Сохранить" : "Сохранить как черновик"}</button></div></div>}
    {habit.status === "ACTIVE" && <section className="today-habit-action"><p className="eyebrow">Сегодня</p>{habit.today.scheduled ? <label><input type="checkbox" disabled={busy} checked={checked} onChange={(event) => { const next = event.target.checked; setTodayChecked(next); void act(() => request(`/api/v1/habits/${habit.id}/simple-check${next ? "" : "/today"}`, next ? "POST" : "DELETE"), next ? "Сегодняшняя отметка сохранена" : "Сегодняшняя отметка снята").then((saved) => { if (!saved) setTodayChecked(!next); }); }} /><span>{checked ? "Выполнено" : "Отметить выполнение"}</span></label> : checked ? <div><strong>Выполнено дополнительно</strong><button className="button-link danger-link" disabled={busy} onClick={() => void act(() => request(`/api/v1/habits/${habit.id}/simple-check/today`, "DELETE"), "Дополнительная отметка снята")}>Снять отметку</button></div> : <div><p>Сегодня день отдыха.</p><button className="button-secondary" disabled={busy} onClick={() => void act(() => request(`/api/v1/habits/${habit.id}/extra/today`), "Дополнительное выполнение сохранено")}>Выполнить дополнительно сегодня</button></div>}</section>}
    <HabitStats habit={habit} calendar={calendar} />
    <section className="habit-lifecycle"><h3>Управление привычкой</h3><div className="habit-actions">
      {habit.status === "ACTIVE" && <button className="button-secondary" disabled={busy} onClick={() => window.confirm("Поставить привычку на паузу с сегодняшнего дня?") && void act(() => request(`/api/v1/habits/${habit.id}/pause`, "POST", { version: habit.version }), "Привычка поставлена на паузу")}>Пауза</button>}
      {habit.status === "PAUSED" && <button disabled={busy} onClick={() => void act(() => request(`/api/v1/habits/${habit.id}/resume`, "POST", { version: habit.version }), "Привычка возобновлена")}>Возобновить</button>}
      {habit.status !== "ARCHIVED" && <button className="button-secondary" disabled={busy} onClick={() => window.confirm("Архивировать привычку с сегодняшнего дня? История сохранится.") && void act(() => request(`/api/v1/habits/${habit.id}/archive`, "POST", { version: habit.version }), "Привычка перенесена в архив")}>Архивировать</button>}
      {habit.status === "ARCHIVED" && <button disabled={busy} onClick={() => void act(() => request(`/api/v1/habits/${habit.id}/restore`, "POST", { version: habit.version }), "Привычка восстановлена")}>Восстановить</button>}
      {!habit.hasHistory && <button className="button-link danger-link" disabled={busy} onClick={() => window.confirm("Удалить привычку без истории? Это действие нельзя отменить.") && void act(async () => { await apiRequest(`/api/v1/habits/${habit.id}`, csrfToken, { method: "DELETE" }); onClose(); }, "Привычка удалена")}>Удалить</button>}
    </div>{habit.hasHistory && <p className="muted">Привычку с историей можно только архивировать — записи сохранятся.</p>}</section>
  </section>;
}

function HabitStats({ habit, calendar }: { habit: SimpleHabitView; calendar: SimpleHabitView["stats"]["calendar"] }) {
  return <section className="habit-statistics"><h3>Спокойная статистика</h3><div className="stat-grid"><article><span>По расписанию</span><strong>{habit.stats.percentage === null ? "—" : `${habit.stats.percentage.toFixed(1)}%`}</strong><small>{habit.stats.percentage === null ? "Пока нет завершённых запланированных дней" : `${habit.stats.completedScheduledDays} из ${habit.stats.elapsedScheduledDays}`}</small></article><article><span>Текущая серия</span><strong>{habit.stats.currentStreak}</strong><small>запланированных выполнений подряд</small></article><article><span>Лучшая серия</span><strong>{habit.stats.bestStreak}</strong><small>за всё время</small></article><article><span>Дополнительно</span><strong>{habit.stats.extraCompletions}</strong><small>не влияет на процент и серию</small></article></div>
    <h4>Последние дни</h4><div className="habit-calendar" role="list" aria-label="Календарь привычки">{calendar.map((day) => <span role="listitem" className={`calendar-${day.state.toLowerCase()}`} key={day.date} title={`${formatRussianDate(day.date)}: ${calendarLabels[day.state]}`} aria-label={`${formatRussianDate(day.date)}: ${calendarLabels[day.state]}`}>{Number(day.date.slice(-2))}</span>)}</div><p className="calendar-legend"><span className="calendar-completed" /> выполнено <span className="calendar-missed" /> не выполнено <span className="calendar-rest" /> отдых</p>
  </section>;
}

export function TodayHabits({ csrfToken, onOpenHabit }: { csrfToken: string; onOpenHabit: (id: string) => void }) {
  const [habits, setHabits] = useState<HabitViewItem[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setHabits((await apiRequest<HabitViewItem[]>("/api/v1/habits", csrfToken)).filter((habit) => habit.status === "ACTIVE" && habit.today.scheduled)); setError(""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Не удалось открыть привычки"); }
  }, [csrfToken]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  async function toggle(habit: SimpleHabitView, checked: boolean) {
    setBusy(habit.id); setError(""); setHabits((current) => current.map((item) => item.id === habit.id && item.type === "SIMPLE" ? { ...item, today: { ...item.today, checked } } : item));
    try { await apiRequest(`/api/v1/habits/${habit.id}/simple-check${checked ? "" : "/today"}`, csrfToken, { method: checked ? "POST" : "DELETE" }); await load(); }
    catch (caught) { setHabits((current) => current.map((item) => item.id === habit.id && item.type === "SIMPLE" ? { ...item, today: { ...item.today, checked: !checked } } : item)); setError(caught instanceof Error ? caught.message : "Не удалось сохранить отметку"); }
    finally { setBusy(null); }
  }
  return <section className="today-habits"><h3>Привычки сегодня</h3>{error && <InlineMessage kind="error">{error}</InlineMessage>}{habits.length === 0 ? <p className="muted">На сегодня нет запланированных привычек.</p> : <ul>{habits.map((habit) => habit.type === "SIMPLE" ? <li key={habit.id}><label><input type="checkbox" checked={habit.today.checked} disabled={busy === habit.id} onChange={(event) => void toggle(habit, event.target.checked)} /><span>{habit.name}</span></label><small>{habit.today.checked ? "Выполнено" : "Можно отметить в течение дня"}</small></li> : habit.type === "PLANK" ? <li className="today-plank" key={habit.id}><div><strong>Планка</strong><small>Факт: {formatPlankDuration(habit.stats.todayTotal)} · цель: {formatPlankDuration(habit.currentRevision?.goalValue ?? 0)}</small></div><button className="button-secondary" onClick={() => onOpenHabit(habit.id)}>Открыть таймер</button></li> : habit.type === "PUSHUPS" ? <li className="today-plank" key={habit.id}><div><strong>Отжимания</strong><small>Факт: {habit.stats.todayTotal} · цель: {habit.currentRevision?.goalValue ?? 0} · подходов: {habit.stats.todaySetCount}</small></div><button className="button-secondary" onClick={() => onOpenHabit(habit.id)}>Добавить подход</button></li> : <li className="today-plank" key={habit.id}><div><strong>Вода</strong><small>Факт: {habit.stats.todayTotal} мл · цель: {habit.currentRevision?.goalValue ?? 0} мл</small></div><button className="button-secondary" onClick={() => onOpenHabit(habit.id)}>Добавить воду</button></li>)}</ul>}</section>;
}
