import { spawnSync } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npm, ["run", "tauri", "--", "build", ...process.argv.slice(2)], {
  cwd: new URL("..", import.meta.url),
  env: { ...process.env, PLAYER_NAMES_MODE: "private" },
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
