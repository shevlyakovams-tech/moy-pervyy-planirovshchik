import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/pages",
  timeout: 30_000,
  fullyParallel: false,
  globalSetup: "./tests/pages/global-setup.ts",
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure" },
  projects: [{ name: "chrome", use: { browserName: "chromium", channel: "chrome" } }]
});
