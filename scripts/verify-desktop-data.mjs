import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const failures = [];
const read = (path) => readFileSync(join(root, path), "utf8");

function filesBelow(directory) {
  const output = [];
  for (const name of readdirSync(join(root, directory))) {
    const absolute = join(root, directory, name);
    if (statSync(absolute).isDirectory()) output.push(...filesBelow(relative(root, absolute)));
    else output.push(relative(root, absolute));
  }
  return output;
}

const app = read("src/App.tsx");
if (/localStorage\.(setItem|getItem)\(["']poker-history["']/.test(app)) {
  failures.push("App.tsx 仍直接读写 poker-history");
}

const native = read("src-tauri/src/lib.rs");
for (const command of [
  "save_hand", "list_hands", "export_hands", "import_hands", "clear_hands",
  "get_model_settings", "save_model_settings", "set_api_key", "has_api_key", "test_ai",
  "get_gameplay_settings", "save_gameplay_settings",
]) {
  if (!native.includes(command)) failures.push(`缺少原生命令 ${command}`);
}
for (const command of ["export_hands", "import_hands"]) {
  const signature = native.match(new RegExp(`fn ${command}\\s*\\(([^)]*)\\)`))?.[1] ?? "";
  if (/path\s*:|String/.test(signature)) failures.push(`${command} 不得接受前端路径参数`);
}

const ui = [read("src/components/HistoryPage.tsx"), read("src/components/SettingsPage.tsx")].join("\n");
for (const label of ["导入 JSON", "导出 JSON", "确认清空", "保存 API Key", "测试连接", "开发预览不保存设置或密钥", "下一手生效"]) {
  if (!ui.includes(label)) failures.push(`缺少界面合同：${label}`);
}

const profiles = read("src/policy/tableProfiles.ts");
for (const value of ["balanced", "friends", "loose-wild", "标准均衡局", "普通朋友局", "宽松疯狂局"]) {
  if (!profiles.includes(value)) failures.push(`缺少牌局风格合同：${value}`);
}
const trainingTypes = read("src/training/types.ts");
for (const tag of ["overcalling", "squeeze-call-too-wide", "multiway-top-pair", "slow-play-strong-hand", "bet-means-nuts", "missed-worse-calls", "river-value-bluff-confusion", "dirty-outs", "players-behind"]) {
  if (!trainingTypes.includes(tag)) failures.push(`缺少弱点标签：${tag}`);
}
const game = read("src/game/game.ts");
for (const field of ["version: 9", "strategyVersion", "strategyDecisions", "playerProfiles", "friendBankrolls", "tableProfileId", "trainingTarget", "assessments", "assessmentStatus", "reviewDecisionInputs", "deepReviewStatus", "deepReview"]) {
  if (!game.includes(field)) failures.push(`缺少 GameState v9 合同：${field}`);
}
const playerProfiles = read("src/policy/playerProfiles.ts");
for (const field of ["friend-01", "friend-02", "friend-03", "friend-04", "friend-05", "friend-06", "effectivePlayerProfile", "validatePlayerProfiles"]) {
  if (!playerProfiles.includes(field)) failures.push(`缺少牌友画像合同：${field}`);
}
const storage = read("src-tauri/src/storage.rs");
for (const field of ["decision_assessments", "normalized_ev_loss", "user_version\", 3", "'gameplay'"]) {
  if (!storage.includes(field)) failures.push(`缺少 SQLite v3 合同：${field}`);
}
for (const component of ["SpecialTrainingPage.tsx", "WeaknessReportPage.tsx", "DeepReviewProgress.tsx", "DeepHandReview.tsx"]) {
  if (!filesBelow("src/components").some((path) => path.endsWith(component))) failures.push(`缺少真实训练组件：${component}`);
}

const tauriConfig = JSON.parse(read("src-tauri/tauri.conf.json"));
const bundleIcons = tauriConfig.bundle?.icon ?? [];
for (const icon of ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.icns", "icons/icon.ico"]) {
  if (!bundleIcons.includes(icon)) failures.push(`打包配置缺少应用图标：${icon}`);
}
for (const source of ["app-icon.svg", "app-icon-small.svg"]) {
  const svg = read(source);
  if (!/id="hero-wordmark"\s+transform="translate\((?:4[8-9]|[56][0-9]|7[0-2]) 0\)"/.test(svg)) {
    failures.push(`${source} 中文字标没有右移到视觉中心`);
  }
  if (/id="hero-wordmark"[^>]*scale\(/.test(svg)) {
    failures.push(`${source} 中文字标不得缩小`);
  }
}

const scanned = ["src", "src-tauri/src"]
  .flatMap(filesBelow)
  .filter((path) => !path.endsWith(".test.ts") && !path.endsWith(".test.tsx"));
for (const path of scanned) {
  const value = read(path);
  if (value.includes("SENTINEL-DESKTOP-SECRET")) failures.push(`${path} 含测试密钥`);
}

if (failures.length) {
  console.error(failures.map((failure) => `FAIL ${failure}`).join("\n"));
  process.exit(1);
}
console.log("desktop-data contract: PASS");
