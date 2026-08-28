import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  generatePreflopPack,
  validateManifest,
} from "./generate-preflop-blueprint.mjs";

test("same generator config produces byte-identical strategy data and manifest", async () => {
  const first = await mkdtemp(join(tmpdir(), "preflop-pack-a-"));
  const second = await mkdtemp(join(tmpdir(), "preflop-pack-b-"));
  try {
    await generatePreflopPack({ outputDir: first, seed: 20260827 });
    await generatePreflopPack({ outputDir: second, seed: 20260827 });
    assert.equal(
      await readFile(join(first, "preflop-blueprint.v1.json"), "utf8"),
      await readFile(join(second, "preflop-blueprint.v1.json"), "utf8"),
    );
    assert.equal(
      await readFile(join(first, "preflop-manifest.v1.json"), "utf8"),
      await readFile(join(second, "preflop-manifest.v1.json"), "utf8"),
    );
  } finally {
    await rm(first, { recursive: true, force: true });
    await rm(second, { recursive: true, force: true });
  }
});

test("seed is recorded and participates in the generated strategy hash", async () => {
  const first = await mkdtemp(join(tmpdir(), "preflop-seed-a-"));
  const second = await mkdtemp(join(tmpdir(), "preflop-seed-b-"));
  try {
    const a = await generatePreflopPack({ outputDir: first, seed: 7 });
    const b = await generatePreflopPack({ outputDir: second, seed: 8 });
    assert.equal(a.manifest.seed, 7);
    assert.equal(b.manifest.seed, 8);
    assert.notEqual(a.manifest.sha256, b.manifest.sha256);
  } finally {
    await rm(first, { recursive: true, force: true });
    await rm(second, { recursive: true, force: true });
  }
});

test("manifest quality gate rejects incomplete or non-converged output", () => {
  assert.throws(() => validateManifest({}), /manifest/);
  assert.throws(
    () => validateManifest({
      schemaVersion: 1,
      strategyVersion: "preflop-abstract-v1",
      algorithmVersion: "boundary-regret-v1",
      seed: 1,
      stackBuckets: [25, 40, 60, 100, 150, 200],
      nodeCount: 288,
      iterations: 4000,
      averageRegret: 1,
      regretThreshold: 0.02,
      sha256: "a".repeat(64),
      minimumAppVersion: "1.4.10",
    }),
    /regret/,
  );
});
