"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { AccessibleModal, AutoField, apiRequest, InlineMessage, SaveIndicator, type SaveQueue } from "@/components/planner-ui";
import { TodayHabits } from "@/components/habit-view";
import { addLocalDays, formatRussianDate } from "@/lib/date-service";

type Task = {
  id: string; localDate: string; title: string; category: string; priorityRank: number | null;
  status: "PLANNED" | "COMPLETED" | "TRANSFERRED" | "LET_GO"; sortOrder: number; version: number;
};
type Quote = {
  id: string; translationRu: string; author: string; sourceExcerpt: string; workTitle: string;
  workYear: number; yearKind: string; locator: string; sourceUrl: string;
  userState: { favoriteAt: string | null; hiddenAt: string | null } | null;
};
type Reflection = { id: string; promptId: string; answer: string; version: number };
type DayEntry = {
  id: string; version: number; gratitude: string | null; mood: string | null; moodNote: string | null;
  thought: string | null; intention: string | null; mainResult: string | null; selfAction: string | null;
  closeAction: string | null; selfActionCompletedAt: string | null; closeActionCompletedAt: string | null;
  morningCompletedAt: string | null; rotatingPrompt: Prompt | null; quote: Quote | null; reflectionAnswers: Reflection[];
};
type Prompt = { id: string; textRu: string; orderIndex: number | null };
type DayData = {
  selectedDate: string; access: "past" | "today" | "future"; businessDate: string; systemDate: string; clockWarning: boolean;
  entry: DayEntry | null; fixedPrompts: Prompt[]; tasks: Task[]; unresolved: Task[]; hiddenCount: number;
  weeklyContext: { weekStart: string; goal: string | null; steps: Array<{ id: string; text: string | null; completedAt: string | null }> };
};

const categoryLabels: Record<string, string> = {
  WORK: "Работа", CLOSE_PEOPLE: "Близкие", FAMILY: "Семья", HOBBY: "Хобби", LEARNING: "Обучение"
};
const moodLabels: Record<string, string> = {
  HARD: "Тяжело", BELOW_USUAL: "Ниже обычного", EVEN: "Ровно", GOOD: "Хорошо", EXCELLENT: "Отлично"
};

