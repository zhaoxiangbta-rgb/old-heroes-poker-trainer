import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const appVersion = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version as string;

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __STRATEGY_STRESS_HANDS__: JSON.stringify(
      Number(process.env.STRATEGY_STRESS_HANDS ?? 1_000),
    ),
    __STRATEGY_STRESS_ENABLED__: JSON.stringify(
      process.env.STRATEGY_STRESS_ENABLED === "true",
    ),
    __STRATEGY_STRESS_FIRST_SEED__: JSON.stringify(
      Number(process.env.STRATEGY_STRESS_FIRST_SEED ?? 1),
    ),
  },
  clearScreen: false,
  build: {
    manifest: true,
    rollupOptions: {
      input: {
        desktop: resolve(__dirname, "index.html"),
        mobile: resolve(__dirname, "mobile/index.html"),
      },
    },
  },
  test: { include: ["src/**/*.test.{ts,tsx}"] },
  server: { host: true, port: 1420, strictPort: true },
});
