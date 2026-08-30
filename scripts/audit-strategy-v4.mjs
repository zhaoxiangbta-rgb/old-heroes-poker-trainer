import { spawnSync } from "node:child_process";

const hands = Number(process.env.STRATEGY_STRESS_HANDS ?? 10_000);
const run = (files, environment = {}) => spawnSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["exec", "--", "vitest", "run", ...files, "--no-file-parallelism"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      ...environment,
    },
  },
);

const golden = run(["src/strategy/v4/goldenSpots.test.ts"]);
if (golden.status !== 0) process.exit(golden.status ?? 1);

const batchSize = Math.min(1_000, hands);
for (let completed = 0; completed < hands; completed += batchSize) {
  const current = Math.min(batchSize, hands - completed);
  const stress = run(["src/strategy/stressGate.test.ts"], {
    STRATEGY_STRESS_ENABLED: "true",
    STRATEGY_STRESS_HANDS: String(current),
    STRATEGY_STRESS_FIRST_SEED: String(completed + 1),
  });
  if (stress.status !== 0) process.exit(stress.status ?? 1);
}
console.log(JSON.stringify({ goldenFamilies: 3, randomHandsPerTableSize: hands, batchSize, fatalIssues: 0 }));
