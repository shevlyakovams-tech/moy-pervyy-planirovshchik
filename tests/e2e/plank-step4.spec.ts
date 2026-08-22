import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

test.describe.configure({ mode: "serial" });

async function finishFirstRun(page: import("@playwright/test").Page) {
  await expect(page.getByRole("heading", { name: /Сначала — ты|Настроиться/ }).or(page.locator(".app-header")).first()).toBeVisible({ timeout: 20_000 });
  const skip = page.getByRole("button", { name: "Пропустить всё знакомство" });
  if (await skip.isVisible()) await skip.click();
  await expect(page.locator(".app-header")).toBeVisible();
}

async function clearHabits() {
  const client = new PrismaClient();
  try {
    await client.weeklyHabitFocus.deleteMany();
    await client.plankSession.deleteMany();
    await client.simpleHabitLog.deleteMany();
    await client.habitExclusionInterval.deleteMany();
    await client.habitRevision.deleteMany();
    await client.habit.deleteMany();
  } finally { await client.$disconnect(); }
}

test.beforeEach(async () => { await clearHabits(); });
test.afterEach(async () => { await clearHabits(); });

test("plank countdown, cancellation, navigation loss, stop, edit, persistence and delete", async ({ page, request }) => {
  test.setTimeout(60_000);
  const bootstrap = await (await request.get("/api/bootstrap")).json() as { today: string };
  const weekday = new Date(`${bootstrap.today}T12:00:00`).getDay() || 7;
  const weekdayNames = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];

  await page.goto("/");
  await finishFirstRun(page);
  await page.locator(".app-header").getByRole("button", { name: "Привычки" }).click();
  await page.getByRole("button", { name: "Добавить планку" }).click();
  await page.getByLabel("Цель на день, секунд").fill("2");
  await page.getByTitle(weekdayNames[weekday - 1]!).click();
  await page.getByRole("button", { name: "Добавить планку", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "Планка" })).toBeVisible();

  await page.getByRole("button", { name: "Начать подход" }).click();
  await expect(page.getByText("Приготовьтесь")).toBeVisible();
  await expect(page.getByLabel(/До начала/)).toBeVisible();
  await page.getByRole("button", { name: "Отмена" }).click();
  await expect(page.getByText("Подход отменён и не записан")).toBeVisible();
  await expect(page.getByText("Пока нет сохранённых подходов")).toBeVisible();

  await page.getByRole("button", { name: "Начать подход" }).click();
  await expect(page.getByRole("button", { name: "Остановить" })).toBeVisible({ timeout: 5_000 });
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator(".app-header").getByRole("button", { name: "Сегодня" }).click();
  await page.locator(".app-header").getByRole("button", { name: "Привычки" }).click();
  await page.getByRole("button", { name: "Открыть таймер" }).click();
  await expect(page.getByText("Пока нет сохранённых подходов")).toBeVisible();

  await page.getByRole("button", { name: "Начать подход" }).click();
  await expect(page.getByRole("button", { name: "Остановить" })).toBeVisible({ timeout: 5_000 });
  await page.waitForTimeout(2_200);
  await page.getByRole("button", { name: "Остановить" }).click();
  await expect(page.getByText(/Подход \d+ сек сохранён/)).toBeVisible();
  const duration = page.getByLabel("Длительность подхода 1, секунд");
  await expect(duration).toHaveValue(/^[1-9]\d*$/);
  await duration.fill("5");
  await page.locator(".plank-sessions").getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Подход исправлен")).toBeVisible();

  await page.locator(".app-header").getByRole("button", { name: "Сегодня" }).click();
  const todayPlank = page.locator(".today-plank");
  await expect(todayPlank.getByText("Факт: 5 сек · цель: 2 сек")).toBeVisible();
  await todayPlank.getByRole("button", { name: "Открыть таймер" }).click();
  await expect(page.getByRole("heading", { name: "Планка" })).toBeVisible();

  await page.reload();
  await page.locator(".app-header").getByRole("button", { name: "Привычки" }).click();
  await page.getByRole("button", { name: "Открыть таймер" }).click();
  await expect(page.getByLabel("Длительность подхода 1, секунд")).toHaveValue("5");
  await page.getByLabel("Мягкий звук при достижении цели").uncheck();
  await expect(page.getByText("Звук цели выключен")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator(".plank-sessions").getByRole("button", { name: "Удалить" }).click();
  await expect(page.getByText("Подход удалён")).toBeVisible();
  await expect(page.getByText("Пока нет сохранённых подходов")).toBeVisible();
});

test("refresh drops an unfinished plank attempt without creating a session", async ({ page, request }) => {
  test.setTimeout(45_000);
  const client = new PrismaClient();
  const bootstrap = await (await request.get("/api/bootstrap")).json() as { today: string };
  const weekday = new Date(`${bootstrap.today}T12:00:00`).getDay() || 7;
  try {
    const habit = await client.habit.create({ data: { type: "PLANK", builtInKey: "PLANK", name: "Планка", normalizedName: "планка", status: "ACTIVE", startDate: bootstrap.today } });
    await client.habitRevision.create({ data: { habitId: habit.id, effectiveFromDate: bootstrap.today, scheduleMask: 1 << (weekday - 1), goalValue: 60, unit: "SECOND" } });
    await page.goto("/");
    await finishFirstRun(page);
    await page.locator(".app-header").getByRole("button", { name: "Привычки" }).click();
    await page.getByRole("button", { name: "Открыть таймер" }).click();
    await page.getByRole("button", { name: "Начать подход" }).click();
    await expect(page.getByRole("button", { name: "Остановить" })).toBeVisible({ timeout: 5_000 });
    await page.reload();
    expect(await client.plankSession.count({ where: { habitId: habit.id } })).toBe(0);
  } finally { await client.$disconnect(); }
});
