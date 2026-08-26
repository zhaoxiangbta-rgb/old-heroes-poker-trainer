import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "mobile-pwa.spec.ts",
  timeout: 30_000,
  use: {
    ...devices["iPhone 14 Pro Max"],
    baseURL: "http://127.0.0.1:4178",
    screenshot: "only-on-failure",
    serviceWorkers: "allow",
  },
  projects: [{ name: "webkit", use: { browserName: "webkit" } }],
  webServer: {
    command: "node scripts/serve-pwa.mjs",
    url: "http://127.0.0.1:4178/",
    reuseExistingServer: true,
  },
});
