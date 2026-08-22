"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export type SaveStatus = "idle" | "saving" | "saved" | "error";
type PendingSave = { timer: ReturnType<typeof setTimeout>; task: () => Promise<void> };

export function useSaveQueue() {
  const pending = useRef(new Map<string, PendingSave>());
  const tail = useRef<Promise<void>>(Promise.resolve());
  const failed = useRef<(() => Promise<void>) | null>(null);
  const [status, setStatus] = useState<SaveStatus>("idle");

  const enqueue = useCallback((task: () => Promise<void>) => {
    setStatus("saving");
    const run = async () => {
      try {
        await task();
        failed.current = null;
        setStatus("saved");
      } catch {
        failed.current = task;
        setStatus("error");
      }
    };
    tail.current = tail.current.then(run, run);
    return tail.current;
  }, []);

  const schedule = useCallback((key: string, task: () => Promise<void>) => {
    const existing = pending.current.get(key);
    if (existing) clearTimeout(existing.timer);
    const timer = setTimeout(() => {
      pending.current.delete(key);
      void enqueue(task);
    }, 600);
    pending.current.set(key, { timer, task });
  }, [enqueue]);

  const flushKey = useCallback(async (key: string) => {
    const item = pending.current.get(key);
    if (item) {
      clearTimeout(item.timer);
      pending.current.delete(key);
      await enqueue(item.task);
    }
    await tail.current;
    return failed.current === null;
  }, [enqueue]);

  const flushAll = useCallback(async () => {
    const items = [...pending.current.values()];
    pending.current.clear();
    for (const item of items) {
      clearTimeout(item.timer);
      await enqueue(item.task);
    }
    await tail.current;
    return failed.current === null;
  }, [enqueue]);

  const retry = useCallback(async () => {
    const task = failed.current;
    if (task) await enqueue(task);
  }, [enqueue]);

  useEffect(() => () => { for (const item of pending.current.values()) clearTimeout(item.timer); }, []);
  return { status, schedule, enqueue, flushKey, flushAll, retry };
}

export type SaveQueue = ReturnType<typeof useSaveQueue>;

export async function apiRequest<T>(path: string, csrfToken: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = options.method ?? "GET";
  const response = await fetch(path, {
    method,
    cache: "no-store",
    headers: method === "GET" ? undefined : { "Content-Type": "application/json", "X-Local-CSRF": csrfToken },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { message?: string; code?: string } } | null;
    throw new Error(payload?.error?.message ?? "Не удалось выполнить действие");
  }
  if (response.status === 204) return undefined as T;
  const payload = await response.json() as { data: T };
  return payload.data;
}

export function SaveIndicator({ queue }: { queue: SaveQueue }) {
  return <div className={`save-indicator save-${queue.status}`} aria-live="polite">
    {queue.status === "saving" && "Сохранение…"}
    {queue.status === "saved" && "Сохранено"}
    {queue.status === "error" && <><span>Не удалось сохранить. Текст остался в поле.</span><button className="button-link" onClick={() => void queue.retry()}>Повторить</button></>}
  </div>;
}

export function AutoField({
  fieldKey, label, initialValue, maxLength, queue, onSave, disabled = false, multiline = true,
  rows = 3, placeholder, children, beforeChange
}: {
  fieldKey: string; label: string; initialValue: string | null | undefined; maxLength: number;
  queue: SaveQueue; onSave: (value: string) => Promise<void>; disabled?: boolean; multiline?: boolean;
  rows?: number; placeholder?: string; children?: ReactNode; beforeChange?: (nextValue: string, currentValue: string) => boolean;
}) {
  const [value, setValue] = useState(initialValue ?? "");
  const change = (next: string) => {
    if (beforeChange && !beforeChange(next, value)) return;
    setValue(next);
    queue.schedule(fieldKey, () => onSave(next));
  };
  const common = {
    value, maxLength, disabled, placeholder,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => change(event.target.value),
    onBlur: () => void queue.flushKey(fieldKey)
  };
  return <label className={`planner-field ${disabled ? "field-readonly" : ""}`}>
    <span>{label}</span>
    {multiline ? <textarea {...common} rows={rows} /> : <input {...common} />}
    {children}
    {value.length >= maxLength * 0.8 && <small>{value.length} / {maxLength}</small>}
  </label>;
}

export function InlineMessage({ children, kind = "info" }: { children: ReactNode; kind?: "info" | "warning" | "error" }) {
  return <p className={`inline-message message-${kind}`} role={kind === "error" ? "alert" : undefined}>{children}</p>;
}

export function AccessibleModal({ labelledBy, onClose, className = "", children }: {
  labelledBy: string; onClose?: () => void; className?: string; children: ReactNode;
}) {
  const cardRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const card = cardRef.current;
    const focusable = () => [...(card?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])') ?? [])]
      .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
    const focusTimer = window.setTimeout(() => focusable()[0]?.focus(), 0);
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && closeRef.current) { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) { event.preventDefault(); card?.focus(); return; }
      const first = items[0]; const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => { window.clearTimeout(focusTimer); document.removeEventListener("keydown", handleKey); previouslyFocused?.focus(); };
  }, []);
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
    <section ref={cardRef} className={`modal-card ${className}`.trim()} tabIndex={-1}>{children}</section>
  </div>;
}
