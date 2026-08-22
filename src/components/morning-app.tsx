"use client";

import { useCallback, useEffect, useState } from "react";
import type { OnboardingDraft } from "@/lib/onboarding";
import { uiText } from "@/lib/ui-text";
import { PlannerApp } from "@/components/planner-app";

type Bootstrap = {
  onboardingCompleted: boolean;
  onboarding: { currentStep: number; draft: OnboardingDraft } | null;
  today: string;
  csrfToken: string;
};

const emptyDraft: OnboardingDraft = {
  weeklyPlanningWeekday: 7,
  weeklyGoal: "",
  trackers: { plank: false, pushups: false, water: false },
  trackerSettings: {
    plank: { weekdays: [] }, pushups: { weekdays: [] }, water: { weekdays: [] }
  },
  simpleHabit: { name: "", weekdays: [] }
};

export function MorningApp() {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    void requestBootstrap()
      .then(setBootstrap)
      .catch(() => setError("Не удалось открыть ежедневник. Перезапустите приложение и попробуйте ещё раз."));
  }, []);

  useEffect(() => {
    let active = true;
    void requestBootstrap()
      .then((result) => { if (active) setBootstrap(result); })
      .catch(() => { if (active) setError("Не удалось открыть ежедневник. Перезапустите приложение и попробуйте ещё раз."); });
    return () => { active = false; };
  }, []);

  if (error) {
    return <main className="centered-state"><h1>Что-то пошло не так</h1><p>{error}</p><button onClick={() => void load()}>Попробовать снова</button></main>;
  }
  if (!bootstrap) return <main className="centered-state" aria-live="polite"><p>Открываем ваш разворот…</p></main>;
  if (!bootstrap.onboardingCompleted && bootstrap.onboarding) {
    return <Onboarding initial={bootstrap.onboarding} csrfToken={bootstrap.csrfToken} onComplete={() => void load()} />;
  }
  return <PlannerApp today={bootstrap.today} csrfToken={bootstrap.csrfToken} />;
}

async function requestBootstrap(): Promise<Bootstrap> {
  const response = await fetch("/api/bootstrap", { cache: "no-store" });
  if (!response.ok) throw new Error("bootstrap");
  return await response.json() as Bootstrap;
}

const weekdays = [
  [1, "Пн"], [2, "Вт"], [3, "Ср"], [4, "Чт"], [5, "Пт"], [6, "Сб"], [7, "Вс"]
] as const;

function WeekdayPicker({ value, onChange, legend }: { value: number[]; onChange: (days: number[]) => void; legend: string }) {
  const toggle = (day: number) => onChange(value.includes(day) ? value.filter((item) => item !== day) : [...value, day].sort());
  return (
    <fieldset className="weekday-picker">
      <legend>{legend}</legend>
      <div>{weekdays.map(([day, label]) => <label key={day}><input type="checkbox" checked={value.includes(day)} onChange={() => toggle(day)} /><span>{label}</span></label>)}</div>
    </fieldset>
  );
}

