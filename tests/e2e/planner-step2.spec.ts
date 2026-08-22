import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { addLocalDays } from "../../src/lib/date-service";

test.describe.configure({ mode: "serial" });

test("the versioned API enforces date and server validation rules", async ({ request }) => {
  const bootstrap = await (await request.get("/api/bootstrap")).json() as { csrfToken: string; today: string };
  const headers = { Origin: "http://127.0.0.1:3210", "X-Local-CSRF": bootstrap.csrfToken };
  expect((await request.get("/api/v1/days/not-a-date")).status()).toBe(422);
  expect((await request.patch(`/api/v1/days/${addLocalDays(bootstrap.today, -1)}`, { headers, data: { version: 1, gratitude: "Нельзя" } })).status()).toBe(403);
  expect((await request.patch(`/api/v1/days/${addLocalDays(bootstrap.today, 1)}`, { headers, data: { version: 1, mood: "GOOD" } })).status()).toBe(403);
  expect((await request.post("/api/v1/tasks", { headers, data: { localDate: bootstrap.today, title: "x".repeat(241), category: "WORK" } })).status()).toBe(422);
});

test("morning ritual, task, future/past access and local persistence", async ({ page }) => {
  const client = new PrismaClient();
  try {
    await client.searchDocument.deleteMany();
    await client.quoteDisplay.deleteMany();
    await client.dailyReflectionAnswer.deleteMany();
    await client.task.deleteMany();
    await client.dailyEntry.deleteMany();
  } finally { await client.$disconnect(); }

  await page.goto("/");
  const welcome = page.getByRole("heading", { name: "Сначала — ты. Потом — всё остальное." });
  if (await welcome.isVisible()) await page.getByRole("button", { name: "Пропустить всё знакомство" }).click();
  await expect(page.getByRole("heading", { name: "Настроиться" })).toBeVisible();
  await expect(page.getByLabel("Для других")).toBeVisible();
  const rightPageLabels = await page.locator(".day-right .planner-field > span").allTextContents();
  expect(rightPageLabels.indexOf("Главный результат дня")).toBeGreaterThan(rightPageLabels.indexOf("Для других"));

  await page.getByLabel("Благодарность").fill("Спасибо за спокойное утро");
  await page.getByLabel("Главный результат дня").fill("Закончить важную часть проекта");
  await page.getByLabel("Главный результат дня").blur();
  await expect(page.getByText("Сохранено")).toBeVisible();

  await page.getByLabel("Новая задача").fill("Подготовить черновик");
  await page.getByRole("button", { name: "Добавить", exact: true }).click();
  const priority = page.getByLabel("Приоритет задачи «Подготовить черновик»");
  await expect(priority).toBeVisible();
  await priority.selectOption("1");
  await expect(page.locator(".priority-list").getByText("1", { exact: true })).toBeVisible();
  await expect(priority.locator("option")).toHaveText(["Без приоритета", "Задача дня № 1", "Задача дня № 2", "Задача дня № 3"]);
  await page.getByRole("button", { name: "Завершить", exact: true }).click();
  await expect(page.getByText("Завершено", { exact: true })).toBeVisible();
  await expect(page.getByText("Ты молодец!", { exact: true })).toBeVisible();

  await page.getByLabel("Новая задача").fill("Перенести на завтра");
  await page.getByRole("button", { name: "Добавить", exact: true }).click();
  const taskToTransfer = page.getByLabel("Название задачи").nth(1).locator("xpath=ancestor::article[contains(@class, 'task-row')]");
  await expect(taskToTransfer.getByRole("button", { name: "Не актуально", exact: true })).toBeVisible();
  await taskToTransfer.getByRole("button", { name: "Перенести", exact: true }).click();
  await expect(page.getByText(/Задача перенесена на/)).toBeVisible();
  await expect(taskToTransfer).toHaveCount(0);

  await page.reload();
  await expect(page.getByLabel("Благодарность")).toHaveValue("Спасибо за спокойное утро");
  await expect(page.getByLabel("Главный результат дня")).toHaveValue("Закончить важную часть проекта");
  await expect(page.getByText("Завершено", { exact: true })).toBeVisible();
  await expect(page.getByText("Ты молодец!", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Следующий день" }).click();
  await expect(page.getByText("Будущий день", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Название задачи")).toHaveValue("Перенести на завтра");
  await expect(page.getByLabel("Благодарность")).toBeDisabled();
  await expect(page.getByLabel("Благодарность")).toHaveValue("");
  await expect(page.getByLabel("Мысль дня")).toHaveValue("");
  await page.getByLabel("Новая задача").fill("Задача на завтра");
  await page.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(page.getByLabel("Название задачи").nth(1)).toHaveValue("Задача на завтра");

  await page.getByLabel("Навигация по датам").getByRole("button", { name: "Сегодня", exact: true }).click();
  await page.getByRole("button", { name: "Предыдущий день" }).click();
  await expect(page.getByText("Прошлый день · только чтение")).toBeVisible();
  await expect(page.getByLabel("Благодарность")).toBeDisabled();
});

test("crossing midnight flushes pending text and shows the new-day transition", async ({ page, request }) => {
  const bootstrap = await (await request.get("/api/bootstrap")).json() as { today: string };
  await page.clock.install({ time: new Date(`${bootstrap.today}T08:00:00`) });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Настроиться" })).toBeVisible();
  await page.getByLabel("Мысль дня").fill("Сохранить перед новым днём");
  await page.clock.setSystemTime(new Date(`${addLocalDays(bootstrap.today, 1)}T00:01:00`));
  await page.clock.fastForward(15_100);
  const dialog = page.getByRole("dialog", { name: "Наступил новый день" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Открыть сегодняшний разворот" }).click();
  await expect(page.getByLabel("Мысль дня")).toHaveValue("Сохранить перед новым днём");
});

test("week planning and quote controls work without implicit external requests", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => { if (!request.url().startsWith("http://127.0.0.1:3210")) externalRequests.push(request.url()); });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Настроиться" })).toBeVisible();

  const quote = page.getByRole("region", { name: "Цитата дня" });
  await expect(quote).toBeVisible();
  await quote.getByRole("button", { name: "Источник" }).click();
  await expect(page.getByRole("dialog", { name: "Источник цитаты" })).toBeVisible();
  await page.getByRole("button", { name: "Закрыть" }).click();
  await quote.getByRole("button", { name: "В избранное" }).click();
  await expect(quote.getByRole("button", { name: "Убрать из избранного" })).toBeVisible();
  const before = await quote.locator("blockquote").textContent();
  await quote.getByRole("button", { name: "Другая цитата" }).click();
  await expect(quote.locator("blockquote")).not.toHaveText(before ?? "");
  const hiddenText = await quote.locator("blockquote").textContent();
  page.once("dialog", (dialog) => dialog.accept());
  await quote.getByRole("button", { name: "Больше не показывать" }).click();
  await expect(quote.locator("blockquote")).not.toHaveText(hiddenText ?? "");
  await quote.getByRole("button", { name: /Скрытые/ }).click();
  const hiddenDialog = page.getByRole("dialog", { name: "Скрытые цитаты" });
  await expect(hiddenDialog).toContainText(hiddenText ?? "");
  await hiddenDialog.getByRole("button", { name: "Восстановить" }).click();
  await expect(hiddenDialog).toContainText("Скрытых цитат нет");
  await hiddenDialog.getByRole("button", { name: "Закрыть" }).click();
  expect(externalRequests).toEqual([]);

  await page.getByRole("navigation", { name: "Основные разделы" }).first().getByRole("button", { name: "Неделя" }).click();
  await expect(page.getByRole("region", { name: "Недельный разворот" })).toBeVisible();
  await expect(page.getByLabel("Для себя")).toHaveCount(0);
  await expect(page.getByLabel("Для близкого")).toHaveCount(0);
  await page.getByLabel("Цель недели").fill("Завершить один важный результат");
  await page.getByLabel("Цель недели").blur();
  await page.getByLabel("Шаг 1").fill("Сделать первый шаг");
  await page.getByLabel("Шаг 1").blur();
  await expect(page.getByText("Сохранено")).toBeVisible();
  await page.reload();
  await page.getByRole("navigation", { name: "Основные разделы" }).first().getByRole("button", { name: "Неделя" }).click();
  await expect(page.getByLabel("Цель недели")).toHaveValue("Завершить один важный результат");
  await expect(page.getByLabel("Шаг 1")).toHaveValue("Сделать первый шаг");
  await page.getByRole("button", { name: "Следующая неделя" }).click();
  await expect(page.getByText("Будущая неделя", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Цель недели")).toBeEnabled();
  await expect(page.getByLabel("Цель недели")).toHaveValue("");
  await expect(page.getByLabel("Почему она важна")).toBeDisabled();
});

test("the longest quote fits at 360px and does not trigger an external request", async ({ page }) => {
  const client = new PrismaClient();
  try {
    const quotes = await client.quote.findMany();
    const longest = quotes.sort((left, right) => right.translationRu.length - left.translationRu.length)[0];
    const entry = await client.dailyEntry.findFirst({ orderBy: { localDate: "desc" } });
    if (longest && entry) await client.dailyEntry.update({ where: { id: entry.id }, data: { quoteId: longest.id } });
  } finally { await client.$disconnect(); }
  const externalRequests: string[] = [];
  page.on("request", (request) => { if (!request.url().startsWith("http://127.0.0.1:3210")) externalRequests.push(request.url()); });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  const quote = page.getByRole("region", { name: "Цитата дня" });
  for (const width of [360, 768, 1200]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(quote.locator("blockquote")).toBeVisible();
    expect(await quote.locator("blockquote").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  }
  expect(externalRequests).toEqual([]);
});
