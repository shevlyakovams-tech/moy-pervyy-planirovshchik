"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AutoField, apiRequest, InlineMessage, SaveIndicator, type SaveQueue } from "@/components/planner-ui";
import type { SimpleHabitView } from "@/components/habit-view";
import { addLocalDays, formatRussianWeek, startOfLocalWeek } from "@/lib/date-service";

type WeekStep = { id: string | null; orderIndex: number; text: string | null; assignedDate: string | null; completedAt: string | null; version: number };
type WeekPlan = {
  id: string; weekStart: string; goal: string | null; whyImportant: string | null; successCriterion: string | null;
  obstacle: string | null; fallbackPlan: string | null; selfAction: string | null; closeAction: string | null;
  outcome: string; version: number; habitFocuses?: Array<{ habitId: string; habitNameSnapshot: string }>;
};
type WeekData = {
  weekStart: string; access: "past" | "today" | "future"; businessWeekStart: string; plan: WeekPlan | null; steps: WeekStep[];
  permissions: { editGoalAndSteps: boolean; editFullPlan: boolean; completeSteps: boolean; resolvePast: boolean };
};
type UnresolvedWeek = WeekPlan & { steps: WeekStep[] };

export function WeekView({ initialDate, csrfToken, queue, pageTurnEnabled }: { initialDate: string; csrfToken: string; queue: SaveQueue; pageTurnEnabled: boolean }) {
  const [weekStart, setWeekStart] = useState(startOfLocalWeek(initialDate));
  const [data, setData] = useState<WeekData | null>(null);
  const [unresolved, setUnresolved] = useState<UnresolvedWeek[]>([]);
  const [habits, setHabits] = useState<SimpleHabitView[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [turnDirection, setTurnDirection] = useState<"forward" | "backward" | null>(null);
  const versionRef = useRef<number | undefined>(undefined);
  const stepVersions = useRef(new Map<number, number>());

  const load = useCallback(async () => {
    setError("");
    try {
      const [week, old, availableHabits] = await Promise.all([
        apiRequest<WeekData>(`/api/v1/weeks/${weekStart}`, csrfToken),
        apiRequest<UnresolvedWeek[]>("/api/v1/weeks/unresolved", csrfToken),
        apiRequest<SimpleHabitView[]>("/api/v1/habits", csrfToken)
      ]);
      setData(week); setUnresolved(old); setHabits(availableHabits.filter((habit) => habit.status === "ACTIVE")); versionRef.current = week.plan?.version;
      stepVersions.current = new Map(week.steps.map((step) => [step.orderIndex, step.version]));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Не удалось открыть неделю"); }
  }, [weekStart, csrfToken]);

  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  async function navigate(next: string) {
    if (!await queue.flushAll()) return;
    setTurnDirection(startOfLocalWeek(next) > weekStart ? "forward" : "backward");
    setData(null);
    setWeekStart(startOfLocalWeek(next));
  }
  async function savePlan(field: string, value: string) {
    const updated = await apiRequest<WeekPlan>(`/api/v1/weeks/${weekStart}`, csrfToken, { method: "PATCH", body: { version: versionRef.current, [field]: value } });
    versionRef.current = updated.version;
  }
  async function action(path: string, method = "POST", body?: unknown) {
    if (!await queue.flushAll()) return;
    setBusy(true); setError("");
    try { await apiRequest(path, csrfToken, { method, body }); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Не удалось выполнить действие"); }
    finally { setBusy(false); }
  }

  return <section className="planner-screen" aria-label="Недельный разворот">
    <div className="calendar-nav week-nav"><button className="icon-button" aria-label="Предыдущая неделя" onClick={() => void navigate(addLocalDays(weekStart, -7))}>‹</button><div><p>{data?.access === "today" ? "Текущая неделя" : data?.access === "past" ? "Прошлая неделя · только чтение" : "Будущая неделя"}</p><h1>{formatRussianWeek(weekStart)}</h1></div><button className="icon-button" aria-label="Следующая неделя" onClick={() => void navigate(addLocalDays(weekStart, 7))}>›</button><label className="calendar-picker"><span className="sr-only">Выбрать неделю</span><input type="date" value={weekStart} onChange={(event) => { if (event.target.value) void navigate(event.target.value); }} /></label>{data && weekStart !== data.businessWeekStart && <button className="button-secondary" onClick={() => void navigate(data.businessWeekStart)}>Текущая неделя</button>}</div>
    {error && <InlineMessage kind="error">{error} <button className="button-link" onClick={() => void load()}>Повторить</button></InlineMessage>}
    <SaveIndicator queue={queue} />
    {unresolved.length > 0 && <UnresolvedGoals weeks={unresolved} currentWeek={data?.businessWeekStart ?? startOfLocalWeek(initialDate)} busy={busy} action={action} />}
    {data ? <div key={weekStart} className={pageTurnEnabled && turnDirection ? `page-turn page-turn-${turnDirection}` : "page-turn-static"}><WeekBook data={data} habits={habits} busy={busy} queue={queue} savePlan={savePlan} action={action} csrfToken={csrfToken} stepVersions={stepVersions} /></div> : !error && <div className="centered-state"><p>Открываем неделю…</p></div>}
  </section>;
}

function WeekBook({ data, habits, busy, queue, savePlan, action, csrfToken, stepVersions }: { data: WeekData; habits: SimpleHabitView[]; busy: boolean; queue: SaveQueue; savePlan: (field: string, value: string) => Promise<void>; action: (path: string, method?: string, body?: unknown) => Promise<void>; csrfToken: string; stepVersions: React.MutableRefObject<Map<number, number>> }) {
  const plan = data.plan;
  const full = data.permissions.editFullPlan;
  const goalAndSteps = data.permissions.editGoalAndSteps;
  async function saveStep(orderIndex: number, text: string, assignedDate: string | null) {
    const saved = await apiRequest<WeekStep>(`/api/v1/weeks/${data.weekStart}/steps/${orderIndex}`, csrfToken, { method: "PUT", body: { text, assignedDate, version: stepVersions.current.get(orderIndex) ?? 1 } });
    stepVersions.current.set(orderIndex, saved.version);
  }
  return <>
    {data.access === "future" && <InlineMessage>В будущей неделе доступны цель и три шага. Остальные поля откроются с наступлением недели.</InlineMessage>}
    {data.access === "past" && <InlineMessage>Прошлая неделя сохранена только для чтения. Если цель не разобрана, варианты находятся над разворотом.</InlineMessage>}
    <article className={`book planner-book week-book state-${data.access}`} aria-label="Недельный книжный разворот">
      <section className="book-page"><p className="page-number">Направление недели</p><h2>Куда я хочу прийти</h2>
        <AutoField fieldKey={`${data.weekStart}:goal`} label="Цель недели" initialValue={plan?.goal} maxLength={500} queue={queue} onSave={(value) => savePlan("goal", value)} disabled={!goalAndSteps} rows={4} />
        <AutoField fieldKey={`${data.weekStart}:why`} label="Почему она важна" initialValue={plan?.whyImportant} maxLength={2000} queue={queue} onSave={(value) => savePlan("whyImportant", value)} disabled={!full} />
        <AutoField fieldKey={`${data.weekStart}:success`} label="Критерий успеха" initialValue={plan?.successCriterion} maxLength={2000} queue={queue} onSave={(value) => savePlan("successCriterion", value)} disabled={!full} />
        <AutoField fieldKey={`${data.weekStart}:obstacle`} label="Вероятное препятствие" initialValue={plan?.obstacle} maxLength={2000} queue={queue} onSave={(value) => savePlan("obstacle", value)} disabled={!full} />
        <AutoField fieldKey={`${data.weekStart}:fallback`} label="Запасной план" initialValue={plan?.fallbackPlan} maxLength={2000} queue={queue} onSave={(value) => savePlan("fallbackPlan", value)} disabled={!full} />
      </section>
      <section className="book-page"><p className="page-number">Как я это поддержу</p><h2>Три спокойных шага</h2>
        <div className="week-steps">{data.steps.map((step) => <WeekStepEditor key={step.orderIndex} step={step} weekStart={data.weekStart} editable={goalAndSteps} completable={data.permissions.completeSteps} queue={queue} save={saveStep} action={action} />)}</div>
        <WeeklyHabitFocus key={`${data.weekStart}:${plan?.habitFocuses?.map((focus) => focus.habitId).join(",") ?? ""}`} habits={habits} selected={plan?.habitFocuses?.map((focus) => focus.habitId) ?? []} editable={data.access !== "past"} busy={busy} onSave={(habitIds) => action(`/api/v1/weeks/${data.weekStart}/habit-focus`, "PUT", { habitIds })} />
      </section>
    </article>
  </>;
}

function WeeklyHabitFocus({ habits, selected, editable, busy, onSave }: { habits: SimpleHabitView[]; selected: string[]; editable: boolean; busy: boolean; onSave: (habitIds: string[]) => Promise<void> }) {
  const [chosen, setChosen] = useState(selected);
  return <section className="weekly-habit-focus"><h3>Привычки в фокусе</h3><p>Визуальное напоминание на эту неделю. Цель и статистика привычек не меняются.</p>{habits.length === 0 ? <p className="muted">Сначала создайте активную привычку в разделе «Привычки».</p> : <fieldset disabled={!editable || busy}><legend className="sr-only">Выберите привычки в фокусе</legend>{habits.map((habit) => <label key={habit.id}><input type="checkbox" checked={chosen.includes(habit.id)} onChange={(event) => setChosen(event.target.checked ? [...chosen, habit.id] : chosen.filter((id) => id !== habit.id))} /><span>{habit.name}</span></label>)}{editable && <button className="button-secondary" type="button" disabled={busy || chosen.join() === selected.join()} onClick={() => void onSave(chosen)}>Сохранить фокус</button>}</fieldset>}</section>;
}

function WeekStepEditor({ step, weekStart, editable, completable, queue, save, action }: { step: WeekStep; weekStart: string; editable: boolean; completable: boolean; queue: SaveQueue; save: (order: number, text: string, date: string | null) => Promise<void>; action: (path: string, method?: string, body?: unknown) => Promise<void> }) {
  const [text, setText] = useState(step.text ?? "");
  const [date, setDate] = useState(step.assignedDate ?? "");
  const key = `${weekStart}:step:${step.orderIndex}`;
  const schedule = (nextText: string, nextDate: string) => queue.schedule(key, () => save(step.orderIndex, nextText, nextDate || null));
  return <section className="week-step"><div className="step-heading"><strong>Шаг {step.orderIndex}</strong>{step.text && <label><input type="checkbox" checked={Boolean(step.completedAt)} disabled={!completable} onChange={(event) => void action(`/api/v1/weeks/${weekStart}/steps/${step.orderIndex}/status`, "PATCH", { completed: event.target.checked })} /> Выполнено</label>}</div><textarea aria-label={`Шаг ${step.orderIndex}`} rows={3} maxLength={500} value={text} disabled={!editable} onChange={(event) => { setText(event.target.value); schedule(event.target.value, date); }} onBlur={() => void queue.flushKey(key)} /><label>Дата шага <input type="date" min={weekStart} max={addLocalDays(weekStart, 6)} value={date} disabled={!editable || !text.trim()} onChange={(event) => { setDate(event.target.value); schedule(text, event.target.value); }} onBlur={() => void queue.flushKey(key)} /></label>{text.length >= 400 && <small>{text.length} / 500</small>}</section>;
}

function UnresolvedGoals({ weeks, currentWeek, busy, action }: { weeks: UnresolvedWeek[]; currentWeek: string; busy: boolean; action: (path: string, method?: string, body?: unknown) => Promise<void> }) {
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [goals, setGoals] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Record<string, number[]>>({});
  const [dates, setDates] = useState<Record<string, string>>({});
  return <section className="unresolved-block week-unresolved"><div className="unresolved-toggle static"><span>Неразобранные цели прошлых недель</span><strong>{weeks.length}</strong></div>{weeks.map((week) => {
    const target = targets[week.id] ?? currentWeek;
    const goal = goals[week.id] ?? week.goal ?? "";
    const transferable = week.steps.filter((step) => step.text && !step.completedAt);
    const chosen = selected[week.id] ?? [];
    return <article key={week.id}><p className="eyebrow">{formatRussianWeek(week.weekStart)}</p><h3>{week.goal}</h3><div className="week-resolution"><button disabled={busy} onClick={() => void action(`/api/v1/weeks/${week.weekStart}/resolve`, "POST", { outcome: "ACHIEVED" })}>Достигнута</button><button className="button-secondary" disabled={busy} onClick={() => void action(`/api/v1/weeks/${week.weekStart}/resolve`, "POST", { outcome: "NOT_RELEVANT" })}>Больше не актуальна</button><label>Цель после переноса<textarea aria-label={`Цель после переноса ${week.weekStart}`} maxLength={500} rows={2} value={goal} onChange={(event) => setGoals({ ...goals, [week.id]: event.target.value })} /></label><label>Перенести в неделю <input type="date" value={target} min={currentWeek} onChange={(event) => setTargets({ ...targets, [week.id]: startOfLocalWeek(event.target.value) })} /></label>{transferable.length > 0 && <fieldset><legend>Перенести незавершённые шаги — по желанию</legend>{transferable.map((step) => { const dateKey = `${week.id}:${step.orderIndex}`; const checked = chosen.includes(step.orderIndex); return <div className="transfer-step" key={step.orderIndex}><label><input type="checkbox" checked={checked} onChange={(event) => setSelected({ ...selected, [week.id]: event.target.checked ? [...chosen, step.orderIndex] : chosen.filter((value) => value !== step.orderIndex) })} />{step.text}</label>{checked && <label>Новая дата <input type="date" min={target} max={addLocalDays(target, 6)} value={dates[dateKey] ?? ""} onChange={(event) => setDates({ ...dates, [dateKey]: event.target.value })} /></label>}</div>; })}</fieldset>}<button className="button-secondary" disabled={busy || !goal.trim()} onClick={() => void action(`/api/v1/weeks/${week.weekStart}/transfer`, "POST", { targetWeekStart: target, goal, steps: chosen.map((orderIndex) => ({ orderIndex, assignedDate: dates[`${week.id}:${orderIndex}`] || null })) })}>Перенести цель</button></div></article>;
  })}</section>;
}
