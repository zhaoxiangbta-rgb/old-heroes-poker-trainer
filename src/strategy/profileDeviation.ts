import type { HandPlayerProfile } from "../policy/playerProfiles";
import type { TableProfileId } from "../policy/tableProfiles";
import type { StrategyAction, StrategyResult } from "./types";

const MAX_SHIFT = 0.15;

function tableMultiplier(action: StrategyAction, profile: TableProfileId) {
  if (profile === "balanced") return 1;
  if (profile === "friends") {
    if (action.action === "fold") return 0.78;
    if (action.action === "call") return 1.35;
    if (action.action === "raise" || action.action === "all-in") return 0.86;
    return 1;
  }
  if (action.action === "fold") return 0.58;
  if (action.action === "call") return 1.12;
  if (action.action === "raise" || action.action === "all-in") return 1.72;
  return 1;
}

function playerMultiplier(action: StrategyAction, profile?: HandPlayerProfile) {
  if (!profile) return 1;
  const loose = (profile.effective.looseness - 50) / 50;
  const aggressive = (profile.effective.aggression - 50) / 50;
  const bluff = (profile.effective.bluff - 35) / 65;
  if (action.action === "fold") return Math.max(0.25, 1 - loose * 0.65);
  if (action.action === "call") return Math.max(0.25, 1 + loose * 0.45 - aggressive * 0.15);
  if (action.action === "raise" || action.action === "all-in") {
    const bluffAdjustment = action.intent === "bluff" ? bluff * 0.35 : 0;
    return Math.max(0.25, 1 + aggressive * 0.7 + loose * 0.15 + bluffAdjustment);
  }
  return 1;
}

function projectBounded(base: number[], desired: number[]) {
  const lower = base.map((value) => Math.max(0, value - MAX_SHIFT));
  const upper = base.map((value) => Math.min(1, value + MAX_SHIFT));
  const result = desired.map((value, index) => Math.max(lower[index], Math.min(upper[index], value)));
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const difference = 1 - result.reduce((sum, value) => sum + value, 0);
    if (Math.abs(difference) < 1e-12) break;
    const capacity = result.map((value, index) =>
      difference > 0 ? upper[index] - value : value - lower[index]
    );
    const totalCapacity = capacity.reduce((sum, value) => sum + value, 0);
    if (totalCapacity <= 1e-12) break;
    for (let index = 0; index < result.length; index += 1) {
      result[index] += difference * (capacity[index] / totalCapacity);
    }
  }
  return result;
}

export function applyBoundedDeviation(
  result: StrategyResult,
  tableProfileId: TableProfileId,
  playerProfile?: HandPlayerProfile,
): StrategyResult {
  if (tableProfileId === "balanced" && !playerProfile) return result;
  const base = result.actions.map((action) => action.frequency);
  const raw = result.actions.map((action) =>
    action.frequency * tableMultiplier(action, tableProfileId) * playerMultiplier(action, playerProfile)
  );
  const total = raw.reduce((sum, value) => sum + value, 0);
  const desired = total > 0 ? raw.map((value) => value / total) : base;
  const frequencies = projectBounded(base, desired);
  const profileDeviationMax = Math.max(
    ...frequencies.map((value, index) => Math.abs(value - base[index])),
  );
  return {
    ...result,
    actions: result.actions.map((action, index) => ({
      ...action,
      frequency: frequencies[index],
    })),
    explanationFacts: {
      ...result.explanationFacts,
      tableProfile: tableProfileId,
      playerProfile: playerProfile?.archetype ?? "none",
      profileDeviationMax: Number(profileDeviationMax.toFixed(6)),
    },
  };
}
