import { app, dialog, Menu, nativeImage, Notification, shell, Tray } from "electron";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { databaseUrlFromPath, getAppPaths } from "../lib/paths";
import { APP_ORIGIN, APP_PORT, APP_VERSION, SCHEMA_VERSION } from "../lib/versions";
import { SafeLogger } from "./safe-logger";
import { ServerSupervisor, type Health } from "./supervisor";

type BuildManifest = { appVersion: string; schemaVersion: number; seedVersion: number; builtAt: string };
const projectRoot = path.resolve(__dirname, "..");
const appPaths = getAppPaths();
const logger = new SafeLogger(appPaths.logFile, APP_VERSION, SCHEMA_VERSION);
let tray: Tray | null = null;
let supervisor: ServerSupervisor | null = null;
let notificationTimer: NodeJS.Timeout | null = null;
let notificationsPaused = false;
let lastNotificationPoll = Date.now();
let lastAutostart: boolean | null = null;
const testExitArgument = process.argv.find((argument) => argument.startsWith("--test-exit-after-health="));
const testExitValue = testExitArgument?.split("=")[1] ?? process.env.UTRENNIY_TEST_EXIT_AFTER_HEALTH;
const testExitAfterHealth = testExitValue ? Number(testExitValue) : null;

function ensureDirectories(): void {
  for (const directory of [appPaths.data, appPaths.logs, appPaths.config]) fs.mkdirSync(directory, { recursive: true });
  if (!fs.existsSync(appPaths.database)) fs.closeSync(fs.openSync(appPaths.database, "a"));
}

function readManifest(): BuildManifest {
  const manifestPath = path.join(projectRoot, "build-manifest.json");
  if (!fs.existsSync(manifestPath)) throw new Error("BUILD_MANIFEST_MISSING");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as BuildManifest;
  if (manifest.appVersion !== APP_VERSION || manifest.schemaVersion !== SCHEMA_VERSION) throw new Error("BUILD_MANIFEST_MISMATCH");
  return manifest;
}

function applyMigrations(): void {
  const node = process.env.UTRENNIY_NODE_PATH || "node";
  const prismaCli = path.join(projectRoot, "node_modules", "prisma", "build", "index.js");
  const result = spawnSync(node, [prismaCli, "migrate", "deploy"], {
    cwd: projectRoot,
    windowsHide: true,
    env: { ...process.env, DATABASE_URL: databaseUrlFromPath(appPaths.database), NEXT_TELEMETRY_DISABLED: "1" },
    encoding: "utf8"
  });
  if (result.status !== 0) throw new Error("MIGRATION_FAILED");
}

