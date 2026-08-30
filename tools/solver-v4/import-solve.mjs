import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const output = option("--output", "public/assets/strategy-v4/strategy-v4-reference.json");
const potBb = Number(option("--pot-bb", "10"));
const effectiveStackBb = Number(option("--stack-bb", "100"));
const generatedAt = option("--generated-at", "2026-06-18T17:59:17.000Z");
const valueOptions = new Set(["--output", "--pot-bb", "--stack-bb", "--generated-at"]);
const inputs = [];
for (let index = 2; index < process.argv.length; index += 1) {
  if (valueOptions.has(process.argv[index])) { index += 1; continue; }
  if (!process.argv[index].startsWith("--")) inputs.push(process.argv[index]);
}
if (!inputs.length) throw new Error("usage: import-solve.mjs --output pack.json solve.json ...");

const rankValue = (rank) => "23456789TJQKA".indexOf(rank) + 2;

function boardFamily(cards) {
  const ranks = cards.map((card) => rankValue(card[0]));
  const suits = cards.map((card) => card[1]);
  const counts = (items) => [...items.reduce((map, item) => map.set(item, (map.get(item) ?? 0) + 1), new Map()).entries()];
  const rankCounts = counts(ranks).sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const suitMax = Math.max(...counts(suits).map(([, count]) => count));
  const high = Math.max(...ranks);
  const highBand = high === 14 ? "ace-high" : high >= 11 ? "broadway-high" : high >= 8 ? "mid" : "low";
  const paired = rankCounts.filter(([, count]) => count >= 2);
  const pairedStructure = rankCounts[0][1] >= 3 ? "trips"
    : paired.length >= 2 ? "two-pair"
      : paired.length === 1 ? paired[0][0] === high ? "top-paired" : "low-paired"
        : "unpaired";
  const suitStructure = suitMax >= 4 ? "four-flush" : suitMax === 3 ? "monotone" : suitMax === 2 ? "two-tone" : "rainbow";
  const rankSet = new Set(ranks);
  if (rankSet.has(14)) rankSet.add(1);
  let pressure = 0;
  for (let low = 1; low <= 10; low += 1) {
    let present = 0;
    for (let rank = low; rank < low + 5; rank += 1) if (rankSet.has(rank)) present += 1;
    pressure = Math.max(pressure, present);
  }
  const connectivity = pressure >= 4 ? "connected" : pressure === 3 ? "gutshot-rich" : "disconnected";
  const street = cards.length === 3 ? "flop" : cards.length === 4 ? "turn" : "river";
  return `bf3:${street}:${highBand}:${pairedStructure}:${suitStructure}:${connectivity}:s${pressure}`;
}

function parseCards(value) {
  return value.match(/[2-9TJQKA][shdc]/g) ?? [];
}

function opponentHandClasses(value) {
  const result = value.split(",").map((item) => item.trim()).filter(Boolean).map((hand) => {
    const exact = parseCards(hand);
    if (exact.length !== 2) return hand;
    const cards = exact.sort((first, second) => rankValue(second[0]) - rankValue(first[0]));
    if (cards[0][0] === cards[1][0]) return `${cards[0][0]}${cards[1][0]}`;
    return `${cards[0][0]}${cards[1][0]}${cards[0][1] === cards[1][1] ? "s" : "o"}`;
  });
  if (!result.length || result.some((hand) => !/^(?:[2-9TJQKA])(?:[2-9TJQKA])(?:s|o)?$/.test(hand))) {
    throw new Error(`unsupported opponent range notation: ${value}`);
  }
  return [...new Set(result)].sort();
}

function action(label, probability) {
  const lower = label.toLowerCase();
  const percent = /(?:bet|raise).*?(\d+(?:\.\d+)?)% pot/.exec(lower);
  const kind = lower.startsWith("fold") ? "fold"
    : lower.startsWith("check") ? "check"
      : lower.startsWith("call") ? "call"
        : lower.startsWith("all-in") ? "all-in"
          : lower.startsWith("raise") ? "raise" : "bet";
  return {
    kind,
    ...(percent ? { potFraction: Number(percent[1]) / 100 } : {}),
    frequency: probability,
  };
}

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
}

