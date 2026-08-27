import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:4179", screenshot: "only-on-failure" },
  webServer: { command: "node scripts/serve-desktop.mjs", url: "http://127.0.0.1:4179/", reuseExistingServer: true },
});