export function DayView({ initialToday, csrfToken, queue, onOpenHabit, pageTurnEnabled }: { initialToday: string; csrfToken: string; queue: SaveQueue; onOpenHabit: (id: string) => void; pageTurnEnabled: boolean }) {
  const [selectedDate, setSelectedDate] = useState(initialToday);
  const [data, setData] = useState<DayData | null>(null);
  const [error, setError] = useState("");
  const [taskNotice, setTaskNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [turnDirection, setTurnDirection] = useState<"forward" | "backward" | null>(null);
  const versionRef = useRef(1);

  const load = useCallback(async () => {
    setError("");
    try {
      const loaded = await apiRequest<DayData>(`/api/v1/days/${selectedDate}`, csrfToken);
      setData(loaded);
      versionRef.current = loaded.entry?.version ?? 1;
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Не удалось открыть день"); }
  }, [selectedDate, csrfToken]);

  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  async function changeDate(next: string) {
    if (!await queue.flushAll()) return;
    setTurnDirection(next > selectedDate ? "forward" : "backward");
    setTaskNotice("");
    setData(null);
    setSelectedDate(next);
  }

  async function saveDay(field: string, value: string | null) {
    const updated = await apiRequest<DayEntry>(`/api/v1/days/${selectedDate}`, csrfToken, { method: "PATCH", body: { version: versionRef.current, [field]: value } });
    versionRef.current = updated.version;
  }

  async function action(path: string, method = "POST", body?: unknown) {
    if (!await queue.flushAll()) return;
    setBusy(true); setError("");
    try {
      await apiRequest(path, csrfToken, { method, body });
      if (path.endsWith("/transfer") && body && typeof body === "object" && "targetDate" in body && typeof body.targetDate === "string") {
        setTaskNotice(`Задача перенесена на ${formatRussianDate(body.targetDate)}.`);
      } else setTaskNotice("");
      await load();
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Не удалось выполнить действие"); }
    finally { setBusy(false); }
  }

  return <section className="planner-screen" aria-label="Дневной разворот">
    <DateNavigator selectedDate={selectedDate} today={data?.businessDate ?? initialToday} queue={queue} onChange={changeDate} />
    {data?.clockWarning && <InlineMessage kind="warning">Системные часы переведены назад. Для защиты прошлых записей используется дата {formatRussianDate(data.businessDate)}.</InlineMessage>}
    {error && <InlineMessage kind="error">{error} <button className="button-link" onClick={() => void load()}>Повторить</button></InlineMessage>}
    <SaveIndicator queue={queue} />
    {data?.access === "today" && data.unresolved.length > 0 && <UnresolvedTasks tasks={data.unresolved} busy={busy} onAction={action} businessDate={data.businessDate} />}
    {!data && !error ? <div className="centered-state"><p>Открываем день…</p></div> : data && <div key={selectedDate} className={pageTurnEnabled && turnDirection ? `page-turn page-turn-${turnDirection}` : "page-turn-static"}><DayBook data={data} csrfToken={csrfToken} queue={queue} saveDay={saveDay} action={action} busy={busy} reload={load} taskNotice={taskNotice} onOpenHabit={onOpenHabit} /></div>}
  </section>;
}

function DateNavigator({ selectedDate, today, queue, onChange }: { selectedDate: string; today: string; queue: SaveQueue; onChange: (date: string) => Promise<void> }) {
  return <div className="calendar-nav" aria-label="Навигация по датам">
    <button className="icon-button" aria-label="Предыдущий день" onClick={() => void onChange(addLocalDays(selectedDate, -1))}>‹</button>
    <div><p>{selectedDate === today ? "Сегодня" : selectedDate < today ? "Прошлый день · только чтение" : "Будущий день"}</p><h1>{formatRussianDate(selectedDate)}</h1></div>
    <button className="icon-button" aria-label="Следующий день" onClick={() => void onChange(addLocalDays(selectedDate, 1))}>›</button>
    <label className="calendar-picker"><span className="sr-only">Выбрать дату</span><input type="date" value={selectedDate} onChange={(event) => { if (event.target.value) void onChange(event.target.value); }} onFocus={() => void queue.flushAll()} /></label>
    {selectedDate !== today && <button className="button-secondary" onClick={() => void onChange(today)}>Сегодня</button>}
  </div>;
}

function DayBook({ data, csrfToken, queue, saveDay, action, busy, reload, taskNotice, onOpenHabit }: {
  data: DayData; csrfToken: string; queue: SaveQueue; saveDay: (field: string, value: string | null) => Promise<void>;
  action: (path: string, method?: string, body?: unknown) => Promise<void>; busy: boolean; reload: () => Promise<void>; taskNotice: string; onOpenHabit: (id: string) => void;
}) {
  const editable = data.access === "today";
  const answers = new Map(data.entry?.reflectionAnswers.map((answer) => [answer.promptId, answer]));
  return <>
    {data.access === "future" && <InlineMessage>На будущую дату можно спокойно записать обычные задачи. Утренние поля откроются, когда наступит этот день.</InlineMessage>}
    {data.access === "past" && !data.entry && data.tasks.length === 0 && <InlineMessage>В этот день записи не было.</InlineMessage>}
    <article className={`book planner-book state-${data.access}`} aria-label="Книжный разворот дня">
      <section className="book-page day-left" aria-labelledby="tune-heading">
        <p className="page-number">Страница 1 · Настроиться</p>
        <h2 id="tune-heading">Настроиться</h2>
        <WeekGoal goal={data.weeklyContext.goal} steps={data.weeklyContext.steps} />
        <QuoteCard quote={data.entry?.quote ?? null} hiddenCount={data.hiddenCount} editable={editable} csrfToken={csrfToken} action={action} reload={reload} />
        <div className="reflection-list">
          {data.fixedPrompts.map((prompt) => <ReflectionField key={prompt.id} prompt={prompt} existing={answers.get(prompt.id)} selectedDate={data.selectedDate} editable={editable} csrfToken={csrfToken} queue={queue} />)}
          {data.entry?.rotatingPrompt && <ReflectionField prompt={data.entry.rotatingPrompt} existing={answers.get(data.entry.rotatingPrompt.id)} selectedDate={data.selectedDate} editable={editable} csrfToken={csrfToken} queue={queue} rotating />}
        </div>
        <AutoField fieldKey={`${data.selectedDate}:gratitude`} label="Благодарность" initialValue={data.entry?.gratitude} maxLength={2000} queue={queue} onSave={(value) => saveDay("gratitude", value)} disabled={!editable} placeholder="За что я благодарен сегодня?" />
        <MoodPicker value={data.entry?.mood ?? null} note={data.entry?.moodNote ?? null} editable={editable} selectedDate={data.selectedDate} queue={queue} saveDay={saveDay} />
        <AutoField fieldKey={`${data.selectedDate}:thought`} label="Мысль дня" initialValue={data.entry?.thought} maxLength={2000} queue={queue} onSave={(value) => saveDay("thought", value)} disabled={!editable} />
        <AutoField fieldKey={`${data.selectedDate}:intention`} label="Настрой дня" initialValue={data.entry?.intention} maxLength={2000} queue={queue} onSave={(value) => saveDay("intention", value)} disabled={!editable} />
      </section>
      <section className="book-page day-right" aria-labelledby="main-heading">
        <p className="page-number">Страница 2 · Выбрать главное</p>
        <h2 id="main-heading">Выбрать главное</h2>
        <WeekGoal goal={data.weeklyContext.goal} compact />
        <TaskManager data={data} csrfToken={csrfToken} queue={queue} action={action} reload={reload} busy={busy} notice={taskNotice} />
        <PersonalAction kind="self" label="Для себя" value={data.entry?.selfAction} completed={Boolean(data.entry?.selfActionCompletedAt)} editable={editable} selectedDate={data.selectedDate} queue={queue} saveDay={saveDay} action={action} />
        <PersonalAction kind="close" label="Для других" value={data.entry?.closeAction} completed={Boolean(data.entry?.closeActionCompletedAt)} editable={editable} selectedDate={data.selectedDate} queue={queue} saveDay={saveDay} action={action} />
        <AutoField fieldKey={`${data.selectedDate}:mainResult`} label="Главный результат дня" initialValue={data.entry?.mainResult} maxLength={500} queue={queue} onSave={(value) => saveDay("mainResult", value)} disabled={!editable} rows={3} />
        {data.access === "today" && <TodayHabits csrfToken={csrfToken} onOpenHabit={onOpenHabit} />}
        {editable && <MorningCompletion completed={Boolean(data.entry?.morningCompletedAt)} hasPriority={data.tasks.some((task) => task.priorityRank === 1 && ["PLANNED", "COMPLETED"].includes(task.status))} busy={busy} onComplete={() => action(`/api/v1/days/${data.selectedDate}/complete-morning`)} />}
      </section>
    </article>
  </>;
}

function WeekGoal({ goal, steps = [], compact = false }: { goal: string | null; steps?: Array<{ text: string | null; completedAt: string | null }>; compact?: boolean }) {
  return <aside className={`week-context ${compact ? "compact" : ""}`}><span>Цель текущей недели</span><p>{goal || "Цель пока не записана — можно начать с одного важного дела."}</p>{!compact && steps.length > 0 && <ul>{steps.map((step, index) => <li key={index} className={step.completedAt ? "is-completed" : ""}>{step.text}</li>)}</ul>}</aside>;
}

function ReflectionField({ prompt, existing, selectedDate, editable, csrfToken, queue, rotating = false }: {
  prompt: Prompt; existing?: Reflection; selectedDate: string; editable: boolean; csrfToken: string; queue: SaveQueue; rotating?: boolean;
}) {
  const version = useRef(existing?.version);
  return <AutoField fieldKey={`${selectedDate}:reflection:${prompt.id}`} label={`${rotating ? "Вопрос дня · " : ""}${prompt.textRu}`} initialValue={existing?.answer} maxLength={2000} queue={queue} disabled={!editable} rows={3} onSave={async (answer) => {
    const saved = await apiRequest<Reflection | null>(`/api/v1/days/${selectedDate}/reflections/${prompt.id}`, csrfToken, { method: "PUT", body: { answer, version: version.current } });
    version.current = saved?.version;
  }} />;
}

function MoodPicker({ value, note, editable, selectedDate, queue, saveDay }: {
  value: string | null; note: string | null; editable: boolean; selectedDate: string; queue: SaveQueue; saveDay: (field: string, value: string | null) => Promise<void>;
}) {
  const [selected, setSelected] = useState(value);
  return <fieldset className="mood-picker" disabled={!editable}><legend>Настроение</legend><div>{Object.entries(moodLabels).map(([key, label]) => <button type="button" className={selected === key ? "selected" : ""} aria-pressed={selected === key} key={key} onClick={() => {
    const next = selected === key ? null : key; setSelected(next); void queue.enqueue(() => saveDay("mood", next));
  }}>{label}</button>)}</div><AutoField fieldKey={`${selectedDate}:moodNote`} label="Заметка к настроению" initialValue={note} maxLength={500} queue={queue} onSave={(text) => saveDay("moodNote", text)} disabled={!editable} rows={2} /></fieldset>;
}

function PersonalAction({ kind, label, value, completed, editable, selectedDate, queue, saveDay, action }: {
  kind: "self" | "close"; label: string; value: string | null | undefined; completed: boolean; editable: boolean; selectedDate: string;
  queue: SaveQueue; saveDay: (field: string, value: string | null) => Promise<void>; action: (path: string, method?: string, body?: unknown) => Promise<void>;
}) {
  const field = kind === "self" ? "selfAction" : "closeAction";
  const [savedText, setSavedText] = useState(value ?? "");
  return <div className="personal-action"><AutoField fieldKey={`${selectedDate}:${field}`} label={label} initialValue={value} maxLength={500} queue={queue} onSave={async (text) => { await saveDay(field, text); setSavedText(text.trim()); }} disabled={!editable} rows={2} beforeChange={(next, current) => !completed || !current.trim() || Boolean(next.trim()) || window.confirm("Очистить выполненное действие? Отметка выполнения тоже будет снята.")} />
    {savedText && <label className="action-check"><input type="checkbox" checked={completed} disabled={!editable} onChange={(event) => void action(`/api/v1/days/${selectedDate}/${kind}-action-status`, "PATCH", { completed: event.target.checked })} /> Выполнено</label>}
  </div>;
}

function MorningCompletion({ completed, hasPriority, busy, onComplete }: { completed: boolean; hasPriority: boolean; busy: boolean; onComplete: () => Promise<void> }) {
  if (completed) return <div className="morning-complete"><span aria-hidden="true">✓</span><strong>Завершено</strong><p>Ты молодец!</p></div>;
  return <div className="morning-action"><button disabled={!hasPriority || busy} onClick={() => void onComplete()}>Завершить</button>{!hasPriority && <p>Перед завершением выберите одну главную задачу дня.</p>}</div>;
}

function TaskManager({ data, csrfToken, queue, action, reload, busy, notice }: { data: DayData; csrfToken: string; queue: SaveQueue; action: (path: string, method?: string, body?: unknown) => Promise<void>; reload: () => Promise<void>; busy: boolean; notice: string }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("WORK");
  const active = data.tasks.filter((task) => ["PLANNED", "COMPLETED"].includes(task.status));
  const priority = active.filter((task) => task.priorityRank).sort((a, b) => (a.priorityRank ?? 9) - (b.priorityRank ?? 9));
  const ordinary = active.filter((task) => !task.priorityRank).sort((a, b) => a.sortOrder - b.sortOrder);
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  async function create() {
    if (!title.trim()) return;
    await action("/api/v1/tasks", "POST", { localDate: data.selectedDate, title, category });
    setTitle("");
  }
  async function reorder(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= ordinary.length) return;
    const ids = ordinary.map((task) => task.id);
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    await action("/api/v1/tasks/reorder", "POST", { localDate: data.selectedDate, ids });
  }
  async function reorderByDrag(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    const from = ordinary.findIndex((task) => task.id === event.active.id);
    const to = ordinary.findIndex((task) => task.id === event.over?.id);
    if (from < 0 || to < 0) return;
    await action("/api/v1/tasks/reorder", "POST", { localDate: data.selectedDate, ids: arrayMove(ordinary.map((task) => task.id), from, to) });
  }
  async function reorderPriorityByDrag(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    const dragged = priority.find((task) => task.id === event.active.id);
    const destination = priority.find((task) => task.id === event.over?.id);
    if (dragged && destination?.priorityRank) await action(`/api/v1/tasks/${dragged.id}`, "PATCH", { priorityRank: destination.priorityRank });
  }
  return <section className="tasks-block"><h3>Приоритетные задачи</h3>
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void reorderPriorityByDrag(event)}><SortableContext items={priority.map((task) => task.id)} strategy={verticalListSortingStrategy}><ol className="priority-list">{[1, 2, 3].map((rank) => { const task = priority.find((item) => item.priorityRank === rank); return task ? <SortableTaskItem key={task.id} task={task} disabled={data.access !== "today" || busy}><span className="priority-number">{rank}</span><TaskRow task={task} data={data} csrfToken={csrfToken} queue={queue} action={action} reload={reload} busy={busy} /></SortableTaskItem> : <li key={`empty-${rank}`}><span className="drag-spacer" aria-hidden="true" /><span className="priority-number">{rank}</span><span className="empty-slot">Можно оставить пустым</span></li>; })}</ol></SortableContext></DndContext>
    <h3>Остальные задачи</h3>
    {notice && <InlineMessage>{notice}</InlineMessage>}
    {ordinary.length === 0 && <p className="empty-note">Других задач пока нет.</p>}
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void reorderByDrag(event)}><SortableContext items={ordinary.map((task) => task.id)} strategy={verticalListSortingStrategy}><ul className="task-list">{ordinary.map((task, index) => <SortableTaskItem key={task.id} task={task} disabled={data.access === "past" || busy}><TaskRow task={task} data={data} csrfToken={csrfToken} queue={queue} action={action} reload={reload} busy={busy} /><div className="reorder-buttons"><button disabled={index === 0} aria-label={`Поднять задачу «${task.title}»`} onClick={() => void reorder(index, -1)}>↑</button><button disabled={index === ordinary.length - 1} aria-label={`Опустить задачу «${task.title}»`} onClick={() => void reorder(index, 1)}>↓</button></div></SortableTaskItem>)}</ul></SortableContext></DndContext>
    {data.access !== "past" && <div className="new-task"><label><span>Новая задача</span><input maxLength={240} value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void create(); }} /></label><label><span>Категория</span><select value={category} onChange={(event) => setCategory(event.target.value)}>{Object.entries(categoryLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><button disabled={busy || !title.trim()} onClick={() => void create()}>Добавить</button></div>}
  </section>;
}

