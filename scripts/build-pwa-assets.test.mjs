import assert from "node:assert/strict";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildPwaAssets } from "./build-pwa-assets.mjs";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("generates a versioned worker whose precache entries exist", async () => {
  const root = await mkdtemp(join(tmpdir(), "old-heroes-pwa-"));
  const distDir = join(root, "dist", "mobile");
  const sourceDir = join(projectRoot, "mobile");
  const iconDir = join(root, "icons");
  await mkdir(distDir, { recursive: true });
  await mkdir(join(root, "dist", "assets"), { recursive: true });
  await mkdir(iconDir, { recursive: true });
  await writeFile(join(distDir, "index.html"), '<!doctype html><script>new Worker(new URL("/assets/analysis.worker-ABC.js",location.href))</script>');
  await writeFile(join(root, "dist", "assets", "analysis.worker-ABC.js"), "self.onmessage=()=>{};");
  for (const file of ["icon-192.png", "icon-512.png", "apple-touch-icon.png"]) {
    await writeFile(join(iconDir, file), file);
  }

  await buildPwaAssets({ distDir, sourceDir, iconDir, version: "9.8.7" });

  const worker = await readFile(join(distDir, "service-worker.js"), "utf8");
  assert.match(worker, /old-heroes-pwa-9\.8\.7-/);
  assert.match(worker, /PWA_CACHE_READY/);
  assert.match(worker, /PWA_QUERY_STATUS/);
  assert.match(worker, /PWA_ACTIVATE_UPDATE/);
  assert.match(await readFile(join(distDir, "index.html"), "utf8"), /\.\/assets\/analysis\.worker-ABC\.js/);
  await access(join(distDir, "assets", "analysis.worker-ABC.js"));
  const match = worker.match(/const PRECACHE=(\[[^;]+\]);/);
  assert.ok(match);
  for (const url of JSON.parse(match[1])) {
    await access(join(distDir, url.replace(/^\.\//, "")));
  }
});

test("uses relative manifest navigation so GitHub Pages subpaths work", async () => {
  const root = await mkdtemp(join(tmpdir(), "old-heroes-pwa-"));
  const distDir = join(root, "dist", "mobile");
  const sourceDir = join(root, "mobile");
  const iconDir = join(root, "icons");
  await mkdir(distDir, { recursive: true });
  await mkdir(sourceDir, { recursive: true });
  await mkdir(iconDir, { recursive: true });
  await writeFile(join(distDir, "index.html"), '<link rel="manifest" href="/assets/manifest-HASH.webmanifest">');
  await writeFile(join(sourceDir, "manifest.webmanifest"), JSON.stringify({ start_url: "./", scope: "./" }));
  await writeFile(join(sourceDir, "recovery.html"), "recovery");
  await writeFile(join(sourceDir, "service-worker.template.js"), "const CACHE_NAME=__CACHE_NAME__;const APP_VERSION=__APP_VERSION__;const PRECACHE=__PRECACHE__;__WORKER_BODY__");
  for (const file of ["icon-192.png", "icon-512.png", "apple-touch-icon.png"]) await writeFile(join(iconDir, file), file);

  await buildPwaAssets({ distDir, sourceDir, iconDir, version: "1.0.0" });
  const manifest = JSON.parse(await readFile(join(distDir, "manifest.webmanifest"), "utf8"));
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.match(await readFile(join(distDir, "index.html"), "utf8"), /href="\.\/manifest\.webmanifest"/);
});
