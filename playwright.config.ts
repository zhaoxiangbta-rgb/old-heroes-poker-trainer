import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:4178", screenshot: "only-on-failure" },
  webServer: { command: "node scripts/serve-pwa.mjs", url: "http://127.0.0.1:4178/", reuseExistingServer: true },
});
