import { defineConfig } from "@playwright/test";

export default defineConfig({
  timeout: 120_000,
  testDir: "tests/e2e",
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.WEB_CONTROL_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
});
