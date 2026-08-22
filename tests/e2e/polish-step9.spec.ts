import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function openPlanner(page: Page) {
  await page.goto("/");
  const skip = page.getByRole("button", { name: "Пропустить всё знакомство" });
  const header = page.locator(".app-header");
  await expect(skip.or(header).first()).toBeVisible({ timeout: 20_000 });
  if (await skip.isVisible()) await skip.click();
  await expect(header).toBeVisible();
}

test("page turning follows the saved setting and reduced motion", async ({ page }) => {
  await openPlanner(page);
  const navigation = page.getByRole("navigation", { name: "Основные разделы" }).first();
  await navigation.getByRole("button", { name: "Настройки" }).click();
  const toggle = page.getByLabel("Анимация перелистывания");
  if (!await toggle.isChecked()) { await toggle.click(); await expect(page.getByText("Сохранено", { exact: true })).toBeVisible(); }
  await navigation.getByRole("button", { name: "Сегодня" }).click();
  await page.getByRole("button", { name: "Следующий день" }).click();
  const animated = page.locator(".page-turn-forward");
  await expect(animated).toBeVisible();
  expect(await animated.evaluate((element) => getComputedStyle(element).animationDuration)).toBe("0.22s");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Следующий день" }).click();
  await expect(page.locator(".page-turn-forward")).toBeVisible();
  expect(await page.locator(".page-turn-forward").evaluate((element) => getComputedStyle(element).animationName)).toBe("none");

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await navigation.getByRole("button", { name: "Настройки" }).click();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await navigation.getByRole("button", { name: "Сегодня" }).click();
  await page.getByRole("button", { name: "Следующий день" }).click();
  await expect(page.locator(".page-turn-static")).toBeVisible();
  await expect(page.locator(".page-turn-forward, .page-turn-backward")).toHaveCount(0);
  await navigation.getByRole("button", { name: "Настройки" }).click();
  await toggle.click();
  await expect(toggle).toBeChecked();
});

test("required viewports keep the page inside the screen and preserve book order", async ({ page }, testInfo) => {
  await openPlanner(page);
  for (const width of [360, 768, 1024, 1200, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const columns = await page.locator(".planner-book").evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
    expect(columns).toBe(width >= 1024 ? 2 : 1);
    const pages = await page.locator(".planner-book .book-page").evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().top));
    if (width < 1024) expect(pages[1]).toBeGreaterThan(pages[0] ?? 0);
    await testInfo.attach(`today-${width}px`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  }
});

test("keyboard route remains usable at an effective 200 percent scale", async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 900 });
  await openPlanner(page);
  const task = page.getByLabel("Новая задача");
  await task.focus();
  await task.pressSequentially("Проверить клавиатуру");
  await task.press("Enter");
  const priority = page.getByLabel("Приоритет задачи «Проверить клавиатуру»");
  await priority.focus();
  await priority.selectOption("1");
  await expect(page.locator(".priority-list").getByLabel("Название задачи")).toHaveValue("Проверить клавиатуру");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("dialogs trap keyboard focus, close with Escape and return focus", async ({ page }) => {
  await openPlanner(page);
  const source = page.getByRole("button", { name: "Источник" });
  await source.focus();
  await source.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Источник цитаты" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Закрыть" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Открыть полный первоисточник" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(source).toBeFocused();
});

test("main screens have no automatically detectable WCAG A or AA violations", async ({ page }) => {
  await openPlanner(page);
  const externalRequests: string[] = [];
  page.on("request", (request) => { if (!request.url().startsWith("http://127.0.0.1:3210")) externalRequests.push(request.url()); });
  const navigation = page.getByRole("navigation", { name: "Основные разделы" }).first();
  for (const section of ["Сегодня", "Неделя", "Привычки", "Прогресс", "Архив", "Настройки"]) {
    await navigation.getByRole("button", { name: section, exact: true }).click();
    await page.waitForTimeout(150);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.map((violation) => ({ id: violation.id, targets: violation.nodes.map((node) => node.target) })), section).toEqual([]);
  }
  expect(externalRequests).toEqual([]);
});
