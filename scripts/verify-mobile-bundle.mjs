import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../dist/mobile/", import.meta.url));
const files = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else files.push(path);
  }
}
await walk(root);
const required = ["index.html", "manifest.webmanifest", "service-worker.js", "recovery.html", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];
for (const name of required) if (!files.includes(join(root, name))) throw new Error(`mobile bundle missing: ${name}`);
const casinoRoot = join(root, "assets", "mobile-casino");
const portraits = files.filter((path) => path.startsWith(join(casinoRoot, "avatars")) && /player-0[1-6]\.jpg$/.test(path));
if (portraits.length !== 6) throw new Error(`mobile bundle requires exactly six portraits, found ${portraits.length}`);
for (const relative of ["textures/felt.jpg", "textures/leather.jpg", "controls/chip-fold.jpg", "controls/chip-primary.jpg", "controls/chip-all-in.jpg"]) {
  if (!files.includes(join(casinoRoot, relative))) throw new Error(`mobile casino asset missing: ${relative}`);
}
const visualRoot = join(root, "assets", "poker-visuals");
const visualPortraits = files.filter((path) => path.startsWith(join(visualRoot, "avatars")) && /player-0[1-6]\.png$/.test(path));
if (visualPortraits.length !== 6) throw new Error(`unified visual bundle requires exactly six portraits, found ${visualPortraits.length}`);
for (const relative of ["cards/card-paper.png", "cards/card-back.png", "controls/fold.png", "controls/check.png", "controls/primary.png", "controls/all-in.png", "chips/wager-red.png", "chips/wager-blue.png", "chips/wager-green.png", "chips/wager-black.png", "chips/wager-gold.png"]) {
  if (!files.includes(join(visualRoot, relative))) throw new Error(`unified poker visual missing: ${relative}`);
}
const strategyPath = join(root, "assets", "strategy", "strategy-v3-mobile.ohsp3");
if (!files.includes(strategyPath)) throw new Error("mobile V3 strategy pack missing");
const strategyText = await readFile(strategyPath, "utf8");
if (!strategyText.startsWith("OHSP3\n")) throw new Error("mobile V3 strategy pack magic invalid");
const manifestEnd = strategyText.indexOf("\n", 6);
const strategyManifest = JSON.parse(strategyText.slice(6, manifestEnd));
const strategyPayload = strategyText.slice(manifestEnd + 1);
const { createHash } = await import("node:crypto");
if (strategyManifest.packKind !== "mobile" || strategyManifest.schemaVersion !== 3) {
  throw new Error("mobile V3 strategy manifest invalid");
}
if (createHash("sha256").update(strategyPayload).digest("hex") !== strategyManifest.sha256) {
  throw new Error("mobile V3 strategy hash mismatch");
}
const solverV4Path = join(root, "assets", "strategy-v4", "strategy-v4-reference.json");
const solverV4ManifestPath = `${solverV4Path}.manifest.json`;
if (!files.includes(solverV4Path) || !files.includes(solverV4ManifestPath)) {
  throw new Error("mobile V4 Solver reference pack missing");
}
const solverV4Text = await readFile(solverV4Path, "utf8");
const solverV4 = JSON.parse(solverV4Text);
const solverV4Manifest = JSON.parse(await readFile(solverV4ManifestPath, "utf8"));
if (solverV4.strategyVersion !== "strategy-v4.0.0" || solverV4.schemaVersion !== 4 ||
    !solverV4.nodes.length || solverV4.nodes.some((node) => !node.opponentHandClasses?.length)) {
  throw new Error("mobile V4 Solver reference pack invalid");
}
if (createHash("sha256").update(solverV4Text).digest("hex") !== solverV4Manifest.sha256) {
  throw new Error("mobile V4 Solver reference hash mismatch");
}
const forbidden = ["SENTINEL-DESKTOP-SECRET", "player-names.local.json", "Bella", "哈队", "倪少", "零哥", "Q大爷", "董秘"];
for (const file of files.filter((path) => /\.(html|js|css|json)$/.test(path))) {
  const content = await readFile(file, "utf8");
  for (const needle of forbidden) if (content.includes(needle)) throw new Error(`forbidden mobile bundle content: ${needle}`);
  if (/https?:\/\/[^)'"\s]+\.(?:png|jpe?g|webp|gif)/i.test(content)) throw new Error(`remote image URL in mobile bundle: ${file}`);
  if (/192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+/.test(content)) throw new Error(`fixed private address in mobile bundle: ${file}`);
}
const index = await readFile(join(root, "index.html"), "utf8");
const mobileScriptPath = files.find((path) => path.endsWith("mobile-app.js"));
const mobileScript = mobileScriptPath ? await readFile(mobileScriptPath, "utf8") : index;
if (!mobileScript.includes("OldHeroesMobile") && !mobileScript.includes("preflop-abstract-v1")) {
  throw new Error("mobile strategy runtime missing");
}
for (const fact of [
  "preflop-abstract-v1",
  "hu-postflop-abstract-v1",
  "multiway-resolver-v1",
  "strategy-v3",
  "explicit-matrix-v3",
  "combo-elasticity-multistreet-v3",
]) {
  if (!mobileScript.includes(fact)) throw new Error(`mobile strategy fact missing: ${fact}`);
}
if (index.includes('"/assets/')) throw new Error("absolute asset URL is not compatible with a Pages subpath");
const manifest = JSON.parse(await readFile(join(root, "manifest.webmanifest"), "utf8"));
if (manifest.start_url !== "./" || manifest.scope !== "./" || manifest.display !== "standalone") throw new Error("invalid PWA manifest scope");
const worker = await readFile(join(root, "service-worker.js"), "utf8");
const precacheMatch = worker.match(/const PRECACHE=(\[[^;]+\]);/);
if (!precacheMatch) throw new Error("service worker precache list missing");
for (const url of JSON.parse(precacheMatch[1])) {
  const path = join(root, url.replace(/^\.\//, ""));
  if (!files.includes(path)) throw new Error(`precache resource missing: ${url}`);
}
const workflow = await readFile(fileURLToPath(new URL("../.github/workflows/pages.yml", import.meta.url)), "utf8");
for (const requiredStep of ["npm ci", "npm run test:ci", "npm run build", "npm run verify:mobile-bundle", "path: dist/mobile"]) {
  if (!workflow.includes(requiredStep)) throw new Error(`Pages workflow missing required step: ${requiredStep}`);
}
console.log(`mobile PWA verified: ${files.length} files, complete precache, no private identities or secrets`);
