import { defineConfig } from "@playwright/test";
import path from "node:path";

const e2eDatabase = path.resolve("tmp/e2e.db");
process.env.DATABASE_URL = `file:${e2eDatabase.replaceAll("\\", "/")}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3210",
    channel: "chrome",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: "http://127.0.0.1:3210/api/health",
    timeout: 120_000,
    reuseExistingServer: process.env.UTRENNIY_E2E_REUSE === "1",
    env: {
      DATABASE_URL: process.env.DATABASE_URL,
      APP_DATA_ROOT: "./tmp/e2e-data",
      NEXT_TELEMETRY_DISABLED: "1"
    }
  }
});