const grouped = new Map();
const inputHashes = [];
for (const filename of inputs) {
  const rawText = await readFile(filename, "utf8");
  inputHashes.push(createHash("sha256").update(rawText).digest("hex"));
  const raw = JSON.parse(rawText);
  const board = raw.board.trim().split(/\s+/);
  const hero = parseCards(raw.hero);
  if (hero.length !== 2) throw new Error(`${filename}: hero cards invalid`);
  for (const comboNodes of Object.values(raw.combos)) {
    for (const node of comboNodes) {
      if (node.off_path || node.hole_label !== raw.hero) continue;
      const key = `${node.infoset_key}|${node.history}|${raw.villain_range}`;
      const rangeClasses = opponentHandClasses(raw.villain_range);
      const groupKey = `${board.join("")}|${raw.hero}|${node.history}|${node.player}|${rangeClasses.join(",")}`;
      const existing = grouped.get(groupKey) ?? {
        key,
        street: board.length === 3 ? "flop" : board.length === 4 ? "turn" : "river",
        board,
        boardFamily: boardFamily(board),
        hero,
        opponentHandClasses: rangeClasses,
        history: node.history,
        actingPlayer: node.player,
        potBb,
        effectiveStackBb,
        reachProbability: 0,
        samples: 0,
        actionMass: new Map(),
      };
      existing.reachProbability += node.reach_prob;
      existing.samples += 1;
      for (const item of node.actions.map((entry) => action(entry.label, entry.prob))) {
        const actionKey = `${item.kind}:${item.potFraction ?? ""}`;
        const aggregate = existing.actionMass.get(actionKey) ?? { ...item, frequency: 0 };
        aggregate.frequency += item.frequency;
        existing.actionMass.set(actionKey, aggregate);
      }
      grouped.set(groupKey, existing);
    }
  }
}

const nodes = [...grouped.values()].map((group) => {
  const actions = [...group.actionMass.values()].map((item) => ({
    ...item,
    frequency: item.frequency / group.samples,
  }));
  const total = actions.reduce((sum, item) => sum + item.frequency, 0);
  actions.forEach((item) => { item.frequency /= total; });
  return {
    id: `sv4:${createHash("sha256").update(group.key).digest("hex").slice(0, 16)}`,
    street: group.street,
    board: group.board,
    boardFamily: group.boardFamily,
    hero: group.hero,
    opponentHandClasses: group.opponentHandClasses,
    history: group.history,
    actingPlayer: group.actingPlayer,
    potBb: group.potBb,
    effectiveStackBb: group.effectiveStackBb,
    reachProbability: group.reachProbability / group.samples,
    actions,
  };
});

const pack = {
  schemaVersion: 4,
  strategyVersion: "strategy-v4.0.0",
  source: {
    project: "amaster97/poker_solver",
    version: "1.11.0+f78f1b2",
    license: "MIT",
    algorithm: "DCFR",
    generatedAt,
    sourceHash: createHash("sha256").update(inputHashes.sort().join(":"), "utf8").digest("hex"),
  },
  nodes: nodes.sort((first, second) => first.id.localeCompare(second.id)),
};
const encoded = canonical(pack);
const sha256 = createHash("sha256").update(encoded).digest("hex");
await mkdir(dirname(output), { recursive: true });
await writeFile(output, encoded);
await writeFile(`${output}.manifest.json`, JSON.stringify({ sha256, byteLength: Buffer.byteLength(encoded), nodeCount: nodes.length }, null, 2));
console.log(JSON.stringify({ output, sha256, nodeCount: nodes.length, byteLength: Buffer.byteLength(encoded) }));
