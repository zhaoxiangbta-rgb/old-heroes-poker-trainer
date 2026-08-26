import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const appVersion = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version as string;

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
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
