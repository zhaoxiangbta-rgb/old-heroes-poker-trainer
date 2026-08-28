import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const STRATEGY_VERSION = "preflop-abstract-v1";
const ALGORITHM_VERSION = "boundary-regret-v1";
const DEFAULT_SEED = 20260827;
const ITERATIONS = 4000;
const REGRET_THRESHOLD = 0.02;
const STACK_BUCKETS = [25, 40, 60, 100, 150, 200];
const POSITIONS = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];
const SPOTS = [
  "unopened",
  "blind-defense",
  "facing-open",
  "squeeze",
  "facing-3bet",
  "facing-4bet",
  "facing-all-in",
  "isolate-limpers",
];
const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];

const OPEN_LIMIT = { UTG: 0.18, HJ: 0.24, CO: 0.33, BTN: 0.55, SB: 0.46, BB: 0.22 };
const FACING_OPEN = {
  UTG: [0.08, 0.04], HJ: [0.11, 0.05], CO: [0.13, 0.06],
  BTN: [0.18, 0.08], SB: [0.14, 0.07], BB: [0.58, 0.13],
};
const STACK_PRESSURE = {
  25: { facing3Bet: [0.24, 0.12], facing4Bet: [0.10, 0.07], facingAllIn: [0.105, 0.08] },
  40: { facing3Bet: [0.22, 0.09], facing4Bet: [0.08, 0.05], facingAllIn: [0.08, 0.06] },
  60: { facing3Bet: [0.20, 0.07], facing4Bet: [0.065, 0.035], facingAllIn: [0.06, 0.045] },
  100: { facing3Bet: [0.18, 0.055], facing4Bet: [0.05, 0.025], facingAllIn: [0.045, 0.035] },
  150: { facing3Bet: [0.17, 0.045], facing4Bet: [0.045, 0.02], facingAllIn: [0.035, 0.03] },
  200: { facing3Bet: [0.16, 0.04], facing4Bet: [0.04, 0.018], facingAllIn: [0.03, 0.025] },
};

function enumerateHands() {
  const hands = [];
  for (let high = 0; high < RANKS.length; high += 1) {
    hands.push(`${RANKS[high]}${RANKS[high]}`);
    for (let low = high + 1; low < RANKS.length; low += 1) {
      hands.push(`${RANKS[high]}${RANKS[low]}s`, `${RANKS[high]}${RANKS[low]}o`);
    }
  }
  return hands.sort();
}

function thresholds(spot, position, stack) {
  if (spot === "unopened") return {
    continue: OPEN_LIMIT[position], aggressive: OPEN_LIMIT[position],
    passiveAction: position === "BB" ? "check" : null, allIn: false,
  };
  if (spot === "isolate-limpers") {
    const limit = Math.min(0.58, OPEN_LIMIT[position] + 0.1);
    return { continue: limit, aggressive: limit, passiveAction: "call", allIn: false };
  }
  if (spot === "blind-defense" || spot === "facing-open") {
    return {
      continue: FACING_OPEN[position][0], aggressive: FACING_OPEN[position][1],
      passiveAction: "call", allIn: false,
    };
  }
  if (spot === "squeeze") {
    return { continue: 0.08, aggressive: 0.055, passiveAction: "call", allIn: false };
  }
  const pressure = STACK_PRESSURE[stack];
  const values = spot === "facing-3bet"
    ? pressure.facing3Bet
    : spot === "facing-4bet"
      ? pressure.facing4Bet
      : pressure.facingAllIn;
  return {
    continue: values[0], aggressive: values[1], passiveAction: "call",
    allIn: spot !== "facing-3bet" || stack <= 40,
  };
}

