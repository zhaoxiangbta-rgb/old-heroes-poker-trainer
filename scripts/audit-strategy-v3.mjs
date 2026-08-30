import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync(
  process.execPath,
  [resolve(root, "node_modules/vite-node/vite-node.mjs"), resolve(root, "scripts/audit-strategy-v3-runner.ts")],
  { cwd: root, stdio: "inherit" },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
