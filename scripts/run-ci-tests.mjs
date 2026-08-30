import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const shardCount = 8;
const vitestEntry = resolve("node_modules/vitest/vitest.mjs");

for (let shard = 1; shard <= shardCount; shard += 1) {
  console.log(`\n[ci] running Vitest shard ${shard}/${shardCount}`);
  const result = spawnSync(
    process.execPath,
    [
      vitestEntry,
      "run",
      "--no-file-parallelism",
      `--shard=${shard}/${shardCount}`,
      "--reporter=dot",
    ],
    { stdio: "inherit" },
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
