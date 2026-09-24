import { defineConfig, devices } from "@playwright/test";

/** 专用 E2E 端口，避免与 tauri/dev 的 45231 脏端口冲突 */
const PORT = Number(process.env.E2E_PORT || 45331);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${PORT}`,
    url: baseURL,
    // 默认不复用，防止脏进程/错误构建；需要时设 E2E_REUSE=1
    reuseExistingServer: process.env.E2E_REUSE === "1",
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
