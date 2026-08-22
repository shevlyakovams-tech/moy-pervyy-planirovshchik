import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

test("first run, completion, repeated launch and stored HTML safety", async ({ page, request }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => { if (!request.url().startsWith("http://127.0.0.1:3210")) externalRequests.push(request.url()); });
  page.on("console", (message) => { if (message.type() === "error") console.error(`Browser console: ${message.text()}`); });
  page.on("pageerror", (error) => console.error(`Browser page error: ${error.message}`));

  const documentResponse = await page.goto("/");
  expect(documentResponse?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  await expect(page.getByRole("heading", { name: "Сначала — ты. Потом — всё остальное." })).toBeVisible();
  const bootstrapResponse = await request.get("/api/bootstrap");
  const bootstrap = await bootstrapResponse.json() as { csrfToken: string };
  const missingCsrf = await request.post("/api/onboarding", { headers: { Origin: "http://127.0.0.1:3210" }, data: { action: "skipAll" } });
  expect(missingCsrf.status()).toBe(403);
  const foreignOrigin = await request.post("/api/onboarding", { headers: { Origin: "https://example.org", "X-Local-CSRF": bootstrap.csrfToken }, data: { action: "skipAll" } });
  expect(foreignOrigin.status()).toBe(403);
  await page.getByRole("button", { name: "Пропустить этот шаг" }).click();
  await page.getByLabel("Воскресенье").check();
  await page.getByRole("button", { name: "Продолжить" }).click();
  const storedHtml = "<img src=x onerror=window.__unsafe=true>";
  await page.getByLabel("Первая цель недели").fill(storedHtml);
  await page.getByRole("button", { name: "Продолжить" }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Добавить встроенные трекеры?" })).toBeVisible();
  await page.getByRole("button", { name: "Назад" }).click();
  await expect(page.getByLabel("Первая цель недели")).toHaveValue(storedHtml);
  await page.getByRole("button", { name: "Продолжить" }).click();
  await page.getByText("Планка", { exact: true }).click();
  await page.getByRole("button", { name: "Продолжить" }).click();
  await page.getByLabel("Цель, секунд").fill("30");
  await page.getByText("Пн", { exact: true }).click();
  await page.getByRole("button", { name: "Продолжить" }).click();
  await page.getByLabel("Название привычки").fill("Почитать");
  await page.getByText("Вт", { exact: true }).click();
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page.getByText(storedHtml, { exact: false })).toBeVisible();
  await expect(page.locator("img")).toHaveCount(0);
  await page.getByRole("button", { name: "Перейти к сегодняшнему дню" }).click();
  await expect(page.getByRole("heading", { name: "Настроиться" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Настроиться" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Основные разделы" }).first()).toContainText("Настройки");
  expect(externalRequests).toEqual([]);
});

test("all navigation controls work and the 360px shell has no horizontal overflow", async ({ page }) => {
  await page.goto("/");
  const welcome = page.getByRole("heading", { name: "Сначала — ты. Потом — всё остальное." });
  const todayHeading = page.getByRole("heading", { name: "Настроиться" });
  await expect(welcome.or(todayHeading)).toBeVisible();
  if (await welcome.isVisible()) {
    await page.getByRole("button", { name: "Пропустить всё знакомство" }).click();
  }
  await expect(todayHeading).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Основные разделы" }).first();
  for (const section of ["Неделя", "Привычки", "Прогресс", "Архив", "Настройки"]) {
    await navigation.getByRole("button", { name: section }).click();
    if (section === "Неделя") await expect(page.getByRole("region", { name: "Недельный разворот" })).toBeVisible();
    else await expect(page.getByRole("heading", { name: section })).toBeVisible();
  }
  await page.reload();
  await expect(page.getByRole("heading", { name: "Настроиться" })).toBeVisible();
  await page.keyboard.press("Tab");
  const brand = page.getByRole("link", { name: "Сначала — ты" });
  await expect(brand).toBeFocused();
  expect(await brand.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Настроиться" })).toBeVisible();
  await page.setViewportSize({ width: 360, height: 800 });
  await page.getByRole("navigation", { name: "Основные разделы" }).last().getByRole("button", { name: "Сегодня" }).click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
});

test("the entire onboarding can be skipped and stays completed", async ({ page }) => {
  const client = new PrismaClient();
  try {
    await client.habitRevision.deleteMany();
    await client.habit.deleteMany();
    await client.weeklyStep.deleteMany();
    await client.weeklyPlan.deleteMany();
    await client.onboardingState.deleteMany();
    await client.appSettings.deleteMany();
  } finally { await client.$disconnect(); }

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Сначала — ты. Потом — всё остальное." })).toBeVisible();
  await page.getByRole("button", { name: "Пропустить всё знакомство" }).click();
  await expect(page.getByRole("heading", { name: "Настроиться" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Настроиться" })).toBeVisible();
});
