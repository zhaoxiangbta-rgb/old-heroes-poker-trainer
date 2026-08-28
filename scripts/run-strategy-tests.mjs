import { spawnSync } from "node:child_process";

const executable = process.platform === "win32" ? "npx.cmd" : "npx";
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const environment = {
  ...process.env,
  STRATEGY_STRESS_HANDS: "1000",
  PLAYER_NAMES_MODE: "public",
};
const prepared = spawnSync(npmExecutable, ["run", "prepare:names"], {
  stdio: "inherit",
  env: environment,
});
if (prepared.status !== 0) process.exit(prepared.status ?? 1);
const result = spawnSync(
  executable,
  ["vitest", "run", "src/strategy", "src/game/game.test.ts", "--maxWorkers=2"],
  {
    stdio: "inherit",
    env: environment,
  },
);
if (result.status !== 0) process.exit(result.status ?? 1);

for (let batch = 0; batch < 10; batch += 1) {
  const stress = spawnSync(
    executable,
    ["vitest", "run", "src/strategy/stressGate.test.ts", "--maxWorkers=1"],
    {
      stdio: "inherit",
      env: {
        ...environment,
        STRATEGY_STRESS_ENABLED: "true",
        STRATEGY_STRESS_FIRST_SEED: String(batch * 1_000 + 1),
      },
    },
  );
  if (stress.status !== 0) process.exit(stress.status ?? 1);
}

process.exit(0);
