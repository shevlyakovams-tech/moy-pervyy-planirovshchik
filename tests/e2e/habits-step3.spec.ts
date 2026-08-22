import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

test.describe.configure({ mode: "serial" });

test.afterEach(async () => {
  const client = new PrismaClient();
  try {
    await client.weeklyHabitFocus.deleteMany();
    await client.simpleHabitLog.deleteMany();
    await client.habitExclusionInterval.deleteMany();
    await client.habitRevision.deleteMany();
    await client.habit.deleteMany();
    await client.appSettings.update({ where: { id: "singleton" }, data: { onboardingCompletedAt: null } });
    await client.onboardingState.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", currentStep: 1, serializedDraft: "{}" },
      update: { currentStep: 1, serializedDraft: "{}" }
    });
  } finally { await client.$disconnect(); }
});

test("simple habit lifecycle, today check, persistence and weekly focus", async ({ page, request }) => {
  const client = new PrismaClient();
  try {
    await client.weeklyHabitFocus.deleteMany();
    await client.simpleHabitLog.deleteMany();
    await client.habitExclusionInterval.deleteMany();
    await client.habitRevision.deleteMany();
    await client.habit.deleteMany();
  } finally { await client.$disconnect(); }

  const bootstrap = await (await request.get("/api/bootstrap")).json() as { today: string };
  const weekday = new Date(`${bootstrap.today}T12:00:00`).getDay() || 7;
  const weekdayNames = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
  const habitName = "Читать десять минут";

  await page.goto("/");
  const welcome = page.getByRole("heading", { name: "Сначала — ты. Потом — всё остальное." });
  await expect(welcome.or(page.getByRole("heading", { name: "Настроиться" })).first()).toBeVisible();
  if (await welcome.isVisible()) await page.getByRole("button", { name: "Пропустить всё знакомство" }).click();
  await page.locator(".app-header").getByRole("button", { name: "Привычки" }).click();
  await expect(page.getByRole("heading", { name: "Привычки", exact: true })).toBeVisible();
  await expect(page.getByText("Пока нет привычек")).toBeVisible();

  await page.getByRole("button", { name: "Новая привычка" }).click();
  await page.getByLabel("Название").fill(habitName);
  await page.getByTitle(weekdayNames[weekday - 1]!).click();
  await page.getByRole("button", { name: "Создать привычку" }).click();
  await expect(page.getByRole("heading", { name: habitName })).toBeVisible();
  await expect(page.getByText("Пока нет завершённых запланированных дней")).toBeVisible();

  const detailCheck = page.locator(".today-habit-action input[type=checkbox]");
  await detailCheck.check();
  await expect(page.getByText("Сегодняшняя отметка сохранена")).toBeVisible();
  await expect(page.locator(".stat-grid").getByText("100.0%", { exact: true })).toBeVisible();

  await page.locator(".app-header").getByRole("button", { name: "Сегодня" }).click();
  const todayHabit = page.locator(".today-habits").getByText(habitName).locator("xpath=ancestor::label");
  await expect(todayHabit.locator("input")).toBeChecked();
  await todayHabit.locator("input").uncheck();
  await expect(todayHabit.locator("input")).not.toBeChecked();

  await page.reload();
  await page.locator(".app-header").getByRole("button", { name: "Привычки" }).click();
  await page.getByRole("button", { name: "Открыть" }).click();
  await expect(page.getByRole("heading", { name: habitName })).toBeVisible();
  await expect(page.locator(".stat-grid").getByText("—", { exact: true })).toBeVisible();

  await detailCheck.check();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Пауза", exact: true }).click();
  await expect(page.getByText("Привычка поставлена на паузу")).toBeVisible();
  await page.getByRole("button", { name: "Возобновить" }).click();
  await expect(page.getByText("Привычка возобновлена")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Архивировать" }).click();
  await expect(page.getByText("Привычка перенесена в архив")).toBeVisible();
  await page.getByRole("button", { name: "Восстановить" }).click();
  await expect(page.getByText("Привычка восстановлена")).toBeVisible();
  await expect(page.getByRole("button", { name: "Удалить" })).toHaveCount(0);

  await page.locator(".app-header").getByRole("button", { name: "Неделя" }).click();
  const focus = page.locator(".weekly-habit-focus");
  await expect(focus.getByText(habitName)).toBeVisible();
  await focus.getByLabel(habitName).check();
  await focus.getByRole("button", { name: "Сохранить фокус" }).click();
  await expect(focus.getByLabel(habitName)).toBeChecked();
  await page.reload();
  await page.locator(".app-header").getByRole("button", { name: "Неделя" }).click();
  await expect(page.locator(".weekly-habit-focus").getByLabel(habitName)).toBeChecked();
});