function SortableTaskItem({ task, disabled, children }: { task: Task; disabled: boolean; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled });
  const style = { transform: transform ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0) scaleX(${transform.scaleX}) scaleY(${transform.scaleY})` : undefined, transition, opacity: isDragging ? 0.65 : undefined };
  return <li ref={setNodeRef} style={style} className={isDragging ? "task-dragging" : undefined}><button type="button" className="drag-handle" aria-label={`Перетащить задачу «${task.title}»`} disabled={disabled} {...attributes} {...listeners}>⋮⋮</button>{children}</li>;
}

function TaskRow({ task, data, csrfToken, queue, action, reload, busy }: { task: Task; data: DayData; csrfToken: string; queue: SaveQueue; action: (path: string, method?: string, body?: unknown) => Promise<void>; reload: () => Promise<void>; busy: boolean }) {
  const version = useRef(task.version);
  const [category, setCategory] = useState(task.category);
  const [transferDate, setTransferDate] = useState(data.access === "today" ? addLocalDays(data.businessDate, 1) : task.localDate);
  async function update(body: Record<string, unknown>) {
    const updated = await apiRequest<Task>(`/api/v1/tasks/${task.id}`, csrfToken, { method: "PATCH", body: { ...body, version: version.current } });
    version.current = updated.version;
  }
  return <article className={`task-row task-${task.status.toLowerCase()}`}>
    <div className="task-main">
      {data.access === "today" && <input aria-label={`Выполнить задачу «${task.title}»`} type="checkbox" checked={task.status === "COMPLETED"} disabled={busy} onChange={(event) => void action(`/api/v1/tasks/${task.id}/${event.target.checked ? "complete" : "reopen"}`)} />}
      <AutoField fieldKey={`task:${task.id}:title`} label="Название задачи" initialValue={task.title} maxLength={240} queue={queue} onSave={(title) => update({ title })} disabled={data.access === "past" || task.status !== "PLANNED"} multiline={false} />
    </div>
    <div className="task-meta"><select aria-label={`Категория задачи «${task.title}»`} value={category} disabled={data.access === "past" || task.status !== "PLANNED"} onChange={(event) => { const next = event.target.value; setCategory(next); void queue.enqueue(() => update({ category: next })); }}>{Object.entries(categoryLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      {data.access === "today" && <select aria-label={`Приоритет задачи «${task.title}»`} value={task.priorityRank ?? ""} disabled={task.status !== "PLANNED" && task.status !== "COMPLETED"} onChange={(event) => { const priorityRank = event.target.value ? Number(event.target.value) : null; void queue.enqueue(async () => { await update({ priorityRank }); await reload(); }); }}><option value="">Без приоритета</option><option value="1">Задача дня № 1</option><option value="2">Задача дня № 2</option><option value="3">Задача дня № 3</option></select>}
      {task.status === "COMPLETED" && <span className="status-badge">Выполнено</span>}
    </div>
    {task.status === "PLANNED" && data.access === "today" && <div className="task-actions"><label>Перенести на <input type="date" min={addLocalDays(data.businessDate, 1)} value={transferDate} onChange={(event) => setTransferDate(event.target.value)} /></label><button className="button-secondary" onClick={() => void action(`/api/v1/tasks/${task.id}/transfer`, "POST", { targetDate: transferDate })}>Перенести</button><button className="button-link" onClick={() => { if (window.confirm("Отметить эту задачу как неактуальную?")) void action(`/api/v1/tasks/${task.id}/let-go`); }}>Не актуально</button><button className="button-link danger-link" onClick={() => { if (window.confirm("Удалить задачу?")) void action(`/api/v1/tasks/${task.id}`, "DELETE"); }}>Удалить</button></div>}
    {task.status === "PLANNED" && data.access === "future" && <div className="task-actions"><label>Другая будущая дата <input type="date" min={addLocalDays(data.businessDate, 1)} value={transferDate} onChange={(event) => setTransferDate(event.target.value)} /></label><button className="button-secondary" onClick={() => void queue.enqueue(async () => { await update({ localDate: transferDate }); await reload(); })}>Изменить дату</button><button className="button-link danger-link" onClick={() => { if (window.confirm("Удалить задачу?")) void action(`/api/v1/tasks/${task.id}`, "DELETE"); }}>Удалить</button></div>}
  </article>;
}

function UnresolvedTasks({ tasks, businessDate, busy, onAction }: { tasks: Task[]; businessDate: string; busy: boolean; onAction: (path: string, method?: string, body?: unknown) => Promise<void> }) {
  const [open, setOpen] = useState(true);
  const [target, setTarget] = useState(addLocalDays(businessDate, 1));
  const groups = tasks.reduce<Record<string, Task[]>>((result, task) => {
    (result[task.localDate] ??= []).push(task);
    return result;
  }, {});
  return <section className="unresolved-block"><button className="unresolved-toggle" aria-expanded={open} onClick={() => setOpen(!open)}><span>Неразобранные задачи</span><strong>{tasks.length}</strong></button>{open && <div>{Object.entries(groups).map(([date, group]) => <section key={date}><h3>{formatRussianDate(date)}</h3>{group.map((task) => <div className="unresolved-row" key={task.id}><span>{task.title}</span><div>{date === addLocalDays(businessDate, -1) && <button disabled={busy} onClick={() => void onAction(`/api/v1/tasks/${task.id}/complete-yesterday`)}>Выполнено вчера</button>}<button disabled={busy} onClick={() => void onAction(`/api/v1/tasks/${task.id}/transfer`, "POST", { targetDate: businessDate })}>На сегодня</button><label>Другая дата <input type="date" min={addLocalDays(businessDate, 1)} value={target} onChange={(event) => setTarget(event.target.value)} /></label><button disabled={busy} onClick={() => void onAction(`/api/v1/tasks/${task.id}/transfer`, "POST", { targetDate: target })}>Перенести</button><button className="button-link" disabled={busy} onClick={() => void onAction(`/api/v1/tasks/${task.id}/let-go`)}>Не актуально</button></div></div>)}</section>)}</div>}</section>;
}

function QuoteCard({ quote, hiddenCount, editable, csrfToken, action, reload }: { quote: Quote | null; hiddenCount: number; editable: boolean; csrfToken: string; action: (path: string, method?: string, body?: unknown) => Promise<void>; reload: () => Promise<void> }) {
  const [source, setSource] = useState<Quote | null>(null);
  const [hiddenOpen, setHiddenOpen] = useState(false);
  if (!quote) return <section className="quote-card"><p>Все цитаты скрыты.</p><button className="button-secondary" onClick={() => setHiddenOpen(true)}>Восстановить цитаты</button>{hiddenOpen && <HiddenQuotes csrfToken={csrfToken} close={() => { setHiddenOpen(false); void reload(); }} />}</section>;
  return <section className="quote-card" aria-label="Цитата дня"><blockquote>{quote.translationRu}</blockquote><p>— {quote.author}</p><div className="quote-actions"><button className="button-link" onClick={async () => setSource(await apiRequest<Quote>(`/api/v1/quotes/${quote.id}/source`, csrfToken))}>Источник</button>{editable && <button className="button-link" onClick={() => void action("/api/v1/quotes/today/replace")}>Другая цитата</button>}<button className="button-link" onClick={() => void action(`/api/v1/quotes/${quote.id}/favorite`, quote.userState?.favoriteAt ? "DELETE" : "POST")}>{quote.userState?.favoriteAt ? "Убрать из избранного" : "В избранное"}</button>{editable && <button className="button-link" onClick={() => { if (window.confirm("Больше не показывать эту цитату? В скрытых её можно восстановить.")) void action(`/api/v1/quotes/${quote.id}/hide`); }}>Больше не показывать</button>}<button className="button-link" onClick={() => setHiddenOpen(true)}>Скрытые{hiddenCount ? ` (${hiddenCount})` : ""}</button></div>{source && <QuoteSource quote={source} close={() => setSource(null)} />}{hiddenOpen && <HiddenQuotes csrfToken={csrfToken} close={() => { setHiddenOpen(false); void reload(); }} />}</section>;
}

function QuoteSource({ quote, close }: { quote: Quote; close: () => void }) {
  return <AccessibleModal labelledBy="source-title" onClose={close} className="source-card"><button className="modal-close" aria-label="Закрыть" onClick={close}>×</button><h2 id="source-title">Источник цитаты</h2><dl><dt>Автор</dt><dd>{quote.author}</dd><dt>Произведение</dt><dd>{quote.workTitle}</dd><dt>Год</dt><dd>{quote.workYear}{quote.yearKind === "FIRST_PERFORMANCE" ? " — первая постановка" : ""}</dd><dt>Раздел</dt><dd>{quote.locator}</dd><dt>Проверочный фрагмент</dt><dd lang="en">{quote.sourceExcerpt}</dd></dl><button onClick={() => window.open(quote.sourceUrl, "_blank", "noopener,noreferrer")}>Открыть полный первоисточник</button></AccessibleModal>;
}

function HiddenQuotes({ csrfToken, close }: { csrfToken: string; close: () => void }) {
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  useEffect(() => { void apiRequest<Quote[]>("/api/v1/quotes/hidden", csrfToken).then(setQuotes); }, [csrfToken]);
  return <AccessibleModal labelledBy="hidden-title" onClose={close} className="hidden-card"><button className="modal-close" aria-label="Закрыть" onClick={close}>×</button><h2 id="hidden-title">Скрытые цитаты</h2>{quotes === null ? <p>Загрузка…</p> : quotes.length === 0 ? <p>Скрытых цитат нет.</p> : <ul>{quotes.map((quote) => <li key={quote.id}><span>«{quote.translationRu}» — {quote.author}</span><button className="button-secondary" onClick={async () => { await apiRequest(`/api/v1/quotes/${quote.id}/hide`, csrfToken, { method: "DELETE" }); setQuotes((current) => current?.filter((item) => item.id !== quote.id) ?? []); }}>Восстановить</button></li>)}</ul>}</AccessibleModal>;
}
