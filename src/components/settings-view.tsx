"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AccessibleModal } from "@/components/planner-ui";

type AppSetting = { weeklyPlanningWeekday: number; pageTurnEnabled: boolean; plankGoalSoundEnabled: boolean; notificationsGloballyPaused: boolean; quietHoursEnabled: boolean; quietStartMinutes: number | null; quietEndMinutes: number | null; autostartEnabled: boolean; version: number };
type Rule = { id: string; kind: string; habitId: string | null; enabled: boolean; weekdaysMask: number | null; timeMinutes: number | null; repeatAfter15: boolean; intervalMinutes: number | null; windowStartMinutes: number | null; windowEndMinutes: number | null; version: number };
type Habit = { id: string; name: string; type: string; status: string; builtInKey: string | null };
type Payload = { settings: AppSetting; rules: Rule[]; habits: Habit[]; hiddenQuotes: Array<{ id: string; translationRu: string; author: string }>; quoteCounts: Record<string, number>; appVersion: string; schemaVersion: number; dataPath: string };
const days = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const dayNames = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];

function timeValue(minutes: number | null, fallback: number) { const value = minutes ?? fallback; return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`; }
function timeMinutes(value: string) { const parts = value.split(":").map(Number); return (parts[0] ?? 0) * 60 + (parts[1] ?? 0); }

export function SettingsView({ csrfToken }: { csrfToken: string }) {
  const [data, setData] = useState<Payload | null>(null); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const [retryAction, setRetryAction] = useState<null | (() => Promise<void>)>(null);
  const [resetStage, setResetStage] = useState<0 | 1 | 2>(0); const [resetPhrase, setResetPhrase] = useState("");
  const load = useCallback(async () => { const response = await fetch("/api/v1/settings", { cache: "no-store" }); const json = await response.json(); if (!response.ok) throw new Error(json.error?.message ?? "Не удалось загрузить настройки"); setData(json.data); }, []);
  useEffect(() => { const initialLoad = window.setTimeout(() => void load().catch((reason) => setError(reason.message)), 0); const channel = new BroadcastChannel("utrenniy-razvorot"); channel.onmessage = (event) => { if (event.data?.type === "data-changed") void load(); }; return () => { window.clearTimeout(initialLoad); channel.close(); }; }, [load]);
  const publish = () => { window.dispatchEvent(new Event("planner-settings-changed")); const channel = new BroadcastChannel("utrenniy-razvorot"); channel.postMessage({ type: "data-changed", area: "settings" }); channel.close(); };
  async function request(path: string, method: string, body: object) {
    setError(""); setMessage(""); setRetryAction(null); const response = await fetch(path, { method, headers: { "Content-Type": "application/json", "X-Local-CSRF": csrfToken }, body: JSON.stringify(body) }); const json = await response.json();
    if (!response.ok) { setError(json.error?.message ?? "Не удалось сохранить"); return { ok: false, conflict: response.status === 409 }; }
    publish(); setMessage("Сохранено"); await load(); return { ok: true, conflict: false };
  }
  async function patch(patchData: Partial<AppSetting>) { if (!data) return; const result = await request("/api/v1/settings", "PATCH", { ...patchData, version: data.settings.version }); if (result.ok && typeof patchData.pageTurnEnabled === "boolean") window.dispatchEvent(new CustomEvent("planner-page-turn-changed", { detail: patchData.pageTurnEnabled })); if (result.conflict) setRetryAction(() => async () => { const latestResponse = await fetch("/api/v1/settings", { cache: "no-store" }); const latest = await latestResponse.json() as { data: Payload }; await request("/api/v1/settings", "PATCH", { ...patchData, version: latest.data.settings.version }); }); }
  const rulesByKey = useMemo(() => new Map(data?.rules.map((rule) => [`${rule.kind}:${rule.habitId ?? ""}`, rule])), [data]);
  if (!data) return <section className="section-card"><h1>Настройки</h1><p>{error || "Загрузка…"}</p></section>;
  return <section className="settings-page" aria-labelledby="settings-title">
    <p className="eyebrow">Локально и под вашим контролем</p><h1 id="settings-title">Настройки</h1>
    {message && <p className="success-message" role="status">{message}</p>}{error && <div className="error-box" role="alert"><p>{error}</p>{error.includes("другой вкладке") && <p><button onClick={() => void load()}>Загрузить актуальное</button> {retryAction && <button onClick={() => void retryAction()}>Повторить с моими значениями</button>}</p>}</div>}
    <div className="settings-grid">
      <SettingsCard title="Общие">
        <label>День недельного планирования<select value={data.settings.weeklyPlanningWeekday} onChange={(event) => void patch({ weeklyPlanningWeekday: Number(event.target.value) })}>{dayNames.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select></label>
        <p>Начало недели — понедельник. Все данные хранятся только на этом компьютере.</p><p>Версия {data.appVersion} · схема {data.schemaVersion}</p><label>Путь к данным<input readOnly value={data.dataPath} /></label>
        <label className="switch-row"><input type="checkbox" checked={data.settings.autostartEnabled} onChange={(event) => void patch({ autostartEnabled: event.target.checked })} /> Запускать приложение при входе в Windows</label>
      </SettingsCard>
      <SettingsCard title="Внешний вид">
        <label className="switch-row"><input type="checkbox" checked={data.settings.pageTurnEnabled} onChange={(event) => void patch({ pageTurnEnabled: event.target.checked })} /> Анимация перелистывания</label><p>Системная настройка уменьшения движения всегда имеет приоритет. Светлая мятно-нюдовая тема фиксирована.</p>
      </SettingsCard>
      <SettingsCard title="Звук">
        <label className="switch-row"><input type="checkbox" checked={data.settings.plankGoalSoundEnabled} onChange={(event) => void patch({ plankGoalSoundEnabled: event.target.checked })} /> Звук при достижении цели планки</label><p>Короткий локальный сигнал; громкость регулируется в Windows.</p>
      </SettingsCard>
      <SettingsCard title="Уведомления" wide>
        <p>Все уведомления изначально выключены и не содержат личного текста.</p>
        <label className="switch-row"><input type="checkbox" checked={data.settings.notificationsGloballyPaused} onChange={(event) => void patch({ notificationsGloballyPaused: event.target.checked })} /> Приостановить все уведомления</label>
        <QuietHours settings={data.settings} save={patch} />
        <RuleEditor title="Утро" kind="MORNING" rule={rulesByKey.get("MORNING:")} csrfToken={csrfToken} onSaved={async () => { publish(); await load(); }} />
        <RuleEditor title="Неделя" kind="WEEKLY" rule={rulesByKey.get("WEEKLY:")} defaultMask={1 << (data.settings.weeklyPlanningWeekday - 1)} csrfToken={csrfToken} onSaved={async () => { publish(); await load(); }} />
        {data.habits.filter((habit) => habit.type !== "WATER").map((habit) => <RuleEditor key={habit.id} title={`Привычка: ${habit.name}`} kind="HABIT" habitId={habit.id} rule={rulesByKey.get(`HABIT:${habit.id}`)} csrfToken={csrfToken} onSaved={async () => { publish(); await load(); }} />)}
        {data.habits.filter((habit) => habit.type === "WATER").map((habit) => <RuleEditor key={habit.id} title="Вода" kind="WATER" habitId={habit.id} rule={rulesByKey.get(`WATER:${habit.id}`)} water csrfToken={csrfToken} onSaved={async () => { publish(); await load(); }} />)}
      </SettingsCard>
      <SettingsCard title="Цитаты">
        <p>Активные: с юмором — {data.quoteCounts.HUMOR ?? 0}, мотивация — {data.quoteCounts.MOTIVATION ?? 0}, философия — {data.quoteCounts.PHILOSOPHY ?? 0}.</p>
        <h3>Скрытые цитаты</h3>{data.hiddenQuotes.length === 0 ? <p>Скрытых цитат нет.</p> : data.hiddenQuotes.map((quote) => <article key={quote.id} className="quote-setting"><p>«{quote.translationRu}» — {quote.author}</p><button onClick={async () => { await request(`/api/v1/quotes/${quote.id}/hide`, "DELETE", {}); }}>Восстановить</button></article>)}
      </SettingsCard>
      <SettingsCard title="Данные">
        <p><strong>Резервной копии нет.</strong> Полный сброс необратимо удалит дневник, задачи, привычки, настройки и историю.</p><button className="danger-button" onClick={() => setResetStage(1)}>Удалить все данные</button>
      </SettingsCard>
    </div>
    {resetStage > 0 && <AccessibleModal key={resetStage} labelledBy="reset-title" onClose={() => { setResetStage(0); setResetPhrase(""); }} className="danger-dialog"><h2 id="reset-title">Удалить все данные?</h2>{resetStage === 1 ? <><p>Действие необратимо. Резервной копии нет, восстановить записи будет невозможно.</p><div className="modal-actions"><button onClick={() => setResetStage(0)}>Отмена</button><button className="danger-button" onClick={() => setResetStage(2)}>Я понимаю, продолжить</button></div></> : <><label>Для подтверждения введите «УДАЛИТЬ»<input value={resetPhrase} onChange={(event) => setResetPhrase(event.target.value)} /></label><div className="modal-actions"><button onClick={() => { setResetStage(0); setResetPhrase(""); }}>Отмена</button><button className="danger-button" disabled={resetPhrase !== "УДАЛИТЬ"} onClick={async () => { const result = await request("/api/v1/settings/reset", "POST", { phrase: resetPhrase }); if (result.ok) window.location.reload(); }}>Удалить без возможности восстановления</button></div></>}</AccessibleModal>}
  </section>;
}

function SettingsCard({ title, wide = false, children }: { title: string; wide?: boolean; children: React.ReactNode }) { return <section className={`settings-card${wide ? " settings-wide" : ""}`}><h2>{title}</h2>{children}</section>; }

function QuietHours({ settings, save }: { settings: AppSetting; save: (patch: Partial<AppSetting>) => Promise<void> }) { return <fieldset className="rule-editor"><legend>Тихие часы</legend><label className="switch-row"><input type="checkbox" checked={settings.quietHoursEnabled} onChange={(event) => void save({ quietHoursEnabled: event.target.checked })} /> Включить</label><label>С<input type="time" value={timeValue(settings.quietStartMinutes, 1320)} onChange={(event) => void save({ quietStartMinutes: timeMinutes(event.target.value) })} /></label><label>До<input type="time" value={timeValue(settings.quietEndMinutes, 420)} onChange={(event) => void save({ quietEndMinutes: timeMinutes(event.target.value) })} /></label><p>Поддерживается период через полночь. Пропущенные напоминания не переносятся.</p></fieldset>; }

function RuleEditor({ title, kind, habitId = null, rule, defaultMask = 127, water = false, csrfToken, onSaved }: { title: string; kind: string; habitId?: string | null; rule?: Rule; defaultMask?: number; water?: boolean; csrfToken: string; onSaved: () => Promise<void> }) {
  const [enabled, setEnabled] = useState(rule?.enabled ?? false); const [mask, setMask] = useState(rule?.weekdaysMask ?? defaultMask); const [time, setTime] = useState(timeValue(rule?.timeMinutes ?? null, 480)); const [repeat, setRepeat] = useState(rule?.repeatAfter15 ?? false); const [interval, setIntervalValue] = useState(rule?.intervalMinutes ?? 90); const [start, setStart] = useState(timeValue(rule?.windowStartMinutes ?? null, 540)); const [end, setEnd] = useState(timeValue(rule?.windowEndMinutes ?? null, 1260)); const [status, setStatus] = useState("");
  async function save() { const response = await fetch("/api/v1/settings/notification-rules", { method: "PUT", headers: { "Content-Type": "application/json", "X-Local-CSRF": csrfToken }, body: JSON.stringify({ kind, habitId, enabled, weekdaysMask: mask, timeMinutes: water ? null : timeMinutes(time), repeatAfter15: kind === "MORNING" && repeat, intervalMinutes: water ? interval : null, windowStartMinutes: water ? timeMinutes(start) : null, windowEndMinutes: water ? timeMinutes(end) : null, version: rule?.version }) }); const json = await response.json(); if (!response.ok) { setStatus(json.error?.message ?? "Не удалось сохранить"); return; } setStatus("Сохранено"); await onSaved(); }
  return <fieldset className="rule-editor"><legend>{title}</legend><label className="switch-row"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Включить</label><div className="weekday-row" aria-label="Дни уведомления">{days.map((day, index) => <label key={day}><input type="checkbox" checked={(mask & (1 << index)) !== 0} onChange={(event) => setMask(event.target.checked ? mask | (1 << index) : mask & ~(1 << index))} />{day}</label>)}</div>{water ? <><label>Интервал<select value={interval} onChange={(event) => setIntervalValue(Number(event.target.value))}><option value="60">60 минут</option><option value="90">90 минут</option><option value="120">120 минут</option></select></label><label>Начало окна<input type="time" value={start} onChange={(event) => setStart(event.target.value)} /></label><label>Конец окна<input type="time" value={end} onChange={(event) => setEnd(event.target.value)} /></label></> : <><label>Время<input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label>{kind === "MORNING" && <label className="switch-row"><input type="checkbox" checked={repeat} onChange={(event) => setRepeat(event.target.checked)} /> Один повтор через 15 минут</label>}</>}<button onClick={() => void save()}>Сохранить уведомление</button>{status && <span role="status"> {status}</span>}</fieldset>;
}
