import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const appVersion = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version as string;

function inlineMobileEntry() {
  return {
    name: "inline-mobile-entry",
    closeBundle() {
      const htmlPath = "dist/mobile/index.html";
      const boot = readFileSync("dist/mobile-boot.js", "utf8").replaceAll("</script", "<\\/script");
      const app = readFileSync("dist/mobile-app.js", "utf8").replaceAll("</script", "<\\/script");
      const css = readFileSync("dist/mobile-app.css", "utf8").replaceAll("</style", "<\\/style");
      const html = readFileSync(htmlPath, "utf8")
        .replace('<script src="/mobile-boot.js"></script>', () => `<script>${boot}</script>`)
        .replace('<link rel="stylesheet" href="/mobile-app.css" />', () => `<style>${css}</style>`)
        .replace(
          '<script defer src="/mobile-app.js"></script>',
          () => `<script>document.addEventListener("DOMContentLoaded",function(){${app}});</script>`,
        );
      writeFileSync(htmlPath, html);
    },
  };
}

export default defineConfig({
  plugins: [react(), inlineMobileEntry()],
  resolve: {
    alias: [
      { find: "./ai/useAiLiveCoach", replacement: resolve("src/mobile/noAiLiveCoach.ts") },
      { find: "./ai/useAiHandReview", replacement: resolve("src/mobile/noAiHandReview.ts") },
      { find: "./components/AiLiveCoach", replacement: resolve("src/mobile/NoAiLiveCoach.tsx") },
      { find: "./components/SettingsPage", replacement: resolve("src/mobile/MobileSettingsPage.tsx") },
    ],
  },
  publicDir: false,
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  build: {
    emptyOutDir: false,
    cssCodeSplit: false,
    lib: {
      entry: "src/mobile/main.tsx",
      name: "OldHeroesMobile",
      formats: ["iife"],
      fileName: () => "mobile-app.js",
      cssFileName: "mobile-app",
    },
    outDir: "dist",
    target: "safari14",
    minify: "terser",
    terserOptions: {
      compress: { passes: 2 },
      format: { comments: false },
    },
  },
});
