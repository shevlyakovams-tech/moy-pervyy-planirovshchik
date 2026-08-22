"use client";

import { useEffect, useRef, useState } from "react";
import { DayView } from "@/components/day-view";
import { WeekView } from "@/components/week-view";
import { AccessibleModal, useSaveQueue } from "@/components/planner-ui";
import { localDate } from "@/lib/date-service";
import { uiText } from "@/lib/ui-text";
import { HabitView } from "@/components/habit-view";
import { ProgressView } from "@/components/progress-view";
import { ArchiveView } from "@/components/archive-view";
import { SettingsView } from "@/components/settings-view";

export function PlannerApp({ today, csrfToken }: { today: string; csrfToken: string }) {
  const [active, setActive] = useState<(typeof uiText.navigation)[number]>("Сегодня");
  const [midnight, setMidnight] = useState(false);
  const [habitToOpen, setHabitToOpen] = useState<string | null>(null);
  const [dayToOpen, setDayToOpen] = useState(today);
  const [weekToOpen, setWeekToOpen] = useState(today);
  const [externalChange, setExternalChange] = useState(false);
  const [pageTurnEnabled, setPageTurnEnabled] = useState(true);
  const openedSystemDate = useRef(localDate());
  const plankActive = useRef(false);
  const queue = useSaveQueue();

  useEffect(() => {
    const interval = setInterval(() => {
      if (localDate() !== openedSystemDate.current) setMidnight(true);
    }, 15_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const loadAppearance = async () => {
      const response = await fetch("/api/v1/settings", { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json() as { data: { settings: { pageTurnEnabled: boolean } } };
      setPageTurnEnabled(payload.data.settings.pageTurnEnabled);
    };
    void loadAppearance();
    const handleSettings = () => void loadAppearance();
    const handlePageTurn = (event: Event) => setPageTurnEnabled((event as CustomEvent<boolean>).detail);
    window.addEventListener("planner-settings-changed", handleSettings);
    window.addEventListener("planner-page-turn-changed", handlePageTurn);
    return () => { window.removeEventListener("planner-settings-changed", handleSettings); window.removeEventListener("planner-page-turn-changed", handlePageTurn); };
  }, []);

  useEffect(() => {
    const channel = new BroadcastChannel("utrenniy-razvorot");
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...arguments_) => {
      const response = await originalFetch(...arguments_);
      const input = arguments_[0]; const options = arguments_[1];
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = (options?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      if (response.ok && method !== "GET" && url.includes("/api/")) channel.postMessage({ type: "data-changed", area: "planner" });
      return response;
    };
    channel.onmessage = (event) => {
      if (event.data?.type !== "data-changed") return;
      if (event.data?.area === "settings") window.dispatchEvent(new Event("planner-settings-changed"));
      else setExternalChange(true);
    };
    return () => { window.fetch = originalFetch; channel.close(); };
  }, []);

  async function navigate(section: (typeof uiText.navigation)[number]) {
    if (section !== active && plankActive.current && !window.confirm("Активный подход не сохранён. Покинуть страницу и сбросить таймер?")) return;
    if (!await queue.flushAll()) return;
    plankActive.current = false;
    setHabitToOpen(null);
    if (section === "Сегодня") setDayToOpen(today);
    if (section === "Неделя") setWeekToOpen(today);
    setActive(section);
  }

  async function openHabit(id: string) {
    if (!await queue.flushAll()) return;
    setHabitToOpen(id);
    setActive("Привычки");
  }

  async function openArchivedDay(date: string) {
    if (!await queue.flushAll()) return;
    setDayToOpen(date); setActive("Сегодня");
  }

  async function openArchivedWeek(date: string) {
    if (!await queue.flushAll()) return;
    setWeekToOpen(date); setActive("Неделя");
  }

  return <div className="app-shell">
    <header className="app-header">
      <a className="brand" href="#main-content" onClick={(event) => { event.preventDefault(); void navigate("Сегодня"); }}>{uiText.appName}</a>
      <nav aria-label="Основные разделы"><ul>{uiText.navigation.map((item) => <li key={item}><button aria-current={active === item ? "page" : undefined} onClick={() => void navigate(item)}>{item}</button></li>)}</ul></nav>
    </header>
    <main id="main-content" tabIndex={-1}>
      {externalChange && <div className="sync-notice" role="status"><span>Данные изменились в другой вкладке.</span><button onClick={async () => { if (await queue.flushAll()) window.location.reload(); }}>Загрузить актуальное</button><button onClick={() => setExternalChange(false)}>Продолжить здесь</button></div>}
      {active === "Сегодня" && <DayView key={dayToOpen} initialToday={dayToOpen} csrfToken={csrfToken} queue={queue} pageTurnEnabled={pageTurnEnabled} onOpenHabit={(id) => void openHabit(id)} />}
      {active === "Неделя" && <WeekView key={weekToOpen} initialDate={weekToOpen} csrfToken={csrfToken} queue={queue} pageTurnEnabled={pageTurnEnabled} />}
      {active === "Привычки" && <HabitView today={today} csrfToken={csrfToken} initialSelectedId={habitToOpen} onPlankActiveChange={(value) => { plankActive.current = value; }} />}
      {active === "Прогресс" && <ProgressView csrfToken={csrfToken} />}
      {active === "Архив" && <ArchiveView today={today} csrfToken={csrfToken} onOpenDay={(date) => void openArchivedDay(date)} onOpenWeek={(date) => void openArchivedWeek(date)} />}
      {active === "Настройки" && <SettingsView csrfToken={csrfToken} />}
    </main>
    <nav className="mobile-nav" aria-label="Основные разделы"><ul>{uiText.navigation.map((item) => <li key={item}><button aria-current={active === item ? "page" : undefined} onClick={() => void navigate(item)}>{item}</button></li>)}</ul></nav>
    {midnight && <AccessibleModal labelledBy="midnight-title"><h2 id="midnight-title">Наступил новый день</h2><p>Введённые данные будут сохранены, а прошедший день станет доступен только для чтения.</p><button onClick={async () => { if (await queue.flushAll()) window.location.reload(); }}>Открыть сегодняшний разворот</button></AccessibleModal>}
  </div>;
}