function portIsFree(): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(APP_PORT, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

async function probeHealth(): Promise<Health | null> {
  try {
    const response = await fetch(`${APP_ORIGIN}/api/health`, { signal: AbortSignal.timeout(1000) });
    if (!response.ok) return null;
    return await response.json() as Health;
  } catch { return null; }
}

function spawnServer(): ChildProcess {
  const node = process.env.UTRENNIY_NODE_PATH || "node";
  const standalone = path.join(projectRoot, ".next", "standalone");
  const child = spawn(node, [path.join(standalone, "server.js")], {
    cwd: standalone,
    windowsHide: true,
    detached: false,
    env: {
      ...process.env,
      HOSTNAME: "127.0.0.1",
      PORT: String(APP_PORT),
      DATABASE_URL: databaseUrlFromPath(appPaths.database),
      NEXT_TELEMETRY_DISABLED: "1",
      APP_ORIGIN
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout?.resume();
  child.stderr?.on("data", () => logger.write({ level: "WARN", code: "SERVER_STDERR", component: "next", operation: "server_output" }));
  return child;
}

async function apiRequest(pathname: string, method = "GET", body?: object) {
  const headers: Record<string, string> = {};
  if (method !== "GET") {
    const bootstrap = await fetch(`${APP_ORIGIN}/api/bootstrap`, { signal: AbortSignal.timeout(1500) });
    const info = await bootstrap.json() as { csrfToken: string };
    headers["Content-Type"] = "application/json"; headers["X-Local-CSRF"] = info.csrfToken;
  }
  const response = await fetch(`${APP_ORIGIN}${pathname}`, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(2000) });
  if (!response.ok) throw new Error(`API_${response.status}`);
  return response.json() as Promise<{ data: unknown }>;
}

async function syncSystemSettings() {
  const response = await apiRequest("/api/v1/settings") as { data: { settings: { notificationsGloballyPaused: boolean; autostartEnabled: boolean } } };
  notificationsPaused = response.data.settings.notificationsGloballyPaused;
  const autostart = response.data.settings.autostartEnabled;
  if (lastAutostart !== autostart) {
    app.setLoginItemSettings({ openAtLogin: autostart, path: process.execPath, args: [...process.argv.slice(1).filter((argument) => argument !== "--autostart"), "--autostart"] });
    lastAutostart = autostart;
  }
  refreshTrayMenu();
}

function showNotification(item: { occurrenceId: string; text: string; canSnooze: boolean }) {
  if (notificationsPaused || !Notification.isSupported()) return;
  const actions = [{ type: "button" as const, text: "Открыть" }, ...(item.canSnooze ? [{ type: "button" as const, text: "Отложить на 15 минут" }] : [])];
  const notification = new Notification({ title: "Сначала — ты", body: item.text, silent: true, actions, closeButtonText: "Закрыть" });
  let acted = false;
  const act = async (action: "OPEN" | "SNOOZE" | "CLOSE") => { if (acted) return; acted = true; try { await apiRequest(`/api/v1/system/notifications/actions/${item.occurrenceId}`, "POST", { action }); } catch { logger.write({ level: "WARN", code: "NOTIFICATION_ACTION_FAILED", component: "electron", operation: "notification_action" }); } if (action === "OPEN") await shell.openExternal(APP_ORIGIN); };
  notification.on("click", () => void act("OPEN"));
  notification.on("action", (_event, index) => void act(index === 0 ? "OPEN" : "SNOOZE"));
  notification.on("close", () => void act("CLOSE"));
  notification.show();
}

async function pollNotifications() {
  const now = Date.now(); const delayed = now - lastNotificationPoll > 45_000; lastNotificationPoll = now;
  try {
    await syncSystemSettings();
    if (delayed || notificationsPaused) return;
    const response = await apiRequest(`/api/v1/system/notifications/due?at=${encodeURIComponent(new Date(now).toISOString())}`) as { data: Array<{ occurrenceId: string; text: string; canSnooze: boolean }> };
    response.data.forEach(showNotification);
  } catch { logger.write({ level: "WARN", code: "NOTIFICATION_POLL_FAILED", component: "electron", operation: "notification_poll" }); }
}

async function toggleNotificationPause() {
  try {
    const response = await apiRequest("/api/v1/settings") as { data: { settings: { version: number; notificationsGloballyPaused: boolean } } };
    await apiRequest("/api/v1/settings", "PATCH", { version: response.data.settings.version, notificationsGloballyPaused: !response.data.settings.notificationsGloballyPaused });
    await syncSystemSettings();
  } catch { logger.write({ level: "WARN", code: "TRAY_PAUSE_FAILED", component: "electron", operation: "tray_pause" }); }
}

function refreshTrayMenu(): void {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Открыть", click: () => void shell.openExternal(APP_ORIGIN) },
    { label: notificationsPaused ? "Возобновить уведомления" : "Приостановить уведомления", click: () => void toggleNotificationPause() },
    { type: "separator" },
    { label: "Выход", click: () => app.quit() }
  ]));
}

function createTray(): void {
  const icon = nativeImage.createFromPath(path.join(projectRoot, "public", "tray-icon.svg"));
  tray = new Tray(icon.resize({ width: 20, height: 20 }));
  tray.setToolTip("Сначала — ты");
  refreshTrayMenu();
  tray.on("double-click", () => void shell.openExternal(APP_ORIGIN));
}

async function launch(): Promise<void> {
  ensureDirectories();
  readManifest();
  applyMigrations();
  supervisor = new ServerSupervisor({ appVersion: APP_VERSION, schemaVersion: SCHEMA_VERSION }, {
    portIsFree,
    spawnServer,
    probeHealth,
    delay: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    log: (code, operation) => logger.write({ level: "ERROR", code, component: "electron", operation })
  });
  await supervisor.start();
  createTray();
  await pollNotifications();
  notificationTimer = setInterval(() => void pollNotifications(), 15_000);
  if (!process.argv.includes("--autostart") && process.env.UTRENNIY_TEST_MODE !== "1") await shell.openExternal(APP_ORIGIN);
  if (testExitAfterHealth && Number.isFinite(testExitAfterHealth)) setTimeout(() => app.quit(), testExitAfterHealth);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { if (testExitAfterHealth === null) void shell.openExternal(APP_ORIGIN); });
  app.on("window-all-closed", () => { /* the tray process intentionally remains active */ });
  app.on("before-quit", (event) => {
    if (!supervisor) return;
    event.preventDefault();
    const current = supervisor;
    supervisor = null;
    if (notificationTimer) { clearInterval(notificationTimer); notificationTimer = null; }
    void current.stop().finally(() => app.exit(0));
  });
  void app.whenReady().then(launch).catch((error: unknown) => {
    logger.write({ level: "ERROR", code: error instanceof Error ? error.message : "START_FAILED", component: "electron", operation: "launch" });
    if (testExitAfterHealth !== null) { app.exit(1); return; }
    void dialog.showMessageBox({ type: "error", title: "Сначала — ты", message: "Не удалось запустить приложение.", detail: "Завершите приложение через значок в трее, выполните setup.bat и попробуйте снова." }).finally(() => app.quit());
  });
}