function Onboarding({ initial, csrfToken, onComplete }: { initial: { currentStep: number; draft: OnboardingDraft }; csrfToken: string; onComplete: () => void }) {
  const [step, setStep] = useState(initial.currentStep);
  const [draft, setDraft] = useState<OnboardingDraft>({ ...emptyDraft, ...initial.draft });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const mutate = useCallback(async (method: "PATCH" | "POST", body: unknown) => {
    const response = await fetch("/api/onboarding", {
      method,
      headers: { "Content-Type": "application/json", "X-Local-CSRF": csrfToken },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error("save");
  }, [csrfToken]);

  async function move(nextStep: number, nextDraft = draft) {
    setBusy(true); setMessage("");
    try {
      await mutate("PATCH", { currentStep: nextStep, draft: nextDraft });
      setDraft(nextDraft); setStep(nextStep);
    } catch { setMessage("Не удалось сохранить выбор. Попробуйте ещё раз."); }
    finally { setBusy(false); }
  }

  async function skipStep() {
    let next = draft;
    if (step === 2) next = { ...draft, weeklyPlanningWeekday: 7 };
    if (step === 3) next = { ...draft, weeklyGoal: "" };
    if (step === 4) next = { ...draft, trackers: { plank: false, pushups: false, water: false } };
    if (step === 5) next = { ...draft, trackerSettings: emptyDraft.trackerSettings };
    if (step === 6) next = { ...draft, simpleHabit: emptyDraft.simpleHabit };
    await move(Math.min(7, step + 1), next);
  }

  async function complete(action: "finish" | "skipAll") {
    setBusy(true); setMessage("");
    try {
      await mutate("POST", action === "finish" ? { action, draft } : { action });
      onComplete();
    } catch { setMessage("Не удалось завершить знакомство. Ваш выбор сохранён — попробуйте ещё раз."); }
    finally { setBusy(false); }
  }

  return (
    <main className="onboarding-shell">
      <section className={`onboarding-card${step === 1 ? " onboarding-welcome" : ""}`} aria-labelledby="onboarding-title">
        <progress className="onboarding-progress" aria-label={`Шаг ${step} из 7`} max="7" value={step} />
        <p className="eyebrow">Знакомство · шаг {step} из 7</p>
        <OnboardingStep step={step} draft={draft} setDraft={setDraft} />
        {message && <p className="form-message" role="alert">{message}</p>}
        <div className="onboarding-actions">
          {step > 1 && <button className="button-secondary" disabled={busy} onClick={() => void move(step - 1)}>Назад</button>}
          {step < 7 ? <button disabled={busy} onClick={() => void move(step + 1)}>{step === 1 ? "Начать знакомство" : "Продолжить"}</button> : <button disabled={busy} onClick={() => void complete("finish")}>Перейти к сегодняшнему дню</button>}
        </div>
        <div className="skip-actions">
          {step < 7 && <button className="button-link" disabled={busy} onClick={() => void skipStep()}>Пропустить этот шаг</button>}
          <button className="button-link" disabled={busy} onClick={() => void complete("skipAll")}>Пропустить всё знакомство</button>
        </div>
      </section>
    </main>
  );
}

function OnboardingStep({ step, draft, setDraft }: { step: number; draft: OnboardingDraft; setDraft: (draft: OnboardingDraft) => void }) {
  if (step === 1) return <><h1 id="onboarding-title" className="welcome-title"><span>{uiText.welcome.title}</span><em>{uiText.welcome.tagline}</em></h1><p className="lead welcome-lead">{uiText.welcome.body}</p><div className="welcome-notes"><p>Выберите одно действительно важное дело.</p><p>Оставьте время для себя без оценок и наказаний.</p><p>Все записи останутся только на этом компьютере.</p></div></>;
  if (step === 2) return <><h1 id="onboarding-title">Когда удобно планировать неделю?</h1><p>Выберите привычный день. Его всегда можно будет изменить в настройках.</p><fieldset className="radio-list"><legend className="sr-only">День недельного планирования</legend>{[...weekdays].reverse().map(([day, label]) => <label key={day}><input type="radio" name="planning-day" checked={draft.weeklyPlanningWeekday === day} onChange={() => setDraft({ ...draft, weeklyPlanningWeekday: day })} /><span>{label === "Вс" ? "Воскресенье" : label === "Сб" ? "Суббота" : `${label}, будний день`}</span></label>)}</fieldset></>;
  if (step === 3) return <><h1 id="onboarding-title">Что важно на этой неделе?</h1><p>Цель необязательна. Одного ясного направления достаточно.</p><label className="field"><span>Первая цель недели</span><textarea maxLength={500} rows={4} value={draft.weeklyGoal} onChange={(event) => setDraft({ ...draft, weeklyGoal: event.target.value })} placeholder="Например: завершить важный рабочий этап и оставить вечер для семьи" /><small>{draft.weeklyGoal.length} / 500</small></label></>;
  if (step === 4) return <><h1 id="onboarding-title">Добавить встроенные трекеры?</h1><p>Включите только то, что действительно хотите отслеживать. По умолчанию ничего не включено.</p><div className="toggle-list">{(["plank", "pushups", "water"] as const).map((key) => <label key={key}><input type="checkbox" checked={draft.trackers[key]} onChange={(event) => setDraft({ ...draft, trackers: { ...draft.trackers, [key]: event.target.checked } })} /><span>{key === "plank" ? "Планка" : key === "pushups" ? "Отжимания" : "Вода"}</span></label>)}</div></>;
  if (step === 5) {
    const selected = (["plank", "pushups", "water"] as const).filter((key) => draft.trackers[key]);
    return <><h1 id="onboarding-title">Настроить выбранные трекеры</h1>{selected.length === 0 ? <p className="empty-note">Вы не выбрали встроенные трекеры. Можно спокойно продолжить.</p> : <div className="tracker-settings">{selected.map((key) => { const settings = draft.trackerSettings[key]; const label = key === "plank" ? "Планка" : key === "pushups" ? "Отжимания" : "Вода"; const unit = key === "plank" ? "секунд" : key === "pushups" ? "повторений" : "мл"; const max = key === "plank" ? 600 : 100000; return <section key={key}><h2>{label}</h2><label className="field"><span>Цель, {unit}</span><input type="number" min={1} max={max} value={settings.goal ?? ""} onChange={(event) => setDraft({ ...draft, trackerSettings: { ...draft.trackerSettings, [key]: { ...settings, goal: event.target.value ? Number(event.target.value) : undefined } } })} /></label><WeekdayPicker legend={`Дни для «${label}»`} value={settings.weekdays} onChange={(days) => setDraft({ ...draft, trackerSettings: { ...draft.trackerSettings, [key]: { ...settings, weekdays: days } } })} /></section>; })}</div>}</>;
  }
  if (step === 6) return <><h1 id="onboarding-title">Добавить свою простую привычку?</h1><p>Например, почитать, сделать разминку или позвонить близкому.</p><label className="field"><span>Название привычки</span><input maxLength={80} value={draft.simpleHabit.name} onChange={(event) => setDraft({ ...draft, simpleHabit: { ...draft.simpleHabit, name: event.target.value } })} placeholder="Моя привычка" /></label><WeekdayPicker legend="Дни привычки" value={draft.simpleHabit.weekdays} onChange={(days) => setDraft({ ...draft, simpleHabit: { ...draft.simpleHabit, weekdays: days } })} /></>;
  return <><h1 id="onboarding-title">Всё готово для начала</h1><p className="lead">Утром откроется спокойный книжный разворот. Его можно заполнять в своём темпе — строгого лимита времени нет.</p><div className="summary-card"><p><strong>Планирование недели:</strong> {weekdays.find(([day]) => day === draft.weeklyPlanningWeekday)?.[1]}</p><p><strong>Цель недели:</strong> {draft.weeklyGoal.trim() || "не задана"}</p><p><strong>Трекеры:</strong> {Object.values(draft.trackers).filter(Boolean).length || "не выбраны"}</p><p><strong>Своя привычка:</strong> {draft.simpleHabit.name.trim() || "не добавлена"}</p></div></>;
}
