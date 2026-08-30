import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const shardCount = 8;
const vitestEntry = resolve("node_modules/vitest/vitest.mjs");

function runVitest(args, label) {
  console.log(`\n[ci] ${label}`);
  const result = spawnSync(process.execPath, [vitestEntry, "run", ...args], {
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

for (let shard = 1; shard <= shardCount; shard += 1) {
  runVitest(
    [
      "--no-file-parallelism",
      `--shard=${shard}/${shardCount}`,
      "--reporter=dot",
      "--exclude=src/training/targetedScenario.test.ts",
      "--exclude=src/game/game.test.ts",
    ],
    `running standard Vitest shard ${shard}/${shardCount}`,
  );
}

const targetedFile = "src/training/targetedScenario.test.ts";
const targetedGroups = [
  "only marks|falls back",
  "raises the deterministic setup hit rate for (overcalling|squeeze-call-too-wide)",
  "raises the deterministic setup hit rate for multiway-top-pair",
  "raises the deterministic setup hit rate for (slow-play-strong-hand|bet-means-nuts)|completes a legal short-stack",
];

targetedGroups.forEach((pattern, index) => {
  runVitest(
    [targetedFile, "--no-file-parallelism", "--reporter=dot", "--testNamePattern", pattern],
    `running targeted-scenario group ${index + 1}/${targetedGroups.length}`,
  );
});

const gameFile = "src/game/game.test.ts";
const longGameTest = "simulates 6-player strategy seeds 1-1000 legally";
runVitest(
  [gameFile, "--no-file-parallelism", "--reporter=dot", "--testNamePattern", longGameTest],
  "running 6-player 1,000-seed legality audit",
);
runVitest(
  [
    gameFile,
    "--no-file-parallelism",
    "--reporter=dot",
    "--testNamePattern",
    `^(?!.*${longGameTest}).*$`,
  ],
  "running remaining playable-loop tests",
);
