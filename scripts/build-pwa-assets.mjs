import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const assetNames = ["manifest.webmanifest", "recovery.html"];
const iconNames = ["icon-192.png", "icon-512.png", "apple-touch-icon.png"];

export async function buildPwaAssets({
  distDir = join(projectRoot, "dist/mobile"),
  sourceDir = join(projectRoot, "mobile"),
  iconDir = join(projectRoot, "public/pwa"),
  version,
} = {}) {
  if (!version) {
    const pkg = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8"));
    version = pkg.version;
  }
  await mkdir(distDir, { recursive: true });
  for (const name of assetNames) await copyFile(join(sourceDir, name), join(distDir, name));
  for (const name of iconNames) await copyFile(join(iconDir, name), join(distDir, name));

  const indexPath = join(distDir, "index.html");
  const index = (await readFile(indexPath, "utf8"))
    .replace(/href="[^"]*manifest-[^"]+\.webmanifest"/, 'href="./manifest.webmanifest"');
  const referencedAssets = [...index.matchAll(/\/assets\/([A-Za-z0-9._-]+)/g)].map((match) => match[1]);
  if (referencedAssets.length) await mkdir(join(distDir, "assets"), { recursive: true });
  for (const name of referencedAssets) await copyFile(join(dirname(distDir), "assets", name), join(distDir, "assets", name));
  await writeFile(indexPath, index.replaceAll('/assets/', './assets/'));

  const precache = ["./index.html", ...assetNames.map((name) => `./${name}`), ...iconNames.map((name) => `./${name}`), ...referencedAssets.map((name) => `./assets/${name}`)];
  const hash = createHash("sha256");
  for (const url of precache) hash.update(await readFile(join(distDir, url.slice(2))));
  const cacheName = `old-heroes-pwa-${version}-${hash.digest("hex").slice(0, 12)}`;
  const template = await readFile(join(sourceDir, "service-worker.template.js"), "utf8");
  const worker = template
    .replace("__CACHE_NAME__", JSON.stringify(cacheName))
    .replace("__APP_VERSION__", JSON.stringify(version))
    .replace("__PRECACHE__", JSON.stringify(precache))
    .replace("__WORKER_BODY__", "");
  await writeFile(join(distDir, "service-worker.js"), worker);
  return { cacheName, precache };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await buildPwaAssets();
}
