import type { HandPlayerProfile } from "../policy/playerProfiles";
import type { TableProfileId } from "../policy/tableProfiles";
import type { StrategyAction, StrategyResult } from "./types";
import type { Street } from "../game/game";
import { adjustProfileV4 } from "./v4/profileAdjustment";

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

function preventNegativeEvTop(actions: StrategyAction[], frequencies: number[]) {
  const topIndex = frequencies.reduce(
    (best, value, index) => value > frequencies[best] ? index : best,
    0,
  );
  if (actions[topIndex].ev >= 0) return frequencies;
  const safeIndexes = actions.map((action, index) => action.ev >= 0 ? index : -1)
    .filter((index) => index >= 0);
  if (!safeIndexes.length) return frequencies;
  const safeIndex = safeIndexes.reduce(
    (best, index) => frequencies[index] > frequencies[best] ? index : best,
    safeIndexes[0],
  );
  const needed = (frequencies[topIndex] - frequencies[safeIndex]) / 2 + 1e-9;
  const transfer = Math.min(
    needed,
    frequencies[topIndex] - Math.max(0, actions[topIndex].frequency - MAX_SHIFT),
    Math.min(1, actions[safeIndex].frequency + MAX_SHIFT) - frequencies[safeIndex],
  );
  if (transfer <= 0) return frequencies;
  const result = [...frequencies];
  result[topIndex] -= transfer;
  result[safeIndex] += transfer;
  return result;
}

export function applyBoundedDeviation(
  result: StrategyResult,
  tableProfileId: TableProfileId,
  playerProfile?: HandPlayerProfile,
  street: Street = "preflop",
): StrategyResult {
  const baselineActions = (result.baselineActions ?? result.actions).map((action) => ({ ...action }));
  if (street !== "preflop") {
    const adjusted = adjustProfileV4({
      actions: baselineActions,
      tableProfileId,
      playerProfile,
      street,
    });
    const maxShift = Math.max(...adjusted.actions.map((action, index) =>
      Math.abs(action.frequency - baselineActions[index].frequency)
    ));
    return {
      ...result,
      actions: adjusted.actions,
      baselineActions,
      adjustment: {
        applied: maxShift > 1e-9,
        tableProfileId,
        playerArchetype: playerProfile?.archetype ?? "none",
        maxShift: Number(maxShift.toFixed(6)),
        reasonCodes: adjusted.adjustments
          .filter((item) => Math.abs(item.after - item.before) > 1e-9)
          .map((item) => item.reason),
      },
      explanationFacts: {
        ...result.explanationFacts,
        tableProfile: tableProfileId,
        playerProfile: playerProfile?.archetype ?? "none",
        profileDeviationMax: Number(maxShift.toFixed(6)),
      },
    };
  }
  if (tableProfileId === "balanced" && !playerProfile) {
    return {
      ...result,
      baselineActions,
      adjustment: {
        applied: false,
        tableProfileId,
        playerArchetype: "none",
        maxShift: 0,
        reasonCodes: [],
      },
    };
  }
  const base = baselineActions.map((action) => action.frequency);
  const raw = baselineActions.map((action) =>
    action.frequency * tableMultiplier(action, tableProfileId) * playerMultiplier(action, playerProfile)
  );
  const total = raw.reduce((sum, value) => sum + value, 0);
  const desired = total > 0 ? raw.map((value) => value / total) : base;
  const frequencies = preventNegativeEvTop(
    baselineActions,
    projectBounded(base, desired),
  );
  const profileDeviationMax = Math.max(
    ...frequencies.map((value, index) => Math.abs(value - base[index])),
  );
  return {
    ...result,
    baselineActions,
    adjustment: {
      applied: profileDeviationMax > 1e-9,
      tableProfileId,
      playerArchetype: playerProfile?.archetype ?? "none",
      maxShift: Number(profileDeviationMax.toFixed(6)),
      reasonCodes: [
        ...(tableProfileId !== "balanced" ? [`table:${tableProfileId}`] : []),
        ...(playerProfile ? [`player:${playerProfile.archetype}`] : []),
      ],
    },
    actions: baselineActions.map((action, index) => ({
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