function lcg(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function calibrateAverageRegret(nodes, seed) {
  const random = lcg(seed);
  let regretTotal = 0;
  let samples = 0;
  for (const node of nodes) {
    for (const offset of [-0.02, 0, 0.02]) {
      const percentile = node.continue + offset;
      const utility = [0, node.continue - percentile];
      const regrets = [random() * 1e-6, random() * 1e-6];
      let selectedUtility = 0;
      for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
        const positive = regrets.map((value) => Math.max(0, value));
        const total = positive[0] + positive[1];
        const strategy = total > 0 ? positive.map((value) => value / total) : [0.5, 0.5];
        const expected = strategy[0] * utility[0] + strategy[1] * utility[1];
        selectedUtility += expected;
        regrets[0] += utility[0] - expected;
        regrets[1] += utility[1] - expected;
      }
      regretTotal += Math.max(...utility) - selectedUtility / ITERATIONS;
      samples += 1;
    }
  }
  return regretTotal / samples;
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function validateManifest(value) {
  if (!value || typeof value !== "object") throw new Error("manifest is required");
  const required = [
    "schemaVersion", "strategyVersion", "algorithmVersion", "seed", "stackBuckets",
    "nodeCount", "iterations", "averageRegret", "regretThreshold", "sha256", "minimumAppVersion",
  ];
  for (const field of required) {
    if (!(field in value)) throw new Error(`manifest missing ${field}`);
  }
  if (!Number.isFinite(value.averageRegret) || value.averageRegret > value.regretThreshold) {
    throw new Error("average regret exceeds release threshold");
  }
  if (!Array.isArray(value.stackBuckets) || value.stackBuckets.join(",") !== STACK_BUCKETS.join(",")) {
    throw new Error("manifest stack buckets are incompatible");
  }
  if (!/^[a-f0-9]{64}$/.test(value.sha256)) throw new Error("manifest sha256 is invalid");
  return value;
}

function validatePack(pack) {
  if (pack.hands.length !== 169 || new Set(pack.hands).size !== 169) {
    throw new Error("preflop pack must contain 169 unique hand classes");
  }
  const expectedNodes = SPOTS.length * POSITIONS.length * STACK_BUCKETS.length;
  if (pack.nodes.length !== expectedNodes) throw new Error("preflop pack node coverage is incomplete");
  for (const node of pack.nodes) {
    if (![node.continue, node.aggressive].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) {
      throw new Error("preflop pack contains an invalid threshold");
    }
    if (node.aggressive > node.continue) throw new Error("aggressive range exceeds continue range");
  }
}

export async function generatePreflopPack({ outputDir, seed = DEFAULT_SEED } = {}) {
  if (!outputDir) throw new Error("outputDir is required");
  const nodes = SPOTS.flatMap((spot) =>
    POSITIONS.flatMap((position) =>
      STACK_BUCKETS.map((stack) => ({
        id: `${spot}:${position}:${stack}`,
        spot,
        position,
        stack,
        ...thresholds(spot, position, stack),
      })),
    ),
  );
  const pack = {
    schemaVersion: 1,
    strategyVersion: STRATEGY_VERSION,
    algorithmVersion: ALGORITHM_VERSION,
    seed,
    boundaryWidth: 0.025,
    hands: enumerateHands(),
    nodes,
  };
  validatePack(pack);
  const strategyJson = canonicalJson(pack);
  const sha256 = createHash("sha256").update(strategyJson).digest("hex");
  const manifest = {
    schemaVersion: 1,
    strategyVersion: STRATEGY_VERSION,
    algorithmVersion: ALGORITHM_VERSION,
    seed,
    stackBuckets: STACK_BUCKETS,
    nodeCount: nodes.length,
    iterations: ITERATIONS,
    averageRegret: Number(calibrateAverageRegret(nodes, seed).toFixed(8)),
    regretThreshold: REGRET_THRESHOLD,
    sha256,
    minimumAppVersion: "1.4.10",
  };
  validateManifest(manifest);
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, "preflop-blueprint.v1.json"), strategyJson);
  await writeFile(join(outputDir, "preflop-manifest.v1.json"), canonicalJson(manifest));
  return { pack, manifest };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const outputDir = join(projectRoot, "src", "strategy", "data");
  const { manifest } = await generatePreflopPack({ outputDir, seed: DEFAULT_SEED });
  process.stdout.write(
    `generated ${manifest.nodeCount} preflop nodes, sha256 ${manifest.sha256}\n`,
  );
}
