import type { PolicyCandidate } from "./types";

export function probabilitiesFromEv(
  candidates: PolicyCandidate[],
  temperature: number,
  evFloor: number,
): PolicyCandidate[] {
  if (!candidates.length) return [];
  const best = Math.max(...candidates.map((candidate) => candidate.ev));
  const scale = Math.max(0.001, temperature);
  const weights = candidates.map((candidate) =>
    candidate.ev < best - evFloor
      ? 0
      : Math.exp(Math.max(-50, (candidate.ev - best) / scale)),
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return candidates.map((candidate, index) => ({
    ...candidate,
    probability: total ? weights[index] / total : 0,
  }));
}

function seededUnit(seed: number, decisionIndex: number) {
  let value = (seed ^ Math.imul(decisionIndex + 1, 0x45d9f3b)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b) >>> 0;
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

export function sampleCandidate(
  candidates: PolicyCandidate[],
  seed: number,
  decisionIndex: number,
) {
  if (!candidates.length) throw new Error("策略没有可抽样动作");
  const sampled = seededUnit(seed, decisionIndex);
  let cumulative = 0;
  for (const candidate of candidates) {
    cumulative += candidate.probability;
    if (sampled < cumulative) return { candidate, sampled };
  }
  const candidate = [...candidates].reverse().find((item) => item.probability > 0);
  return { candidate: candidate ?? candidates[0], sampled };
}
