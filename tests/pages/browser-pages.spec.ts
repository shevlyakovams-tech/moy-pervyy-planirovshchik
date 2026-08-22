import { expect, test } from "@playwright/test";

test("first opening is independent and onboarding persists only in its browser profile", async ({ browser }) => {
  const first = await browser.newContext();
  const page = await first.newPage();
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).hostname !== "127.0.0.1") externalRequests.push(request.url());
  });
  await page.goto("/");
  await expect(page.getByText("Сначала — ты.")).toBeVisible();
  await page.getByRole("button", { name: "Пропустить всё знакомство" }).click();
  await expect(page.getByRole("navigation")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("navigation")).toBeVisible();

  const second = await browser.newContext();
  const secondPage = await second.newPage();
  await secondPage.goto("/");
  await expect(secondPage.getByText("Сначала — ты.")).toBeVisible();
  expect(externalRequests).toEqual([]);
  await first.close();
  await second.close();
});

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Пропустить всё знакомство" }).click();
});

test("task, priority and text survive a reload", async ({ page }) => {
  await page.getByLabel("Благодарность").fill("Спасибо за спокойное утро");
  await page.getByLabel("Новая задача").fill("Сделать главное дело");
  await page.getByRole("button", { name: "Добавить", exact: true }).click();
  await page.locator("[data-task-priority]").selectOption("1");
  await page.reload();
  await expect(page.getByLabel("Благодарность")).toHaveValue("Спасибо за спокойное утро");
  await expect(page.locator("[data-task-title]")).toHaveValue("Сделать главное дело");
  await expect(page.locator("[data-task-priority]")).toHaveValue("1");
  await expect(page.getByRole("button", { name: "Завершить" })).toBeEnabled();
});

test("simple habit records progress and all main sections open", async ({ page }) => {
  await page.getByRole("button", { name: "Привычки", exact: true }).click();
  await page.getByLabel("Название простой привычки").fill("Разминка");
  await page.getByRole("button", { name: "Добавить простую привычку" }).click();
  await page.getByRole("button", { name: "Сегодня", exact: true }).click();
  await page.getByRole("button", { name: "Выполнено" }).click();
  await expect(page.getByText("Факт: Выполнено")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Факт: Выполнено")).toBeVisible();
  for (const section of ["Неделя", "Привычки", "Прогресс", "Архив", "Настройки"]) {
    const navigationButton = page.getByRole("button", { name: section, exact: true });
    await navigationButton.click();
    await expect(navigationButton).toHaveAttribute("aria-current", "page");
  }
});

test("layout has no horizontal overflow on phone and desktop", async ({ page }) => {
  for (const viewport of [{ width: 375, height: 812 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.reload();
    const sizes = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(sizes.scroll).toBeLessThanOrEqual(sizes.client + 1);
  }
});
